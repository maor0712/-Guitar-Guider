/**
 * Strumming and fingerpicking patterns, one bar long.
 *
 * Strum steps: 'D' down, 'U' up, '-' hand keeps moving but misses the strings.
 * Pick steps:  'B' bass (chord root string), 'A' alternate bass, '1'..'3' treble
 *              strings (1 = high e), several tokens joined with '+' = played together.
 */

export type PatternKind = 'strum' | 'pick'
export type Level = 1 | 2 | 3

export interface Pattern {
  id: string
  kind: PatternKind
  level: Level
  meter: number
  /** Steps per beat: 1 = quarters, 2 = eighths, 4 = sixteenths. */
  subdiv: number
  steps: string[]
  name: string
  tip: string
  /** Step indices played harder. Defaults to beat 1. */
  accents?: number[]
  /** For song-generated patterns: which part of the song it is for. */
  variant?: 'all' | 'soft' | 'loud'
}

export const PATTERNS: Pattern[] = [
  // 4/4 strumming
  { id: 's4-whole', kind: 'strum', level: 1, meter: 4, subdiv: 2, steps: ['D', '-', '-', '-', '-', '-', '-', '-'],
    name: 'מכה אחת לתיבה', tip: 'מכה אחת למטה בתחילת כל תיבה, ושאר הזמן מכינים את האקורד הבא. מעולה לתרגול החלפות.' },
  { id: 's4-quarters', kind: 'strum', level: 1, meter: 4, subdiv: 2, steps: ['D', '-', 'D', '-', 'D', '-', 'D', '-'],
    name: 'רבעים', tip: 'מכה למטה על כל פעמה. היד ממשיכה לזוז למעלה ולמטה גם כשלא פורטים.' },
  { id: 's4-ddu', kind: 'strum', level: 2, meter: 4, subdiv: 2, steps: ['D', '-', 'D', 'U', 'D', '-', 'D', 'U'],
    name: 'למטה, למטה-למעלה', tip: 'המכה למעלה קלה יותר ונוגעת בעיקר במיתרים הדקים.' },
  { id: 's4-pop', kind: 'strum', level: 3, meter: 4, subdiv: 2, steps: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'],
    name: 'הקלאסי של הפופ', tip: 'בפעמה 3 היד יורדת בלי לפגוע במיתרים. זה הסוד של הדפוס הזה.' },
  // 3/4 strumming
  { id: 's3-quarters', kind: 'strum', level: 1, meter: 3, subdiv: 2, steps: ['D', '-', 'D', '-', 'D', '-'],
    name: 'ואלס פשוט', tip: 'שלוש מכות למטה בתיבה, והראשונה חזקה יותר.' },
  { id: 's3-du', kind: 'strum', level: 2, meter: 3, subdiv: 2, steps: ['D', '-', 'D', 'U', 'D', 'U'],
    name: 'ואלס עם מכות למעלה', tip: 'מכה ראשונה חזקה למטה, ואחריה למטה-למעלה פעמיים.' },
  { id: 's3-flow', kind: 'strum', level: 3, meter: 3, subdiv: 2, steps: ['D', '-', '-', 'U', 'D', 'U'],
    name: 'ואלס זורם', tip: 'מדלגים על פעמה 2 ונותנים לאקורד לצלצל.' },
  // 4/4 fingerpicking
  { id: 'p4-pinch', kind: 'pick', level: 1, meter: 4, subdiv: 2, steps: ['B', '-', '3+2+1', '-', 'B', '-', '3+2+1', '-'],
    name: 'בס ואקורד', tip: 'האגודל פורט את הבס, ושלוש אצבעות (אצבע, אמה, קמיצה) פורטות יחד את שלושת המיתרים הדקים.' },
  { id: 'p4-arpeggio', kind: 'pick', level: 2, meter: 4, subdiv: 2, steps: ['B', '3', '2', '3', '1', '3', '2', '3'],
    name: "ארפג'ו", tip: 'כל אצבע אחראית על מיתר אחד: אצבע על 3, אמה על 2, קמיצה על 1.' },
  { id: 'p4-travis', kind: 'pick', level: 3, meter: 4, subdiv: 2, steps: ['B+1', '3', 'A', '2', 'B', '3', 'A', '2'],
    name: 'טראוויס', tip: 'האגודל מחליף בין שני מיתרי בס על כל פעמה, והאצבעות ממלאות ביניהם.' },
  // 3/4 fingerpicking
  { id: 'p3-pinch', kind: 'pick', level: 1, meter: 3, subdiv: 2, steps: ['B', '-', '3+2+1', '-', '3+2+1', '-'],
    name: 'ואלס באצבעות', tip: 'בס על פעמה 1, ואקורד על פעמות 2 ו-3.' },
  { id: 'p3-arpeggio', kind: 'pick', level: 2, meter: 3, subdiv: 2, steps: ['B', '3', '2', '1', '2', '3'],
    name: "ארפג'ו בשלוש", tip: 'עולים מהבס עד המיתר הדק ויורדים חזרה.' },
  { id: 'p3-travis', kind: 'pick', level: 3, meter: 3, subdiv: 2, steps: ['B+1', '3', 'A', '2', 'A', '3'],
    name: 'ואלס מתקדם', tip: 'בס על 1, בס מתחלף על 2 ו-3, והאצבעות ממלאות.' },
]

export function patternsFor(kind: PatternKind, meter: number): Pattern[] {
  const m = meter === 3 ? 3 : 4
  return PATTERNS.filter((p) => p.kind === kind && p.meter === m)
}

/** The teacher's pick for this song: fast songs get sparser patterns. */
export function recommendPattern(kind: PatternKind, meter: number, bpm: number, level: Level): Pattern {
  const options = patternsFor(kind, meter)
  const busy = kind === 'pick' ? bpm > 120 : bpm > 150
  const target = busy ? Math.min(level, 2) : level
  const candidates = options.filter((p) => p.level === target)
  // "One hit per bar" is a drill for chord changes, not a way to play the song.
  return candidates.find((p) => !p.id.endsWith('whole')) ?? candidates[0] ?? options[0]
}

export function countLabel(stepInBar: number, subdiv: number): string {
  const k = stepInBar % subdiv
  if (k === 0) return String(stepInBar / subdiv + 1)
  if (subdiv === 4) return ['', 'e', '&', 'a'][k]
  return '&'
}
