// Playbook: everything you've learned. Product fit list, angle×platform and niche×platform matrices,
// best focus recipes per angle, and the launch history with verdicts & post-mortems. OWNER: ui-management.
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import type { DialogProps } from './types'
import type { AngleId, AreaId, ComboRating, GameState, LaunchRecord, NicheId, PlatformId, Verdict } from '../../core/types'
import { Badge, Button, DialogFrame, Tabs } from '../kit'
import { productImage } from '../../core/assets'
import { formatDate } from '../../core/time'
import { pct } from '../../core/format'
import { knownFocus, playbookStats } from '../../sim/playbook'
import { ANGLES, ANGLE_IDS } from '../../data/angles'
import { PLATFORMS, PLATFORM_IDS } from '../../data/platforms'
import { NICHES, NICHE_IDS, findProduct } from '../../data/catalog'
import { SIZES } from '../../data/sizes'
import { AREAS, STAGES } from '../../data/areas'
import { COMBO_MULT, COMBO_META, isPerProductPlatform, keyAP, keyNP, keyPA, keyPP, parseComboKey } from '../../data/combos'
import { VERDICTS } from '../../data/quotes'
import { playSfx } from '../audio'
import { ComboCell, ComboLegend, Empty, Kpi, Note, Spark, useCoachOnOpen, useGameState, usd, usdShort } from '../manage/common'

type Tab = 'products' | 'angles' | 'niches' | 'focus' | 'history'
const TABS: Tab[] = ['products', 'angles', 'niches', 'focus', 'history']

const AREA_COLOR: Record<AreaId, string> = {
  research: '#9775fa', quality: '#4dabf7', pricing: '#da77f2',
  copy: '#4dabf7', visuals: '#ff922b', offer: '#da77f2',
  hooks: '#ff922b', targeting: '#f59f00', influencers: '#f06595',
}
const rateTip = (label: string, r?: ComboRating) => (r ? `${label}: ${COMBO_META[r].label} (×${COMBO_MULT[r]})` : `${label}: unknown. Launch it to find out`)

// ---------------------------------------------------------------------------
// Products tab
// ---------------------------------------------------------------------------
function ProductsTab({ s }: { s: GameState }) {
  const rows = useMemo(() => {
    const ids = new Set<string>()
    for (const k of Object.keys(s.playbook.combos)) {
      const p = parseComboKey(k)
      if (p && (p.kind === 'pa' || p.kind === 'pp')) ids.add(p.a)
    }
    for (const id of Object.keys(s.playbook.launchedProducts)) ids.add(id)
    return [...ids].map(id => findProduct(id)).filter((p): p is NonNullable<typeof p> => !!p)
      .sort((a, b) => a.niche.localeCompare(b.niche) || a.name.localeCompare(b.name))
  }, [s])

  if (!rows.length) {
    return (
      <Empty icon="📒" title="Your Playbook is empty">
        Combos are revealed in the post-mortem when a launch finishes its run. Launch something, ride it out, and the fits land here.
      </Empty>
    )
  }
  const combos = s.playbook.combos
  return (
    <>
      <Note>Each row is a product you've sold. <b>Angle</b> columns show how well the pitch fit the product. <b>Platform</b> columns show where its buyers hang out: Fadbook &amp; TikTak fit is per product; the rest is niche-wide.</Note>
      <div className="g-matrix-wrap">
        <table className="g-matrix">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingLeft: 12 }}>Product</th>
              {ANGLE_IDS.map(a => (
                <th key={a} data-tip={ANGLES[a].name} className={clsx(!s.unlocked.angles.includes(a) && 'dim')}><span className="ic">{ANGLES[a].icon}</span></th>
              ))}
              {PLATFORM_IDS.map((p, i) => (
                <th key={p} className={clsx(i === 0 && 'sep', !s.unlocked.platforms.includes(p) && 'dim')} data-tip={PLATFORMS[p].name}><span className="ic">{PLATFORMS[p].icon}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const n = s.playbook.launchedProducts[p.id] ?? 0
              return (
                <tr key={p.id}>
                  <th>
                    <div className="g-prod-cell">
                      <img className="g-thumb" src={productImage(p.id)} alt="" loading="lazy" />
                      <div>
                        <div className="g-prod-name">{p.name}</div>
                        <div className="g-prod-meta">{NICHES[p.niche].icon} {NICHES[p.niche].name}{n ? ` · launched ${n}×` : ''}</div>
                      </div>
                    </div>
                  </th>
                  {ANGLE_IDS.map(a => {
                    const r = combos[keyPA(p.id, a)]
                    return <td key={a}><ComboCell rating={r} tip={rateTip(`${p.name} × ${ANGLES[a].name}`, r)} /></td>
                  })}
                  {PLATFORM_IDS.map((pl, i) => {
                    const r = isPerProductPlatform(pl) ? combos[keyPP(p.id, pl)] : combos[keyNP(p.niche, pl)]
                    const label = isPerProductPlatform(pl) ? `${p.name} on ${PLATFORMS[pl].name}` : `${NICHES[p.niche].name} niche on ${PLATFORMS[pl].name}`
                    return <td key={pl} className={clsx(i === 0 && 'sep')}><ComboCell rating={r} tip={rateTip(label, r)} /></td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Matrix tabs
// ---------------------------------------------------------------------------
function Matrix<R extends string>({ s, rows, rowLabel, rowIcon, rowUnlocked, keyFor, note }: {
  s: GameState; rows: R[]; rowLabel: (r: R) => string; rowIcon: (r: R) => string; rowUnlocked: (r: R) => boolean
  keyFor: (r: R, p: PlatformId) => string; note?: React.ReactNode
}) {
  const combos = s.playbook.combos
  const known = rows.reduce((a, r) => a + PLATFORM_IDS.filter(p => combos[keyFor(r, p)]).length, 0)
  return (
    <>
      <div className="g-row" style={{ justifyContent: 'space-between' }}>
        <ComboLegend />
        <Badge tone="purple">{known} / {rows.length * PLATFORM_IDS.length} cells discovered</Badge>
      </div>
      {note}
      <div className="g-matrix-wrap">
        <table className="g-matrix">
          <thead>
            <tr>
              <th />
              {PLATFORM_IDS.map(p => (
                <th key={p} className={clsx(!s.unlocked.platforms.includes(p) && 'dim')}>
                  <span className="ic">{PLATFORMS[p].icon}</span>{PLATFORMS[p].short}
                  {!s.unlocked.platforms.includes(p) && <span className="lock">🔒</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r}>
                <th className={clsx(!rowUnlocked(r) && 'dim')}>
                  {rowIcon(r)} {rowLabel(r)}{!rowUnlocked(r) && <span className="lock">🔒</span>}
                </th>
                {PLATFORM_IDS.map(p => {
                  const rating = combos[keyFor(r, p)]
                  return <td key={p}><ComboCell rating={rating} tip={rateTip(`${rowLabel(r)} × ${PLATFORMS[p].name}`, rating)} /></td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Focus tab
// ---------------------------------------------------------------------------
function FocusTab({ s }: { s: GameState }) {
  const perAngle = useMemo(() => {
    const m = {} as Record<AngleId, { n: number; wins: number }>
    for (const a of ANGLE_IDS) m[a] = { n: 0, wins: 0 }
    for (const h of s.history) { m[h.angle].n++; if (h.verdict === 'winner') m[h.angle].wins++ }
    return m
  }, [s])
  return (
    <>
      <Note icon="🎛️">Your best slider recipe per angle: the focus that landed closest to what the angle wants. Platforms nudge it a little (TikTak &amp; Reels want more 🎬 Hooks, Poogle more 🎯 Targeting, Pinterestt more 📸 Visuals).</Note>
      <div className="g-focus-grid">
        {ANGLE_IDS.map(a => {
          const def = ANGLES[a]
          const f = knownFocus(s, a)
          const unlocked = s.unlocked.angles.includes(a)
          const st = perAngle[a]
          const acc = f ? Math.round(f.accuracy * 100) : 0
          return (
            <article key={a} className={clsx('g-card g-focus', !f && 'unknown')}>
              <div className="g-focus-head">
                <div className="g-focus-ic" style={{ background: `${def.color}33` }}>{def.icon}</div>
                <div className="g-grow">
                  <div className="g-focus-name">{def.name}</div>
                  <div className="g-sub">{st.n ? `${st.n} launch${st.n === 1 ? '' : 'es'}${st.wins ? ` · ${st.wins} 🏆` : ''}` : unlocked ? 'Not launched yet' : '🔒 Research it in the Lab'}</div>
                </div>
                {f && <Badge tone={acc >= 90 ? 'good' : acc >= 78 ? 'info' : 'warn'}>{acc}% on target</Badge>}
              </div>
              <div className="g-focus-stages">
                {STAGES.map((stg, i) => (
                  <div key={stg.name} className="g-stage">
                    <div className="g-stage-name">{stg.icon} {stg.name}</div>
                    {stg.areas.map((area, j) => {
                      const v = f ? Math.round((f.sliders[i]?.[j] ?? 0) * 100) : 0
                      return (
                        <div key={area} className="g-mini" data-tip={`${AREAS[area].name}: ${f ? `${v}%` : 'unknown'}`}>
                          <span>{AREAS[area].icon}</span>
                          <span className="g-mini-bar"><i style={{ width: `${v}%`, background: AREA_COLOR[area] }} /></span>
                          <b>{f ? v : '?'}</b>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              {!f && <div className="g-focus-hint">💭 {def.wants}</div>}
            </article>
          )
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------
type Filter = 'all' | Verdict | 'killed'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'winner', label: '🏆 Winners' }, { id: 'solid', label: '✅ Solid' },
  { id: 'breakeven', label: '😐 Break-even' }, { id: 'flop', label: '📉 Flops' }, { id: 'killed', label: '✂️ Killed' },
]

function RecordDetail({ r }: { r: LaunchRecord }) {
  const rv = r.review
  const pm = r.postMortem
  return (
    <div className="g-hdetail">
      {rv && (
        <div className="g-scores">
          <div className="g-score-tile"><span>CTR</span><b>{rv.scores.ctr.toFixed(1)}<small>/10</small></b><small>{pct(rv.ctr)} click-through</small></div>
          <div className="g-score-tile"><span>CVR</span><b>{rv.scores.cvr.toFixed(1)}<small>/10</small></b><small>{pct(rv.cvr)} conversion</small></div>
          <div className="g-score-tile"><span>AOV</span><b>{rv.scores.aov.toFixed(1)}<small>/10</small></b><small>{usd(rv.aov)} per order</small></div>
          <div className="g-score-tile"><span>ROAS</span><b>{rv.scores.roas.toFixed(1)}<small>/10</small></b><small>{rv.roas.toFixed(2)}× vs {rv.breakEvenRoas.toFixed(2)} break-even</small></div>
        </div>
      )}
      {pm ? (
        <>
          <div className="g-h3" style={{ margin: 0 }}>📝 {pm.headline}</div>
          {pm.notes.length > 0 && <ul className="g-pm-notes">{pm.notes.slice(0, 6).map((n, i) => <li key={i}>{n}</li>)}</ul>}
          {pm.combos.length > 0 && (
            <div className="g-pm-combos">
              {pm.combos.map(c => <span key={c.key} className="g-pm-combo"><ComboCell rating={c.rating} size="sm" />{c.label}</span>)}
            </div>
          )}
          {pm.focusTips.length > 0 && <Note icon="🎛️">{pm.focusTips.join(' ')}</Note>}
        </>
      ) : (
        <div className="g-sub">No post-mortem was filed for this one.</div>
      )}
    </div>
  )
}

function HistoryTab({ s }: { s: GameState }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const all = useMemo(() => [...s.history].reverse(), [s.history])
  const list = useMemo(() => all.filter(r => filter === 'all' || (filter === 'killed' ? r.endReason === 'killed' : r.verdict === filter)), [all, filter])
  const totals = useMemo(() => {
    const wins = all.filter(r => r.verdict === 'winner').length
    const profit = all.reduce((a, r) => a + r.profit, 0)
    const best = all.reduce<LaunchRecord | null>((b, r) => (!b || r.profit > b.profit ? r : b), null)
    return { wins, profit, best }
  }, [all])

  if (!all.length) {
    return (
      <Empty icon="🚀" title="No finished launches yet">
        {s.live.length || s.current ? 'Your launches are still running. Their verdicts and profit land here once each run ends.' : 'Start a launch from the 🚀 button. Every finished run lands here with its verdict and profit.'}
      </Empty>
    )
  }
  return (
    <>
      <div className="g-kpis">
        <Kpi icon="🚀" label="Launches finished" value={all.length} sub={s.live.length ? `${s.live.length} still live` : 'None live right now'} />
        <Kpi icon="🏆" label="Winners" value={totals.wins} sub={`${Math.round((totals.wins / all.length) * 100)}% win rate`} tone={totals.wins ? 'gold' : undefined} />
        <Kpi icon="💰" label="Total launch profit" value={usd(totals.profit)} tone={totals.profit >= 0 ? 'good' : 'bad'} />
        {totals.best && <Kpi icon="⭐" label="Best launch" value={usdShort(totals.best.profit)} sub={totals.best.name} />}
      </div>
      <div className="g-hist-filters">
        {FILTERS.map(f => {
          const n = f.id === 'all' ? all.length : all.filter(r => (f.id === 'killed' ? r.endReason === 'killed' : r.verdict === f.id)).length
          return <button key={f.id} type="button" className={clsx('g-chip', filter === f.id && 'on')} onClick={() => setFilter(f.id)}>{f.label} {n}</button>
        })}
      </div>
      <div className="g-hist">
        {list.length === 0 && <div className="g-sub" style={{ padding: 12 }}>Nothing in this bucket yet.</div>}
        {list.map(r => {
          const v = VERDICTS[r.verdict]
          const isOpen = open === r.id
          const weeks = r.weeklyRevenue?.length ?? r.postMortem?.totals.weeks ?? 0
          return (
            <article key={r.id} className="g-card g-hrow">
              <div className="g-hrow-main" onClick={() => { setOpen(isOpen ? null : r.id); playSfx('tick') }} role="button" tabIndex={0} aria-expanded={isOpen}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : r.id) } }}>
                <img className="g-thumb" src={productImage(r.productId)} alt="" loading="lazy" />
                <div style={{ minWidth: 0 }}>
                  <div className="g-hrow-name">{r.name}</div>
                  <div className="g-hrow-meta">
                    <span>{formatDate(r.launchDay)}</span><i className="g-sep">·</i>
                    <span>{ANGLES[r.angle].icon} {ANGLES[r.angle].name}</span><i className="g-sep">·</i>
                    <span>{PLATFORMS[r.platform].icon} {PLATFORMS[r.platform].short}</span><i className="g-sep">·</i>
                    <span>{SIZES[r.size].icon} {SIZES[r.size].name}</span>
                    {r.endReason === 'killed' && <Badge tone="bad">✂️ Killed</Badge>}
                  </div>
                </div>
                <div className="g-row g-hscore" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <div className={clsx('g-score', r.verdict)} data-tip={`Overall ${r.overall.toFixed(1)}/10`}>{r.overall.toFixed(1)}</div>
                  <Badge tone={v.tone}>{v.emoji} {v.label}</Badge>
                </div>
                <div className="g-hval"><span>Revenue</span><b>{usdShort(r.revenue)}</b></div>
                <div className="g-hval"><span>Profit</span><b className={r.profit >= 0 ? 'g-pos' : 'g-neg'}>{r.profit >= 0 ? '+' : ''}{usdShort(r.profit)}</b></div>
                <div className="g-hspark" data-tip={`${weeks} week${weeks === 1 ? '' : 's'} of sales`}><Spark values={r.weeklyRevenue ?? []} /></div>
                <button type="button" className={clsx('g-caret', isOpen && 'open')} aria-label={isOpen ? 'Hide details' : 'Show details'} tabIndex={-1}><ChevronDown size={18} /></button>
              </div>
              {isOpen && <RecordDetail r={r} />}
            </article>
          )
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
export default function PlaybookDialog({ props, close }: DialogProps) {
  const s = useGameState()
  useCoachOnOpen('playbook')
  const [tab, setTab] = useState<Tab>(() => (typeof props?.tab === 'string' && TABS.includes(props.tab as Tab) ? props.tab as Tab : 'products'))
  const stats = useMemo(() => (s ? playbookStats(s) : null), [s])
  if (!s || !stats) return null

  return (
    <DialogFrame
      title="Playbook"
      icon="📒"
      width={1060}
      subtitle="Everything your launches taught you. Only combos you've actually tried show up here."
      onClose={close}
      footer={
        <>
          <span className="g-foot-tip">Winners repeat patterns: a ✓✓ product×angle on a ✓✓ platform with an on-target focus is how you print money.</span>
          <Button variant="secondary" onClick={close}>Close</Button>
        </>
      }
    >
      <div className="g-wrap">
        <div className="g-pb-stats">
          <Badge tone="purple">📒 {stats.total} combo{stats.total === 1 ? '' : 's'} discovered</Badge>
          {(['great', 'good', 'ok', 'bad'] as ComboRating[]).map(r => stats[r] > 0 && (
            <span key={r} className="g-legend-item" style={{ font: '500 12.5px var(--k-font-data)' }}><ComboCell rating={r} size="sm" />{stats[r]}</span>
          ))}
          <Badge>{s.history.length} launch{s.history.length === 1 ? '' : 'es'} in the books</Badge>
        </div>
        <div className="g-tabs-bar">
          <Tabs<Tab>
            value={tab}
            onChange={t => { setTab(t); playSfx('tick') }}
            tabs={[
              { id: 'products', label: '🛍️ Products' },
              { id: 'angles', label: '🎯 Angle × Platform' },
              { id: 'niches', label: '🗂️ Niche × Platform' },
              { id: 'focus', label: '🎛️ Focus recipes' },
              { id: 'history', label: <span className="g-tab-label">📜 History <small>{s.history.length}</small></span> },
            ]}
          />
        </div>
        {tab === 'products' && <><ComboLegend /><ProductsTab s={s} /></>}
        {tab === 'angles' && (
          <Matrix<AngleId>
            s={s} rows={ANGLE_IDS}
            rowLabel={a => ANGLES[a].name} rowIcon={a => ANGLES[a].icon} rowUnlocked={a => s.unlocked.angles.includes(a)}
            keyFor={(a, p) => keyAP(a, p)}
            note={<Note icon="🎯">Does the pitch suit the crowd? Aesthetic lives on TikTak, pain points win on search. This fit is the same for every product.</Note>}
          />
        )}
        {tab === 'niches' && (
          <Matrix<NicheId>
            s={s} rows={NICHE_IDS}
            rowLabel={n => NICHES[n].name} rowIcon={n => NICHES[n].icon} rowUnlocked={n => s.unlocked.niches.includes(n)}
            keyFor={(n, p) => keyNP(n, p)}
            note={<Note icon="🗂️">Where each niche's buyers scroll. <b>Fadbook &amp; TikTak</b> cells show the niche's typical fit; single products can beat it (see 🛍️ Products).</Note>}
          />
        )}
        {tab === 'focus' && <FocusTab s={s} />}
        {tab === 'history' && <HistoryTab s={s} />}
      </div>
    </DialogFrame>
  )
}

