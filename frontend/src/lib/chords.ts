/** Guitar chord voicings. Strings are ordered low E → high e. */

export interface Voicing {
  /** Fret per string: null = muted, 0 = open. */
  frets: (number | null)[]
  /** Finger per string (1-4), 0 = none. */
  fingers: number[]
  barre?: { fret: number; fromString: number; toString: number }
  /** Open chords are easy; barre chords are hard for beginners. */
  difficulty: 'easy' | 'medium' | 'hard'
}

const PITCH: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

const x = null

// Common open shapes, keyed by "<pitch class>:<quality>".
const OPEN: Record<string, Omit<Voicing, 'difficulty'> & { difficulty?: Voicing['difficulty'] }> = {
  '0:': { frets: [x, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  '0:7': { frets: [x, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  '2:': { frets: [x, x, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  '2:m': { frets: [x, x, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  '2:7': { frets: [x, x, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  '2:m7': { frets: [x, x, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  '4:': { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  '4:m': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  '4:7': { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  '4:m7': { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  '7:': { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  '7:7': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  '9:': { frets: [x, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  '9:m': { frets: [x, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  '9:7': { frets: [x, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  '9:m7': { frets: [x, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  '11:7': { frets: [x, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], difficulty: 'medium' },
  '0:maj7': { frets: [x, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  '2:maj7': { frets: [x, x, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] },
  '4:maj7': { frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0] },
  '5:maj7': { frets: [x, x, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  '7:maj7': { frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1] },
  '9:maj7': { frets: [x, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] },
}

// Movable barre shapes as fret offsets from the barre fret.
const E_SHAPE: Record<string, { offsets: number[]; fingers: number[] }> = {
  '': { offsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  m: { offsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  '7': { offsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  m7: { offsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  maj7: { offsets: [0, 2, 1, 1, 0, 0], fingers: [1, 4, 2, 3, 1, 1] },
}
const A_SHAPE: Record<string, { offsets: number[]; fingers: number[] }> = {
  '': { offsets: [0, 2, 2, 2, 0], fingers: [1, 2, 3, 4, 1] },
  m: { offsets: [0, 2, 2, 1, 0], fingers: [1, 3, 4, 2, 1] },
  '7': { offsets: [0, 2, 0, 2, 0], fingers: [1, 3, 1, 4, 1] },
  m7: { offsets: [0, 2, 0, 1, 0], fingers: [1, 3, 1, 2, 1] },
  maj7: { offsets: [0, 2, 1, 2, 0], fingers: [1, 3, 2, 4, 1] },
}

export function parseChord(label: string): { pc: number; quality: string } | null {
  const match = /^([A-G][#b]?)(.*)$/.exec(label)
  if (!match || !(match[1] in PITCH)) return null
  return { pc: PITCH[match[1]], quality: match[2] }
}

export function voicingFor(label: string): Voicing | null {
  const chord = parseChord(label)
  if (!chord) return null
  const open = OPEN[`${chord.pc}:${chord.quality}`]
  if (open) return { difficulty: 'easy', ...open }

  const eShape = E_SHAPE[chord.quality]
  const aShape = A_SHAPE[chord.quality]
  if (!eShape || !aShape) return null
  const eFret = ((chord.pc - 4 + 12) % 12) || 12
  const aFret = ((chord.pc - 9 + 12) % 12) || 12
  if (eFret <= aFret) {
    return {
      frets: eShape.offsets.map((o) => eFret + o),
      fingers: eShape.fingers,
      barre: { fret: eFret, fromString: 0, toString: 5 },
      difficulty: 'hard',
    }
  }
  return {
    frets: [null, ...aShape.offsets.map((o) => aFret + o)],
    fingers: [0, ...aShape.fingers],
    barre: { fret: aFret, fromString: 1, toString: 5 },
    difficulty: 'hard',
  }
}
