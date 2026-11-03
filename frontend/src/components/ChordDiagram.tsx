import { memo } from 'react'
import { voicingFor } from '../lib/chords'

const ROWS = 5
const LEFT = 26
const TOP = 30
const GAP = 18
const ROW_H = 22
const WIDTH = LEFT + GAP * 5 + 14
const HEIGHT = TOP + ROW_H * ROWS + 8

/** Standard vertical chord box: strings left→right are low E → high e. */
export const ChordDiagram = memo(function ChordDiagram({ label, className = '' }: { label: string; className?: string }) {
  const voicing = voicingFor(label)
  if (!voicing) {
    return (
      <div className={`flex aspect-[4/5] items-center justify-center rounded-xl text-sm text-muted ${className}`}>
        אין דיאגרמה
      </div>
    )
  }
  const fretted = voicing.frets.filter((f): f is number => f !== null && f > 0)
  const maxFret = Math.max(0, ...fretted)
  const base = maxFret > ROWS ? Math.min(...fretted) : 1
  const sx = (s: number) => LEFT + s * GAP
  const fy = (f: number) => TOP + (f - base + 0.5) * ROW_H

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={className} direction="ltr" role="img" aria-label={`אקורד ${label}`}>
      {/* frets */}
      {Array.from({ length: ROWS + 1 }, (_, i) => (
        <line key={`f${i}`} x1={sx(0)} x2={sx(5)} y1={TOP + i * ROW_H} y2={TOP + i * ROW_H}
          stroke="var(--color-muted)" strokeWidth={i === 0 && base === 1 ? 4 : 1} opacity={i === 0 && base === 1 ? 1 : 0.6} />
      ))}
      {/* strings */}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={`s${s}`} x1={sx(s)} x2={sx(s)} y1={TOP} y2={TOP + ROWS * ROW_H}
          stroke="var(--color-muted)" strokeWidth={1 + (5 - s) * 0.25} />
      ))}
      {base > 1 && (
        <text x={LEFT - 10} y={fy(base) + 4} fontSize="11" fill="var(--color-muted)" textAnchor="end">{base}</text>
      )}
      {voicing.barre && (
        <rect x={sx(voicing.barre.fromString) - 7} y={fy(voicing.barre.fret) - 7}
          width={sx(voicing.barre.toString) - sx(voicing.barre.fromString) + 14} height={14} rx={7}
          fill="var(--color-accent)" />
      )}
      {voicing.frets.map((fret, s) => {
        if (fret === null) {
          return <text key={s} x={sx(s)} y={TOP - 10} fontSize="13" fill="var(--color-bad)" textAnchor="middle">✕</text>
        }
        if (fret === 0) {
          return <circle key={s} cx={sx(s)} cy={TOP - 14} r={5} fill="none" stroke="var(--color-good)" strokeWidth={1.6} />
        }
        const onBarre = voicing.barre && fret === voicing.barre.fret && voicing.fingers[s] === 1
        if (onBarre) return null
        return (
          <g key={s}>
            <circle cx={sx(s)} cy={fy(fret)} r={8} fill="var(--color-accent)" />
            {voicing.fingers[s] > 0 && (
              <text x={sx(s)} y={fy(fret) + 4} fontSize="10" fontWeight="700" fill="#1f1a17" textAnchor="middle">
                {voicing.fingers[s]}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
})
