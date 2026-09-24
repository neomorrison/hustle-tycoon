// Finance: 52-week revenue/profit chart (hand-rolled SVG), cash chart, monthly burn, runway, P&L and lifetime stats.
// OWNER: ui-management.
import { useMemo, useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import type { DialogProps } from './types'
import type { GameState, WeekFinance } from '../../core/types'
import { Button, DialogFrame, Tabs } from '../kit'
import { openDialog } from '../../core/ui'
import { delta } from '../../core/format'
import { DAYS_PER_MONTH, formatDate, monthName, monthOf, weekOfMonth, yearOf } from '../../core/time'
import { ECONOMY, monthlyBurn } from '../../sim/economy'
import { playSfx } from '../audio'
import { Empty, Kpi, Note, clamp01, lastWeeks, launchProfitOf, sumWeeks, useCoachOnOpen, useGameState, useWidth, usd, usdShort } from '../manage/common'

interface Pt extends WeekFinance { day: number; partial?: boolean }
type Mode = 'pl' | 'cash'

const COLORS = { rev: '#7c4dff', pos: '#22c55e', neg: '#ef4444', cash: '#7c4dff', rent: '#ec4899', salaries: '#3b82f6', apps: '#14b8a6' }

function niceCeil(x: number): number {
  if (!(x > 0)) return 0
  const p = 10 ** Math.floor(Math.log10(x))
  const f = x / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}
function colPath(x: number, base: number, end: number, w: number): string {
  const h = Math.abs(end - base)
  if (h < 0.5) return ''
  const r = Math.min(4, h, w / 2)
  const up = end < base
  const e1 = up ? end + r : end - r
  return `M${x},${base}V${e1}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${e1}V${base}Z`
}
const axisMoney = (n: number) => (n === 0 ? '$0' : usdShort(n).replace('.0K', 'K'))

function useSeries(s: GameState | null): Pt[] {
  const finance = s?.finance
  const cash = s?.cash ?? 0
  const day = s?.day ?? 0
  return useMemo(() => {
    if (!finance) return []
    const closed = finance.weeks.slice(-51).map(w => ({ ...w, day: w.week * 7 }))
    const cur = finance.thisWeek
    const pts: Pt[] = [...closed]
    if (day > 0 || cur.revenue || cur.profit) pts.push({ ...cur, cash, day: cur.week * 7, partial: true })
    return pts
  }, [finance, cash, day])
}

function Tip({ p, x, slotW, width, mode }: { p: Pt; x: number; slotW: number; width: number; mode: Mode }) {
  const onRight = x < width * 0.55
  const pos = onRight ? { left: x + slotW / 2 + 10 } : { right: width - x + slotW / 2 + 10 }
  const lp = launchProfitOf(p)
  return (
    <div className="g-tip" style={{ ...pos, top: 4 }} role="status">
      <div className="g-tip-title">{formatDate(p.day)}{p.partial ? ' · so far' : ''}</div>
      {mode === 'pl' ? (
        <>
          <div className="g-tip-row"><i style={{ background: COLORS.rev }} /><span>Revenue</span><b>{usd(p.revenue)}</b></div>
          <div className="g-tip-row minor"><i /><span>Ad spend</span><b>−{usd(p.adSpend)}</b></div>
          <div className="g-tip-row minor"><i /><span>Stock (COGS)</span><b>−{usd(p.cogs)}</b></div>
          <div className="g-tip-row minor"><i /><span>Fees</span><b>−{usd(p.fees)}</b></div>
          <div className="g-tip-row minor"><i /><span>Launch profit</span><b>{usd(lp)}</b></div>
          {(p.expenses > 0 || p.income > 0) && <div className="g-tip-sep" />}
          {p.expenses > 0 && <div className="g-tip-row minor"><i /><span>Bills &amp; one-offs</span><b>−{usd(p.expenses)}</b></div>}
          {p.income > 0 && <div className="g-tip-row minor"><i /><span>Paycheck</span><b>+{usd(p.income)}</b></div>}
          <div className="g-tip-sep" />
          <div className="g-tip-row"><i style={{ background: p.profit >= 0 ? COLORS.pos : COLORS.neg }} /><span>Profit</span><b>{usd(p.profit)}</b></div>
          {p.adSpend > 0 && <div className="g-tip-row minor"><i /><span>Blended ROAS</span><b>{(p.revenue / p.adSpend).toFixed(2)}×</b></div>}
        </>
      ) : (
        <>
          <div className="g-tip-row"><i style={{ background: COLORS.cash }} /><span>Cash {p.partial ? 'now' : 'at week end'}</span><b>{usd(p.cash)}</b></div>
          <div className="g-tip-row minor"><i /><span>Week profit</span><b>{usd(p.profit)}</b></div>
        </>
      )}
    </div>
  )
}

function WeeklyChart({ data, mode }: { data: Pt[]; mode: Mode }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 56
  const padR = 12
  const slots = Math.max(12, data.length)
  const plotW = Math.max(100, width - padL - padR)
  const slotW = plotW / slots
  const barW = Math.max(2, Math.min(24, slotW * 0.66))
  const cx = (i: number) => padL + i * slotW + slotW / 2

  const revH = 150, gap = 30, profH = 116, axisH = 24, cashH = 250
  const H = mode === 'pl' ? revH + gap + profH + axisH : cashH + axisH

  // scales
  const revMax = niceCeil(Math.max(100, ...data.map(d => d.revenue)))
  const posMax = Math.max(0, ...data.map(d => d.profit))
  const negMax = Math.max(0, ...data.map(d => -d.profit))
  const span = niceCeil(Math.max(100, posMax, negMax))
  const pTop = posMax > 0 ? niceCeil(posMax) : negMax > 0 ? span / 4 : 100
  const pBot = negMax > 0 ? niceCeil(negMax) : 0
  const profTop = revH + gap
  const py = (v: number) => profTop + ((pTop - v) / (pTop + pBot || 1)) * profH
  const ry = (v: number) => revH - (v / revMax) * revH

  const cashVals = data.map(d => d.cash)
  const showOd = Math.min(...cashVals) < 1000
  const cMin = Math.min(0, ...cashVals, showOd ? ECONOMY.overdraftFloor : 0)
  const cMaxRaw = Math.max(500, ...cashVals)
  const cMax = niceCeil(cMaxRaw)
  const cLo = cMin < 0 ? -niceCeil(-cMin) : 0
  const cy = (v: number) => ((cMax - v) / (cMax - cLo || 1)) * cashH

  // x labels: month starts
  const labels: { i: number; text: string }[] = []
  let lastLabelX = -99
  data.forEach((d, i) => {
    if (weekOfMonth(d.day) !== 1 && i !== 0) return
    const m = monthOf(d.day)
    const text = m === 0 ? `Y${yearOf(d.day)}` : monthName(m)
    const x = cx(i)
    if (x - lastLabelX < 34) return
    lastLabelX = x
    labels.push({ i, text })
  })

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover(h => Math.max(0, (h ?? data.length) - 1)) }
    if (e.key === 'ArrowRight') { e.preventDefault(); setHover(h => Math.min(data.length - 1, (h ?? -1) + 1)) }
    if (e.key === 'Escape' && hover !== null) { e.preventDefault(); e.stopPropagation(); setHover(null) }
  }
  const hp = hover !== null ? data[hover] : null
  const cashPath = data.map((d, i) => `${i ? 'L' : 'M'}${cx(i)},${cy(d.cash)}`).join('')
  const baseY = cy(Math.max(cLo, 0))

  return (
    <div
      ref={ref}
      className="g-chart"
      tabIndex={0}
      role="img"
      aria-label={mode === 'pl' ? 'Weekly revenue and profit, last 52 weeks' : 'Weekly closing cash, last 52 weeks'}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
      onPointerLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={H}>
          {hover !== null && <rect className="hover-wash" x={padL + hover * slotW} y={0} width={slotW} height={H - axisH} rx={4} />}
          {mode === 'pl' ? (
            <>
              {/* revenue panel */}
              <text className="ptitle" x={padL} y={-6}>Revenue</text>
              {[0, revMax / 2, revMax].map(t => (
                <g key={`r${t}`}>
                  <line className={t === 0 ? 'zero' : 'grid'} x1={padL} x2={width - padR} y1={ry(t)} y2={ry(t)} />
                  <text className="tick" x={padL - 8} y={ry(t) + 4} textAnchor="end">{axisMoney(t)}</text>
                </g>
              ))}
              {data.map((d, i) => (
                <path key={`rv${i}`} className={clsx('bar-rev', d.partial && 'partial')} d={colPath(cx(i) - barW / 2, ry(0), ry(d.revenue), barW)} />
              ))}
              {/* profit panel */}
              <text className="ptitle" x={padL} y={profTop - 8}>Profit (after every cost)</text>
              {[pTop, 0, ...(pBot > 0 ? [-pBot] : [])].map(t => (
                <g key={`p${t}`}>
                  <line className={t === 0 ? 'zero' : 'grid'} x1={padL} x2={width - padR} y1={py(t)} y2={py(t)} />
                  <text className="tick" x={padL - 8} y={py(t) + 4} textAnchor="end">{axisMoney(t)}</text>
                </g>
              ))}
              {data.map((d, i) => (
                <path key={`pf${i}`} className={clsx(d.profit >= 0 ? 'bar-pos' : 'bar-neg', d.partial && 'partial')} d={colPath(cx(i) - barW / 2, py(0), py(d.profit), barW)} />
              ))}
            </>
          ) : (
            <>
              {[cMax, cMax / 2, 0, ...(cLo < 0 ? [cLo] : [])].filter((t, i, a) => a.indexOf(t) === i).map(t => (
                <g key={`c${t}`}>
                  <line className={t === 0 ? 'zero' : 'grid'} x1={padL} x2={width - padR} y1={cy(t)} y2={cy(t)} />
                  <text className="tick" x={padL - 8} y={cy(t) + 4} textAnchor="end">{axisMoney(t)}</text>
                </g>
              ))}
              {showOd && (
                <g>
                  <line className="od-line" x1={padL} x2={width - padR} y1={cy(ECONOMY.overdraftFloor)} y2={cy(ECONOMY.overdraftFloor)} />
                  <text className="od-label" x={width - padR} y={cy(ECONOMY.overdraftFloor) - 5} textAnchor="end">Overdraft limit −$3K</text>
                </g>
              )}
              <path className="cash-area" d={`${cashPath}L${cx(data.length - 1)},${baseY}L${cx(0)},${baseY}Z`} />
              <path className="cash-line" d={cashPath} />
              {data.length > 0 && (
                <>
                  <circle className="cash-dot" cx={cx(data.length - 1)} cy={cy(data[data.length - 1].cash)} r={5} />
                  <text className="tick" x={Math.min(width - padR, cx(data.length - 1) + 8)} y={cy(data[data.length - 1].cash) - 10} textAnchor="end" style={{ fontWeight: 700, fill: 'var(--k-ink)' }}>{usdShort(data[data.length - 1].cash)}</text>
                </>
              )}
              {hp && hover !== data.length - 1 && <circle className="cash-dot" cx={cx(hover!)} cy={cy(hp.cash)} r={5} />}
            </>
          )}
          {/* x axis */}
          {labels.map(l => (
            <text key={`x${l.i}`} className="tick" x={cx(l.i)} y={H - 6} textAnchor="middle">{l.text}</text>
          ))}
          {/* hit targets: whole slot, both panels */}
          {data.map((_, i) => (
            <rect key={`h${i}`} className="hit" x={padL + i * slotW} y={0} width={slotW} height={H - axisH} onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)} />
          ))}
        </svg>
      )}
      {hp && hover !== null && <Tip p={hp} x={cx(hover)} slotW={slotW} width={width} mode={mode} />}
    </div>
  )
}

function WeekTable({ data }: { data: Pt[] }) {
  return (
    <details className="g-table-toggle">
      <summary>Show as a table</summary>
      <div className="g-table-scroll">
        <table className="g-table">
          <thead><tr><th>Week</th><th>Revenue</th><th>Ads</th><th>COGS</th><th>Fees</th><th>Bills</th><th>Paycheck</th><th>Profit</th><th>Cash</th></tr></thead>
          <tbody>
            {[...data].reverse().map(p => (
              <tr key={`${p.week}${p.partial ? 'p' : ''}`}>
                <td>{formatDate(p.day)}{p.partial ? ' (so far)' : ''}</td>
                <td>{usd(p.revenue)}</td><td>{usd(p.adSpend)}</td><td>{usd(p.cogs)}</td><td>{usd(p.fees)}</td>
                <td>{usd(p.expenses)}</td><td>{usd(p.income)}</td>
                <td className={p.profit >= 0 ? 'g-pos' : 'g-neg'}>{usd(p.profit)}</td><td>{usd(p.cash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export default function FinanceDialog({ close }: DialogProps) {
  const s = useGameState()
  useCoachOnOpen('finance')
  const [mode, setMode] = useState<Mode>('pl')
  const data = useSeries(s)
  if (!s) return null

  const last4 = sumWeeks(lastWeeks(s, 4))
  const prev4 = sumWeeks(s.finance.weeks.slice(-8, -4))
  const revDelta = delta(last4.revenue, prev4.revenue)
  const burn = monthlyBurn(s)
  const bills = burn.rent + burn.salaries + burn.features
  const net = last4.launchProfit - burn.total
  const runwayMonths = net < 0 && s.cash > 0 ? s.cash / -net : null
  const roas = last4.adSpend > 0 ? last4.revenue / last4.adSpend : 0
  const payday = DAYS_PER_MONTH - (s.day % DAYS_PER_MONTH)
  const winRate = s.stats.launches ? Math.round((s.stats.winners / s.stats.launches) * 100) : 0
  const hasData = data.some(d => d.revenue || d.profit || d.cash)

  const pl = (label: string, value: number, of: number, cls?: string, color?: string) => (
    <div className={clsx('g-line', cls)}>
      <span className="g-sw" style={{ background: color ?? 'transparent' }} />
      <span>{label}</span>
      <small>{of > 0 ? `${Math.round((Math.abs(value) / of) * 100)}%` : ''}</small>
      <b className={value < 0 ? 'g-neg' : cls ? (value >= 0 ? 'g-pos' : 'g-neg') : undefined}>{value < 0 ? '−' : ''}{usd(Math.abs(value))}</b>
    </div>
  )

  return (
    <DialogFrame
      title="Finance"
      icon="📈"
      width={1060}
      subtitle="Revenue is vanity, profit is sanity, cash is king."
      onClose={close}
      footer={
        <>
          <span className="g-foot-tip">ROAS = revenue ÷ ad spend. Above break-even ROAS every ad dollar pays for itself plus the product, the shipping and the fees.</span>
          <Button variant="secondary" onClick={close}>Close</Button>
        </>
      }
    >
      <div className="g-wrap">
        <div className="g-kpis">
          <Kpi className="hero" icon="💵" label="Cash" value={usd(s.cash)} tone={s.cash < 0 ? 'bad' : undefined}
            sub={s.cash < ECONOMY.overdraftFloor ? `🚨 ${Math.max(0, ECONOMY.bankruptDays - s.brokeDays)} days to get above −$3,000` : s.cash < 0 ? 'In overdraft (limit −$3,000)' : `Peak ${usd(s.stats.peakCash)}`} />
          <Kpi icon="🛒" label="Revenue, last 4 weeks" value={usd(last4.revenue)} sub={revDelta.dir === 'flat' ? 'Flat vs the 4 weeks before' : `${revDelta.dir === 'up' ? '▲' : '▼'} ${revDelta.text} vs the 4 weeks before`} tone={revDelta.dir === 'up' ? 'good' : undefined} />
          <Kpi icon="💰" label="Profit, last 4 weeks" value={usd(last4.profit)} tone={last4.profit > 0 ? 'good' : last4.profit < 0 ? 'bad' : undefined} sub="After ads, stock, fees and bills" />
          <Kpi icon="🎯" label="Blended ROAS, 4 weeks" value={roas ? `${roas.toFixed(2)}×` : '—'} sub={last4.adSpend ? `${usd(last4.adSpend)} on ads` : 'No ads running'} />
        </div>

        <section className="g-card g-chart-card">
          <div className="g-chart-head">
            <Tabs<Mode> value={mode} onChange={m => { setMode(m); playSfx('tick') }} tabs={[{ id: 'pl', label: '📊 Revenue & profit' }, { id: 'cash', label: '💵 Cash' }]} />
            <div className="g-legend">
              {mode === 'pl' ? (
                <>
                  <span className="g-legend-item"><i className="g-legend-key" style={{ background: COLORS.rev }} />Revenue</span>
                  <span className="g-legend-item"><i className="g-legend-key" style={{ background: COLORS.pos }} />Profit</span>
                  <span className="g-legend-item"><i className="g-legend-key" style={{ background: COLORS.neg }} />Loss</span>
                  {hasData && <span className="g-legend-item k-muted">Last {data.length} week{data.length === 1 ? '' : 's'} · faded bar = this week so far</span>}
                </>
              ) : (
                <span className="g-legend-item"><i className="g-legend-key line" style={{ background: COLORS.cash }} />Cash at the end of each week</span>
              )}
            </div>
          </div>
          {hasData ? (
            <>
              <div style={{ paddingTop: mode === 'pl' ? 14 : 4 }}><WeeklyChart data={data} mode={mode} /></div>
              <WeekTable data={data} />
            </>
          ) : (
            <Empty icon="📉" title="No money has moved yet">Your first week closes on day 7. Start a launch and watch this fill up.</Empty>
          )}
        </section>

        <div className="g-fin-cols">
          <section className="g-card g-runway">
            <h3 className="g-h3" style={{ marginTop: 0 }}>🧾 Monthly bills <small>next due in {payday} day{payday === 1 ? '' : 's'}</small></h3>
            {bills > 0 && (
              <div className="g-burn-bar" aria-hidden="true">
                {burn.rent > 0 && <i style={{ width: `${(burn.rent / bills) * 100}%`, background: COLORS.rent }} />}
                {burn.salaries > 0 && <i style={{ width: `${(burn.salaries / bills) * 100}%`, background: COLORS.salaries }} />}
                {burn.features > 0 && <i style={{ width: `${(burn.features / bills) * 100}%`, background: COLORS.apps }} />}
              </div>
            )}
            <div className="g-lines">
              <div className="g-line"><span className="g-sw" style={{ background: COLORS.rent }} /><span>🏠 Rent</span><Button size="sm" variant="ghost" onClick={() => openDialog('office')}>Office</Button><b>{usd(burn.rent)}</b></div>
              <div className="g-line"><span className="g-sw" style={{ background: COLORS.salaries }} /><span>👥 Salaries · {s.staff.length} staff</span><Button size="sm" variant="ghost" onClick={() => openDialog('staff')}>Staff</Button><b>{usd(burn.salaries)}</b></div>
              <div className="g-line"><span className="g-sw" style={{ background: COLORS.apps }} /><span>🧩 Store apps · {s.activeFeatures.length} on</span><Button size="sm" variant="ghost" onClick={() => openDialog('features')}>Apps</Button><b>{usd(burn.features)}</b></div>
              {burn.dayJob > 0 && <div className="g-line"><span className="g-sw" /><span>🍔 McDoodle's paycheck</span><span /><b className="g-pos">+{usd(burn.dayJob)}</b></div>}
              <div className="g-line total"><span /><span>{burn.total > 0 ? 'Net burn per month' : 'Net per month'}</span><span /><b className={burn.total > 0 ? 'g-neg' : 'g-pos'}>{burn.total > 0 ? '−' : '+'}{usd(Math.abs(burn.total))}</b></div>
            </div>
          </section>

          <section className="g-card g-runway">
            <h3 className="g-h3" style={{ marginTop: 0 }}>🛟 Runway</h3>
            {s.cash < 0 && net > 0 ? (
              <>
                <div className="g-runway-big" style={{ color: '#b45309' }}>Climbing out 🧗</div>
                <div className="g-sub">You're in overdraft, but last month's launches netted <b>{usd(net)}/mo</b> after bills. At this pace you're back above $0 in about <b>{Math.max(0.1, -s.cash / net).toFixed(1)} months</b>.</div>
                <div className="g-meter"><i style={{ width: `${clamp01((s.cash - ECONOMY.overdraftFloor) / -ECONOMY.overdraftFloor) * 100}%`, background: '#f59e0b' }} /></div>
              </>
            ) : net >= 0 && s.cash >= 0 && last4.launchProfit <= 0 && burn.dayJob > 0 ? (
              <>
                <div className="g-runway-big">Paycheck-funded 🍔</div>
                <div className="g-sub">McDoodle's covers the bills for now (<b>+{usd(net)}/mo</b> left over). Your launches haven't turned a profit yet{last4.revenue > 0 ? ' this month' : ''}.</div>
                <div className="g-meter"><i style={{ width: '100%', background: 'var(--k-gold)' }} /></div>
              </>
            ) : net >= 0 && s.cash >= 0 ? (
              <>
                <div className="g-runway-big g-pos">Self-funding ✓</div>
                <div className="g-sub">Last month's launches made {usd(last4.launchProfit)}. After {burn.total >= 0 ? 'the bills' : 'bills and the paycheck'} you're up <b>{usd(net)}/mo</b>.</div>
                <div className="g-meter"><i style={{ width: '100%', background: COLORS.pos }} /></div>
              </>
            ) : s.cash <= 0 ? (
              <>
                <div className="g-runway-big g-neg">In overdraft</div>
                <div className="g-sub">{net < 0 ? <>You're losing about <b>{usd(-net)}/mo</b>.</> : <>You're treading water.</>} Stay above −$3,000: {ECONOMY.bankruptDays} days below it and the bank freezes everything. Kill losers, switch off apps, or pick up McDoodle's shifts.</div>
                <div className="g-meter"><i style={{ width: `${clamp01((s.cash - ECONOMY.overdraftFloor) / -ECONOMY.overdraftFloor) * 100}%`, background: COLORS.neg }} /></div>
              </>
            ) : (
              <>
                <div className={clsx('g-runway-big', (runwayMonths ?? 0) < 2 && 'g-neg')}>~{(runwayMonths ?? 0) < 10 ? (runwayMonths ?? 0).toFixed(1) : Math.round(runwayMonths ?? 0)} months</div>
                <div className="g-sub">At last month's pace you lose about <b>{usd(-net)}/mo</b>, so cash hits $0 in roughly {(runwayMonths ?? 0).toFixed(1)} months. A winning launch fixes that fast.</div>
                <div className="g-meter"><i style={{ width: `${clamp01((runwayMonths ?? 0) / 12) * 100}%`, background: (runwayMonths ?? 0) < 2 ? COLORS.neg : (runwayMonths ?? 0) < 6 ? '#f59e0b' : COLORS.pos }} /></div>
              </>
            )}
            <h3 className="g-h3">🔎 Where the money went <small>last 4 weeks</small></h3>
            {last4.revenue > 0 || last4.expenses > 0 ? (
              <div className="g-lines">
                {pl('Revenue', last4.revenue, last4.revenue, undefined, COLORS.rev)}
                {pl('Ad spend', -last4.adSpend, last4.revenue)}
                {pl('Stock & shipping (COGS)', -last4.cogs, last4.revenue)}
                {pl('Payment fees', -last4.fees, last4.revenue)}
                {pl('Launch profit', last4.launchProfit, last4.revenue, 'total')}
                {pl('Bills, launches & one-offs', -last4.expenses, 0)}
                {last4.income > 0 && pl("McDoodle's", last4.income, 0)}
                {pl('Net profit', last4.profit, 0, 'total')}
              </div>
            ) : <div className="g-sub">Nothing sold in the last 4 weeks.</div>}
            {last4.revenue > 0 && last4.adSpend > 0 && (
              <Note icon="📣">Ads ate <b>{Math.round((last4.adSpend / last4.revenue) * 100)}%</b> of revenue. {last4.launchProfit > 0 ? 'The rest paid for stock and fees with room to spare.' : 'Not enough left for stock and fees: kill or refresh the weak ones.'}</Note>
            )}
          </section>
        </div>

        <section>
          <h3 className="g-h3">🏅 Lifetime</h3>
          <div className="g-kpis" style={{ marginTop: 8 }}>
            <Kpi icon="🛒" label="Lifetime revenue" value={usd(s.stats.lifetimeRevenue)} />
            <Kpi icon="💰" label="Lifetime profit" value={usd(s.stats.lifetimeProfit)} tone={s.stats.lifetimeProfit >= 0 ? 'good' : 'bad'} sub="From launches" />
            <Kpi icon="🚀" label="Launches" value={s.stats.launches} sub={`${s.stats.winners} 🏆 winners · ${winRate}%`} />
            <Kpi icon="⭐" label="Best review" value={s.stats.bestScore ? `${s.stats.bestScore.toFixed(1)}/10` : '—'} />
            <Kpi icon="📈" label="Best week" value={usd(s.stats.peakWeekRevenue)} sub="Revenue" />
            <Kpi icon="❤️" label="Fans" value={Math.round(s.fans).toLocaleString('en-US')} sub={`Brand ${Math.round(s.brand)}/100`} />
          </div>
        </section>
      </div>
    </DialogFrame>
  )
}
