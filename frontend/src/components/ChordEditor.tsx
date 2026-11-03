import { useState } from 'react'
import { parseChord } from '../lib/chords'
import { ChordDiagram } from './ChordDiagram'

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const QUALITIES = [
  { value: '', label: "מז'ור" },
  { value: 'm', label: 'מינור' },
  { value: '7', label: '7' },
  { value: 'm7', label: 'm7' },
  { value: 'maj7', label: 'maj7' },
]

interface Props {
  label: string
  onSave: (label: string, scope: 'one' | 'all') => void
  onClose: () => void
}

/** Bottom sheet for correcting a recognised chord. */
export function ChordEditor({ label, onSave, onClose }: Props) {
  const parsed = parseChord(label)
  const [root, setRoot] = useState(parsed ? ROOTS[parsed.pc] : 'A')
  const [quality, setQuality] = useState(parsed?.quality ?? '')
  const [none, setNone] = useState(label === 'N')
  const next = none ? 'N' : root + quality

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl border border-line bg-surface p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">תיקון אקורד</h3>
          <button onClick={onClose} className="p-1 text-muted" aria-label="סגירה">✕</button>
        </div>
        <p className="mb-3 text-sm text-muted">
          זוהה: <b dir="ltr" className="text-ink">{label === 'N' ? 'ללא אקורד' : label}</b>. מה האקורד הנכון?
        </p>
        <div className="grid grid-cols-6 gap-1.5" dir="ltr">
          {ROOTS.map((r) => (
            <button key={r} onClick={() => { setRoot(r); setNone(false) }}
              className={`rounded-lg py-2 font-bold ${!none && root === r ? 'bg-accent text-bg' : 'bg-surface-2'}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUALITIES.map((q) => (
            <button key={q.value} onClick={() => { setQuality(q.value); setNone(false) }}
              className={`rounded-lg px-3 py-2 text-sm ${!none && quality === q.value ? 'bg-accent font-bold text-bg' : 'bg-surface-2'}`}>
              {q.label}
            </button>
          ))}
          <button onClick={() => setNone(true)}
            className={`rounded-lg px-3 py-2 text-sm ${none ? 'bg-accent font-bold text-bg' : 'bg-surface-2'}`}>
            ללא אקורד
          </button>
        </div>
        <div className="mt-4 flex items-center gap-4" dir="ltr">
          {!none && <ChordDiagram label={next} className="w-20" />}
          <div className="text-4xl font-extrabold">{none ? '–' : next}</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => onSave(next, 'one')} className="rounded-xl bg-accent py-3 font-bold text-bg">
            רק כאן
          </button>
          <button onClick={() => onSave(next, 'all')} className="rounded-xl border border-accent py-3 font-bold text-accent">
            <span>כל ה-</span><span dir="ltr">{label === 'N' ? '–' : label}</span><span> בשיר</span>
          </button>
        </div>
      </div>
    </div>
  )
}
