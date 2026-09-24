// Top HUD: company + date, animated cash, fans, RP, brand, speed controls, trend ticker, log & settings.
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Bell, FlaskConical, Heart, Pause, Play, Settings, Star, X } from 'lucide-react'
import { useGS } from '../../core/store'
import { useUI, setSpeed, openDialog, type Speed } from '../../core/ui'
import { compact, money } from '../../core/format'
import { dayOf, formatDate, isBfcm, monthOf, weekOfMonth, yearOf } from '../../core/time'
import type { Toast, Trend } from '../../core/types'
import { playSfx } from '../audio'

// ---------------------------------------------------------------------------
// Animated cash counter
// ---------------------------------------------------------------------------
const NARROW_Q = '(max-width: 379px)'
let narrow = typeof window !== 'undefined' && !!window.matchMedia?.(NARROW_Q).matches
function fmtCash(v: number) {
  return money(Math.round(v), { cents: false, compact: Math.abs(v) >= (narrow ? 100_000 : 1_000_000) })
}
/** Re-render when the viewport crosses the tiny-phone breakpoint (cash switches to compact). */
function useNarrow() {
  const [n, setN] = useState(narrow)
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW_Q)
    if (!mq) return
    const on = () => { narrow = mq.matches; setN(mq.matches) }
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return n
}
function CashCounter() {
  useNarrow()
  const cash = useGS(s => s.cash)
  const weekProfit = useGS(s => s.finance.thisWeek.profit)
  const textRef = useRef<HTMLSpanElement>(null)
  const shown = useRef(cash)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  useEffect(() => {
    const from = shown.current
    const to = cash
    if (from === to) return
    setFlash(to > from ? 'up' : 'down')
    const flashT = window.setTimeout(() => setFlash(null), 650)
    const start = performance.now()
    const dur = Math.min(900, 350 + Math.log10(Math.abs(to - from) + 1) * 110)
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const e = 1 - Math.pow(1 - t, 3)
      shown.current = from + (to - from) * e
      if (textRef.current) textRef.current.textContent = fmtCash(shown.current)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); window.clearTimeout(flashT); shown.current = to; if (textRef.current) textRef.current.textContent = fmtCash(to) }
  }, [cash])
  return (
    <button type="button" className={clsx('m-cash', cash < 0 && 'neg', flash)} data-cash-counter onClick={() => openDialog('finance')} data-tip="Cash on hand · click for Finance" data-tip-pos="bottom">
      <span className="m-cash-label">Cash</span>
      <span className="m-cash-value" ref={textRef}>{fmtCash(cash)}</span>
      <span className={clsx('m-cash-week', weekProfit > 0 ? 'pos' : weekProfit < 0 ? 'neg' : '')}>
        {weekProfit === 0 ? 'this week $0' : `${weekProfit > 0 ? '▲' : '▼'} ${money(Math.abs(weekProfit), { cents: false, compact: true })} this wk`}
      </span>
    </button>
  )
}

/** Small counter that bumps when its value rises. */
function BumpStat({ icon, value, label, tip, className, onClick }: { icon: React.ReactNode; value: number; label: string; tip: string; className?: string; onClick?: () => void }) {
  const prev = useRef(value)
  const [bump, setBump] = useState(0)
  useEffect(() => {
    if (value > prev.current + 1e-9) setBump(b => b + 1)
    prev.current = value
  }, [value])
  return (
    <button type="button" className={clsx('m-stat', className)} data-tip={tip} data-tip-pos="bottom" onClick={onClick} aria-label={`${label}: ${compact(Math.floor(value))}`}>
      <span className="m-stat-icon">{icon}</span>
      <span className="m-stat-body">
        <span key={bump} className={clsx('m-stat-value', bump > 0 && 'bump')}>{compact(Math.floor(value))}</span>
        <span className="m-stat-label">{label}</span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------
const SPEEDS: { v: Speed; label: string; key: string }[] = [
  { v: 0, label: 'Pause', key: 'Space' },
  { v: 1, label: 'Normal speed', key: '1' },
  { v: 2, label: 'Fast', key: '2' },
  { v: 4, label: 'Hustle mode', key: '3' },
]
function SpeedControls() {
  const speed = useUI(u => u.speed)
  const blocked = useUI(u => u.dialogs.length > 0 || u.pauseLocks.length > 0)
  const modal = useGS(s => s.modals.length > 0 || !!s.current?.awaitingSliders)
  const held = speed !== 0 && (blocked || modal)
  return (
    <div className={clsx('m-speed', speed === 0 && 'paused', held && 'held')} role="group" aria-label="Game speed">
      {SPEEDS.map(s => (
        <button
          key={s.v}
          type="button"
          className={clsx('m-speed-btn', speed === s.v && 'on')}
          aria-pressed={speed === s.v}
          data-tip={`${s.label} (${s.key})`}
          data-tip-pos="bottom"
          data-silent
          onClick={() => { setSpeed(s.v); playSfx('tick') }}
        >
          {s.v === 0 ? <Pause size={16} strokeWidth={2.8} /> : s.v === 1 ? <Play size={16} strokeWidth={2.8} /> : (
            <span className="m-ff">{Array.from({ length: s.v === 2 ? 2 : 3 }, (_, i) => <Play key={i} size={s.v === 2 ? 13 : 11} strokeWidth={3} />)}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trend ticker: active trends + upcoming seasonal moments
// ---------------------------------------------------------------------------
interface TickerItem { id: string; icon: string; text: string; tone: 'hot' | 'cal' | 'live' | 'bad' }
const SEASON: { m: number; w: number; icon: string; label: string; within?: (day: number) => boolean }[] = [
  { m: 10, w: 4, icon: '🛍️', label: 'BFCM', within: isBfcm },
  { m: 1, w: 1, icon: '💘', label: "Valentine's rush", within: d => monthOf(d) === 1 },
  { m: 1, w: 1, icon: '🏮', label: 'Factory holidays (CNY)', within: d => monthOf(d) === 1 && weekOfMonth(d) <= 2 },
  { m: 4, w: 1, icon: '💐', label: 'Gifting season (May)', within: d => monthOf(d) === 4 },
  { m: 5, w: 1, icon: '☀️', label: 'Summer outdoor boom', within: d => monthOf(d) >= 5 && monthOf(d) <= 7 },
  { m: 11, w: 1, icon: '🎁', label: 'Holiday gifting', within: d => monthOf(d) === 11 },
  { m: 0, w: 1, icon: '🥶', label: 'January slump', within: d => monthOf(d) === 0 },
]
function useTickerItems(): TickerItem[] {
  const trends = useGS(s => s.market.trends)
  const day = useGS(s => s.day)
  // platform news with a lasting effect (sim/world sets these): explains why CPMs or reach suddenly moved
  const algoUntil = useGS(s => Number(s.flags['pe:algoUntil'] ?? 0))
  const scareUntil = useGS(s => Number(s.flags['pe:scareUntil'] ?? 0))
  const week = Math.floor(day / 7)
  return useMemo(() => {
    const items: TickerItem[] = []
    const wksLeft = (until: number) => { const w = Math.max(1, Math.ceil((until - day) / 7)); return `${w} wk${w === 1 ? '' : 's'} left` }
    if (algoUntil > day) items.push({ id: 'algo', icon: '📘', text: `Fadbook algorithm update: CPM ×1.2 · ${wksLeft(algoUntil)}`, tone: 'bad' })
    if (scareUntil > day) items.push({ id: 'scare', icon: '🎵', text: `TikTak ban scare: pricier reach · ${wksLeft(scareUntil)}`, tone: 'bad' })
    const active = (trends as Trend[]).filter(t => t.startDay <= day && day < t.endDay)
    for (const t of active) {
      const wks = Math.max(1, Math.ceil((t.endDay - day) / 7))
      const own = /^\s*\p{Extended_Pictographic}/u.test(t.label)
      items.push({ id: t.id, icon: own ? '' : '🔥', text: `${t.label.trim()} ×${t.mult.toFixed(1)} · ${wks} wk${wks === 1 ? '' : 's'} left`, tone: 'hot' })
    }
    for (const e of SEASON) {
      if (e.within?.(day)) { items.push({ id: `s-${e.label}`, icon: e.icon, text: `${e.label} is on`, tone: 'live' }); continue }
      let d = dayOf(yearOf(day), e.m, e.w)
      if (d <= day) d = dayOf(yearOf(day) + 1, e.m, e.w)
      const wks = Math.ceil((d - day) / 7)
      if (wks <= 6) items.push({ id: `s-${e.label}`, icon: e.icon, text: `${e.label} in ${wks} wk${wks === 1 ? '' : 's'}`, tone: 'cal' })
    }
    if (!items.length) items.push({ id: 'none', icon: '📡', text: 'No hot trends right now. Evergreen products it is.', tone: 'cal' })
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trends, week, algoUntil, scareUntil])
}
function TrendTicker() {
  const items = useTickerItems()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (items.length < 2) return
    const t = window.setInterval(() => setI(x => x + 1), 4200)
    return () => window.clearInterval(t)
  }, [items.length])
  const item = items[i % items.length]
  return (
    <div className="m-ticker" aria-live="polite" data-tip={items.map(x => (x.icon ? `${x.icon} ${x.text}` : x.text)).join('\n')} data-tip-pos="bottom">
      <span className="m-ticker-tag">TRENDS</span>
      <span key={item.id + (i % items.length)} className={clsx('m-ticker-item', item.tone)}>
        {item.icon && <span>{item.icon} </span>}{item.text}
      </span>
      {items.length > 1 && <span className="m-ticker-count">{(i % items.length) + 1}/{items.length}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message log
// ---------------------------------------------------------------------------
/** Most sim messages lead with their own emoji: in the log it replaces the generic kind icon instead of doubling up. */
const LEADING_EMOJI = /^\s*(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*\s*/u
const leadIcon = (t: Toast) => t.text.match(LEADING_EMOJI)?.[0].trim() || KIND_ICON[t.kind]
const KIND_ICON: Record<Toast['kind'], string> = { info: '💬', good: '✅', bad: '⚠️', money: '💰', coach: '🧢', research: '🧪', milestone: '🏆' }
function LogButton() {
  const toasts = useGS(s => s.toasts)
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => toasts[toasts.length - 1]?.id ?? '')
  const lastId = toasts[toasts.length - 1]?.id ?? ''
  const unread = useMemo(() => {
    if (!seen) return toasts.length
    const idx = toasts.findIndex(t => t.id === seen)
    return idx < 0 ? toasts.length : toasts.length - 1 - idx
  }, [toasts, seen])
  useEffect(() => { if (open) setSeen(lastId) }, [open, lastId])
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="m-log" ref={wrap}>
      <button type="button" className={clsx('m-iconbtn', open && 'on')} aria-label="Message log" data-tip="Message log" data-tip-pos="bottom" onClick={() => setOpen(o => !o)}>
        <Bell size={18} strokeWidth={2.4} />
        {unread > 0 && !open && <span className="m-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="m-log-pop k-panel" role="dialog" aria-label="Recent messages">
          <div className="m-log-head">
            <b>Recent messages</b>
            <button type="button" className="k-x" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="m-log-list">
            {toasts.length === 0 && <div className="m-log-empty">Nothing yet. Go make some noise.</div>}
            {[...toasts].reverse().map(t => (
              <div key={t.id} className={clsx('m-log-row', `t-${t.kind}`)}>
                <span className="m-log-ic">{leadIcon(t)}</span>
                <span className="m-log-text">{t.text.replace(LEADING_EMOJI, '')}{typeof t.amount === 'number' && t.amount !== 0 && <b className={t.amount > 0 ? 'pos' : 'neg'}> {money(t.amount, { cents: false, sign: true })}</b>}</span>
                <span className="m-log-day">{formatDate(t.day)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------
function DateBlock() {
  const day = useGS(s => s.day)
  const frac = useUI(u => u.dayFrac)
  const weekPct = (((day % 7) + frac) / 7) * 100
  return (
    <div className="m-date" data-tip={`Day ${day + 1} · a new week starts every 7 days (sales & ad spend settle weekly)`} data-tip-pos="bottom">
      <span className="m-date-text">{formatDate(day)}</span>
      <span className="m-date-bar"><i style={{ width: `${weekPct}%` }} /></span>
    </div>
  )
}

export default function Hud() {
  const company = useGS(s => s.meta.company)
  const fans = useGS(s => s.fans)
  const rp = useGS(s => s.rp)
  const brand = useGS(s => s.brand)
  return (
    <header className="m-hud">
      <div className="m-hud-left">
        <div className="m-brand-mark" aria-hidden="true">⚡</div>
        <div className="m-company">
          <span className="m-company-name" title={company}>{company}</span>
          <DateBlock />
        </div>
      </div>
      <div className="m-hud-mid">
        <CashCounter />
        <BumpStat icon={<Heart size={16} strokeWidth={2.6} />} value={fans} label="Fans" className="fans" tip="Fans: customers on your list. They buy again and boost launches." />
        <BumpStat icon={<FlaskConical size={16} strokeWidth={2.6} />} value={rp} label="RP" className="rp" tip="Research points · click to open Research" onClick={() => openDialog('research')} />
        <BumpStat icon={<Star size={16} strokeWidth={2.6} />} value={brand} label="Brand" className="brand" tip="Brand reputation (0–100): good launches raise it, complaints sink it." />
      </div>
      <div className="m-hud-right">
        <TrendTicker />
        <SpeedControls />
        <LogButton />
        <button type="button" className="m-iconbtn" aria-label="Settings" data-tip="Settings" data-tip-pos="bottom" onClick={() => openDialog('settings')}>
          <Settings size={18} strokeWidth={2.4} />
        </button>
      </div>
    </header>
  )
}

