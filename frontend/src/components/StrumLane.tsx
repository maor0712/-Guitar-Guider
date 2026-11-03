import { useEffect, useRef } from 'react'
import type { Beat, ChordSegment } from '../api'
import type { Hit } from '../lib/hits'
import { tick } from '../lib/sound'
import { indexAt } from '../lib/timing'

interface Props {
  hits: Hit[]
  beats: Beat[]
  chords: ChordSegment[]
  /** Shape name to show for a sounding chord (capo/simplify applied). */
  shape: (label: string) => string
  getTime: () => number
  playing: boolean
  stepsPerSecond: number
  audible: boolean
}

const HEIGHT = 200
const STRING_TOP = 44
const STRING_GAP = 20
const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e']
const COLORS = { down: '#f59e0b', up: '#38bdf8', thumb: '#f59e0b', finger: '#a78bfa', string: '#cbbfb3', muted: '#6b5f55' }

const stringY = (s: number) => STRING_TOP + s * STRING_GAP

/**
 * Strings drawn as seen when looking down at your guitar: low E on top, so a
 * down-strum arrow points down. Notes scroll right-to-left onto the hit line.
 */
export function StrumLane({ hits, beats, chords, shape, getTime, playing, stepsPerSecond, audible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const props = useRef({ hits, beats, chords, shape, getTime, playing, stepsPerSecond, audible })
  props.current = { hits, beats, chords, shape, getTime, playing, stepsPerSecond, audible }

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let width = 0
    let frame = 0
    let lastTime = -1

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      canvas.width = width * dpr
      canvas.height = HEIGHT * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.direction = 'ltr'
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = () => {
      const p = props.current
      const now = p.getTime()
      const hitX = Math.max(56, width * 0.2)
      const pps = Math.min(320, Math.max(110, 40 * p.stepsPerSecond))
      const xOf = (t: number) => hitX + (t - now) * pps
      const tStart = now - hitX / pps
      const tEnd = now + (width - hitX) / pps

      // Audible guide: click for every hit that crossed the line since the last frame.
      if (p.audible && p.playing && lastTime >= 0 && now > lastTime && now - lastTime < 0.25) {
        for (let i = Math.max(0, indexAt(p.hits, lastTime, (h) => h.t) + 1); i < p.hits.length && p.hits[i].t <= now; i++) {
          const h = p.hits[i]
          tick(h.kind === 'U' ? 1400 : h.kind === 'D' ? 950 : h.strings[0] <= 2 ? 700 : 1200, h.accent ? 0.35 : 0.2, 0.04)
        }
      }
      lastTime = now

      ctx.clearRect(0, 0, width, HEIGHT)

      // Fretboard wood.
      const boardTop = stringY(0) - 14
      const boardBottom = stringY(5) + 14
      const wood = ctx.createLinearGradient(0, boardTop, 0, boardBottom)
      wood.addColorStop(0, '#3b2a20')
      wood.addColorStop(1, '#2a1e17')
      ctx.fillStyle = wood
      ctx.fillRect(0, boardTop, width, boardBottom - boardTop)

      // Beat grid and count labels.
      ctx.textAlign = 'center'
      for (let i = Math.max(0, indexAt(p.beats, tStart, (b) => b.t)); i < p.beats.length && p.beats[i].t <= tEnd; i++) {
        const b = p.beats[i]
        const x = xOf(b.t)
        ctx.strokeStyle = b.beat === 1 ? '#8a7a6c' : '#4a3d33'
        ctx.lineWidth = b.beat === 1 ? 2 : 1
        ctx.beginPath()
        ctx.moveTo(x, boardTop)
        ctx.lineTo(x, boardBottom)
        ctx.stroke()
      }

      // Strings, vibrating after they are hit.
      for (let s = 0; s < 6; s++) {
        let amp = 0
        for (let i = indexAt(p.hits, now, (h) => h.t); i >= 0 && now - p.hits[i].t < 0.6; i--) {
          if (p.hits[i].strings.includes(s)) {
            amp = 3.2 * Math.exp(-(now - p.hits[i].t) * 7)
            break
          }
        }
        ctx.strokeStyle = amp > 0.3 ? '#fff4e0' : COLORS.string
        ctx.lineWidth = 0.8 + (5 - s) * 0.35
        ctx.beginPath()
        const y = stringY(s)
        for (let x = 0; x <= width; x += 6) {
          const wobble = amp * Math.sin(x * 0.09 + now * 90 + s) * Math.sin((x / width) * Math.PI)
          if (x === 0) ctx.moveTo(x, y + wobble)
          else ctx.lineTo(x, y + wobble)
        }
        ctx.stroke()
      }

      // Hit line.
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)'
      ctx.fillRect(hitX - 14, boardTop, 28, boardBottom - boardTop)
      ctx.strokeStyle = COLORS.down
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(hitX, boardTop - 4)
      ctx.lineTo(hitX, boardBottom + 4)
      ctx.stroke()

      // Chord names at each change.
      ctx.font = 'bold 15px Rubik, sans-serif'
      ctx.textAlign = 'left'
      for (let i = Math.max(0, indexAt(p.chords, tStart, (c) => c.start)); i < p.chords.length && p.chords[i].start <= tEnd; i++) {
        const c = p.chords[i]
        if (c.label === 'N') continue
        const x = Math.max(xOf(c.start), i === indexAt(p.chords, now, (cc) => cc.start) ? 4 : -100)
        ctx.fillStyle = '#f4ede6'
        ctx.fillText(p.shape(c.label), x + 3, 22)
      }

      // Hits.
      const counts: { x: number; label: string; on: boolean }[] = []
      for (let i = Math.max(0, indexAt(p.hits, tStart, (h) => h.t)); i < p.hits.length && p.hits[i].t <= tEnd; i++) {
        const h = p.hits[i]
        const x = xOf(h.t)
        const past = h.t < now - 0.08
        ctx.globalAlpha = past ? Math.max(0.15, 1 - (now - h.t) * 2.5) : 1
        if (h.kind === 'P') {
          for (const s of h.strings) {
            ctx.fillStyle = s <= 2 ? COLORS.thumb : COLORS.finger
            ctx.beginPath()
            ctx.arc(x, stringY(s), h.accent ? 9 : 7.5, 0, Math.PI * 2)
            ctx.fill()
          }
        } else {
          drawArrow(ctx, x, stringY(Math.min(...h.strings)) - 6, stringY(Math.max(...h.strings)) + 6,
            h.kind === 'D', h.kind === 'D' ? COLORS.down : COLORS.up, h.accent)
        }
        ctx.globalAlpha = 1
        counts.push({ x, label: h.count, on: Math.abs(h.t - now) < 0.09 })
      }

      ctx.font = 'bold 13px Rubik, sans-serif'
      ctx.textAlign = 'center'
      for (const c of counts) {
        ctx.fillStyle = c.on ? COLORS.down : '#a99d92'
        ctx.fillText(c.label, c.x, HEIGHT - 12)
      }

      // String names.
      ctx.font = '11px Rubik, sans-serif'
      ctx.fillStyle = '#a99d92'
      ctx.textAlign = 'left'
      STRING_NAMES.forEach((name, s) => ctx.fillText(name, 4, stringY(s) + 4))

      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="block h-[200px] w-full" />
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, yTop: number, yBottom: number,
  down: boolean, color: string, accent: boolean) {
  const head = 9
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = accent ? 6 : 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, down ? yTop : yTop + head)
  ctx.lineTo(x, down ? yBottom - head : yBottom)
  ctx.stroke()
  const tip = down ? yBottom : yTop
  const base = down ? yBottom - head - 2 : yTop + head + 2
  ctx.beginPath()
  ctx.moveTo(x, tip)
  ctx.lineTo(x - head, base)
  ctx.lineTo(x + head, base)
  ctx.closePath()
  ctx.fill()
}
