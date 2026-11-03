import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type SongMeta } from '../api'
import { navigate } from '../router'

export function Home() {
  const [songs, setSongs] = useState<SongMeta[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    api.listSongs().then(setSongs).catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Poll while something is still being processed.
  const pending = songs.some((s) => s.status === 'queued' || s.status === 'processing')
  useEffect(() => {
    if (!pending) return
    const id = setInterval(refresh, 1500)
    return () => clearInterval(id)
  }, [pending, refresh])

  const run = async (action: () => Promise<SongMeta>) => {
    setBusy(true)
    setError(null)
    try {
      const song = await action()
      setUrl('')
      if (song.status === 'ready') navigate(`/song/${song.id}`)
      else refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (song: SongMeta) => {
    if (!confirm(`למחוק את "${song.title ?? song.id}"?`)) return
    await api.deleteSong(song.id)
    refresh()
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold">🎸 Guitar Guider</h1>
        <p className="mt-1 text-muted">המורה הפרטי שלך לגיטרה. שלח שיר, ואני אלמד אותך לנגן אותו.</p>
      </header>

      <form className="rounded-2xl border border-line bg-surface p-4"
        onSubmit={(e) => { e.preventDefault(); if (url.trim()) void run(() => api.addYoutube(url.trim())) }}>
        <label className="mb-2 block text-sm font-medium text-muted" htmlFor="yt">קישור מיוטיוב</label>
        <div className="flex gap-2">
          <input id="yt" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-3 text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none" />
          <button disabled={busy || !url.trim()}
            className="rounded-xl bg-accent px-5 font-bold text-bg disabled:opacity-40">
            נתח
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <span>או</span>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}
            className="rounded-lg border border-line px-3 py-1.5 text-ink hover:border-accent">
            העלאת קובץ שמע
          </button>
          <input ref={fileInput} type="file" accept="audio/*,video/mp4,.webm,.opus" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(() => api.upload(f)); e.target.value = '' }} />
        </div>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </form>

      <h2 className="mb-3 mt-10 text-lg font-bold">השירים שלי</h2>
      {songs.length === 0 && <p className="text-muted">עוד אין שירים. הדבק קישור כדי להתחיל.</p>}
      <ul className="space-y-3">
        {songs.map((song) => (
          <li key={song.id}>
            <SongCard song={song} onDelete={() => void remove(song)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SongCard({ song, onDelete }: { song: SongMeta; onDelete: () => void }) {
  const ready = song.status === 'ready'
  const thumb = song.video_id ? `https://i.ytimg.com/vi/${song.video_id}/mqdefault.jpg` : null
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-start disabled:cursor-default"
        disabled={!ready && song.status !== 'error'} onClick={() => navigate(`/song/${song.id}`)}>
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-2xl">
          {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : '🎵'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{song.title ?? 'שיר חדש'}</div>
          {ready && (
            <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted" dir="ltr">
              {song.chord_set?.slice(0, 6).map((c) => (
                <span key={c} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-bold text-ink">{c}</span>
              ))}
              {song.bpm ? <span className="px-1 py-0.5">{Math.round(song.bpm)} BPM</span> : null}
            </div>
          )}
          {(song.status === 'queued' || song.status === 'processing') && (
            <div className="mt-2">
              <div className="mb-1 text-xs text-muted">{song.stage_text}…</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-accent transition-all" style={{ width: `${song.progress ?? 0}%` }} />
              </div>
            </div>
          )}
          {song.status === 'error' && <div className="mt-1 truncate text-xs text-bad">שגיאה: {song.error}</div>}
        </div>
      </button>
      <button onClick={onDelete} aria-label="מחיקה" className="rounded-lg p-2 text-muted hover:text-bad">✕</button>
    </div>
  )
}
