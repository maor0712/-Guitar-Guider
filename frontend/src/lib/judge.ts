import { chordPitchClasses, type Hit } from './hits'
import type { MicOnset } from './listener'

export type Timing = 'perfect' | 'good' | 'early' | 'late' | 'miss'
export type SoundCheck = 'ok' | 'near' | 'wrong' | 'unknown'

export interface Judgment {
  timing: Timing
  /** Seconds the player was off (negative = early). */
  dt: number
  sound: SoundCheck
  dir: 'ok' | 'wrong' | 'unknown'
}

/** How far (seconds) from an expected stroke an attack still counts as aimed at it. */
export const MATCH_WINDOW = 0.2

export function timingOf(dt: number): Timing {
  const a = Math.abs(dt)
  if (a <= 0.05) return 'perfect'
  if (a <= 0.1) return 'good'
  return dt < 0 ? 'early' : 'late'
}

function vec(pcs: number[]): number[] {
  const v = new Array(12).fill(0)
  for (const pc of pcs) v[pc] = 1
  return v
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < 12; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na * nb) || 1)
}

const TRIADS = Array.from({ length: 24 }, (_, i) => {
  const root = i % 12
  return vec([root, (root + (i < 12 ? 4 : 3)) % 12, (root + 7) % 12])
})

/** Does a strum sound like the expected chord (compared with every major/minor triad)? */
export function strumMatches(chroma: number[], chordLabel: string): SoundCheck {
  const pcs = chordPitchClasses(chordLabel)
  if (!pcs) return 'unknown'
  const expected = cosine(chroma, vec(pcs))
  const best = Math.max(...TRIADS.map((t) => cosine(chroma, t)))
  if (expected >= 0.9 * best && expected >= 0.55) return 'ok'
  if (expected >= 0.75 * best) return 'near'
  return 'wrong'
}

/** Did a pluck produce the expected note (or at least a note of the chord)? */
export function pluckMatches(pitch: number | null, notes: number[], chordLabel: string): SoundCheck {
  if (pitch === null) return 'unknown'
  if (notes.includes(pitch)) return 'ok'
  return (chordPitchClasses(chordLabel) ?? []).includes(pitch) ? 'near' : 'wrong'
}

// Strum direction isn't judged yet: telling down from up by sound wasn't reliable in testing.
export function judge(hit: Hit, onset: MicOnset, songTime: number): Judgment {
  const dt = songTime - hit.t
  const sound = hit.kind === 'P' ? pluckMatches(onset.pitch, hit.notes, hit.chord) : strumMatches(onset.chroma, hit.chord)
  return { timing: timingOf(dt), dt, sound, dir: 'unknown' }
}

export interface CoachStats {
  judged: number
  onTime: number
  early: number
  late: number
  missed: number
  extra: number
  wrongSound: number
  wrongDir: number
  /** Mean timing offset of the strokes that were played (seconds). */
  meanDt: number
  /** Chord label -> [wrong, total]. */
  chordTrouble: Record<string, [number, number]>
}

export function summarize(hits: Hit[], judgments: Map<number, Judgment>, extra: number): CoachStats {
  const stats: CoachStats = { judged: 0, onTime: 0, early: 0, late: 0, missed: 0, extra, wrongSound: 0, wrongDir: 0, meanDt: 0, chordTrouble: {} }
  let dtSum = 0, dtN = 0
  for (const [i, j] of judgments) {
    stats.judged++
    if (j.timing === 'miss') { stats.missed++; continue }
    if (j.timing === 'perfect' || j.timing === 'good') stats.onTime++
    else if (j.timing === 'early') stats.early++
    else stats.late++
    dtSum += j.dt; dtN++
    if (j.dir === 'wrong') stats.wrongDir++
    const label = hits[i]?.chord
    if (label && j.sound !== 'unknown') {
      const entry = (stats.chordTrouble[label] ??= [0, 0])
      entry[1]++
      if (j.sound === 'wrong') { entry[0]++; stats.wrongSound++ }
    }
  }
  stats.meanDt = dtN ? dtSum / dtN : 0
  return stats
}

/** The teacher's comments, most important first. `shape` turns a sounding chord into what the player fingers. */
export function coachTips(stats: CoachStats, shape: (label: string) => string): string[] {
  const tips: string[] = []
  if (stats.judged < 8) return tips
  const ms = Math.round(Math.abs(stats.meanDt) * 1000)
  if (stats.missed / stats.judged > 0.3) tips.push('אתה מפספס הרבה פריטות. נסה מהירות 75% או דפוס ברמה נמוכה יותר.')
  if (ms >= 40) tips.push(stats.meanDt < 0
    ? `אתה ממהר, בממוצע ${ms} אלפיות שנייה לפני הפעמה. נסה להקשיב לתוף ולחכות לו.`
    : `אתה מאחר, בממוצע ${ms} אלפיות שנייה אחרי הפעמה. נסה להכין את היד מוקדם יותר.`)
  const trouble = Object.entries(stats.chordTrouble)
    .filter(([, [wrong, total]]) => total >= 3 && wrong / total >= 0.4)
    .sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1])
  for (const [label, [wrong, total]] of trouble.slice(0, 2)) {
    tips.push(`האקורד ${shape(label)} לא נשמע נקי (${wrong} מתוך ${total}). בדוק שכל אצבע לוחצת קרוב לשריג ולא נוגעת במיתר השכן.`)
  }
  if (stats.wrongDir / stats.judged > 0.3) tips.push('כיוון הפריטה לא תמיד נכון. זכור: למטה על הפעמה, למעלה בין הפעמות.')
  if (stats.extra / Math.max(1, stats.judged) > 0.4) tips.push('יש פריטות מיותרות. נסה לפגוע במיתרים רק במקומות המסומנים, ולתת ליד לעבור באוויר בשאר הזמן.')
  if (!tips.length && stats.onTime / stats.judged >= 0.8) tips.push('מצוין! הקצב יציב. אפשר לנסות מהירות גבוהה יותר או רמה מתקדמת.')
  return tips
}
