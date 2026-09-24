// Office: tier cards with room art, rent, desks, unlocks and move / downsize. OWNER: ui-management.
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { DialogProps } from './types'
import { Badge, Button, DialogFrame } from '../kit'
import { roomImage } from '../../core/assets'
import { canMoveOffice, moveOffice, monthlyBurn } from '../../sim/economy'
import { OFFICES, type OfficeDef } from '../../data/offices'
import { playSfx } from '../audio'
import { ConfirmBar, Kpi, Note, actResult, fx, monthlyLaunchProfit, useCoachOnOpen, useFlash, useGameState, usd } from '../manage/common'

function coverTone(x: number): 'good' | 'warn' | 'bad' { return x >= 3 ? 'good' : x >= 1 ? 'warn' : 'bad' }

export default function OfficeDialog({ close }: DialogProps) {
  const s = useGameState()
  useCoachOnOpen('office')
  const [confirm, setConfirm] = useState<number | null>(null)
  const [moved, setMoved] = useFlash<number>(2200)
  useEffect(() => {
    const t = window.setTimeout(() => document.querySelector('.g-office.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350)
    return () => window.clearTimeout(t)
  }, [])
  if (!s) return null

  const here = OFFICES[s.office]
  const burn = monthlyBurn(s)
  const launchProfit = monthlyLaunchProfit(s)

  const doMove = (o: OfficeDef) => {
    const up = o.tier > s.office
    const r = actResult(d => moveOffice(d, o.tier), { ok: false } as { ok: boolean; reason?: string })
    setConfirm(null)
    if (!r.ok) { playSfx('error'); return }
    setMoved(o.tier)
    if (up) fx({ kind: 'sound', sound: 'winner' }, { kind: 'confetti', amount: o.tier >= 4 ? 1.4 : 1 })
    else playSfx('whoosh')
  }

  return (
    <DialogFrame
      title="Office"
      icon="🏠"
      width={1120}
      subtitle="More desks means a bigger team, bigger launches and bigger rent. Each move-in costs a one-off deposit and fit-out."
      onClose={close}
      footer={
        <>
          <span className="g-foot-tip">Coach Kev's rule: move up when a month of launch profit covers the new rent about 3×. Downsizing is allowed, and there's no shame in it.</span>
          <Button variant="secondary" onClick={close}>Close</Button>
        </>
      }
    >
      <div className="g-wrap">
        <div className="g-kpis">
          <Kpi icon={here.emoji} label="You're at" value={here.name} sub={`${s.staff.length}/${here.slots} desks used`} tone="gold" />
          <Kpi icon="🧾" label="Rent" value={`${usd(here.rent)}/mo`} sub={`All bills ${usd(burn.rent + burn.salaries + burn.features)}/mo`} />
          <Kpi icon="📈" label="Launch profit, last 4 weeks" value={usd(launchProfit)} tone={launchProfit > 0 ? 'good' : launchProfit < 0 ? 'bad' : undefined} sub="Revenue minus ads, stock and fees" />
          <Kpi icon="💵" label="Cash" value={usd(s.cash)} tone={s.cash < 0 ? 'bad' : undefined} sub={s.cash < 0 ? 'In overdraft: not a great time to move up' : 'Available for the move'} />
        </div>
        {s.current && <Note icon="🚧">Moving mid-launch is fine: your team packs the laptops and keeps building.</Note>}

        <div className="g-offices">
          {OFFICES.map(o => {
            const current = o.tier === s.office
            const up = o.tier > s.office
            const chk = canMoveOffice(s, o.tier)
            const cover = o.rent > 0 ? launchProfit / o.rent : Infinity
            const rentDelta = o.rent - here.rent
            return (
              <article key={o.tier} className={clsx('g-card g-office', current && 'current', up && 'future', moved === o.tier && 'moved')}>
                <div className="g-office-art">
                  <img src={roomImage(o.tier)} alt={`${o.name} room`} loading="lazy" />
                  <span className="g-office-tier">Tier {o.tier}</span>
                  {current && <span className="g-office-here">📍 You're here</span>}
                </div>
                <div className="g-office-body">
                  <div className="g-office-name"><span aria-hidden="true">{o.emoji}</span>{o.name}</div>
                  <div className="g-office-flavor">{o.flavor}</div>
                  <div className="g-office-facts">
                    <div className="g-fact"><span>Rent</span><b>{o.rent ? `${usd(o.rent)}/mo` : 'Free'}</b></div>
                    <div className="g-fact"><span>Staff desks</span><b>🪑 {o.slots}</b></div>
                    <div className="g-fact"><span>Move-in</span><b>{o.moveCost ? usd(o.moveCost) : 'Free'}</b></div>
                  </div>
                  <ul className="g-office-unlocks">
                    {o.unlocks.map(u => <li key={u}>{u}</li>)}
                  </ul>
                  <div className="g-office-cta">
                    {!current && (
                      <div className="g-row" style={{ gap: 6 }}>
                        {up && (
                          <span className={clsx('g-cover', coverTone(cover))} data-tip="Last 4 weeks of launch profit ÷ this rent. Kev likes 3× or more.">
                            {launchProfit <= 0 ? '✗ Launches aren\'t profitable yet' : <>{cover >= 3 ? '✓' : cover >= 1 ? '~' : '✗'} Profit covers rent {cover >= 10 ? '10×+' : `${cover.toFixed(1)}×`}</>}
                          </span>
                        )}
                        {rentDelta !== 0 && <Badge tone={rentDelta > 0 ? 'warn' : 'good'}>{rentDelta > 0 ? '+' : '−'}{usd(Math.abs(rentDelta))}/mo rent</Badge>}
                      </div>
                    )}
                    {moved === o.tier && <Badge tone="gold">🔑 Keys in hand. Welcome home!</Badge>}
                    {confirm === o.tier ? (
                      <ConfirmBar
                        tone={up ? 'info' : 'warn'}
                        actions={<><Button size="sm" variant={up ? 'gold' : 'primary'} onClick={() => doMove(o)}>{up ? '🚚 Move in!' : '📦 Downsize'}</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button></>}
                      >
                        {up ? 'Move' : 'Downsize'} to the <b>{o.name}</b>? {o.moveCost ? <>Pay <b>{usd(o.moveCost)}</b> now, then </> : 'Free to move, then '}
                        rent is <b>{usd(o.rent)}/mo</b> ({rentDelta >= 0 ? '+' : '−'}{usd(Math.abs(rentDelta))}/mo vs now).
                      </ConfirmBar>
                    ) : current ? (
                      <Button variant="secondary" disabled>📍 Current office</Button>
                    ) : (
                      <>
                        <Button variant={up ? 'gold' : 'secondary'} disabled={!chk.ok} onClick={() => { setConfirm(o.tier); playSfx('tick') }}>
                          {up ? `🚚 Move in · ${usd(chk.cost)}` : `📦 Downsize · ${chk.cost ? usd(chk.cost) : 'free'}`}
                        </Button>
                        {!chk.ok && chk.reason && <span className="g-why">{chk.reason}</span>}
                      </>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </DialogFrame>
  )
}
