let ctx: AudioContext | null = null

/** The shared AudioContext (clicks and microphone use the same clock). */
export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** Create/resume the shared AudioContext. Call from a click handler (browsers require a user gesture). */
export function ensureAudio(): void {
  const c = getAudioContext()
  if (c.state === 'suspended') void c.resume()
}

/** A short percussive click, now or at an AudioContext time. */
export function tick(freq: number, volume = 0.3, length = 0.05, at?: number): void {
  if (!ctx) return
  const start = at ?? ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length + 0.01)
}
