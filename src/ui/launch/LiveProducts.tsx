// Live products strip: one card per selling launch — weekly revenue/profit, sparkline, ROAS vs break-even,
// budget, attached scale-call chip and quick Scale / Refresh / Kill. OWNER: ui-launch.
import { memo, useMemo } from 'react'
import clsx from 'clsx'
import { RefreshCw, Skull, TrendingUp, Zap } from 'lucide-react'
import { getGS } from '../../core/store'
import { openDialog } from '../../core/ui'
import type { Launch } from '../../core/types'
import { SIZES } from '../../data/sizes'
import { PLATFORMS } from '../../data/platforms'
import { ANGLES } from '../../data/angles'
import { killLaunch, launchHealth, refreshCost, SALES, scaleLaunch, refreshCreatives } from '../../sim/sales'
import { launchWorldTags, pauseKind } from '../../sim/world'
import { playSfx } from '../audio'
import { ConfirmButton, EMPTY, flashDecision, MiniBars, ProductThumb, useG, usd, usdSigned, x2 } from './common'
import { quickAction, scaledThisWeek } from './actions'

/** Short chip label per decision kind (the full card sits in the tray). */
const CALL_LABEL: Partial<Record<string, string>> = {
  kill: 'Kill call', refresh: 'Refresh call', scale: 'Scale call', go_bulk: 'Bulk deal',
  restock: 'Restock call', influencer: 'Creator offer', price_match: 'Price war',
}

export default function LiveProducts() {
  const live = useG(s => s.live, EMPTY as unknown as Launch[])
  const count = live.filter(l => l.status === 'live').length
  if (!count) return null
  return (
    <div className="l-live" aria-label={`${count} live product${count > 1 ? 's' : ''}`}>
      <div className="l-live-tag" aria-hidden="true"><span>LIVE</span><b>{count}</b></div>
      {live.map(l => (l.status === 'live' ? <LiveCard key={l.id} l={l} /> : null))}
    </div>
  )
}

const LiveCard = memo(function LiveCard({ l }: { l: Launch }) {
  const trends = useG(s => s.market.trends, EMPTY as unknown as never[])
  const decision = useG(s => s.decisions.find(d => d.launchId === l.id) ?? null, null)
  const run = l.sales
  const rv = l.review
  const weeks = run?.weeks ?? []
  const last = weeks.at(-1)
  const health = launchHealth(l)
  const tags = useMemo(() => { try { return launchWorldTags(getGS(), l) } catch { return [] } }, [l, trends])
  const paused = pauseKind(l)
  const cap = SALES.maxBudgetMult[l.size] ?? 4
  const mult = run?.budgetMult ?? 1
  const weekly = SIZES[l.size].weeklyBudget * mult
  const be = Number(run?.flags.lastBe ?? rv?.breakEvenRoas ?? 99)
  const roas = last?.roas ?? rv?.roas ?? 0
  const ratio = be > 0 && be < 99 ? roas / be : 0
  const fatigue = run?.fatigue ?? 0
  const rCost = useMemo(() => { try { return refreshCost(getGS(), l.id) } catch { return 0 } }, [l])
  const canPayRefresh = useG(s => s.cash >= rCost, false)
  const bars = useMemo(() => weeks.map(w => ({ value: w.revenue, profit: w.profit, label: `Week ${w.week + 1}: ${usd(w.revenue)} revenue · ${usdSigned(w.profit)} profit` })), [weeks])

  const open = () => openDialog('launchDetail', { launchId: l.id })
  const scale = () => { quickAction(l.id, 'scale', 'scale50', s => scaleLaunch(s, l.id, 1.5)); playSfx('coin') }
  const refresh = () => { quickAction(l.id, 'refresh', 'refresh', s => refreshCreatives(s, l.id)); playSfx('whoosh') }
  const kill = () => { quickAction(l.id, 'kill', 'kill', s => killLaunch(s, l.id)); playSfx('whoosh') }

  // pointer events on the inner buttons must not open the detail dialog
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const settling = scaledThisWeek(l)
  const canScale = mult < cap - 0.01 && !paused && !settling
  const scaleTip = !canScale
    ? paused ? 'Ads are paused right now' : settling ? 'Scaled this week already: give the algorithm a week to settle' : `Budget is maxed at ${cap}× for a ${SIZES[l.size].name.toLowerCase()}`
    : `+50% budget → ${usd(weekly * 1.5)}/wk${ratio > 0 && ratio < 1 ? '\n⚠️ ROAS is under break-even: scaling a loser burns cash faster' : ''}`

  return (
    <div
      className={clsx('l-card l-livecard', `h-${health.tone}`, decision && 'has-call')}
      role="button" tabIndex={0} onClick={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
      aria-label={`${l.name}: open details`}
    >
      <div className="l-live-head">
        <ProductThumb productId={l.productId} size={42} />
        <div className="l-live-title">
          <div className="l-live-name" title={l.name}>{l.name}</div>
          <div className="l-live-sub">
            <span>{PLATFORMS[l.platform].icon} Wk {weeks.length + 1}</span>
            <span className={clsx('l-health', health.tone)}>{health.label}</span>
          </div>
        </div>
        {rv && <span className={clsx('l-score-dot', rv.verdict)} data-tip={`Review ${rv.overall.toFixed(1)}/10 · ${ANGLES[l.angle].icon} ${ANGLES[l.angle].name}`}>{rv.overall.toFixed(1)}</span>}
      </div>

      {(tags.length > 0 || decision) && (
        <div className="l-live-tags">
          {decision && (
            <button type="button" className="l-callchip" onClick={e => { stop(e); flashDecision(decision.id) }} data-tip="A scale call is waiting in the tray">
              <Zap size={12} /> {CALL_LABEL[decision.kind] ?? 'Decision'}
            </button>
          )}
          {tags.map(t => <span key={t.id} className={clsx('l-tag', t.tone)}>{t.emoji} {t.label}</span>)}
        </div>
      )}

      <div className="l-live-nums">
        {last ? (
          <>
            <div><small>Last week</small><b>{usd(last.revenue)}</b></div>
            <div><small>Profit</small><b className={last.profit >= 0 ? 'pos' : 'neg'}>{usdSigned(last.profit)}</b></div>
          </>
        ) : (
          <div className="l-live-first"><small>Learning phase</small><b>First sales next week…</b></div>
        )}
        <MiniBars data={bars} max={10} height={30} className="l-live-bars" />
      </div>

      <div className="l-roas" data-tip={`ROAS = revenue ÷ ad spend. Break-even ROAS ${x2(be)} covers product, shipping and fees.\nAbove it you profit; below it every ad dollar loses money.`}>
        <div className="l-roas-top">
          <span>ROAS <b className={ratio >= 1 ? 'pos' : ratio > 0 ? 'neg' : ''}>{roas > 0 ? x2(roas) : '—'}</b></span>
          <span>BE {x2(be)}</span>
        </div>
        <div className="l-roas-track">
          <i className={ratio >= 1.25 ? 'gold' : ratio >= 1 ? 'good' : 'bad'} style={{ width: `${Math.min(100, (ratio / 2.5) * 100)}%` }} />
          <em style={{ left: '40%' }} />
        </div>
      </div>

      <div className="l-live-foot">
        <span className="l-budget" data-tip={`Weekly ad budget ${usd(weekly)} (${mult.toFixed(2)}× the ${SIZES[l.size].name.toLowerCase()} default)`}>💰 {usd(weekly)}/wk · {mult.toFixed(1)}×</span>
        <span className={clsx('l-fatigue', fatigue >= 0.25 && 'hot')} data-tip="Creative fatigue: the audience has seen these ads. Refresh resets it.">😴 {Math.round(fatigue * 100)}%</span>
      </div>

      <div className="l-quick" onClick={stop} onKeyDown={stop}>
        <ConfirmButton className="l-qbtn scale" stop disabled={!canScale} onConfirm={scale} tip={scaleTip}
          confirm={<>{usd(weekly * 1.5)}?</>}>
          <TrendingUp size={14} /> Scale
        </ConfirmButton>
        <ConfirmButton className="l-qbtn refresh" stop disabled={fatigue < 0.05 || !canPayRefresh} onConfirm={refresh}
          tip={fatigue < 0.05 ? 'Creatives are still fresh' : !canPayRefresh ? `Need ${usd(rCost)}` : `New creatives for ${usd(rCost)}: fatigue ${Math.round(fatigue * 100)}% → 0%`}
          confirm={<>Pay {usd(rCost)}</>}>
          <RefreshCw size={13} /> Refresh
        </ConfirmButton>
        <ConfirmButton className="l-qbtn kill" stop confirm={<><Skull size={13} /> Sure?</>} onConfirm={kill}
          tip={ratio >= 1 ? 'End this run now (it is still profitable!)' : 'Stop the bleeding: end the run and read the post-mortem'}>
          <Skull size={13} /> Kill
        </ConfirmButton>
      </div>
    </div>
  )
})
