// The Lab: research tree by category (tiers as columns), node cards with cost / prerequisites / state,
// and a juicy unlock burst. OWNER: ui-management.
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Check, Lock, Newspaper } from 'lucide-react'
import type { DialogProps } from './types'
import type { FeatureId, GameState } from '../../core/types'
import { Badge, Button, DialogFrame, Tabs } from '../kit'
import { getGS } from '../../core/store'
import {
  RESEARCH_CATEGORIES, canResearch, research, researchLockReason, researchNodes, researchState, type ResearchNode,
} from '../../sim/research'
import { RESEARCH_BY_ID } from '../../data/research'
import { FEATURES } from '../../data/features'
import { officeName } from '../../data/offices'
import { playSfx } from '../audio'
import { actResult, fx, Note, useCoachOnOpen, useFlash, useGameState, usd } from '../manage/common'

type Cat = ResearchNode['category']
const NODES = researchNodes()
const CAT_IDS = RESEARCH_CATEGORIES.map(c => c.id)
const TIER_NAMES = ['Tier I', 'Tier II', 'Tier III', 'Tier IV', 'Tier V', 'Tier VI']

// Depth of a node inside its own category (cross-category prerequisites show as chips instead).
const DEPTH: Record<string, number> = {}
function depthOf(id: string): number {
  if (DEPTH[id] !== undefined) return DEPTH[id]
  DEPTH[id] = 0 // cycle guard
  const n = RESEARCH_BY_ID[id]
  const inCat = n ? n.requires.filter(r => RESEARCH_BY_ID[r]?.category === n.category) : []
  DEPTH[id] = inCat.length ? Math.max(...inCat.map(r => depthOf(r) + 1)) : 0
  return DEPTH[id]
}

function unlockKind(n: ResearchNode): string {
  const u = n.unlocks
  if (u.feature) {
    const f = FEATURES[u.feature as FeatureId]
    return f ? `🧩 Store app · ${usd(f.monthly)}/mo` : '🧩 Store app'
  }
  if (u.angle) return '🎯 New marketing angle'
  if (u.niche) return '🗂️ New product niche'
  if (u.platform) return '📱 New ad platform'
  if (u.size) return '📦 New launch size'
  return '⚗️ Permanent boost'
}

const SPARKS = ['✨', '🟣', '⭐', '✨', '💜', '⭐', '✨', '🟣']
function Burst({ icon }: { icon: string }) {
  return (
    <div className="g-burst" aria-hidden="true">
      {SPARKS.map((e, i) => {
        const a = (i / SPARKS.length) * Math.PI * 2 + 0.3
        const r = 90 + (i % 3) * 22
        return (
          <span key={i} className="g-spark-p" style={{ ['--dx' as string]: `${Math.cos(a) * r}px`, ['--dy' as string]: `${Math.sin(a) * r * 0.7}px`, ['--rot' as string]: `${(i % 2 ? 1 : -1) * 120}deg`, animationDelay: `${i * 25}ms` }}>
            {i === 0 ? icon : e}
          </span>
        )
      })}
      <span className="g-burst-stamp">UNLOCKED!</span>
    </div>
  )
}

function NodeCard({ s, node, burstKey, flash, onResearch, onJump }: {
  s: GameState; node: ResearchNode; burstKey: number | null; flash: boolean
  onResearch: (id: string) => void; onJump: (id: string) => void
}) {
  const st = researchState(s, node.id)
  const lock = st === 'locked' ? researchLockReason(s, node.id) : null
  const reqsMet = node.requires.every(r => s.unlocked.research.includes(r))
  const officeMet = !node.minOffice || s.office >= node.minOffice
  const newsGate = st === 'locked' && reqsMet && officeMet && !!lock
  const rpShort = Math.max(0, Math.ceil(node.cost - s.rp))
  const cashShort = node.cash > 0 ? Math.max(0, Math.ceil(node.cash - s.cash)) : 0
  const why = st === 'short' ? canResearch(s, node.id).reason : null
  const progress = node.cost > 0 ? Math.min(1, s.rp / node.cost) : 1

  return (
    <article
      data-node={node.id}
      className={clsx('g-rs-node', st, flash && 'flash', burstKey !== null && 'burst')}
      aria-label={`${node.name}: ${st === 'owned' ? 'researched' : st === 'ready' ? 'ready to research' : st === 'short' ? 'not enough points' : 'locked'}`}
    >
      {burstKey !== null && <Burst key={burstKey} icon={node.icon} />}
      <div className="g-rs-head">
        <div className="g-rs-ic" aria-hidden="true">{node.icon}</div>
        <div className="g-grow">
          <div className="g-rs-name">{node.name}</div>
          <div className="g-rs-kind">{unlockKind(node)}</div>
        </div>
      </div>
      <div className="g-rs-desc">{node.description}</div>

      {(node.requires.length > 0 || node.minOffice) && st !== 'owned' && (
        <div className="g-rs-reqs">
          {node.requires.map(r => {
            const rn = RESEARCH_BY_ID[r]
            const met = s.unlocked.research.includes(r)
            return (
              <button key={r} type="button" className={clsx('g-req', met && 'met')} onClick={() => onJump(r)} data-tip={met ? 'Researched' : `Research ${rn?.name ?? r} first (click to find it)`}>
                {met ? '✓' : '✗'} {rn?.icon} {rn?.name ?? r}
              </button>
            )
          })}
          {node.minOffice ? (
            <span className={clsx('g-req static', officeMet && 'met')} data-tip={officeMet ? 'Office requirement met' : 'Move offices in 🏠 Office'}>
              {officeMet ? '✓' : '✗'} 🏠 {officeName(node.minOffice)}+
            </span>
          ) : null}
          {newsGate && <span className="g-req static"><Newspaper size={12} /> Waiting for news</span>}
        </div>
      )}

      {st !== 'owned' && (
        <>
          <div className="g-rs-cost">
            <span className={clsx('rp', rpShort > 0 && 'short')}>🟣 {node.cost} RP</span>
            {node.cash > 0 && <span className={clsx('cash', cashShort > 0 && 'short')}>+ {usd(node.cash)}</span>}
          </div>
          {st !== 'ready' && <div className="g-rs-prog" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></div>}
        </>
      )}

      <div className="g-rs-foot">
        {st === 'owned' && <span className="g-rs-done"><Check size={16} strokeWidth={3} /> Researched</span>}
        {st === 'ready' && <Button size="sm" onClick={() => onResearch(node.id)}>🔬 Research</Button>}
        {st === 'short' && <span className="g-why">{why ?? `Need ${rpShort} more RP`}</span>}
        {st === 'locked' && <span className="g-rs-lock"><Lock size={13} style={{ flex: 'none', marginTop: 1 }} />{lock}</span>}
      </div>
    </article>
  )
}

export default function ResearchDialog({ props, close }: DialogProps) {
  const s = useGameState()
  useCoachOnOpen('research')
  const focusId = typeof props?.focus === 'string' && RESEARCH_BY_ID[props.focus] ? props.focus : null
  const [cat, setCat] = useState<Cat>(() => {
    if (focusId) return RESEARCH_BY_ID[focusId].category
    const want = props?.category
    if (typeof want === 'string' && CAT_IDS.includes(want as Cat)) return want as Cat
    try {
      const g = getGS()
      const ready = CAT_IDS.find(c => NODES.some(n => n.category === c && researchState(g, n.id) === 'ready'))
      if (ready) return ready
    } catch { /* no game */ }
    return 'angle'
  })
  const [burst, setBurst] = useFlash<{ id: string; key: number }>(1800)
  const [flash, setFlash] = useFlash<string>(1500)

  useEffect(() => { if (focusId) setFlash(focusId) }, [focusId, setFlash])
  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => document.querySelector(`[data-node="${flash}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 60)
    return () => window.clearTimeout(t)
  }, [flash, cat])

  const summary = useMemo(() => {
    if (!s) return null
    const per = {} as Record<Cat, { owned: number; total: number; ready: number }>
    for (const c of CAT_IDS) per[c] = { owned: 0, total: 0, ready: 0 }
    for (const n of NODES) {
      const st = researchState(s, n.id)
      per[n.category].total++
      if (st === 'owned') per[n.category].owned++
      if (st === 'ready') per[n.category].ready++
    }
    const owned = CAT_IDS.reduce((a, c) => a + per[c].owned, 0)
    const ready = CAT_IDS.reduce((a, c) => a + per[c].ready, 0)
    return { per, owned, ready }
  }, [s])

  const columns = useMemo(() => {
    const cols: ResearchNode[][] = []
    for (const n of NODES) {
      if (n.category !== cat) continue
      const d = depthOf(n.id)
      ;(cols[d] ??= []).push(n)
    }
    return cols.filter(Boolean)
  }, [cat])

  if (!s || !summary) return null

  const doResearch = (id: string) => {
    const ok = actResult(d => research(d, id), false)
    if (ok) {
      setBurst({ id, key: Date.now() })
      fx({ kind: 'sound', sound: 'levelup' }, { kind: 'confetti', amount: 0.45 })
    } else playSfx('error')
  }
  const jump = (id: string) => {
    const n = RESEARCH_BY_ID[id]
    if (!n) return
    setCat(n.category)
    setFlash(id)
  }

  return (
    <DialogFrame
      title="The Lab"
      icon="🧪"
      width={1120}
      subtitle="Spend 🟣 research points on new angles, niches, platforms, launch sizes and store apps."
      onClose={close}
      footer={
        <>
          <span className="g-foot-tip">🟣 RP comes from the 🔎 Research and 🎯 Targeting sliders, every worker-day of dev, and each launch (+10, winners +25).</span>
          <Button variant="secondary" onClick={close}>Close</Button>
        </>
      }
    >
      <div className="g-wrap">
        <div className="g-rs-top">
          <span className="g-rp-pill"><i>RP</i>{Math.floor(s.rp).toLocaleString('en-US')} <small>research points</small></span>
          <Badge tone="good">💵 {usd(s.cash)} cash</Badge>
          <Badge tone="purple">{summary.owned} / {NODES.length} researched</Badge>
          {summary.ready > 0 ? <Badge tone="gold">⚡ {summary.ready} ready to research</Badge> : <Badge>Nothing affordable yet: keep launching</Badge>}
        </div>

        <div className="g-tabs-bar">
          <Tabs<Cat>
            value={cat}
            onChange={c => { setCat(c); playSfx('tick') }}
            tabs={RESEARCH_CATEGORIES.map(c => ({
              id: c.id,
              label: (
                <span className="g-tab-label">
                  {c.emoji} {c.label} <small>{summary.per[c.id].owned}/{summary.per[c.id].total}</small>
                  {summary.per[c.id].ready > 0 && <i className="g-dot">{summary.per[c.id].ready}</i>}
                </span>
              ),
            }))}
          />
        </div>

        {cat === 'platform' && (!s.market.platforms.reels.available || !s.market.platforms.tiktak_shop.available) && (
          <Note icon="📰">Some platforms don't exist yet. <b>Instaglam Reels</b> and <b>TikTak Shop</b> show up in the news later; research them once they launch.</Note>
        )}
        {cat === 'feature' && <Note icon="🧩">Researched apps install <b>switched on</b>. Flip them off in 🧩 Features if the monthly fee isn't paying for itself.</Note>}

        <div className="g-rs-tree" style={{ ['--cols' as string]: columns.map(c => `minmax(240px, ${c.length}fr)`).join(' ') }}>
          {columns.map((col, i) => (
            <div key={i} className="g-rs-col">
              <div className="g-rs-colhead">{TIER_NAMES[i] ?? `Tier ${i + 1}`} <small>{col.filter(n => s.unlocked.research.includes(n.id)).length}/{col.length}</small></div>
              <div className="g-rs-cards">
              {col.map(n => (
                <NodeCard
                  key={n.id}
                  s={s}
                  node={n}
                  burstKey={burst?.id === n.id ? burst.key : null}
                  flash={flash === n.id}
                  onResearch={doResearch}
                  onJump={jump}
                />
              ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DialogFrame>
  )
}
