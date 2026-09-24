// Non-blocking scale calls (s.decisions): cards with the launch thumb, the call, option buttons with costs and an
// expiry bar. Live cards link here with a ⚡ chip (flashDecision). OWNER: ui-launch.
import { memo, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { act } from '../../core/store'
import type { Decision, DecisionOption } from '../../core/types'
import { usePauseWhileMounted } from '../../core/ui'
import { findLaunch, resolveDecision } from '../../sim/sales'
import { playSfx } from '../audio'
import { EMPTY, ProductThumb, reduceMotion, useG, useLaunchUI, usd } from './common'

const KIND: Record<Decision['kind'], { emoji: string; label: string; tone: string }> = {
  scale: { emoji: '🔥', label: 'Scale call', tone: 'good' },
  refresh: { emoji: '😴', label: 'Ad fatigue', tone: 'warn' },
  kill: { emoji: '🩸', label: 'Kill call', tone: 'bad' },
  go_bulk: { emoji: '📦', label: 'Supply deal', tone: 'info' },
  price_match: { emoji: '⚔️', label: 'Price war', tone: 'bad' },
  influencer: { emoji: '🤳', label: 'Influencer offer', tone: 'purple' },
  restock: { emoji: '📦', label: 'Stockout', tone: 'warn' },
  custom: { emoji: '💡', label: 'Decision', tone: 'info' },
}

export default function DecisionTray() {
  const decisions = useG(s => s.decisions, EMPTY as unknown as Decision[])
  const collapsed = useLaunchUI(u => u.trayCollapsed)
  const seen = useRef<Set<string> | null>(null)
  // reading a call shouldn't cost you the call: the clock holds while the mouse is over the tray
  // (only after the mouse actually moves over it — a call popping up under a parked cursor shouldn't freeze time)
  const [hover, setHover] = useState(false)
  const entry = useRef<{ x: number; y: number } | null>(null)
  usePauseWhileMounted('decision-tray', hover && decisions.length > 0 && !collapsed)
  useEffect(() => { if (!decisions.length) { setHover(false); entry.current = null } }, [decisions.length])
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || hover) return
    const en = entry.current
    if (!en) { entry.current = { x: e.clientX, y: e.clientY }; return }
    if (Math.abs(e.clientX - en.x) + Math.abs(e.clientY - en.y) > 4) setHover(true)
  }

  // a soft "ding" when a new call lands (not for the ones already there on mount)
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(decisions.map(d => d.id)); return }
    let fresh = false
    for (const d of decisions) if (!seen.current.has(d.id)) { seen.current.add(d.id); fresh = true }
    if (fresh) playSfx('ping')
  }, [decisions])

  if (!decisions.length) return null
  const n = decisions.length
  return (
    <div className={clsx('l-tray', collapsed && 'collapsed', hover && 'held')}
      onPointerEnter={e => { if (e.pointerType === 'mouse') entry.current = { x: e.clientX, y: e.clientY } }}
      onPointerMove={onMove}
      onPointerLeave={() => { entry.current = null; setHover(false) }}>
      <button type="button" className="l-tray-head" onClick={() => useLaunchUI.getState().set({ trayCollapsed: !collapsed })} aria-expanded={!collapsed}>
        <span className="l-tray-bolt" aria-hidden="true">{hover && !collapsed ? '⏸' : '⚡'}</span>
        <span>{n === 1 ? '1 call to make' : `${n} calls to make`}</span>
        <small>{hover && !collapsed ? 'clock paused while you decide' : 'calls expire: decide fast'}</small>
        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {!collapsed && decisions.map(d => <DecisionCard key={d.id} d={d} />)}
    </div>
  )
}

const DecisionCard = memo(function DecisionCard({ d }: { d: Decision }) {
  const launch = useG(s => findLaunch(s, d.launchId) ?? null, null)
  const day = useG(s => s.day, 0)
  const cash = useG(s => s.cash, 0)
  const flash = useLaunchUI(u => (u.flash?.id === d.id ? u.flash.n : 0))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!flash || !ref.current) return
    ref.current.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' })
    ref.current.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px) rotate(-1deg)' }, { transform: 'translateX(6px) rotate(1deg)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'ease-in-out' })
  }, [flash])

  const meta = KIND[d.kind] ?? KIND.custom
  const total = Math.max(1, d.expiresDay - d.createdDay)
  const left = Math.max(0, d.expiresDay - day)
  const frac = Math.min(1, left / total)
  const choose = (o: DecisionOption) => {
    act(s => resolveDecision(s, d.id, o.id))
    playSfx(o.cost ? 'coin' : o.tone === 'critical' ? 'whoosh' : 'click')
  }
  const cols = Math.min(3, d.options.length)

  return (
    <div ref={ref} className={clsx('l-card l-decision', `t-${meta.tone}`)} data-decision={d.id}>
      <div className="l-dec-head">
        <div className="l-dec-thumb">
          {launch ? <ProductThumb productId={launch.productId} size={40} /> : <span className="l-dec-emoji">{meta.emoji}</span>}
          <span className="l-dec-kind" aria-hidden="true">{meta.emoji}</span>
        </div>
        <div className="l-dec-title">
          <small>{meta.label}{launch ? ` · ${launch.name}` : ''}</small>
          <b>{d.title}</b>
        </div>
      </div>
      <p className="l-dec-body">{d.body}</p>
      <div className="l-dec-opts" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {d.options.map(o => {
          const short = !!o.cost && o.cost > cash
          return (
            <div key={o.id} className="l-dec-opt">
              <button
                type="button"
                className={clsx('k-btn sm', o.tone === 'primary' ? 'primary' : o.tone === 'critical' ? 'danger' : 'secondary')}
                disabled={short}
                onClick={() => choose(o)}
                // native title, not data-tip: the tray is a scroll container and would clip the CSS tooltip
                title={short ? `Need ${usd(o.cost ?? 0)} (you have ${usd(cash)})` : o.hint ?? undefined}
              >
                <span className="l-dec-label">{o.label}</span>
              </button>
              {(o.cost || o.hint) && <small>{o.cost ? usd(o.cost) : o.hint?.split(' · ')[0]}</small>}
            </div>
          )
        })}
      </div>
      <div className="l-dec-expiry" title={`Ignored calls expire: nothing changes (${left} day${left === 1 ? '' : 's'} left)`}>
        <Clock size={12} />
        <div className="l-dec-track"><i className={frac < 0.3 ? 'low' : ''} style={{ width: `${frac * 100}%` }} /></div>
        <span>{left}d</span>
      </div>
    </div>
  )
})
