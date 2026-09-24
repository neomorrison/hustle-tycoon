// Transient juice driven by the sim FX bus: point bubbles, cash pops, confetti and sounds.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bug, Eye, FlaskConical, Gem, MousePointerClick } from 'lucide-react'
import { onFX } from '../../core/store'
import type { FX, Points } from '../../core/types'
import { money } from '../../core/format'
import { playSfx } from '../audio'

// ---------------------------------------------------------------------------
// Point styling (shared with other main components)
// ---------------------------------------------------------------------------
export const POINT_META: Record<keyof Points, { color: string; label: string; Icon: typeof Eye }> = {
  conv: { color: 'var(--k-conv)', label: 'Conversion', Icon: MousePointerClick },
  traffic: { color: 'var(--k-traffic)', label: 'Traffic', Icon: Eye },
  aov: { color: 'var(--k-aov)', label: 'Order value', Icon: Gem },
  research: { color: 'var(--k-research)', label: 'Research', Icon: FlaskConical },
  bugs: { color: 'var(--k-bugs)', label: 'Complaints', Icon: Bug },
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ---------------------------------------------------------------------------
// Bubbles: pop at the worker's avatar, float up, then fly into the project card
// ---------------------------------------------------------------------------
interface BubbleSpec { id: number; x: number; y: number; point: keyof Points; amount: number; delay: number; dx: number }
let bubbleSeq = 0
const MAX_BUBBLES = 36

function fmtPoints(n: number) {
  if (n >= 10) return String(Math.round(n))
  if (n >= 1) return String(Math.round(n))
  return n.toFixed(1)
}

function Bubble({ b, onDone }: { b: BubbleSpec; onDone: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rise = -46 - Math.random() * 22
    const target = document.querySelector('[data-bubble-target]')?.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    // phones stack the scale-call tray between the office and the project card: don't fly bubbles across the calls
    const tray = vw <= 760 ? document.querySelector('.m-decisions .l-tray')?.getBoundingClientRect() : undefined
    const blocked = !!tray && !!target && tray.height > 0 && tray.top >= b.y && tray.bottom <= target.top + 4
    const canFly = !!target && !blocked && target.width > 40 && target.height > 20 && target.top < vh && target.bottom > 0 && target.left < vw && !reduceMotion()
    const frames: Keyframe[] = [
      { transform: `translate(-50%, -50%) translate(0px, 0px) scale(.2)`, opacity: 0, offset: 0 },
      { transform: `translate(-50%, -50%) translate(${b.dx * 0.3}px, ${rise * 0.35}px) scale(1.18)`, opacity: 1, offset: 0.12 },
      { transform: `translate(-50%, -50%) translate(${b.dx}px, ${rise}px) scale(1)`, opacity: 1, offset: canFly ? 0.5 : 0.7 },
    ]
    if (canFly && target) {
      const tx = target.left + target.width * (0.3 + Math.random() * 0.4) - b.x
      const ty = target.top + Math.min(28, target.height / 2) - b.y
      frames.push({ transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(.45)`, opacity: 0.9, offset: 1 })
    } else {
      frames.push({ transform: `translate(-50%, -50%) translate(${b.dx * 1.2}px, ${rise - 40}px) scale(.9)`, opacity: 0, offset: 1 })
    }
    const anim = el.animate(frames, { duration: canFly ? 1650 : 1500, delay: b.delay, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' })
    const t = window.setTimeout(() => playSfx('bubble'), b.delay)
    anim.onfinish = () => {
      onDone(b.id)
      if (canFly) {
        const slot = document.querySelector('[data-bubble-target]')
        slot?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.12)' }, { filter: 'brightness(1)' }], { duration: 260 })
      }
    }
    return () => { anim.cancel(); window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const meta = POINT_META[b.point]
  const Icon = meta.Icon
  const fixed = b.amount < 0
  return (
    <div ref={ref} className={`m-bubble p-${b.point}${fixed ? ' fixed' : ''}`} style={{ left: b.x, top: b.y, background: fixed ? 'var(--k-green)' : meta.color }}>
      <Icon size={13} strokeWidth={2.6} />
      <span>{fixed ? '−' : '+'}{fmtPoints(Math.abs(b.amount))}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cash pops near the HUD counter
// ---------------------------------------------------------------------------
interface CashPop { id: number; x: number; y: number; amount: number }
let cashSeq = 0

function CashPopEl({ p, onDone }: { p: CashPop; onDone: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const big = Math.abs(p.amount) >= 10_000
    const anim = el.animate(
      [
        { transform: 'translate(-50%, 0) scale(.4)', opacity: 0 },
        { transform: `translate(-50%, 10px) scale(${big ? 1.35 : 1.12})`, opacity: 1, offset: 0.15 },
        { transform: 'translate(-50%, 22px) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, 44px) scale(.95)', opacity: 0 },
      ],
      { duration: 1900, easing: 'cubic-bezier(.3,0,.3,1)', fill: 'both' },
    )
    anim.onfinish = () => onDone(p.id)
    return () => anim.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pos = p.amount >= 0
  return (
    <div ref={ref} className={`m-cashpop ${pos ? 'pos' : 'neg'}`} style={{ left: p.x, top: p.y }}>
      {pos ? '+' : '−'}{money(Math.abs(p.amount), { cents: false, compact: Math.abs(p.amount) >= 1_000_000 })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confetti (canvas)
// ---------------------------------------------------------------------------
interface Piece { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; color: string; shape: 0 | 1 | 2; life: number }
const CONFETTI_COLORS = ['#7c4dff', '#ff7a45', '#ff4d8d', '#22c55e', '#f5b700', '#3b82f6', '#ffd54a', '#c026d3']
let fireConfettiImpl: ((power?: number) => void) | null = null
/** Fire a confetti burst from anywhere in the UI (also triggered by 'confetti' FX). */
export function fireConfetti(power = 1) {
  fireConfettiImpl?.(power)
}

function ConfettiCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx2 = cv.getContext('2d')
    if (!ctx2) return
    let pieces: Piece[] = []
    let raf = 0
    let last = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      cv.width = window.innerWidth * dpr
      cv.height = window.innerHeight * dpr
    }
    resize()
    window.addEventListener('resize', resize)
    const spawn = (n: number, x: number, y: number, angle: number, spread: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * spread
        const v = speed * (0.55 + Math.random() * 0.6)
        pieces.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
          w: 7 + Math.random() * 7, h: 4 + Math.random() * 6, color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
          shape: Math.random() < 0.6 ? 0 : Math.random() < 0.5 ? 1 : 2, life: 0,
        })
      }
    }
    const step = (now: number) => {
      const dt = Math.min(34, now - (last || now)) / 16.67
      last = now
      ctx2.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx2.clearRect(0, 0, cv.width, cv.height)
      const H = window.innerHeight
      pieces = pieces.filter(p => p.y < H + 40 && p.life < 420)
      for (const p of pieces) {
        p.life += dt
        p.vy += 0.32 * dt
        p.vx *= Math.pow(0.985, dt)
        p.vy *= Math.pow(0.985, dt)
        p.x += p.vx * dt + Math.sin((p.life + p.w) / 9) * 0.6
        p.y += p.vy * dt
        p.r += p.vr * dt
        const fade = p.life > 330 ? Math.max(0, 1 - (p.life - 330) / 90) : 1
        ctx2.globalAlpha = fade
        ctx2.fillStyle = p.color
        ctx2.save()
        ctx2.translate(p.x, p.y)
        ctx2.rotate(p.r)
        if (p.shape === 0) {
          ctx2.scale(1, Math.cos(p.life / 5))
          ctx2.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        } else if (p.shape === 1) {
          ctx2.beginPath()
          ctx2.arc(0, 0, p.h * 0.7, 0, Math.PI * 2)
          ctx2.fill()
        } else {
          ctx2.beginPath()
          ctx2.moveTo(0, -p.w / 2)
          ctx2.lineTo(p.w / 2, p.w / 2)
          ctx2.lineTo(-p.w / 2, p.w / 2)
          ctx2.closePath()
          ctx2.fill()
        }
        ctx2.restore()
      }
      ctx2.globalAlpha = 1
      if (pieces.length) raf = requestAnimationFrame(step)
      else { raf = 0; last = 0 }
    }
    fireConfettiImpl = (power = 1) => {
      if (reduceMotion()) return
      const W = window.innerWidth
      const H = window.innerHeight
      const k = Math.max(0.5, Math.min(2.5, power))
      const n = Math.round((W < 600 ? 70 : 120) * k)
      spawn(n, W * 0.08, H * 0.75, -Math.PI / 3, 0.9, 22)
      spawn(n, W * 0.92, H * 0.75, (-2 * Math.PI) / 3, 0.9, 22)
      spawn(Math.round(n * 0.6), W / 2, H * 0.3, -Math.PI / 2, Math.PI * 1.6, 12)
      if (!raf) raf = requestAnimationFrame(step)
    }
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
      fireConfettiImpl = null
    }
  }, [])
  return <canvas ref={ref} className="m-confetti" aria-hidden="true" />
}

// ---------------------------------------------------------------------------
// The layer
// ---------------------------------------------------------------------------
export default function FxLayer() {
  const [bubbles, setBubbles] = useState<BubbleSpec[]>([])
  const [pops, setPops] = useState<CashPop[]>([])
  useEffect(() => {
    const bubbleBuf = new Map<string, { personId: string; point: keyof Points; amount: number }>()
    let cashBuf = 0
    let bubbleTimer = 0
    let cashTimer = 0
    const flushBubbles = () => {
      bubbleTimer = 0
      if (document.hidden) { bubbleBuf.clear(); return }
      const specs: BubbleSpec[] = []
      let i = 0
      for (const e of bubbleBuf.values()) {
        const el = document.querySelector(`[data-person="${CSS.escape(e.personId)}"]`) ?? document.querySelector('[data-person="founder"]')
        const r = el?.getBoundingClientRect()
        if (!r || r.width === 0) continue
        if (Math.abs(e.amount) < 0.3) continue
        specs.push({ id: ++bubbleSeq, x: r.left + r.width / 2 + (Math.random() - 0.5) * r.width * 0.5, y: r.top + r.height * 0.1, point: e.point, amount: e.amount, delay: i * 110 + Math.random() * 90, dx: (Math.random() - 0.5) * 50 })
        i++
      }
      bubbleBuf.clear()
      if (specs.length) setBubbles(cur => [...cur, ...specs].slice(-MAX_BUBBLES))
    }
    const flushCash = () => {
      cashTimer = 0
      const amt = Math.round(cashBuf)
      cashBuf = 0
      if (!amt || document.hidden) return
      const el = document.querySelector('[data-cash-counter]')
      const r = el?.getBoundingClientRect()
      if (!r || r.width === 0) return
      setPops(cur => [...cur, { id: ++cashSeq, x: r.left + r.width / 2 + (Math.random() - 0.5) * 30, y: r.bottom - 4, amount: amt }].slice(-6))
    }
    const off = onFX((list: FX[]) => {
      for (const f of list) {
        switch (f.kind) {
          case 'bubble': {
            if (!f.point || !f.amount || (f.amount < 0 && f.point !== 'bugs')) break
            const personId = f.personId ?? 'founder'
            const key = `${personId}:${f.point}:${f.amount < 0 ? '-' : '+'}`
            const cur = bubbleBuf.get(key)
            if (cur) cur.amount += f.amount
            else bubbleBuf.set(key, { personId, point: f.point, amount: f.amount })
            if (!bubbleTimer) bubbleTimer = window.setTimeout(flushBubbles, 160)
            break
          }
          case 'cash':
            if (f.amount) {
              cashBuf += f.amount
              if (!cashTimer) cashTimer = window.setTimeout(flushCash, 300)
            }
            break
          case 'confetti':
            fireConfetti(f.amount && f.amount > 0 ? f.amount : 1)
            break
          case 'sound':
            if (f.sound) playSfx(f.sound)
            break
        }
      }
    })
    return () => {
      off()
      window.clearTimeout(bubbleTimer)
      window.clearTimeout(cashTimer)
    }
  }, [])
  const doneBubble = (id: number) => setBubbles(cur => cur.filter(b => b.id !== id))
  const donePop = (id: number) => setPops(cur => cur.filter(p => p.id !== id))
  return (
    <>
      <div className="m-fx" aria-hidden="true">
        {bubbles.map(b => <Bubble key={b.id} b={b} onDone={doneBubble} />)}
        {pops.map(p => <CashPopEl key={p.id} p={p} onDone={donePop} />)}
      </div>
      <ConfettiCanvas />
    </>
  )
}
