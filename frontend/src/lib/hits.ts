import type { Analysis } from '../api'
import { parseChord, voicingFor } from './chords'
import { countLabel, type Pattern } from './patterns'
import { indexAt } from './timing'
import { type ChordView, shapeFor } from './transform'

/** One stroke or pluck the player should make. Strings: 0 = low E … 5 = high e. */
export interface Hit {
  t: number
  kind: 'D' | 'U' | 'P'
  strings: number[]
  accent: boolean
  count: string
  /** The sounding chord (as recognised in the song). */
  chord: string
  /** Pitch classes that should sound for a pluck (capo included). */
  notes: number[]
}

const TREBLE: Record<string, number> = { '1': 5, '2': 4, '3': 3 }
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64]

/**
 * Lay one-bar patterns over the song's real beat grid, using the shape of the chord at each step.
 * `patternAt` picks the pattern for each bar (song patterns differ between soft and loud parts).
 * With `relief`, the up-strum right before a chord change is dropped to leave time to switch.
 */
export function buildHits(analysis: Analysis, patternAt: (bar: number) => Pattern, view: ChordView, relief: boolean): Hit[] {
  const { beats, chords } = analysis
  const hits: Hit[] = []
  const chordAt = (t: number) => chords[indexAt(chords, t + 0.001, (c) => c.start)]

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i]
    const pattern = patternAt(beat.bar)
    const prev = beats[i - 1]?.t ?? beat.t - 0.5
    const duration = (beats[i + 1]?.t ?? beat.t + (beat.t - prev)) - beat.t
    const slot = duration / pattern.subdiv
    for (let k = 0; k < pattern.subdiv; k++) {
      const stepInBar = (beat.beat - 1) * pattern.subdiv + k
      const step = pattern.steps[stepInBar % pattern.steps.length]
      if (!step || step === '-') continue
      const t = beat.t + slot * k
      const chord = chordAt(t)
      if (!chord || chord.label === 'N') continue

      const shape = shapeFor(chord.label, view)
      if (relief && step === 'U') {
        const next = chordAt(t + slot * 0.98)
        if (next && next !== chord && next.label !== 'N' && shapeFor(next.label, view) !== shape) continue
      }

      const voicing = voicingFor(shape)
      const played = voicing ? voicing.frets.flatMap((f, s) => (f === null ? [] : [s])) : [0, 1, 2, 3, 4, 5]
      const root = played[0]
      const altBass = root === 0 ? 2 : Math.min(root + 1, 3)

      let kind: Hit['kind'] = 'P'
      let strings: number[]
      if (step === 'D') {
        kind = 'D'
        strings = played
      } else if (step === 'U') {
        kind = 'U'
        strings = played.filter((s) => s >= 2)
      } else {
        strings = step.split('+').map((token) => (token === 'B' ? root : token === 'A' ? altBass : TREBLE[token]))
      }

      const notes = strings.map((s) => {
        const fret = voicing?.frets[s] ?? 0
        return (OPEN_STRING_MIDI[s] + (fret ?? 0) + view.capo) % 12
      })
      const accents = pattern.accents ?? [0]
      hits.push({
        t, kind, strings, notes, chord: chord.label,
        accent: accents.includes(stepInBar),
        count: countLabel(stepInBar, pattern.subdiv),
      })
    }
  }
  return hits
}

/** Pitch classes of a chord label, or null. */
export function chordPitchClasses(label: string): number[] | null {
  const chord = parseChord(label)
  if (!chord) return null
  const intervals: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11] }
  const iv = intervals[chord.quality]
  return iv ? iv.map((i) => (chord.pc + i) % 12) : null
}
