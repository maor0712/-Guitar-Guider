import { useCallback, useEffect, useRef, useState } from 'react'
import type { Beat } from '../api'
import { ensureAudio, tick } from '../lib/sound'
import { indexAt } from '../lib/timing'

export interface LoopRange {
  start: number
  end: number
}

/** Audio playback with slow-down (pitch preserved), A-B looping and a beat-synced click. */
export function usePlayer(src: string, beats: Beat[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastBeat = useRef(-1)
  const loopRef = useRef<LoopRange | null>(null)
  const metronomeRef = useRef(false)

  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRateState] = useState(1)
  const [loop, setLoopState] = useState<LoopRange | null>(null)
  const [metronome, setMetronomeState] = useState(false)

  useEffect(() => {
    const audio = new Audio(src)
    audio.preload = 'auto'
    audio.preservesPitch = true
    audioRef.current = audio
    const onMeta = () => setDuration(audio.duration)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onPause)
    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onPause)
      audio.src = ''
      audioRef.current = null
    }
  }, [src])

  const click = useCallback((accent: boolean) => tick(accent ? 1600 : 1000, accent ? 0.5 : 0.3), [])

  /** Current playback position, read straight from the audio element (for per-frame animation). */
  const getTime = useCallback(() => audioRef.current?.currentTime ?? 0, [])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const audio = audioRef.current
      if (!audio) return
      let t = audio.currentTime
      const range = loopRef.current
      if (range && t >= range.end) {
        audio.currentTime = range.start
        t = range.start
        lastBeat.current = -1
      }
      const beatIdx = indexAt(beats, t, (b) => b.t)
      if (beatIdx !== lastBeat.current) {
        if (metronomeRef.current && beatIdx >= 0 && lastBeat.current !== -1) click(beats[beatIdx].beat === 1)
        lastBeat.current = beatIdx
      }
      setTime(t)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, beats, click])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }, [])

  const play = useCallback(() => { void audioRef.current?.play() }, [])
  const pause = useCallback(() => { audioRef.current?.pause() }, [])

  const seek = useCallback((t: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, t)
    lastBeat.current = -1
    setTime(audio.currentTime)
  }, [])

  const setRate = useCallback((r: number) => {
    if (audioRef.current) audioRef.current.playbackRate = r
    setRateState(r)
  }, [])

  const setLoop = useCallback(
    (range: LoopRange | null) => {
      loopRef.current = range
      setLoopState(range)
      const audio = audioRef.current
      if (range && audio && (audio.currentTime < range.start || audio.currentTime >= range.end)) seek(range.start)
    },
    [seek],
  )

  const setMetronome = useCallback((on: boolean) => {
    if (on) ensureAudio()
    metronomeRef.current = on
    setMetronomeState(on)
  }, [])

  return { time, duration, playing, rate, loop, metronome, getTime, toggle, play, pause, seek, setRate, setLoop, setMetronome }
}
