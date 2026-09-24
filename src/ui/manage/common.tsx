// Shared building blocks for the management dialogs (Research, Staff, Features, Office, Playbook, Finance,
// Day Job, Milestones). OWNER: ui-management. CSS prefix: g-.
import './manage.css'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { act, emitFX, useGame } from '../../core/store'
import type { ComboRating, FX, GameState, WeekFinance } from '../../core/types'
import type { DialogId } from '../../core/ui'
import { coachDialog } from '../../sim/world'
import { COMBO_META, COMBO_MULT } from '../../data/combos'
import { money } from '../../core/format'

/** The whole game state (dialogs pause the clock, so this only re-renders on player actions). */
export function useGameState(): GameState | null {
  return useGame(st => st.state)
}

/** Coach Kev's first-open tip for this dialog (deduped by the sim). */
export function useCoachOnOpen(id: DialogId) {
  useEffect(() => {
    try { act(s => coachDialog(s, id)) } catch { /* no game loaded */ }
  }, [id])
}

/** Fire FX through the shared bus (confetti / sounds are rendered by the main FX layer). */
export const fx = (...list: FX[]) => emitFX(list)

/** Run a sim action inside act() and report what it returned. */
export function actResult<T>(fn: (s: GameState) => T, fallback: T): T {
  let out = fallback
  act(s => { out = fn(s) })
  return out
}

/** Width of an element (ResizeObserver) — for pixel-exact SVG charts. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(entries => {
      const cw = Math.round(entries[0]?.contentRect.width ?? el.clientWidth)
      setW(prev => (prev === cw ? prev : cw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** Clears a transient highlight after `ms`. */
export function useFlash<T>(ms = 1600): [T | null, (v: T | null) => void] {
  const [v, set] = useState<T | null>(null)
  useEffect(() => {
    if (v === null) return
    const t = window.setTimeout(() => set(null), ms)
    return () => window.clearTimeout(t)
  }, [v, ms])
  return [v, set]
}

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------
export const usd = (n: number) => money(n, { cents: false })
export const usdShort = (n: number) => money(n, { cents: false, compact: true })

/** Launch gross profit of a finance week: revenue − ad spend − COGS − fees (bills & paycheck excluded). */
export const launchProfitOf = (w: WeekFinance) => w.revenue - w.adSpend - w.cogs - w.fees

/** Sum of the last `n` closed finance weeks. */
export function lastWeeks(s: GameState, n: number): WeekFinance[] {
  return s.finance.weeks.slice(-n)
}
export function sumWeeks(weeks: WeekFinance[]) {
  const t = { revenue: 0, adSpend: 0, cogs: 0, fees: 0, expenses: 0, income: 0, profit: 0, launchProfit: 0 }
  for (const w of weeks) {
    t.revenue += w.revenue; t.adSpend += w.adSpend; t.cogs += w.cogs; t.fees += w.fees
    t.expenses += w.expenses; t.income += w.income; t.profit += w.profit; t.launchProfit += launchProfitOf(w)
  }
  return t
}
/** Launch profit over the last 4 closed weeks (≈ one month) — the "can the business carry it?" number. */
export const monthlyLaunchProfit = (s: GameState) => sumWeeks(lastWeeks(s, 4)).launchProfit

// ---------------------------------------------------------------------------
// Small UI pieces
// ---------------------------------------------------------------------------
export function Kpi({ label, value, sub, tone, icon, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'gold'; icon?: ReactNode; className?: string }) {
  return (
    <div className={clsx('g-kpi', tone, className)}>
      <div className="g-kpi-label">{icon && <span className="g-kpi-ic">{icon}</span>}{label}</div>
      <div className="g-kpi-value">{value}</div>
      {sub && <div className="g-kpi-sub">{sub}</div>}
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="g-empty">
      <div className="g-empty-ic">{icon}</div>
      <div className="g-empty-title">{title}</div>
      {children && <div className="g-empty-text">{children}</div>}
      {action && <div className="g-empty-act">{action}</div>}
    </div>
  )
}

/** Inline confirmation strip (no nested modals — keeps the flow arcade-fast). */
export function ConfirmBar({ tone = 'warn', children, actions }: { tone?: 'warn' | 'bad' | 'good' | 'info'; children: ReactNode; actions: ReactNode }) {
  return (
    <div className={clsx('g-confirm', tone)} role="alertdialog">
      <div className="g-confirm-text">{children}</div>
      <div className="g-confirm-actions">{actions}</div>
    </div>
  )
}

export function Note({ icon = '💡', children, tone }: { icon?: ReactNode; children: ReactNode; tone?: 'warn' | 'bad' | 'good' }) {
  return <div className={clsx('g-note', tone)}><span className="g-note-ic">{icon}</span><span>{children}</span></div>
}

/** Playbook knowledge cell: ✓✓ great · ✓ good · ~ ok · ✗ bad · ? unknown. */
export function ComboCell({ rating, tip, size }: { rating?: ComboRating; tip?: string; size?: 'sm' }) {
  const meta = rating ? COMBO_META[rating] : null
  const text = tip ?? (meta ? `${meta.label} fit (×${COMBO_MULT[rating as ComboRating]})` : 'Unknown: launch it to find out')
  return (
    <span className={clsx('g-cc', rating ?? 'unknown', size)} data-tip={text} tabIndex={0} aria-label={text}>
      {meta ? meta.icon : '?'}
    </span>
  )
}

export function ComboLegend() {
  return (
    <div className="g-legend" aria-label="Legend">
      {(['great', 'good', 'ok', 'bad'] as ComboRating[]).map(r => (
        <span key={r} className="g-legend-item"><ComboCell rating={r} size="sm" tip={`${COMBO_META[r].label}: ×${COMBO_MULT[r]} to the launch`} />{COMBO_META[r].label}</span>
      ))}
      <span className="g-legend-item"><ComboCell size="sm" />Unknown</span>
    </div>
  )
}

/** Tiny revenue sparkline (bars). */
export function Spark({ values, className, width = 76 }: { values: number[]; className?: string; width?: number }) {
  const v = values.length ? values : [0]
  const max = Math.max(1, ...v)
  const w = Math.max(40, v.length * 5)
  return (
    <svg className={clsx('g-spark', className)} viewBox={`0 0 ${w} 24`} width={width} height={24} preserveAspectRatio="none" aria-hidden="true">
      {v.map((x, i) => {
        const h = Math.max(1.5, (Math.max(0, x) / max) * 22)
        return <rect key={i} x={i * 5 + 0.5} y={24 - h} width={4} height={h} rx={1.2} />
      })}
    </svg>
  )
}

export const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
