// Staff: desks, team cards (stats, level, training, firing) and candidates to hire. OWNER: ui-management.
import { useState } from 'react'
import clsx from 'clsx'
import type { DialogProps } from './types'
import type { GameState, Person, StatId } from '../../core/types'
import { Badge, Button, DialogFrame, StatBar, Tabs } from '../kit'
import { act, getGS } from '../../core/store'
import { openDialog } from '../../core/ui'
import { founderPortrait, portrait } from '../../core/assets'
import { DAYS_PER_MONTH, formatDate } from '../../core/time'
import {
  ROLE_INFO, STAT_IDS, STAT_INFO, TRAINING_DAYS, canHire, canTrain, fire, freeSlots, hire, hiringFee, isTraining,
  personTagline, severance, staffSlots, train, trainingCost, xpToNext,
} from '../../sim/staff'
import { hasBoost, hasResearch } from '../../sim/research'
import { MAX_OFFICE, officeDef } from '../../data/offices'
import { SIZES, SIZE_IDS } from '../../data/sizes'
import { playSfx } from '../audio'
import { ConfirmBar, Empty, Note, actResult, fx, useCoachOnOpen, useFlash, useGameState, usd } from '../manage/common'

const STAT_COLOR: Record<StatId, string> = {
  copy: 'var(--k-conv)', creative: 'var(--k-traffic)', research: 'var(--k-research)', speed: 'var(--k-green)',
}
const firstName = (p: Person) => p.name.split(' ')[0]
type Tab = 'team' | 'hire'

function faceFor(s: GameState, p: Person): string {
  if (p.id !== s.founder.id) return portrait(p.portrait)
  return founderPortrait(s.cash < 0 ? 'stressed' : s.dayJob.employed ? 'tired' : 'happy')
}

function StatBlock({ p }: { p: Person }) {
  return (
    <div className="g-stats">
      {STAT_IDS.map(k => (
        <div key={k} className={clsx('g-stat', p.stats[k] >= 60 && 'strong')} data-tip={STAT_INFO[k].blurb} data-tip-pos="right">
          <span>{STAT_INFO[k].emoji} {STAT_INFO[k].label}</span>
          <StatBar value={p.stats[k]} color={STAT_COLOR[k]} />
          <b>{Math.round(p.stats[k])}</b>
        </div>
      ))}
    </div>
  )
}

function TrainPicker({ s, p, stat, onPick, onGo, onCancel }: {
  s: GameState; p: Person; stat: StatId; onPick: (k: StatId) => void; onGo: () => void; onCancel: () => void
}) {
  const bonus = hasBoost(s, 'mentorship') ? 3 : 0
  const lo = 6 + bonus
  const hi = 12 + bonus
  const cost = trainingCost(s, p.id)
  const check = canTrain(s, p.id, stat)
  const me = p.id === s.founder.id
  return (
    <div className="g-picker">
      <div className="g-picker-title">🎓 {me ? 'Book yourself a course' : `Train ${firstName(p)}`}: pick a stat</div>
      <div className="g-picker-opts">
        {STAT_IDS.map(k => (
          <button key={k} type="button" className={clsx('g-picker-opt', stat === k && 'on')} disabled={p.stats[k] >= 100} onClick={() => onPick(k)}>
            <span>{STAT_INFO[k].emoji} {STAT_INFO[k].label}</span>
            <small>{Math.round(p.stats[k])} → {Math.min(100, p.stats[k] + lo)}–{Math.min(100, p.stats[k] + hi)}</small>
          </button>
        ))}
      </div>
      <div className="g-picker-meta">
        <span>💵 <b>{usd(cost)}</b></span>
        <span>⏳ {TRAINING_DAYS} days away from the desk</span>
        <span>{STAT_INFO[stat].emoji} {STAT_INFO[stat].blurb}</span>
      </div>
      {!check.ok && <div className="g-why">{check.reason}</div>}
      <div className="g-row">
        <Button size="sm" disabled={!check.ok} onClick={onGo}>Send to training · {usd(cost)}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function PersonCard({ s, p, mode, picker, firing, pop, onTrainOpen, onTrainPick, onTrainGo, onTrainCancel, onFireAsk, onFireYes, onFireNo, onHire }: {
  s: GameState; p: Person; mode: 'team' | 'candidate'; picker: StatId | null; firing: boolean; pop: boolean
  onTrainOpen?: () => void; onTrainPick?: (k: StatId) => void; onTrainGo?: () => void; onTrainCancel?: () => void
  onFireAsk?: () => void; onFireYes?: () => void; onFireNo?: () => void; onHire?: () => void
}) {
  const founder = p.id === s.founder.id
  const role = ROLE_INFO[p.role]
  const training = mode === 'team' && isTraining(s, p)
  const left = training ? Math.max(0, (p.trainingUntil ?? s.day) - s.day) : 0
  const need = xpToNext(p.level)
  const hireCheck = mode === 'candidate' ? canHire(s, p.id) : null
  return (
    <article className={clsx('g-card g-person', founder && 'founder', pop && 'pop')} data-person-card={p.id}>
      <div className="g-person-top">
        <img className="g-face" src={faceFor(s, p)} alt="" />
        <div className="g-grow">
          <div className="g-person-name">
            {p.name}{founder && <Badge tone="gold">You</Badge>}
          </div>
          <div className="g-row" style={{ marginTop: 4, gap: 6 }}>
            <Badge tone="purple">{role.emoji} {role.label}</Badge>
            {founder && s.dayJob.employed && <Badge tone="warn">🍔 ½ output</Badge>}
            {mode === 'candidate' && <Badge tone="info">Lv {p.level}</Badge>}
          </div>
          <div className="g-person-tag">“{founder ? role.blurb : personTagline(p)}”</div>
        </div>
      </div>

      {mode === 'team' && (
        <div className="g-lvl" data-tip={`${need - p.xp} XP to level ${p.level + 1}. Every launch review hands out XP (winners the most).`}>
          <span className="g-lvl-badge">Lv {p.level}</span>
          <StatBar value={p.xp} max={need} color="var(--k-purple)" />
          <span className="g-num">{Math.floor(p.xp)}/{need} XP</span>
        </div>
      )}

      <StatBlock p={p} />

      <div className="g-person-money">
        {founder
          ? <span>💵 Salary: <b>instant ramen</b></span>
          : <span>💵 <b>{usd(p.salary)}</b>/mo</span>}
        {mode === 'candidate' && <span>✍️ Signing bonus <b>{usd(hiringFee(p))}</b></span>}
        {mode === 'team' && !founder && <span>📅 Since {formatDate(p.hiredDay)}</span>}
        {mode === 'candidate' && <span className="k-muted">{role.blurb}</span>}
      </div>

      {training && (
        <div className="g-train-status">
          <span>🎓 At {STAT_INFO[p.trainingStat ?? 'copy'].label} training · back in {left} day{left === 1 ? '' : 's'}</span>
          <StatBar value={TRAINING_DAYS - left} max={TRAINING_DAYS} color="var(--k-blue)" />
        </div>
      )}

      {mode === 'team' && picker && onTrainPick && onTrainGo && onTrainCancel && (
        <TrainPicker s={s} p={p} stat={picker} onPick={onTrainPick} onGo={onTrainGo} onCancel={onTrainCancel} />
      )}

      {mode === 'team' && firing && onFireYes && onFireNo && (
        <ConfirmBar tone="bad" actions={<><Button size="sm" variant="danger" onClick={onFireYes}>Let {firstName(p)} go</Button><Button size="sm" variant="ghost" onClick={onFireNo}>Keep</Button></>}>
          Let {firstName(p)} go? Severance is <b>{usd(severance(p))}</b> (half a month). Saves {usd(p.salary)}/mo.
        </ConfirmBar>
      )}

      <div className="g-person-actions">
        {mode === 'team' && !picker && !firing && (
          <>
            <Button size="sm" variant="secondary" disabled={training} onClick={onTrainOpen}>🎓 Train</Button>
            {!founder && <Button size="sm" variant="ghost" onClick={onFireAsk}>Let go</Button>}
          </>
        )}
        {mode === 'candidate' && hireCheck && (
          <>
            <Button size="sm" variant={hireCheck.ok ? 'primary' : 'secondary'} disabled={!hireCheck.ok} onClick={onHire}>👋 Hire · {usd(hiringFee(p))}</Button>
            {!hireCheck.ok && <span className="g-why">{hireCheck.reason}</span>}
          </>
        )}
      </div>
    </article>
  )
}

export default function StaffDialog({ props, close }: DialogProps) {
  const s = useGameState()
  useCoachOnOpen('staff')
  const [tab, setTab] = useState<Tab>(() => {
    if (props?.tab === 'hire' || props?.tab === 'team') return props.tab
    try { const g = getGS(); return g.staff.length === 0 && freeSlots(g) > 0 ? 'hire' : 'team' } catch { return 'team' }
  })
  const [picker, setPicker] = useState<{ id: string; stat: StatId } | null>(null)
  const [firing, setFiring] = useState<string | null>(null)
  const [pop, setPop] = useFlash<string>(1500)
  if (!s) return null

  const slots = staffSlots(s)
  const free = freeSlots(s)
  const payroll = s.staff.reduce((a, p) => a + p.salary, 0)
  const next = s.office < MAX_OFFICE ? officeDef(s.office + 1) : null
  const lockedSeats = next ? Math.max(0, next.slots - slots) : 0
  const refreshIn = DAYS_PER_MONTH - (s.day % DAYS_PER_MONTH)
  const office = officeDef(s.office)

  const doHire = (id: string) => {
    const r = actResult(d => hire(d, id), { ok: false } as { ok: boolean; reason?: string })
    if (r.ok) {
      setTab('team')
      setPop(id)
      fx({ kind: 'sound', sound: 'levelup' }, { kind: 'confetti', amount: 0.35 })
    } else playSfx('error')
  }
  const doTrain = (id: string, stat: StatId) => {
    const r = actResult(d => train(d, id, stat), { ok: false } as { ok: boolean; reason?: string })
    if (r.ok) { setPicker(null); playSfx('ping') } else playSfx('error')
  }
  const doFire = (id: string) => {
    act(d => fire(d, id))
    setFiring(null)
    playSfx('whoosh')
  }

  const team = [s.founder, ...s.staff]
  const cardFor = (p: Person) => (
    <PersonCard
      key={p.id}
      s={s}
      p={p}
      mode="team"
      picker={picker?.id === p.id ? picker.stat : null}
      firing={firing === p.id}
      pop={pop === p.id}
      onTrainOpen={() => { setFiring(null); setPicker({ id: p.id, stat: (ROLE_INFO[p.role].primary[0] ?? 'speed') }) }}
      onTrainPick={k => setPicker({ id: p.id, stat: k })}
      onTrainGo={() => picker && doTrain(p.id, picker.stat)}
      onTrainCancel={() => setPicker(null)}
      onFireAsk={() => { setPicker(null); setFiring(p.id) }}
      onFireYes={() => doFire(p.id)}
      onFireNo={() => setFiring(null)}
    />
  )

  return (
    <DialogFrame
      title="Staff"
      icon="👥"
      width={1020}
      subtitle={`${office.emoji} ${office.name} · ${s.staff.length}/${slots} desk${slots === 1 ? '' : 's'} filled · payroll ${usd(payroll)}/mo`}
      onClose={close}
      footer={
        <>
          <span className="g-foot-tip">✍️ Copy powers Copy/Offer/Quality/Pricing · 🎨 Creative powers Hooks/Visuals/Influencers · 🔎 Research powers Research/Targeting · ⚡ Speed shortens builds.</span>
          <Button variant="secondary" onClick={close}>Close</Button>
        </>
      }
    >
      <div className="g-wrap">
        <div className="g-desks">
          <div className="g-desks-label">
            Desks {s.staff.length}/{slots}
            <small>{slots === 0 ? 'Just you and the laptop' : free > 0 ? `${free} open desk${free === 1 ? '' : 's'}` : 'Every desk is taken'}</small>
          </div>
          <div className="g-seats">
            <span className="g-seat founder" data-tip="You (founder)"><img src={faceFor(s, s.founder)} alt="" /></span>
            {Array.from({ length: slots }, (_, i) => {
              const p = s.staff[i]
              return p
                ? <span key={p.id} className={clsx('g-seat', isTraining(s, p) && 'train')} data-tip={`${p.name} · ${ROLE_INFO[p.role].label}${isTraining(s, p) ? ' (training)' : ''}`}><img src={portrait(p.portrait)} alt="" /></span>
                : <button key={`e${i}`} type="button" className="g-seat empty" onClick={() => setTab('hire')} data-tip="Open desk: hire someone">+</button>
            })}
            {Array.from({ length: lockedSeats }, (_, i) => (
              <span key={`l${i}`} className="g-seat locked" data-tip={`More desks at the ${next?.name}`}>🔒</span>
            ))}
          </div>
          {next && <Button size="sm" variant="gold" onClick={() => openDialog('office')}>🏠 Need more desks?</Button>}
        </div>

        <div className="g-tabs-bar">
          <Tabs<Tab>
            value={tab}
            onChange={t => { setTab(t); playSfx('tick') }}
            tabs={[
              { id: 'team', label: <span className="g-tab-label">👥 Team <small>{team.length}</small></span> },
              { id: 'hire', label: <span className="g-tab-label">🤝 Hiring <small>{s.candidates.length}</small>{free > 0 && s.candidates.length > 0 && <i className="g-dot">+</i>}</span> },
            ]}
          />
          {tab === 'hire' && <Badge>🔄 Fresh candidates in {refreshIn} day{refreshIn === 1 ? '' : 's'}</Badge>}
        </div>

        {tab === 'team' && (
          <>
            {s.staff.length === 0 && (
              <Note icon="🧢">
                It's just you for now. {slots === 0
                  ? <>Mom's basement has no spare desk. Move to the <b>Shared Apartment</b> to make your first hire.</>
                  : <>You have {free} open desk{free === 1 ? '' : 's'}. Check the <b>Hiring</b> tab.</>}
              </Note>
            )}
            <div className="g-people">{team.map(cardFor)}</div>
          </>
        )}

        {tab === 'hire' && (
          <>
            {free === 0 && (
              <ConfirmBar tone="warn" actions={next ? <Button size="sm" variant="gold" onClick={() => openDialog('office')}>🏠 See offices</Button> : <></>}>
                {s.office === 0
                  ? <>No spare desk in Mom's basement. The <b>Shared Apartment</b> has 1 desk ({usd(officeDef(1).rent)}/mo).</>
                  : next
                    ? <>All {slots} desks are taken. The <b>{next.name}</b> has {next.slots}, or let someone go.</>
                    : <>All {slots} Penthouse desks are taken. Let someone go to make room.</>}
              </ConfirmBar>
            )}
            <Note>Salary is monthly: roughly $20–28 per stat point, and stronger hires cost more per point. You pay a signing bonus of half a month's salary today. Candidates get better as your office and the years grow.</Note>
            <Note icon="👥">
              Launch size caps the team:{' '}
              {SIZE_IDS.map((id, i) => (
                <span key={id}>{i > 0 && ' · '}{SIZES[id].icon} {SIZES[id].name.replace(/ Launch$/, '')} fits you + {SIZES[id].maxTeam - 1}</span>
              ))}
              . Extra hires sit on the bench until you run bigger launches.
            </Note>
            {!hasResearch(s, 'boost_recruiter') && s.office >= 2 && <Note icon="🤝">Research <b>Recruiter network</b> in the Lab for 5 stronger candidates every month.</Note>}
            {s.candidates.length === 0
              ? <Empty icon="📭" title="Nobody's applying right now">New faces show up at the start of next month.</Empty>
              : (
                <div className="g-people">
                  {s.candidates.map(p => (
                    <PersonCard key={p.id} s={s} p={p} mode="candidate" picker={null} firing={false} pop={false} onHire={() => doHire(p.id)} />
                  ))}
                </div>
              )}
          </>
        )}
      </div>
    </DialogFrame>
  )
}
