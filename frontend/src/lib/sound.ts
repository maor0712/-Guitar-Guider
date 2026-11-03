let ctx: AudioContext | null = null

/** Create/resume the shared AudioContext. Call from a click handler (browsers require a user gesture). */
export function ensureAudio(): void {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

/** A short percussive click. */
export function tick(freq: number, volume = 0.3, length = 0.05): void {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + length + 0.01)
}
