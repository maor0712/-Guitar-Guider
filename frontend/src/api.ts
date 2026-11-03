export type SongStatus = 'queued' | 'processing' | 'ready' | 'error'

export interface Key {
  tonic: string
  mode: 'major' | 'minor'
  confidence: number
}

export interface SongMeta {
  id: string
  status: SongStatus
  stage?: string
  stage_text?: string
  progress?: number
  title?: string
  artist?: string | null
  duration?: number
  thumbnail?: string | null
  source: 'youtube' | 'upload'
  video_id?: string
  error?: string | null
  bpm?: number
  key?: Key
  chord_set?: string[]
}

export interface Beat {
  t: number
  bar: number
  beat: number
}

export interface Bar {
  index: number
  start: number
  end: number
  chords: string[]
}

export interface ChordSegment {
  start: number
  end: number
  label: string
  root: string | null
  quality: string | null
  confidence: number
}

export interface Section {
  label: string
  start: number
  end: number
  start_bar: number
  end_bar: number
  repeats: number
  progression: string[]
}

export interface Analysis {
  version: number
  separated?: boolean
  edited?: boolean
  duration: number
  bpm: number
  meter: number
  tuning_cents: number
  key: Key
  beats: Beat[]
  bars: Bar[]
  chords: ChordSegment[]
  sections: Section[]
  chord_set: string[]
}

export interface SongDetail extends SongMeta {
  analysis: Analysis | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let message = `שגיאה (${res.status})`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      // keep the generic message
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export interface Settings {
  youtube_cookies: boolean
}

export const api = {
  getSettings: () => request<Settings>('/api/settings'),
  uploadCookies: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Settings>('/api/settings/youtube-cookies', { method: 'POST', body: form })
  },
  deleteCookies: () => request<Settings>('/api/settings/youtube-cookies', { method: 'DELETE' }),
  listSongs: () => request<SongMeta[]>('/api/songs'),
  getSong: (id: string) => request<SongDetail>(`/api/songs/${id}`),
  addYoutube: (url: string) =>
    request<SongMeta>('/api/songs/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<SongMeta>('/api/songs/upload', { method: 'POST', body: form })
  },
  editChord: (id: string, index: number, label: string, scope: 'one' | 'all') =>
    request<Analysis>(`/api/songs/${id}/chords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, label, scope }),
    }),
  reanalyze: (id: string) => request<SongMeta>(`/api/songs/${id}/reanalyze`, { method: 'POST' }),
  deleteSong: (id: string) => request<{ ok: boolean }>(`/api/songs/${id}`, { method: 'DELETE' }),
  audioUrl: (id: string) => `/api/songs/${id}/audio`,
}
