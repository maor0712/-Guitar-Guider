import type { Analysis } from '../api'
import { voicingFor } from './chords'
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
}

const TREBLE: Record<string, number> = { '1': 5, '2': 4, '3': 3 }

/** Lay a one-bar pattern over the song's real beat grid, using the shape of the chord at each step. */
export function buildHits(analysis: Analysis, pattern: Pattern, view: ChordView): Hit[] {
  const { beats, chords } = analysis
  const hits: Hit[] = []
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i]
    const prev = beats[i - 1]?.t ?? beat.t - 0.5
    const duration = (beats[i + 1]?.t ?? beat.t + (beat.t - prev)) - beat.t
    for (let k = 0; k < pattern.subdiv; k++) {
      const stepInBar = (beat.beat - 1) * pattern.subdiv + k
      const step = pattern.steps[stepInBar % pattern.steps.length]
      if (step === '-') continue
      const t = beat.t + (duration * k) / pattern.subdiv
      const chord = chords[indexAt(chords, t + 0.001, (c) => c.start)]
      if (!chord || chord.label === 'N') continue

      const voicing = voicingFor(shapeFor(chord.label, view))
      const played = voicing
        ? voicing.frets.flatMap((f, s) => (f === null ? [] : [s]))
        : [0, 1, 2, 3, 4, 5]
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
      hits.push({ t, kind, strings, accent: stepInBar === 0, count: countLabel(stepInBar, pattern.subdiv) })
    }
  }
  return hits
}
