import type { Level, Pattern, PatternKind } from '../lib/patterns'
import { countLabel } from '../lib/patterns'

const LEVELS: { value: Level; label: string }[] = [
  { value: 1, label: 'מתחיל' },
  { value: 2, label: 'בינוני' },
  { value: 3, label: 'מתקדם' },
]

const PICK_TOKEN: Record<string, string> = { B: 'בס', A: 'בס 2' }

interface Props {
  kind: PatternKind
  level: Level
  patterns: Pattern[]
  pattern: Pattern
  recommended: Pattern
  guide: boolean
  onKind: (kind: PatternKind) => void
  onLevel: (level: Level) => void
  onPattern: (id: string) => void
  onGuide: (on: boolean) => void
}

/** Choose strumming vs fingerpicking, difficulty and pattern. */
export function PracticePanel(p: Props) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={[{ value: 'strum', label: '🎸 פריטה מלאה' }, { value: 'pick', label: '🤌 באצבעות' }]}
          value={p.kind} onChange={(v) => p.onKind(v as PatternKind)} />
        <Segmented options={LEVELS.map((l) => ({ value: String(l.value), label: l.label }))}
          value={String(p.level)} onChange={(v) => p.onLevel(Number(v) as Level)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.patterns.map((pt) => (
          <button key={pt.id} onClick={() => p.onPattern(pt.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${pt.id === p.pattern.id ? 'bg-ink font-bold text-bg' : 'bg-surface-2'}`}>
            {pt.id === p.recommended.id && '⭐ '}{pt.name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-1" dir="ltr">
        {p.pattern.steps.map((step, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className={`flex h-10 w-full items-center justify-center rounded-lg text-lg font-bold ${
              step === '-' ? 'bg-surface-2/50 text-muted' : step === 'U' ? 'bg-sky-400/20 text-sky-300' : 'bg-accent-soft text-accent'
            }`}>
              <StepGlyph step={step} />
            </div>
            <span className={`text-xs ${i % p.pattern.subdiv === 0 ? 'font-bold text-ink' : 'text-muted'}`}>
              {countLabel(i, p.pattern.subdiv)}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted">
        {p.pattern.id === p.recommended.id && <b className="text-accent">המלצת המורה לשיר הזה. </b>}
        {p.pattern.tip}
      </p>

      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={p.guide} onChange={(e) => p.onGuide(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        השמע תקתוק על כל פריטה
      </label>
    </div>
  )
}

function StepGlyph({ step }: { step: string }) {
  if (step === 'D') return <>↓</>
  if (step === 'U') return <>↑</>
  if (step === '-') return <>·</>
  return (
    <span className="text-[10px] leading-tight">
      {step.split('+').map((t) => PICK_TOKEN[t] ?? t).join('+')}
    </span>
  )
}

function Segmented({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm ${o.value === value ? 'bg-accent font-bold text-bg' : 'text-muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
