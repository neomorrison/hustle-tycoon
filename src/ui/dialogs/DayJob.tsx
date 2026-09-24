// McDoodle's: the day job card. Pay, the speed penalty, a "ready to quit?" meter, Quit (celebration) / Rejoin.
// OWNER: ui-management.
import { useState } from 'react'
import clsx from 'clsx'
import type { DialogProps } from './types'
import { Badge, Button, DialogFrame } from '../kit'
import { roomImage } from '../../core/assets'
import { formatDate } from '../../core/time'
import { ECONOMY, monthlyBurn, quitDayJob, rejoinDayJob } from '../../sim/economy'
import { playSfx } from '../audio'
import { ConfirmBar, Kpi, Note, actResult, clamp01, fx, monthlyLaunchProfit, useCoachOnOpen, useGameState, usd } from '../manage/common'

export default function DayJobDialog({ close }: DialogProps) {
  const s = useGameState()
  useCoachOnOpen('dayJob')
  const [confirm, setConfirm] = useState<'quit' | 'rejoin' | null>(null)
  const [party, setParty] = useState(false)
  const [humbled, setHumbled] = useState(false)
  if (!s) return null

  const job = s.dayJob
  const employed = job.employed
  const pay = employed ? job.monthly : ECONOMY.rejoinPay
  const burn = monthlyBurn(s)
  const bills = burn.rent + burn.salaries + burn.features
  const launchProfit = monthlyLaunchProfit(s)
  const target = 2 * (employed ? job.monthly : ECONOMY.dayJobPay)
  const readiness = launchProfit / target
  const verdict = readiness >= 1 ? { tone: 'good' as const, text: '🟢 Kev says: quit. Your launches out-earn the fryer 2× over.' }
    : readiness >= 0.5 ? { tone: 'warn' as const, text: '🟡 Getting close. One more solid launch and the hairnet can go.' }
    : { tone: 'bad' as const, text: '🔴 Not yet. The paycheck is still doing the heavy lifting.' }
  const runwayNoJob = bills > 0 ? s.cash / bills : Infinity

  const doQuit = () => {
    const ok = actResult(d => { const was = d.dayJob.employed; quitDayJob(d); return was && !d.dayJob.employed }, false)
    setConfirm(null)
    if (!ok) { playSfx('error'); return }
    setParty(true)
    setHumbled(false)
    fx({ kind: 'sound', sound: 'winner' }, { kind: 'confetti', amount: 1.6 })
    window.setTimeout(() => fx({ kind: 'confetti', amount: 0.8 }), 650)
  }
  const doRejoin = () => {
    const ok = actResult(d => rejoinDayJob(d), false)
    setConfirm(null)
    if (!ok) { playSfx('error'); return }
    setParty(false)
    setHumbled(true)
    playSfx('flop')
  }

  return (
    <DialogFrame
      title="McDoodle's"
      icon="🍔"
      width={820}
      subtitle={employed ? "Your day job. Steady money, greasy hands, half your brainpower." : "Your former day job. The fryer still hums without you."}
      onClose={close}
      footer={
        <>
          <span className="g-foot-tip">The classic founder move: keep the paycheck until your launches reliably earn twice as much, then go all in.</span>
          <Button variant="secondary" onClick={close}>Close</Button>
        </>
      }
    >
      <div className="g-wrap">
        {party && (
          <div className="g-party" role="status">
            <div className="g-party-rays" aria-hidden="true" />
            <div className="g-party-toss" aria-hidden="true">🧢</div>
            <h3>FREEDOM!</h3>
            <p>The hairnet is retired. You're a full-time founder now: <b>double output</b> and <b>faster launches</b>. There's no paycheck, so keep something live that pays the bills.</p>
          </div>
        )}
        {humbled && (
          <Note icon="🍟" tone="warn">Back on fries at {usd(ECONOMY.rejoinPay)}/mo. No shame: plenty of founders funded their comeback one shift at a time.</Note>
        )}

        <div className="g-dj">
          <div className={clsx('g-dj-art', !employed && 'quit')}>
            <img src={roomImage('mcdoodles')} alt="McDoodle's kitchen" />
            <span className={clsx('g-dj-sign', !employed && 'off')}>{employed ? '🍔 ON SHIFT' : '🚪 CLOCKED OUT'}</span>
            {!employed && <span className="g-dj-stamp">QUIT</span>}
          </div>
          <div className="g-dj-body">
            <div className="g-dj-title">
              {employed ? 'Fry cook' : 'Former fry cook'}
              <Badge tone={employed ? 'warn' : 'good'}>{employed ? `+${usd(job.monthly)}/mo` : 'Full-time founder'}</Badge>
              {job.timesRejoined > 0 && <Badge>Rejoined {job.timesRejoined}×</Badge>}
            </div>
            {employed ? (
              <ul className="g-dj-effects">
                <li><span>💵</span><div><b>{usd(job.monthly)} every month</b>, paid on the 1st no matter how your launches do.</div></li>
                <li><span>🐢</span><div><b>Your output ×0.5.</b> You build after closing time, so you make half the points of a full-time founder.</div></li>
                <li><span>⏳</span><div><b>Launches take 1.5× longer.</b> Fewer launches a year means fewer chances at a winner.</div></li>
                <li><span>🛡️</span><div><b>Safety net.</b> The paycheck covers {bills > 0 ? `${Math.round(Math.min(1, job.monthly / bills) * 100)}% of your ${usd(bills)} monthly bills` : 'your bills entirely (you have none yet)'}.</div></li>
              </ul>
            ) : (
              <ul className="g-dj-effects">
                <li><span>🚀</span><div><b>Full output, normal build speed.</b> Every day goes into launches.</div></li>
                <li><span>📅</span><div>Quit on <b>{job.quitDay !== null ? formatDate(job.quitDay) : 'a good day'}</b>. The manager still asks about you.</div></li>
                <li><span>🧾</span><div>Bills are <b>{usd(bills)}/mo</b>{bills <= 0 ? ' right now.' : s.cash <= 0 ? <>, and you're in overdraft: every bill digs the hole deeper until a launch pays out.</> : <>, and cash covers about <b>{Number.isFinite(runwayNoJob) ? runwayNoJob.toFixed(1) : '∞'} months</b> of them without new profit.</>}</div></li>
                <li><span>🍟</span><div>Rough patch? McDoodle's takes you back at <b>{usd(ECONOMY.rejoinPay)}/mo</b> (less than before) with the same half-speed penalty.</div></li>
              </ul>
            )}

            {employed && (
              <div className="g-ready">
                <div className="g-ready-top">
                  <span>Ready to quit?</span>
                  <small>Launch profit, last 4 weeks: <b>{usd(launchProfit)}</b> / goal {usd(target)}</small>
                </div>
                <div className="g-meter"><i style={{ width: `${clamp01(readiness / 2) * 100}%`, background: readiness >= 1 ? 'var(--k-green)' : readiness >= 0.5 ? 'var(--k-gold)' : 'var(--k-red)' }} /></div>
                <div className="g-ready-scale"><span>$0</span><span>2× paycheck</span><span>4×</span></div>
                <div className={clsx('g-note', verdict.tone)} style={{ padding: '7px 10px' }}>{verdict.text}</div>
              </div>
            )}

            {confirm === 'quit' && (
              <ConfirmBar tone="good" actions={<><Button variant="gold" onClick={doQuit}>🎉 Quit McDoodle's!</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Not yet</Button></>}>
                Hang up the hairnet? You lose <b>{usd(job.monthly)}/mo</b> but build at <b>full speed</b>.{s.cash <= 0 ? <> You're in overdraft right now, so this is a bold move.</> : bills > 0 && s.cash < bills * 2 ? <> Cash covers only about {(s.cash / bills).toFixed(1)} months of bills.</> : null}
              </ConfirmBar>
            )}
            {confirm === 'rejoin' && (
              <ConfirmBar tone="warn" actions={<><Button onClick={doRejoin}>🍔 Rejoin at {usd(ECONOMY.rejoinPay)}/mo</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button></>}>
                Go back to McDoodle's? You get <b>{usd(ECONOMY.rejoinPay)}/mo</b>, but your output drops to half and launches take 1.5× longer.
              </ConfirmBar>
            )}
            {!confirm && (
              <div className="g-row">
                {employed
                  ? <Button variant={readiness >= 1 ? 'gold' : 'danger'} size="lg" onClick={() => { setConfirm('quit'); playSfx('tick') }}>🧢 Quit McDoodle's</Button>
                  : <Button variant="secondary" onClick={() => { setConfirm('rejoin'); playSfx('tick') }}>🍔 Rejoin McDoodle's</Button>}
              </div>
            )}
          </div>
        </div>

        <div className="g-kpis">
          <Kpi icon="💵" label="Cash" value={usd(s.cash)} tone={s.cash < 0 ? 'bad' : undefined} />
          <Kpi icon="🧾" label="Monthly bills" value={usd(bills)} sub={burn.dayJob > 0 ? `Paycheck brings net to ${burn.total > 0 ? '−' : '+'}${usd(Math.abs(burn.total))}/mo` : 'No paycheck'} />
          <Kpi icon="📈" label="Launch profit, last 4 weeks" value={usd(launchProfit)} tone={launchProfit >= pay * 2 ? 'good' : launchProfit < 0 ? 'bad' : undefined} sub={`vs ${usd(pay)}/mo on fries`} />
        </div>
      </div>
    </DialogFrame>
  )
}
