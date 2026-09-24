// Launch detail: weekly revenue chart + ROAS vs break-even, review scores, totals, next-week projection and actions
// (scale / cut / refresh / kill, pending calls). Works for live and recently ended launches. Props: { launchId }.
// OWNER: ui-launch.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { BarChart3, FileText, RefreshCw, Scissors, Skull, TrendingUp, Zap } from 'lucide-react'
import type { DialogProps } from './types'
import { Button, DialogFrame } from '../kit'
import { act, getGS, useGame } from '../../core/store'
import { openDialog } from '../../core/ui'
import type { Decision, DecisionOption, Launch, LaunchRecord, Review, SalesWeek } from '../../core/types'
import { formatDate } from '../../core/time'
import { findProduct, PRICE_TIERS } from '../../data/catalog'
import { ANGLES } from '../../data/angles'
import { PLATFORMS } from '../../data/platforms'
import { SIZES } from '../../data/sizes'
import { VERDICTS } from '../../data/quotes'
import { findLaunch, findRecord, killLaunch, launchHealth, refreshCost, refreshCreatives, resolveDecision, SALES, scaleLaunch, weeklyProjection } from '../../sim/sales'
import { launchWorldTags, pauseKind } from '../../sim/world'
import { playSfx } from '../audio'
import { ConfirmButton, EMPTY, ProductThumb, pct1, usd, usdC, usdSigned, useG, x2 } from '../launch/common'
import { quickAction, scaledThisWeek } from '../launch/actions'

export default function LaunchDetailDialog({ props, close }: DialogProps) {
  const launchId = String(props?.launchId ?? '')
  const l = useGame(st => (st.state && launchId ? findLaunch(st.state, launchId) ?? null : null))
  const rec = useGame(st => (st.state && launchId ? findRecord(st.state, launchId) ?? null : null))
  const [stale, setStale] = useState<Launch | null>(null)
  // keep showing the last known launch if it drops out of the archive while open
  useEffect(() => { if (l) setStale(l) }, [l])
  const shown = l ?? stale
  if (!shown && !rec) {
    return (
      <DialogFrame title="Launch" icon="📦" onClose={close} footer={<Button onClick={close}>Close</Button>}>
        <p className="k-muted">This launch is no longer on file.</p>
      </DialogFrame>
    )
  }
  return shown ? <Detail l={shown} close={close} /> : <RecordDetail r={rec as LaunchRecord} close={close} />
}

// ---------------------------------------------------------------------------
function Detail({ l, close }: { l: Launch; close: () => void }) {
  const day = useG(s => s.day, 0)
  const cash = useG(s => s.cash, 0)
  const trends = useG(s => s.market.trends, EMPTY as unknown as never[])
  const decision = useG(s => s.decisions.find(d => d.launchId === l.id) ?? null, null)
  const [hover, setHover] = useState<Hover>(null)
  const p = findProduct(l.productId)
  const rv = l.review
  const run = l.sales
  const weeks = run?.weeks ?? []
  const live = l.status === 'live'
  const health = launchHealth(l)
  const cap = SALES.maxBudgetMult[l.size] ?? 4
  const mult = run?.budgetMult ?? 1
  const weekly = SIZES[l.size].weeklyBudget * mult
  const paused = pauseKind(l)
  const tags = useMemo(() => { try { return launchWorldTags(getGS(), l) } catch { return [] } }, [l, trends])
  const proj = useMemo(() => { try { return live ? weeklyProjection(getGS(), l) : null } catch { return null } }, [l, live, day])
  const rCost = useMemo(() => { try { return live ? refreshCost(getGS(), l.id) : 0 } catch { return 0 } }, [l, live])
  const extra = Number(run?.flags.extraCosts ?? 0)
  const spent = (run?.totalSpend ?? 0) + (l.upfront ?? SIZES[l.size].upfront) + extra
  const fatigue = run?.fatigue ?? 0
  const be = Number(run?.flags.lastBe ?? rv?.breakEvenRoas ?? 99)
  const scaleBlock = paused ? 'Ads are paused right now' : scaledThisWeek(l) ? 'Scaled this week already: give the algorithm a week to settle' : mult >= cap - 0.01 ? `Budget is maxed at ${cap}× for this size` : ''
  const canScale = !scaleBlock

  const act1 = (fn: () => void, sfx: 'coin' | 'whoosh' | 'click') => { fn(); playSfx(sfx) }
  const choose = (d: Decision, o: DecisionOption) => act1(() => act(s => resolveDecision(s, d.id, o.id)), o.cost ? 'coin' : 'click')

  const status = live ? `Live · week ${weeks.length + 1}` : l.status === 'killed' ? `Killed after ${weeks.length} weeks` : `Ended after ${weeks.length} weeks`

  return (
    <DialogFrame
      title={l.name}
      subtitle={<>{p?.name ?? 'Product'} · launched {formatDate(l.launchDay ?? l.startDay)}</>}
      icon={<ProductThumb productId={l.productId} size={56} />}
      width={940}
      onClose={close}
      footer={
        <>
          {rv && <Button variant="ghost" onClick={() => openDialog('review', { launchId: l.id, instant: true })}><BarChart3 size={15} /> Review</Button>}
          {l.postMortem && <Button variant="ghost" onClick={() => openDialog('postMortem', { launchId: l.id })}><FileText size={15} /> Post-mortem</Button>}
          <Button onClick={close}>Done</Button>
        </>
      }
    >
      <div className="l-ld">
        <div className="l-ld-chips">
          <span className={clsx('l-health', live ? health.tone : 'info')}>{live ? health.label : l.status === 'killed' ? 'Killed' : 'Ended'}</span>
          <span className="l-chip">{status}</span>
          <span className="l-chip">{ANGLES[l.angle].icon} {ANGLES[l.angle].name}</span>
          <span className="l-chip">{PLATFORMS[l.platform].icon} {PLATFORMS[l.platform].name}</span>
          <span className="l-chip">{SIZES[l.size].icon} {SIZES[l.size].name}</span>
          <span className="l-chip">{PRICE_TIERS[l.priceTier].icon} {PRICE_TIERS[l.priceTier].name}{rv ? ` · ${usdC(rv.price * (run?.priceMult ?? 1))}` : ''}</span>
          {tags.map(t => <span key={t.id} className={clsx('l-tag', t.tone)}>{t.emoji} {t.label}</span>)}
        </div>

        <div className="l-ld-totals">
          <Big label="Revenue" value={usd(run?.totalRevenue ?? 0)} />
          <Big label="Spent" value={usd(spent)} tip="Upfront + ad spend + refreshes & extras" />
          <Big label="Profit" value={usdSigned(run?.totalProfit ?? 0)} tone={(run?.totalProfit ?? 0) >= 0 ? 'pos' : 'neg'} tip="After product costs, fees, ads and upfront" />
          <Big label="Units sold" value={Math.round(run?.units ?? 0).toLocaleString('en-US')} />
        </div>

        {decision && live && (
          <div className="l-ld-call">
            <div className="l-ld-call-head"><Zap size={16} /><b>{decision.title}</b><small>{Math.max(0, decision.expiresDay - day)}d left</small></div>
            <p>{decision.body}</p>
            <div className="l-ld-call-opts">
              {decision.options.map(o => (
                <Button key={o.id} size="sm" variant={o.tone === 'primary' ? 'primary' : o.tone === 'critical' ? 'danger' : 'secondary'} disabled={!!o.cost && o.cost > cash}
                  onClick={() => choose(decision, o)} data-tip={o.hint ?? ''}>{o.label}{o.cost ? ` · ${usd(o.cost)}` : ''}</Button>
              ))}
            </div>
          </div>
        )}

        <div className="l-ld-charts">
          <ChartCard title="Weekly revenue" legend={<><i className="sw pos" /> profitable week <i className="sw neg" /> losing week</>}>
            {weeks.length ? <RevenueChart weeks={weeks} hover={hover} setHover={setHover} /> : <EmptyChart />}
          </ChartCard>
          <ChartCard title="ROAS vs break-even" legend={<><i className="ln" /> ROAS <i className="ln dash" /> break-even {x2(be)}</>}>
            {weeks.length ? <RoasChart weeks={weeks} be={be} hover={hover} setHover={setHover} /> : <EmptyChart />}
          </ChartCard>
        </div>

        <div className="l-ld-grid">
          {rv && <ReviewTiles rv={rv} />}
          <div className="l-ld-now">
            <h4>{live ? 'Right now' : 'Final state'}</h4>
            <Row k="Ad budget" v={`${usd(weekly)}/wk · ${mult.toFixed(2)}×`} tip={`Scaling cap for this size: ${cap}×`} />
            <Row k="Last ROAS" v={weeks.length ? <><b className={(weeks.at(-1)?.roas ?? 0) >= be ? 'pos' : 'neg'}>{x2(weeks.at(-1)?.roas ?? 0)}</b> vs {x2(be)} BE</> : '—'} />
            <Row k="Creative fatigue" v={<span className={fatigue >= 0.25 ? 'neg' : ''}>{Math.round(fatigue * 100)}%{run?.creativeGen && run.creativeGen > 1 ? ` · ads v${run.creativeGen}` : ''}</span>} />
            {proj && <Row k="Next week (est.)" v={<>{usd(proj.revenue)} · <b className={proj.profit >= 0 ? 'pos' : 'neg'}>{usdSigned(proj.profit)}</b></>} tip="Expected numbers for the coming week at the current budget (before luck)" />}
            {paused && <Row k="Status" v={<span className="neg">Ads paused ({paused === 'ban' ? 'ad ban' : paused === 'cny' ? 'CNY' : 'stockout'})</span>} />}
            {live && (
              <div className="l-ld-actions">
                <Button size="sm" disabled={!canScale} onClick={() => act1(() => quickAction(l.id, 'scale', 'scale50', s => scaleLaunch(s, l.id, 1.5)), 'coin')}
                  data-tip={scaleBlock || `${usd(Math.min(cap, mult * 1.5) * SIZES[l.size].weeklyBudget)}/wk`}><TrendingUp size={14} /> +50%</Button>
                <Button size="sm" variant="secondary" disabled={!canScale} onClick={() => act1(() => quickAction(l.id, 'scale', 'double', s => { scaleLaunch(s, l.id, 2) }), 'coin')}
                  data-tip={scaleBlock || `${usd(Math.min(cap, mult * 2) * SIZES[l.size].weeklyBudget)}/wk · learning phase −15% next week`}>×2</Button>
                <Button size="sm" variant="secondary" disabled={mult <= 0.26} onClick={() => act1(() => act(s => scaleLaunch(s, l.id, 0.5)), 'click')}
                  data-tip={`Cut to ${usd(weekly * 0.5)}/wk`}><Scissors size={14} /> Cut</Button>
                <Button size="sm" variant="secondary" disabled={fatigue < 0.05 || cash < rCost} onClick={() => act1(() => quickAction(l.id, 'refresh', 'refresh', s => refreshCreatives(s, l.id)), 'whoosh')}
                  data-tip={fatigue < 0.05 ? 'Creatives are still fresh' : `Fresh creatives: ${usd(rCost)}`}><RefreshCw size={14} /> Refresh</Button>
                <ConfirmButton className="k-btn danger sm" confirm={<><Skull size={14} /> Really kill?</>}
                  onConfirm={() => { quickAction(l.id, 'kill', 'kill', s => killLaunch(s, l.id)); playSfx('whoosh'); close() }}>
                  <Skull size={14} /> Kill
                </ConfirmButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </DialogFrame>
  )
}

// ---------------------------------------------------------------------------
function RecordDetail({ r, close }: { r: LaunchRecord; close: () => void }) {
  const v = VERDICTS[r.verdict]
  const weeks = useMemo<SalesWeek[]>(() => (r.weeklyRevenue ?? []).map((rev, i) => ({ week: i, day: 0, spend: 0, revenue: rev, units: 0, cogs: 0, fees: 0, profit: 0, roas: 0, fatigue: 0 })), [r])
  const [hover, setHover] = useState<Hover>(null)
  return (
    <DialogFrame title={r.name} subtitle={`${findProduct(r.productId)?.name ?? ''} · ${formatDate(r.launchDay)} → ${formatDate(r.endDay)}`} icon={<ProductThumb productId={r.productId} size={56} />} width={820} onClose={close}
      footer={<>{r.postMortem && <Button variant="ghost" onClick={() => openDialog('postMortem', { launchId: r.id })}><FileText size={15} /> Post-mortem</Button>}<Button onClick={close}>Done</Button></>}>
      <div className="l-ld">
        <div className="l-ld-chips">
          <span className={clsx('l-verdict-pill', r.verdict)}>{v.emoji} {v.label} · {r.overall.toFixed(1)}</span>
          <span className="l-chip">{ANGLES[r.angle].icon} {ANGLES[r.angle].name}</span>
          <span className="l-chip">{PLATFORMS[r.platform].icon} {PLATFORMS[r.platform].name}</span>
          <span className="l-chip">{SIZES[r.size].icon} {SIZES[r.size].name}</span>
        </div>
        <div className="l-ld-totals">
          <Big label="Revenue" value={usd(r.revenue)} />
          <Big label="Profit" value={usdSigned(r.profit)} tone={r.profit >= 0 ? 'pos' : 'neg'} />
          <Big label="Weeks" value={String(weeks.length)} />
        </div>
        {weeks.length > 0 && <ChartCard title="Weekly revenue"><RevenueChart weeks={weeks} hover={hover} setHover={setHover} neutral /></ChartCard>}
        {r.review && <ReviewTiles rv={r.review} />}
      </div>
    </DialogFrame>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function Big({ label, value, tone, tip }: { label: string; value: ReactNode; tone?: 'pos' | 'neg'; tip?: string }) {
  return <div className="l-big" data-tip={tip ?? ''}><small>{label}</small><b className={tone}>{value}</b></div>
}
function Row({ k, v, tip }: { k: string; v: ReactNode; tip?: string }) {
  return <div className="l-row" data-tip={tip ?? ''}><span>{k}</span><span>{v}</span></div>
}
function ChartCard({ title, legend, children }: { title: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <div className="l-chartcard">
      <div className="l-chartcard-head"><b>{title}</b>{legend && <span className="l-legend-row">{legend}</span>}</div>
      {children}
    </div>
  )
}
function EmptyChart() {
  return <div className="l-chart-empty">First sales week lands soon…</div>
}

type Hover = { i: number; src: 'rev' | 'roas' } | null

const tone = (x: number) => (x >= 8.5 ? 'great' : x >= 6 ? 'good' : x >= 4 ? 'meh' : 'bad')
function ReviewTiles({ rv }: { rv: Review }) {
  const v = VERDICTS[rv.verdict]
  const items: { k: keyof Review['scores']; name: string; val: string }[] = [
    { k: 'ctr', name: 'CTR', val: pct1(rv.ctr) },
    { k: 'cvr', name: 'CVR', val: pct1(rv.cvr) },
    { k: 'aov', name: 'AOV', val: usdC(rv.aov) },
    { k: 'roas', name: 'ROAS', val: `${x2(rv.roas)}×` },
  ]
  return (
    <div className="l-ld-review">
      <h4>Review <span className={clsx('l-verdict-pill', rv.verdict)}>{v.emoji} {v.label} · {rv.overall.toFixed(1)}</span></h4>
      <div className="l-tiles">
        {items.map(it => (
          <div key={it.k} className={clsx('l-tile', tone(rv.scores[it.k]))} data-tip={rv.quotes[it.k]}>
            <small>{it.name}</small>
            <b>{rv.scores[it.k].toFixed(1)}</b>
            <span>{it.val}</span>
          </div>
        ))}
      </div>
      <div className="l-ld-under">CPM {usdC(rv.cpm)} · CPA {usdC(rv.cpa)} · margin {usdC(rv.marginPerOrder)}/order</div>
    </div>
  )
}

function tipFor(w: SalesWeek) {
  return (
    <>
      <b>Week {w.week + 1}</b>
      <span>Revenue <em>{usd(w.revenue)}</em></span>
      {w.spend > 0 && <span>Ad spend <em>{usd(w.spend)}</em></span>}
      {(w.spend > 0 || w.profit !== 0) && <span>Profit <em className={w.profit >= 0 ? 'pos' : 'neg'}>{usdSigned(w.profit)}</em></span>}
      {w.roas > 0 && <span>ROAS <em>{x2(w.roas)}</em></span>}
      {w.spend > 0 && <span>Fatigue <em>{Math.round(w.fatigue * 100)}%</em></span>}
    </>
  )
}

function RevenueChart({ weeks, hover: hv, setHover: setHv, neutral }: { weeks: SalesWeek[]; hover: Hover; setHover: (h: Hover) => void; neutral?: boolean }) {
  const max = Math.max(1, ...weeks.map(w => w.revenue))
  const n = weeks.length
  const hover = hv?.i ?? null
  const setHover = (i: number | null) => setHv(i === null ? null : { i, src: 'rev' })
  const showTip = hv?.src === 'rev'
  return (
    <div className="l-wc">
      <div className="l-wc-y"><span>{usd(max)}</span><span>{usd(max / 2)}</span><span>$0</span></div>
      <div className="l-wc-plot" onMouseLeave={() => setHover(null)}>
        <div className="l-wc-grid"><i /><i /><i /></div>
        {weeks.map((w, i) => (
          <div key={i} className={clsx('l-wc-col', hover === i && 'hover')} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            <i className={neutral ? 'neutral' : w.spend <= 0 ? 'paused' : w.profit >= 0 ? 'pos' : 'neg'} style={{ height: `${Math.max(1.5, (w.revenue / max) * 100)}%` }} />
          </div>
        ))}
        {showTip && hover !== null && weeks[hover] && (
          <div className={clsx('l-wc-tip', hover > n * 0.5 && 'left')} style={{ left: `${((hover + 0.5) / n) * 100}%` }}>{tipFor(weeks[hover])}</div>
        )}
      </div>
      <div className="l-wc-x"><span>Wk 1</span>{n > 1 && <span>Wk {n}</span>}</div>
    </div>
  )
}

function RoasChart({ weeks, be, hover: hv, setHover: setHv }: { weeks: SalesWeek[]; be: number; hover: Hover; setHover: (h: Hover) => void }) {
  const n = weeks.length
  const hover = hv?.i ?? null
  const setHover = (i: number | null) => setHv(i === null ? null : { i, src: 'roas' })
  const showTip = hv?.src === 'roas'
  const beShown = be < 99 ? be : 0
  const top = Math.max(0.5, beShown * 1.6, ...weeks.map(w => w.roas)) * 1.08
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number) => 100 - (Math.max(0, v) / top) * 100
  const pts = weeks.map((w, i) => `${x(i)},${y(w.roas)}`).join(' ')
  return (
    <div className="l-wc">
      <div className="l-wc-y"><span>{top.toFixed(1)}</span><span>{(top / 2).toFixed(1)}</span><span>0</span></div>
      <div className="l-wc-plot" onMouseLeave={() => setHover(null)}>
        <div className="l-wc-grid"><i /><i /><i /></div>
        <svg className="l-rc-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {beShown > 0 && <line x1="0" x2="100" y1={y(beShown)} y2={y(beShown)} className="be" vectorEffect="non-scaling-stroke" />}
          {n > 1 && <polyline points={pts} className="roas" vectorEffect="non-scaling-stroke" />}
        </svg>
        {weeks.map((w, i) => (
          <div key={i} className={clsx('l-rc-dot', w.roas >= beShown ? 'pos' : 'neg', hover === i && 'hover')} style={{ left: `${x(i)}%`, top: `${y(w.roas)}%` }} />
        ))}
        <div className="l-rc-hit">
          {weeks.map((_, i) => <div key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
        </div>
        {showTip && hover !== null && weeks[hover] && (
          <div className={clsx('l-wc-tip', hover > n * 0.5 && 'left')} style={{ left: `${x(hover)}%` }}>{tipFor(weeks[hover])}</div>
        )}
      </div>
      <div className="l-wc-x"><span>Wk 1</span>{n > 1 && <span>Wk {n}</span>}</div>
    </div>
  )
}
