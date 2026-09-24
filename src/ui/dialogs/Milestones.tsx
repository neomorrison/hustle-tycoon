// Milestones: achieved / locked grid with icons, dates and progress toward the numeric ones. OWNER: ui-management.
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { DialogProps } from './types'
import type { GameState } from '../../core/types'
import { Button, DialogFrame, StatBar } from '../kit'
import { compact } from '../../core/format'
import { formatDate, yearOf } from '../../core/time'
import { milestoneDefs } from '../../sim/world'
import { playSfx } from '../audio'
import { useCoachOnOpen, useGameState, usdShort } from '../manage/common'

type Filter = 'all' | 'got' | 'locked'

function streak(s: GameState): number {
  let n = 0
  for (let i = s.history.length - 1; i >= 0 && s.history[i].verdict === 'winner'; i--) n++
  return n
}

/** Progress toward numeric milestones: [current, goal, formatter]. */
function progressFor(s: GameState, id: string): { cur: number; goal: number; fmt: (n: number) => string } | null {
  const n = (x: number) => compact(Math.max(0, Math.floor(x)))
  switch (id) {
    case 'profit_10k': return { cur: s.stats.lifetimeProfit, goal: 10_000, fmt: usdShort }
    case 'launches_10': return { cur: s.stats.launches, goal: 10, fmt: n }
    case 'hat_trick': return { cur: streak(s), goal: 3, fmt: n }
    case 'fans_10k': return { cur: s.fans, goal: 10_000, fmt: n }
    case 'week_100k': return { cur: s.stats.peakWeekRevenue, goal: 100_000, fmt: usdShort }
    case 'near_perfect': return { cur: s.stats.bestScore, goal: 9.5, fmt: x => x.toFixed(1) }
    case 'all_angles': return { cur: s.unlocked.angles.length, goal: 9, fmt: n }
    case 'all_platforms': return { cur: s.unlocked.platforms.length, goal: 6, fmt: n }
    case 'brand_75': return { cur: s.brand, goal: 75, fmt: n }
    case 'full_house': return { cur: s.staff.length, goal: 7, fmt: n }
    case 'revenue_1m': return { cur: s.stats.lifetimeRevenue, goal: 1_000_000, fmt: usdShort }
    case 'penthouse': return { cur: s.office, goal: 5, fmt: x => `Tier ${n(x)}` }
    case 'millionaire': return { cur: s.cash, goal: 1_000_000, fmt: usdShort }
    case 'ten_years': return { cur: yearOf(s.day) - 1, goal: 10, fmt: x => `${n(x)} yr` }
    default: return null
  }
}

export default function MilestonesDialog({ close }: DialogProps) {
  const s = useGameState()
  useCoachOnOpen('milestones')
  const [filter, setFilter] = useState<Filter>('all')
  const defs = milestoneDefs()
  const got = useMemo(() => (s ? defs.filter(d => s.milestones[d.id] !== undefined) : []), [s, defs])
  if (!s) return null

  const total = defs.length
  const latestDay = got.reduce((a, d) => Math.max(a, s.milestones[d.id]), -1)
  const list = defs
    .filter(d => filter === 'all' || (filter === 'got') === (s.milestones[d.id] !== undefined))
    .slice()
    .sort((a, b) => {
      const da = s.milestones[a.id], db = s.milestones[b.id]
      if ((da !== undefined) !== (db !== undefined)) return da !== undefined ? -1 : 1
      if (da !== undefined && db !== undefined) return db - da
      return 0
    })

  return (
    <DialogFrame
      title="Milestones"
      icon="🏆"
      width={980}
      subtitle="Bragging rights for the hustle. Some are sneaky: try a little bit of everything."
      onClose={close}
      footer={
        <>
          <span className="g-foot-tip">{got.length === total ? '🎉 Every milestone unlocked. Absolute legend.' : `${total - got.length} to go. There's no finish line: it's a sandbox, so play your way.`}</span>
          <Button variant="secondary" onClick={close}>Close</Button>
        </>
      }
    >
      <div className="g-wrap">
        <div className="g-ms-top">
          <div className="g-ms-count">{got.length}<small> / {total}</small></div>
          <div className="g-ms-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={got.length}><i style={{ width: `${(got.length / total) * 100}%` }} /></div>
          <div className="g-hist-filters">
            {([['all', 'All'], ['got', '🏆 Unlocked'], ['locked', '🔒 Locked']] as [Filter, string][]).map(([id, label]) => (
              <button key={id} type="button" className={clsx('g-chip', filter === id && 'on')} onClick={() => { setFilter(id); playSfx('tick') }}>{label}</button>
            ))}
          </div>
        </div>
        <div className="g-ms-grid">
          {list.map(d => {
            const day = s.milestones[d.id]
            const done = day !== undefined
            const prog = done ? null : progressFor(s, d.id)
            const isNew = done && day === latestDay && s.day - day <= 28
            return (
              <article key={d.id} className={clsx('g-card g-ms', done ? 'got' : 'locked')} aria-label={`${d.title}${done ? ', unlocked' : ', locked'}`}>
                {isNew && <span className="g-ms-new">NEW</span>}
                <div className="g-ms-ic" aria-hidden="true"><span>{d.icon}</span></div>
                <div className="g-ms-title">{d.title}</div>
                <div className="g-ms-desc">{d.description}</div>
                {done && <div className="g-ms-date">🗓️ {formatDate(day)}</div>}
                {prog && (
                  <div className="g-ms-prog">
                    <StatBar value={Math.max(0, prog.cur)} max={prog.goal} color="var(--k-gold)" />
                    <span>{prog.fmt(Math.max(0, Math.min(prog.cur, prog.goal)))} / {prog.fmt(prog.goal)}</span>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </DialogFrame>
  )
}
