import { useEffect, useState } from 'react'
import type { useCoach } from '../hooks/useCoach'
import { coachTips } from '../lib/judge'

interface Props {
  coach: ReturnType<typeof useCoach>
  shape: (label: string) => string
  waitMode: boolean
  onWaitMode: (on: boolean) => void
}

/** "The teacher is listening": mic controls, live feedback, stats and tips. */
export function CoachPanel({ coach, shape, waitMode, onWaitMode }: Props) {
  const { listening, stats, last, waiting } = coach
  const fresh = useFresh(last?.at)

  return (
    <section className="mx-4 mt-4 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">🎤 המורה מקשיב</h2>
        {listening ? (
          <button onClick={coach.stop} className="rounded-xl border border-line px-4 py-2 text-sm">עצור</button>
        ) : (
          <button onClick={() => void coach.start()} className="rounded-xl bg-accent px-4 py-2 font-bold text-bg">התחל להקשיב</button>
        )}
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={waitMode} onChange={(e) => onWaitMode(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        השיר מחכה לי: נעצר בכל החלפת אקורד עד שאנגן אותו
      </label>

      {!listening && (
        <p className="mt-3 text-sm text-muted">
          נגן יחד עם השיר, והמורה יסמן על המסלול כל פריטה: <b className="text-good">✓</b> בזמן, <b className="text-yellow-400">‹ ›</b> מוקדם או מאוחר,
          <b className="text-bad"> ✗</b> אקורד או מיתר לא נכון, <b className="text-bad">⭘</b> פספוס. כדאי לשמוע את השיר באוזניות, כדי שהמיקרופון ישמע רק את הגיטרה.
        </p>
      )}
      {coach.error && <p className="mt-3 text-sm text-bad">{coach.error}</p>}

      {listening && (
        <>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span>מיקרופון</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" dir="ltr">
              <div className="h-full bg-good transition-[width] duration-75" style={{ width: `${Math.min(100, coach.level * 400)}%` }} />
            </div>
          </div>

          {waiting && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-accent-soft p-4">
              <div>
                <div className="text-sm text-muted">השיר מחכה לך. נגן:</div>
                <div className="text-4xl font-extrabold" dir="ltr">{shape(waiting.label)}</div>
              </div>
              <button onClick={coach.skipWait} className="rounded-lg border border-line px-3 py-1.5 text-sm">דלג</button>
            </div>
          )}

          <div className={`mt-3 min-h-12 rounded-2xl px-4 py-3 text-center text-lg font-bold transition-colors ${
            !last ? 'bg-surface-2 text-muted' : last.ok ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'
          } ${fresh ? 'scale-[1.02]' : ''}`}>
            {last?.text ?? (coach.calibrating ? 'פרוט מכה אחת על כל תקתוק…' : 'נגן, אני מקשיב…')}
          </div>

          {stats && stats.judged > 0 && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                <Stat label="דיוק" value={`${Math.round((stats.onTime / stats.judged) * 100)}%`} strong />
                <Stat label="בזמן" value={stats.onTime} />
                <Stat label="מוקדם" value={stats.early} />
                <Stat label="מאוחר" value={stats.late} />
                <Stat label="פספוס" value={stats.missed} />
                <Stat label="מיותר" value={stats.extra} />
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {coachTips(stats, shape).map((tip) => (
                  <li key={tip} className="rounded-xl bg-surface-2 px-3 py-2">💡 {tip}</li>
                ))}
              </ul>
            </>
          )}

          <details className="mt-3 text-sm text-muted">
            <summary className="cursor-pointer">כיול והגדרות</summary>
            <div className="mt-2 space-y-3">
              <p>
                הכיול מודד את ההשהיה של האוזניות והמיקרופון ({Math.round(coach.latency * 1000)}ms כרגע).
                כדאי לכייל פעם אחת לכל אוזניות: לוחצים, ופורטים מכה אחת על כל אחד מ-8 תקתוקים.
              </p>
              <button onClick={coach.calibrate} disabled={coach.calibrating}
                className="rounded-lg border border-line px-3 py-1.5 text-ink disabled:opacity-40">
                {coach.calibrating ? 'מכייל…' : 'כיול השהיה'}
              </button>
              <label className="flex items-center gap-3">
                <span className="shrink-0">רגישות</span>
                <input type="range" min={2} max={20} step={1} value={22 - coach.sensitivity} dir="ltr"
                  onChange={(e) => coach.setSensitivity(22 - Number(e.target.value))} className="flex-1" />
              </label>
              <p className="text-xs">אם הוא שומע פריטות שלא היו (רעש, השיר מהרמקול), הורד רגישות. אם הוא מפספס פריטות שקטות, העלה.</p>
              <button onClick={coach.reset} className="rounded-lg border border-line px-3 py-1.5 text-ink">איפוס תוצאות</button>
            </div>
          </details>
        </>
      )}
    </section>
  )
}

function Stat({ label, value, strong }: { label: string; value: number | string; strong?: boolean }) {
  return (
    <div className={`rounded-xl py-2 ${strong ? 'bg-accent-soft' : 'bg-surface-2'}`}>
      <div className={`text-lg font-bold ${strong ? 'text-accent' : ''}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

/** True for a moment after `at` changes (for a small pop animation). */
function useFresh(at: number | undefined): boolean {
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    if (at === undefined) return
    setFresh(true)
    const id = setTimeout(() => setFresh(false), 150)
    return () => clearTimeout(id)
  }, [at])
  return fresh
}
