// Shared bits for the launch UI (ProjectCard, LiveProducts, DecisionTray, launch dialogs). OWNER: ui-launch.
import './launch.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Bug, Eye, FlaskConical, Gem, MousePointerClick } from 'lucide-react'
import { create } from 'zustand'
import { useGame } from '../../core/store'
import type { ComboRating, GameState, Points } from '../../core/types'
import { productImage } from '../../core/assets'
import { money } from '../../core/format'
import { findProduct, NICHES } from '../../data/catalog'
import { COMBO_META } from '../../data/combos'
import { RESEARCH } from '../../data/research'
import { officeName } from '../../data/offices'
import { researchState } from '../../sim/research'

// ---------------------------------------------------------------------------
// Store access
// ---------------------------------------------------------------------------
/** Null-safe game-state selector. `fallback` must be a stable value (primitive or module constant). */
export function useG<T>(sel: (s: GameState) => T, fallback: T): T {
  return useGame(st => (st.state ? sel(st.state) : fallback))
}
export const EMPTY: readonly never[] = Object.freeze([]) as readonly never[]

/** UI-only launch state: decision tray collapse + "flash this decision" requests from live cards. */
export const useLaunchUI = create<{ trayCollapsed: boolean; flash: { id: string; n: number } | null; set: (p: Partial<{ trayCollapsed: boolean; flash: { id: string; n: number } | null }>) => void }>()(set => ({
  trayCollapsed: false,
  flash: null,
  set: p => set(p),
}))
let flashSeq = 0
/** Scroll the decision tray to a decision and make it wiggle. */
export function flashDecision(id: string) {
  useLaunchUI.getState().set({ trayCollapsed: false, flash: { id, n: ++flashSeq } })
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export const usd = (n: number) => money(n, { cents: false, compact: Math.abs(n) >= 100_000 })
export const usdSigned = (n: number) => money(n, { cents: false, sign: true, compact: Math.abs(n) >= 100_000 })
export const usdC = (n: number) => money(n, { cents: true })
/** Compact from $10K up (tight stat tiles). */
export const usdK = (n: number) => money(n, { cents: false, compact: Math.abs(n) >= 10_000 })
export const pct1 = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 2 : 1)}%`
export const x2 = (n: number) => (n >= 99 ? '∞' : n.toFixed(2))

/** Split a leading emoji/glyph off a sentence ("🩸 Kept a loser…" → ["🩸", "Kept a loser…"]). */
export function splitLead(text: string): [string, string] {
  const m = text.match(/^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[️‍]|\p{Extended_Pictographic}|\p{Emoji_Modifier})*|✓✓|✓|~|✗)\s*/u)
  return m ? [m[1], text.slice(m[0].length)] : ['', text]
}

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
export { reduceMotion }

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------
export const POINT_UI: Record<keyof Points, { label: string; color: string; Icon: typeof Eye; emoji: string }> = {
  conv: { label: 'Conversion', color: 'var(--k-conv)', Icon: MousePointerClick, emoji: '🔵' },
  traffic: { label: 'Traffic', color: 'var(--k-traffic)', Icon: Eye, emoji: '🟠' },
  aov: { label: 'Basket', color: 'var(--k-aov)', Icon: Gem, emoji: '💜' },
  research: { label: 'Research', color: 'var(--k-research)', Icon: FlaskConical, emoji: '🟣' },
  bugs: { label: 'Complaints', color: 'var(--k-bugs)', Icon: Bug, emoji: '🔴' },
}

// ---------------------------------------------------------------------------
// Animated number
// ---------------------------------------------------------------------------
/** Tween a number toward `target` (ease-out). Starts from `from` on mount (default: target). */
export function useCountUp(target: number, duration = 650, from?: number): number {
  const [v, setV] = useState(from ?? target)
  const cur = useRef(from ?? target)
  useEffect(() => {
    if (!Number.isFinite(target)) return
    if (reduceMotion() || duration <= 0) { cur.current = target; setV(target); return }
    const start = cur.current
    if (start === target) return
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration)
      const e = 1 - Math.pow(1 - k, 3)
      const x = start + (target - start) * e
      cur.current = x
      setV(x)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return v
}

// ---------------------------------------------------------------------------
// Product thumbnail (white studio tile; falls back to the niche emoji)
// ---------------------------------------------------------------------------
export function ProductThumb({ productId, size = 48, className, rounded = 12 }: { productId: string; size?: number; className?: string; rounded?: number }) {
  const [broken, setBroken] = useState(false)
  const p = findProduct(productId)
  return (
    <div className={clsx('l-thumb', className)} style={{ width: size, height: size, borderRadius: rounded }}>
      {broken || !p ? (
        <span style={{ fontSize: size * 0.5 }} aria-hidden="true">{p ? NICHES[p.niche]?.icon ?? '📦' : '📦'}</span>
      ) : (
        <img src={productImage(productId)} alt={p.name} loading="lazy" draggable={false} onError={() => setBroken(true)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Playbook knowledge chip (✓✓ / ✓ / ~ / ✗ / ?) — ONLY feed it ratings from s.playbook.
// ---------------------------------------------------------------------------
export function ComboChip({ rating, label, tip, typical, big }: { rating?: ComboRating; label?: ReactNode; tip?: string; typical?: boolean; big?: boolean }) {
  const meta = rating ? COMBO_META[rating] : null
  return (
    <span className={clsx('l-combo', rating ?? 'unknown', typical && 'typical', big && 'big')} data-tip={tip ?? ''}>
      <b>{meta ? meta.icon : '?'}</b>
      {label && <span>{label}</span>}
    </span>
  )
}
export const RATING_WORD: Record<ComboRating, string> = { great: 'Great fit', good: 'Good fit', ok: 'So-so', bad: 'Bad fit' }

// ---------------------------------------------------------------------------
// Two-step confirm button (click → "Sure?" for 3 s)
// ---------------------------------------------------------------------------
export function ConfirmButton({ children, confirm, onConfirm, className, disabled, tip, stop }: { children: ReactNode; confirm: ReactNode; onConfirm: () => void; className?: string; disabled?: boolean; tip?: string; stop?: boolean }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={clsx(className, armed && 'armed')}
      disabled={disabled}
      data-tip={armed ? '' : tip ?? ''}
      onClick={e => {
        if (stop) e.stopPropagation()
        if (armed) { setArmed(false); onConfirm() } else setArmed(true)
      }}
    >
      {armed ? confirm : children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Mini weekly bars (sparkline) — green = profitable week, red = losing week
// ---------------------------------------------------------------------------
export interface BarDatum { value: number; profit: number; label: string }
export function MiniBars({ data, max = 12, height = 34, className }: { data: BarDatum[]; max?: number; height?: number; className?: string }) {
  const shown = data.slice(-max)
  const top = Math.max(1, ...shown.map(d => d.value))
  const pad = Math.max(0, max - shown.length)
  return (
    <div className={clsx('l-minibars', className)} style={{ height }} role="img" aria-label={`Weekly revenue, last ${shown.length} weeks`}>
      {Array.from({ length: pad }, (_, i) => <i key={`p${i}`} className="ghost" />)}
      {shown.map((d, i) => (
        <i key={i} className={d.profit >= 0 ? 'pos' : 'neg'} style={{ height: `${Math.max(6, (d.value / top) * 100)}%` }} data-tip={d.label} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Research lock hints ("🧪 Beauty niche · 30 RP")
// ---------------------------------------------------------------------------
export interface LockHint { text: string; nodeId?: string; ready?: boolean }
export function researchHint(s: GameState, kind: 'niche' | 'angle' | 'platform' | 'size', id: string): LockHint {
  const node = RESEARCH.find(n => n.unlocks[kind] === id)
  if (!node) return { text: 'Locked' }
  const st = researchState(s, node.id)
  const cost = `${node.cost} 🟣${node.cash ? ` + ${usd(node.cash)}` : ''}`
  if (st === 'ready') return { text: `🧪 Research ${node.name} now (${cost})`, nodeId: node.id, ready: true }
  return { text: `🧪 Research: ${node.name} · ${cost}`, nodeId: node.id }
}
export const officeLabel = (tier: number) => officeName(tier)

/** Deterministic pick from a list by a string seed (stable per launch id). */
export function pickBy<T>(seed: string, arr: readonly T[]): T {
  let h = 7
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return arr[Math.abs(h) % arr.length]
}
