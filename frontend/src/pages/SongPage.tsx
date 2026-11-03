import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { api, type Analysis, type SongDetail } from '../api'
import { BeatCounter } from '../components/BeatCounter'
import { ChordDiagram } from '../components/ChordDiagram'
import { sectionColor, Timeline } from '../components/Timeline'
import { usePlayer } from '../hooks/usePlayer'
import { voicingFor } from '../lib/chords'
import { formatTime, indexAt } from '../lib/timing'
import { navigate } from '../router'

export function SongPage({ id }: { id: string }) {
  const [song, setSong] = useState<SongDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false
    const load = () =>
      api.getSong(id).then((s) => {
        if (cancelled) return
        setSong(s)
        if (s.status === 'queued' || s.status === 'processing') timer = setTimeout(load, 1500)
      }).catch((e: Error) => setError(e.message))
    void load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [id])

  const reanalyze = async () => {
    const meta = await api.reanalyze(id)
    setSong({ ...meta, analysis: null })
    const poll = async () => {
      const s = await api.getSong(id)
      setSong(s)
      if (s.status !== 'ready' && s.status !== 'error') setTimeout(poll, 1500)
    }
    setTimeout(poll, 1500)
  }

  return (
    <div className="mx-auto max-w-3xl pb-40">
      <header className="flex items-center gap-3 px-4 pt-5">
        <button onClick={() => navigate('/')} className="rounded-lg border border-line px-3 py-1.5 text-sm">→ חזרה</button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{song?.title ?? ''}</h1>
      </header>
      {error && <p className="p-4 text-bad">{error}</p>}
      {song && song.status !== 'ready' && <Processing song={song} onRetry={reanalyze} />}
      {song?.status === 'ready' && song.analysis && (
        <Lesson songId={id} analysis={song.analysis} onReanalyze={reanalyze} />
      )}
    </div>
  )
}

function Processing({ song, onRetry }: { song: SongDetail; onRetry: () => void }) {
  if (song.status === 'error') {
    return (
      <div className="m-4 rounded-2xl border border-bad/40 bg-surface p-5">
        <p className="font-bold text-bad">הניתוח נכשל</p>
        <p className="mt-1 text-sm text-muted">{song.error}</p>
        <button onClick={onRetry} className="mt-4 rounded-xl bg-accent px-4 py-2 font-bold text-bg">נסה שוב</button>
      </div>
    )
  }
  return (
    <div className="m-4 rounded-2xl border border-line bg-surface p-6 text-center">
      <div className="mb-2 text-4xl">🎧</div>
      <p className="font-bold">{song.stage_text}…</p>
      <div className="mx-auto mt-4 h-2 max-w-sm overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${song.progress ?? 0}%` }} />
      </div>
      <p className="mt-3 text-xs text-muted">הניתוח לוקח בדרך כלל פחות מדקה</p>
    </div>
  )
}

const SPEEDS = [0.5, 0.75, 0.9, 1]
const MODE_HE = { major: "מז'ור", minor: 'מינור' } as const

function Lesson({ songId, analysis, onReanalyze }: { songId: string; analysis: Analysis; onReanalyze: () => void }) {
  const { beats, bars, chords, sections, meter } = analysis
  const player = usePlayer(api.audioUrl(songId), beats)
  const { time } = player

  const beatIdx = indexAt(beats, time, (b) => b.t)
  const beat = beatIdx >= 0 ? beats[beatIdx] : null
  const chordIdx = indexAt(chords, time, (c) => c.start)
  const current = chordIdx >= 0 ? chords[chordIdx] : null

  const next = useMemo(() => {
    for (let i = chordIdx + 1; i < chords.length; i++) {
      if (chords[i].label !== 'N' && chords[i].label !== current?.label) return chords[i]
    }
    return null
  }, [chords, chordIdx, current?.label])
  const beatsToNext = next ? indexAt(beats, next.start - 0.01, (b) => b.t) - beatIdx + 1 : null

  const currentSection = sections.find((s) => time >= s.start && time < s.end)
  const loopedSection = player.loop && sections.find((s) => s.start === player.loop!.start && s.end === player.loop!.end)

  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 pt-3 text-sm" dir="rtl">
        <Chip>{Math.round(analysis.bpm)} BPM</Chip>
        <Chip>סולם <span dir="ltr">{analysis.key.tonic}</span> {MODE_HE[analysis.key.mode]}</Chip>
        <Chip><span dir="ltr">{meter}/4</span></Chip>
        <Chip>{analysis.chord_set.length} אקורדים</Chip>
      </div>

      {/* Now / next */}
      <section className="mx-4 mt-4 rounded-3xl border border-line bg-surface p-4">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4" dir="ltr">
          <div className="flex items-center gap-3">
            <ChordDiagram label={current?.label ?? 'N'} className="w-28 shrink-0 sm:w-36" />
            <div>
              <div className="text-5xl font-extrabold sm:text-6xl">{current && current.label !== 'N' ? current.label : '–'}</div>
              {current && current.confidence < 0.5 && current.label !== 'N' && (
                <div className="mt-1 text-xs text-muted" dir="rtl">זיהוי לא ודאי</div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center opacity-70">
            <div className="text-xs text-muted" dir="rtl">הבא</div>
            <div className="text-2xl font-bold">{next?.label ?? ''}</div>
            {next && <ChordDiagram label={next.label} className="w-16 sm:w-20" />}
            {beatsToNext !== null && beatsToNext > 0 && beatsToNext <= 8 && (
              <div className="text-xs text-accent" dir="rtl">בעוד {beatsToNext} {beatsToNext === 1 ? 'פעמה' : 'פעמות'}</div>
            )}
          </div>
        </div>
        <div className="mt-4">
          <BeatCounter meter={meter} beat={beat?.beat ?? 0} active={player.playing || time > 0} />
        </div>
      </section>

      <div className="mt-4">
        <Timeline bars={bars} sections={sections} currentBar={beat?.bar ?? -99} currentBeat={beat?.beat ?? 0} onSeek={player.seek} />
      </div>

      {/* Sections */}
      <section className="mx-4 mt-6">
        <h2 className="mb-1 text-lg font-bold">מבנה השיר</h2>
        <p className="mb-3 text-sm text-muted">קטעים עם אותו רצף אקורדים מסומנים באותה אות. לחץ "לופ" כדי לתרגל קטע שוב ושוב.</p>
        <div className="space-y-2">
          {sections.filter((s) => s.label !== '-').map((s) => {
            const active = currentSection === s
            const looped = loopedSection === s
            return (
              <div key={`${s.start_bar}`} className={`flex items-center gap-3 rounded-xl border p-3 ${active ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg font-extrabold text-bg" style={{ background: sectionColor(s.label) }}>
                  {s.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1" dir="ltr">
                    {s.progression.filter((c) => c !== 'N').map((c, i) => (
                      <span key={i} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-sm font-bold">{c}</span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {formatTime(s.start)} · {s.end_bar - s.start_bar + 1} תיבות{s.repeats > 1 ? ` · ${s.repeats} חזרות` : ''}
                  </div>
                </div>
                <button onClick={() => player.seek(s.start)} className="rounded-lg border border-line px-2.5 py-1.5 text-sm">נגן</button>
                <button onClick={() => player.setLoop(looped ? null : { start: s.start, end: s.end })}
                  className={`rounded-lg px-2.5 py-1.5 text-sm font-bold ${looped ? 'bg-accent text-bg' : 'border border-line'}`}>
                  לופ
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Chord sheet */}
      <section className="mx-4 mt-8">
        <h2 className="mb-3 text-lg font-bold">האקורדים בשיר</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5" dir="ltr">
          {analysis.chord_set.map((label) => {
            const difficulty = voicingFor(label)?.difficulty
            return (
              <div key={label} className="rounded-xl border border-line bg-surface p-2 text-center">
                <div className="text-lg font-bold">{label}</div>
                <ChordDiagram label={label} className="mx-auto w-full max-w-24" />
                {difficulty === 'hard' && <div className="text-xs text-accent" dir="rtl">ברֶה</div>}
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3 text-xs text-muted">
          <span>הזיהוי אוטומטי ועשוי לטעות לפעמים, במיוחד באקורדים מורכבים.</span>
          <button onClick={onReanalyze} className="shrink-0 rounded-lg border border-line px-3 py-1.5">נתח מחדש</button>
        </div>
      </section>

      <Controls player={player} />
    </>
  )
}

function Controls({ player }: { player: ReturnType<typeof usePlayer> }) {
  const { time, duration, playing, rate, loop, metronome } = player
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted" dir="ltr">
          <span className="w-10">{formatTime(time)}</span>
          <input type="range" min={0} max={duration || 0} step={0.1} value={time}
            onChange={(e) => player.seek(Number(e.target.value))} className="flex-1" aria-label="מיקום בשיר" />
          <span className="w-10 text-end">{formatTime(duration)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => player.setRate(s)}
                className={`rounded-lg px-2 py-1.5 text-sm ${rate === s ? 'bg-accent font-bold text-bg' : 'bg-surface-2'}`}>
                {Math.round(s * 100)}%
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2" dir="ltr">
            <button onClick={() => player.seek(time - 5)} className="rounded-full bg-surface-2 px-3 py-2 text-sm" aria-label="5 שניות אחורה">⟲5</button>
            <button onClick={player.toggle} aria-label={playing ? 'השהה' : 'נגן'}
              className="flex size-14 items-center justify-center rounded-full bg-accent text-2xl text-bg">
              {playing ? '❚❚' : '▶'}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => player.setMetronome(!metronome)}
              className={`rounded-lg px-2 py-1.5 text-sm ${metronome ? 'bg-accent font-bold text-bg' : 'bg-surface-2'}`}>
              מטרונום
            </button>
            {loop && (
              <button onClick={() => player.setLoop(null)} className="rounded-lg bg-surface-2 px-2 py-1.5 text-sm">בטל לופ</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-line bg-surface px-3 py-1">{children}</span>
}
