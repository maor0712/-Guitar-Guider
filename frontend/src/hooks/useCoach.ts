import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChordSegment } from '../api'
import type { Hit } from '../lib/hits'
import { type CoachStats, judge, type Judgment, MATCH_WINDOW, pluckMatches, strumMatches, summarize } from '../lib/judge'
import { Listener, type MicOnset } from '../lib/listener'
import { ensureAudio, getAudioContext, tick } from '../lib/sound'
import { indexAt } from '../lib/timing'
import type { usePlayer } from './usePlayer'

type Player = ReturnType<typeof usePlayer>

export interface CoachFeedback {
  judgments: Map<number, Judgment>
  /** Song times of attacks that matched no expected stroke. */
  extras: number[]
}

export interface LastResult {
  ok: boolean
  text: string
  at: number
}

const LATENCY_KEY = 'gg:latency'

function loadLatency(): number {
  try {
    const v = Number(localStorage.getItem(LATENCY_KEY))
    return Number.isFinite(v) && v > 0 ? v : 0.12
  } catch {
    return 0.12
  }
}

function describe(j: Judgment, hit: Hit): { ok: boolean; text: string } {
  const parts: string[] = []
  const ms = Math.round(Math.abs(j.dt) * 1000)
  if (j.timing === 'perfect') parts.push('בול בזמן')
  else if (j.timing === 'good') parts.push('בזמן')
  else parts.push(j.timing === 'early' ? `מוקדם ב-${ms}ms` : `מאוחר ב-${ms}ms`)
  if (j.sound === 'wrong') parts.push(hit.kind === 'P' ? 'מיתר לא נכון' : 'האקורד לא נשמע נכון')
  else if (j.sound === 'near') parts.push(hit.kind === 'P' ? 'צליל מהאקורד, אבל לא המיתר הנכון' : 'האקורד לא נקי')
  if (j.dir === 'wrong') parts.push(hit.kind === 'D' ? 'היה צריך למטה ↓' : 'היה צריך למעלה ↑')
  const ok = (j.timing === 'perfect' || j.timing === 'good') && j.sound !== 'wrong' && j.dir !== 'wrong'
  return { ok, text: parts.join(' · ') }
}

export function useCoach({ hits, chords, shape, player, waitMode }: {
  hits: Hit[]
  chords: ChordSegment[]
  shape: (label: string) => string
  player: Player
  waitMode: boolean
}) {
  const listener = useRef<Listener | null>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [latency, setLatency] = useState(loadLatency)
  const [sensitivity, setSensitivityState] = useState(6)
  const [stats, setStats] = useState<CoachStats | null>(null)
  const [last, setLast] = useState<LastResult | null>(null)
  const [waiting, setWaiting] = useState<{ index: number; label: string; start: number } | null>(null)
  const [calibrating, setCalibrating] = useState(false)

  const feedback = useRef<CoachFeedback>({ judgments: new Map(), extras: [] })
  const satisfied = useRef(new Set<number>())
  const missCursor = useRef(0)
  const calib = useRef<{ clicks: number[]; onsets: number[] } | null>(null)

  // Chord changes the song waits on: the first chord and every change of shape.
  const changes = useMemo(() => {
    const list: { index: number; start: number; label: string }[] = []
    let prev = ''
    chords.forEach((c, index) => {
      if (c.label === 'N') return
      const s = shape(c.label)
      if (s !== prev) list.push({ index, start: c.start, label: c.label })
      prev = s
    })
    return list
  }, [chords, shape])

  const live = useRef({ hits, player, latency, waiting, waitMode, changes })
  live.current = { hits, player, latency, waiting, waitMode, changes }

  const refreshStats = useCallback(() => {
    const fb = feedback.current
    setStats(summarize(live.current.hits, fb.judgments, fb.extras.length))
  }, [])

  const reset = useCallback(() => {
    feedback.current = { judgments: new Map(), extras: [] }
    satisfied.current.clear()
    missCursor.current = live.current.player.getTime()
    setStats(null)
    setLast(null)
  }, [])

  // Patterns changed -> previous judgments no longer refer to the same strokes.
  useEffect(() => { reset() }, [hits, reset])

  const onOnset = useCallback((onset: MicOnset) => {
    if (calib.current) {
      calib.current.onsets.push(onset.t)
      return
    }
    const { hits, player, latency, waiting } = live.current
    if (waiting) {
      const check = strumMatches(onset.chroma, waiting.label)
      const pluck = pluckMatches(onset.pitch, [], waiting.label)
      if (check !== 'wrong' || pluck === 'near') {
        satisfied.current.add(waiting.index)
        // The stroke played while paused is the one at the chord change: count it as a hit.
        const first = indexAt(hits, waiting.start - MATCH_WINDOW, (h) => h.t) + 1
        if (hits[first] && Math.abs(hits[first].t - waiting.start) < MATCH_WINDOW) {
          feedback.current.judgments.set(first, { timing: 'perfect', dt: 0, sound: check, dir: 'unknown' })
          refreshStats()
        }
        setWaiting(null)
        setLast({ ok: true, text: `${shape(waiting.label)} ✓ ממשיכים`, at: performance.now() })
        player.play()
      } else {
        setLast({ ok: false, text: `זה לא נשמע כמו ${shape(waiting.label)}, נסה שוב`, at: performance.now() })
      }
      return
    }
    if (!player.playing) return

    const ctx = getAudioContext()
    const songTime = player.getTime() - (ctx.currentTime - onset.t) * player.rate - latency * player.rate
    const fb = feedback.current
    let best = -1
    let bestDist = MATCH_WINDOW
    const around = indexAt(hits, songTime, (h) => h.t)
    for (let i = Math.max(0, around - 2); i <= Math.min(hits.length - 1, around + 3); i++) {
      const d = Math.abs(hits[i].t - songTime)
      if (d < bestDist && !fb.judgments.has(i)) { best = i; bestDist = d }
    }
    if (best < 0) {
      fb.extras.push(songTime)
      setLast({ ok: false, text: 'פריטה מיותרת', at: performance.now() })
    } else {
      const j = judge(hits[best], onset, songTime)
      fb.judgments.set(best, j)
      setLast({ ...describe(j, hits[best]), at: performance.now() })
    }
    refreshStats()
  }, [refreshStats, shape])
  const onOnsetRef = useRef(onOnset)
  onOnsetRef.current = onOnset

  // Misses and "wait for me".
  useEffect(() => {
    if (!listening) return
    const id = setInterval(() => {
      const { hits, player, latency, waitMode, changes } = live.current
      const now = player.getTime()
      if (now < missCursor.current - 0.5) {
        // Jumped back: allow judging and waiting again from here.
        missCursor.current = now
        for (const c of changes) if (c.start > now) satisfied.current.delete(c.index)
      }
      if (!player.playing) return

      const fb = feedback.current
      const until = now - MATCH_WINDOW - latency
      let changed = false
      for (let i = Math.max(0, indexAt(hits, missCursor.current, (h) => h.t)); i < hits.length && hits[i].t < until; i++) {
        if (hits[i].t >= missCursor.current && !fb.judgments.has(i)) {
          fb.judgments.set(i, { timing: 'miss', dt: 0, sound: 'unknown', dir: 'unknown' })
          changed = true
        }
      }
      missCursor.current = Math.max(missCursor.current, until)
      if (changed) refreshStats()

      if (waitMode) {
        const next = changes.find((c) => c.start >= now - 0.15 && !satisfied.current.has(c.index))
        if (next && now >= next.start - 0.06) {
          player.pause()
          player.seek(next.start - 0.06)
          setWaiting({ index: next.index, label: next.label, start: next.start })
        }
      }
    }, 30)
    return () => clearInterval(id)
  }, [listening, refreshStats])

  const start = useCallback(async () => {
    setError(null)
    ensureAudio()
    try {
      const l = new Listener()
      l.onOnset = (o) => onOnsetRef.current(o)
      l.onLevel = (rms) => setLevel(rms)
      await l.start()
      l.setFloor(sensitivity)
      listener.current = l
      reset()
      setListening(true)
    } catch (e) {
      const err = e as Error
      setError(err.name === 'NotAllowedError' ? 'צריך לאשר גישה למיקרופון' : err.message)
    }
  }, [reset, sensitivity])

  const stop = useCallback(() => {
    listener.current?.stop()
    listener.current = null
    setListening(false)
    setWaiting(null)
    setLevel(0)
  }, [])

  useEffect(() => () => listener.current?.stop(), [])

  const setSensitivity = useCallback((floor: number) => {
    setSensitivityState(floor)
    listener.current?.setFloor(floor)
  }, [])

  const skipWait = useCallback(() => {
    const w = live.current.waiting
    if (!w) return
    satisfied.current.add(w.index)
    setWaiting(null)
    live.current.player.play()
  }, [])

  /** Play 8 clicks; the player strums on each. The median delay is the round-trip latency. */
  const calibrate = useCallback(() => {
    if (!listener.current) return
    const ctx = getAudioContext()
    const t0 = ctx.currentTime + 1
    const clicks = Array.from({ length: 8 }, (_, i) => t0 + i * 0.8)
    clicks.forEach((t, i) => tick(i === 0 ? 1600 : 1200, 0.6, 0.06, t))
    calib.current = { clicks, onsets: [] }
    setCalibrating(true)
    setTimeout(() => {
      const data = calib.current!
      calib.current = null
      setCalibrating(false)
      const delays = data.clicks
        .map((c) => data.onsets.find((o) => o - c > -0.1 && o - c < 0.5))
        .map((o, i) => (o === undefined ? null : o - data.clicks[i]))
        .filter((d): d is number => d !== null)
        .sort((a, b) => a - b)
      if (delays.length < 4) {
        setError('לא שמעתי מספיק פריטות בזמן הכיול. נסה שוב ופרוט חזק על כל תקתוק.')
        return
      }
      const median = Math.min(0.6, Math.max(0, delays[Math.floor(delays.length / 2)]))
      setLatency(median)
      try { localStorage.setItem(LATENCY_KEY, String(median)) } catch { /* not persisted */ }
      setLast({ ok: true, text: `הכיול הסתיים: השהיה של ${Math.round(median * 1000)}ms`, at: performance.now() })
    }, (clicks[clicks.length - 1] - ctx.currentTime + 1) * 1000)
  }, [])

  return {
    listening, error, level, latency, sensitivity, stats, last, waiting, calibrating, feedback,
    start, stop, reset, setSensitivity, skipWait, calibrate,
  }
}
