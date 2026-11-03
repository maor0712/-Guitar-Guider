import { getAudioContext } from './sound'

/** One detected strum or pluck from the microphone. */
export interface MicOnset {
  /** AudioContext time of the attack. */
  t: number
  strength: number
  /** 12-bin pitch-class profile of the new sound (C = 0), max = 1. */
  chroma: number[]
  /** Pitch class of the most likely single note (for plucks), or null. */
  pitch: number | null
}

/**
 * Runs inside the audio thread.
 * - Onsets: SuperFlux-style spectral flux on 1024-sample frames (hop 256): each bin is
 *   compared with the max of its neighbours in the previous frame, so strings that are
 *   still ringing don't trigger new onsets.
 * - Per onset, ~100 ms later: the spectrum of the NEW sound (now minus just before the
 *   attack) gives a chroma vector (from spectral peaks) and a single-note pitch estimate
 *   (harmonic summation, so a low string's strong overtones don't fool it).
 */
const WORKLET = `
function makeFFT(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n)
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2)
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n) }
  return function (re, im) {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size
      for (let i = 0; i < n; i += size) for (let j = 0; j < half; j++) {
        const k = j * step, a = i + j, b = a + half
        const tr = re[b] * cos[k] - im[b] * sin[k], ti = re[b] * sin[k] + im[b] * cos[k]
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
      }
    }
  }
}
function hann(n) { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); return w }

const N = 1024, HOP = 256, BIG = 4096, RING = 8192

class OnsetDetector extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ring = new Float32Array(RING); this.pos = 0; this.sinceHop = 0
    this.fft = makeFFT(N); this.win = hann(N)
    this.bigFft = makeFFT(BIG); this.bigWin = hann(BIG)
    this.re = new Float32Array(N); this.im = new Float32Array(N)
    this.prev = new Float32Array(N / 2 + 1); this.cur = new Float32Array(N / 2 + 1)
    this.hist = []; this.prevFlux = 0
    this.lastOnset = -1; this.lastStrength = 0
    this.pending = null
    const binHz = sampleRate / N
    this.lo = Math.max(1, Math.floor(60 / binHz)); this.hi = Math.floor(5000 / binHz)
    this.floor = 10
    this.levelAcc = 0; this.levelN = 0
    this.port.onmessage = (e) => { if (e.data.floor) this.floor = e.data.floor }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      const s = ch[i]
      this.ring[this.pos] = s; this.pos = (this.pos + 1) % RING
      this.levelAcc += s * s; this.levelN++
      if (++this.sinceHop >= HOP) { this.sinceHop = 0; this.frame(currentTime + (i + 1) / sampleRate) }
    }
    if (this.levelN >= 4096) { this.port.postMessage({ level: Math.sqrt(this.levelAcc / this.levelN) }); this.levelAcc = 0; this.levelN = 0 }
    return true
  }
  frame(t) {
    const { re, im } = this
    for (let k = 0; k < N; k++) { re[k] = this.ring[(this.pos - N + k + RING) % RING] * this.win[k]; im[k] = 0 }
    this.fft(re, im)
    let flux = 0
    const cur = this.cur, prev = this.prev
    for (let b = this.lo - 1; b <= this.hi; b++) cur[b] = Math.log(1 + 100 * Math.hypot(re[b], im[b]))
    for (let b = this.lo; b < this.hi; b++) {
      const d = cur[b] - Math.max(prev[b - 1], prev[b], prev[b + 1])
      if (d > 0) flux += d
    }
    this.cur = prev; this.prev = cur

    if (this.pending && ++this.pending.hops >= Math.round(0.1 * sampleRate / HOP)) { this.emit(this.pending); this.pending = null }

    this.hist.push(flux); if (this.hist.length > 40) this.hist.shift()
    const mean = this.hist.reduce((a, b) => a + b, 0) / this.hist.length
    const thresh = Math.max(this.floor, mean * 1.8)
    const rising = flux > this.prevFlux
    this.prevFlux = flux
    const since = t - this.lastOnset
    // Right after a strong attack, the rest of the same strum can re-trigger: demand more.
    const echo = since < 0.15 && flux < 0.4 * this.lastStrength
    if (rising && flux > thresh && since > 0.08 && !echo) {
      if (this.pending) this.emit(this.pending) // a new attack closes the previous one early
      this.lastOnset = t; this.lastStrength = flux
      // "Before" window ends ~20 ms before the attack was detected, so it holds none of it.
      this.pending = { t: t - HOP / sampleRate, strength: flux, hops: 0, before: this.spectrum(1024) }
    }
  }
  /** Magnitude spectrum of the 4096 samples ending \`lag\` samples ago. */
  spectrum(lag) {
    const re = new Float32Array(BIG), im = new Float32Array(BIG)
    const start = this.pos - lag - BIG + 2 * RING
    for (let k = 0; k < BIG; k++) re[k] = this.ring[(start + k) % RING] * this.bigWin[k]
    this.bigFft(re, im)
    const mag = new Float32Array(BIG / 2)
    for (let b = 0; b < BIG / 2; b++) mag[b] = Math.hypot(re[b], im[b])
    return mag
  }
  emit(p) {
    const after = this.spectrum(0), before = p.before
    const hz = sampleRate / BIG, lo = Math.ceil(70 / hz), hi = Math.floor(2500 / hz)
    const mag = new Float32Array(hi + 2)
    for (let b = lo - 1; b <= hi + 1; b++) mag[b] = Math.max(0, after[b] - before[b])
    let top = 0
    for (let b = lo; b <= hi; b++) top = Math.max(top, mag[b])

    // Spectral peaks with interpolated frequencies.
    const peaks = []
    for (let b = lo; b <= hi; b++) {
      const m = mag[b]
      if (m < top * 0.05 || m < mag[b - 1] || m < mag[b + 1]) continue
      const a = mag[b - 1], c = mag[b + 1], shift = 0.5 * (a - c) / (a - 2 * m + c || 1)
      peaks.push([(b + shift) * hz, m])
    }
    // Salience of each guitar note E2..C6: how much peak energy its harmonics explain.
    // (Low strings have strong overtones, so raw peaks alone would point at the wrong note.)
    const salience = new Float32Array(85)
    for (let midi = 40; midi <= 84; midi++) {
      const f0 = 440 * Math.pow(2, (midi - 69) / 12)
      let score = 0, fundamental = false
      for (let k = 1; k <= 10; k++) {
        const fk = f0 * k, tol = Math.max(fk * 0.024, 0.6 * hz)
        for (const [f, m] of peaks) if (Math.abs(f - fk) < tol) { score += m / Math.sqrt(k); if (k <= 2) fundamental = true; break }
      }
      salience[midi] = fundamental ? score : 0
    }
    let best = 40
    for (let midi = 41; midi <= 84; midi++) if (salience[midi] > salience[best]) best = midi
    const pitch = salience[best] > 0 ? best % 12 : null
    const chroma = new Array(12).fill(0)
    for (let midi = 40; midi <= 84; midi++) if (salience[midi] >= 0.25 * salience[best]) chroma[midi % 12] = Math.max(chroma[midi % 12], salience[midi])
    const cmax = Math.max(...chroma) || 1
    this.port.postMessage({ onset: { t: p.t, strength: p.strength, chroma: chroma.map((v) => v / cmax), pitch } })
  }
}
registerProcessor('onset-detector', OnsetDetector)
`

const loadedContexts = new WeakSet<AudioContext>()

export class Listener {
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private mute: GainNode | null = null
  onOnset: (onset: MicOnset) => void = () => {}
  onLevel: (rms: number) => void = () => {}

  get ctx(): AudioContext {
    return getAudioContext()
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('הדפדפן לא מאפשר גישה למיקרופון (צריך כתובת https)')
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation keeps the song (from the speaker) out of the mic; the rest would colour the guitar.
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    })
    const ctx = this.ctx
    if (!loadedContexts.has(ctx)) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      await ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      loadedContexts.add(ctx)
    }
    this.node = new AudioWorkletNode(ctx, 'onset-detector')
    this.node.port.onmessage = (e) => {
      if (e.data.onset) this.onOnset(e.data.onset as MicOnset)
      else if (e.data.level !== undefined) this.onLevel(e.data.level)
    }
    this.source = ctx.createMediaStreamSource(this.stream)
    this.mute = ctx.createGain()
    this.mute.gain.value = 0
    // Connect through a muted gain so the browser keeps pulling audio through the detector.
    this.source.connect(this.node).connect(this.mute).connect(ctx.destination)
  }

  /** Minimum attack strength; lower = more sensitive. */
  setFloor(floor: number): void {
    this.node?.port.postMessage({ floor })
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.source?.disconnect()
    this.node?.disconnect()
    this.mute?.disconnect()
    this.stream = null
    this.node = null
  }
}
