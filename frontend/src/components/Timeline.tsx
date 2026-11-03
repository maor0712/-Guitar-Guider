import { memo, useEffect, useRef } from 'react'
import type { Bar, Section } from '../api'

const SECTION_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fb923c']

export function sectionColor(label: string): string {
  if (label === '-') return '#6b5f55'
  return SECTION_COLORS[(label.charCodeAt(0) - 65) % SECTION_COLORS.length]
}

interface Props {
  bars: Bar[]
  sections: Section[]
  currentBar: number
  currentBeat: number
  onSeek: (t: number) => void
  shape: (label: string) => string
}

/** Horizontally scrolling bar grid that follows playback. */
export const Timeline = memo(function Timeline({ bars, sections, currentBar, currentBeat, onSeek, shape }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const barRefs = useRef(new Map<number, HTMLButtonElement>())

  useEffect(() => {
    const el = barRefs.current.get(currentBar)
    const box = scroller.current
    if (!el || !box) return
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 3, behavior: 'smooth' })
  }, [currentBar])

  const sectionOf = (barIndex: number) =>
    sections.find((s) => barIndex >= s.start_bar && barIndex <= s.end_bar)

  return (
    <div ref={scroller} className="no-scrollbar relative overflow-x-auto" dir="ltr">
      <div className="flex gap-1.5 px-4 pb-2 pt-6">
        {bars.map((bar) => {
          const section = sectionOf(bar.index)
          const isSectionStart = section && section.start_bar === bar.index
          const isCurrent = bar.index === currentBar
          return (
            <button key={bar.index}
              ref={(el) => { if (el) barRefs.current.set(bar.index, el); else barRefs.current.delete(bar.index) }}
              onClick={() => onSeek(bar.start)}
              className={`relative flex h-16 shrink-0 rounded-lg border text-start transition-colors ${
                isCurrent ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
              }`}
              style={{ width: `${bar.chords.length * 26}px` }}>
              {section && (
                <span className="absolute inset-x-0 top-0 h-1 rounded-t-lg" style={{ background: sectionColor(section.label) }} />
              )}
              {isSectionStart && section.label !== '-' && (
                <span className="absolute -top-5 left-0 text-xs font-bold" style={{ color: sectionColor(section.label) }}>
                  {section.label}
                </span>
              )}
              {bar.chords.map((chord, i) => {
                const changed = i === 0 || chord !== bar.chords[i - 1]
                const beatOn = isCurrent && currentBeat === i + 1
                return (
                  <span key={i} className="relative flex w-[26px] flex-col items-start justify-between py-2 ps-1">
                    <span className={`whitespace-nowrap text-sm font-bold ${chord === 'N' ? 'text-muted' : 'text-ink'}`}>
                      {changed ? (chord === 'N' ? '–' : shape(chord)) : ''}
                    </span>
                    <span className={`h-1.5 w-3 rounded-full ${beatOn ? 'bg-accent' : 'bg-line'}`} />
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>
    </div>
  )
})
