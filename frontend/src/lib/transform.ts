import { parseChord, voicingFor } from './chords'

/** How chords are shown to the player: capo position and optional simplification. */
export interface ChordView {
  capo: number
  simplify: boolean
}

// Names guitarists usually use for chord shapes.
const SHAPE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const SIMPLE_QUALITY: Record<string, string> = { '7': '', m7: 'm', maj7: '' }

/** The chord shape to finger, given the real (sounding) chord. */
export function shapeFor(label: string, view: ChordView): string {
  const chord = parseChord(label)
  if (!chord) return label
  const quality = view.simplify ? (SIMPLE_QUALITY[chord.quality] ?? chord.quality) : chord.quality
  return SHAPE_NAMES[(chord.pc - view.capo + 12) % 12] + quality
}

const DIFFICULTY_COST = { easy: 0, medium: 1, hard: 3 } as const

/** Rank capo positions 0-7 by how easy the resulting shapes are, weighted by how often each chord is played. */
export function rankCapos(weights: Map<string, number>, simplify: boolean) {
  const results = []
  for (let capo = 0; capo <= 7; capo++) {
    let cost = 0
    let hard = 0
    for (const [label, weight] of weights) {
      const voicing = voicingFor(shapeFor(label, { capo, simplify }))
      const difficulty = voicing?.difficulty ?? 'hard'
      cost += DIFFICULTY_COST[difficulty] * weight
      if (difficulty === 'hard') hard++
    }
    // Small tie-breaker so lower capo positions win when equally easy.
    results.push({ capo, cost: cost + capo * 0.01, hard })
  }
  return results.sort((a, b) => a.cost - b.cost)
}
