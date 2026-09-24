import { describe, expect, it } from 'vitest'
import { createNewGame, DIFFICULTY } from '../newGame'
import { canMoveOffice, economyDailyTick, monthlyBurn, monthlyTick, moveOffice, quitDayJob, rejoinDayJob, resolveBankrupt } from '../economy'
import { resolveModal } from '../world'
import { officeMoveCost, officeRent } from '../../data/offices'
import type { Person } from '../../core/types'

const hireling = (id: string, salary: number): Person => ({
  id, name: id, portrait: 'p01', role: 'generalist', stats: { copy: 30, creative: 30, research: 30, speed: 30 },
  level: 1, xp: 0, salary, hiredDay: 0,
})

describe('economy', () => {
  it('starts each difficulty with the DESIGN cash and market bar', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = createNewGame({ company: 'C', founder: 'F', difficulty: d, seed: 2 })
      expect(s.cash).toBe(DIFFICULTY[d].cash)
      expect(s.market.bar).toBe(DIFFICULTY[d].bar)
      expect(s.dayJob).toMatchObject({ employed: true, monthly: 1600 })
      expect(s.unlocked.platforms).toEqual(['fadbook'])
      expect(s.candidates.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('bills rent, salaries and app fees monthly and pays the day job', () => {
    const s = createNewGame({ company: 'C', founder: 'F', difficulty: 'normal', seed: 3 })
    s.office = 2
    s.staff = [hireling('a', 3000), hireling('b', 2500)]
    s.unlocked.features = ['reviews', 'bundles']
    s.activeFeatures = ['reviews', 'bundles']
    const b = monthlyBurn(s)
    expect(b.rent).toBe(officeRent(2))
    expect(b.salaries).toBe(5500)
    expect(b.features).toBeGreaterThan(0)
    expect(b.total).toBe(b.rent + b.salaries + b.features - 1600)
    const cash = s.cash
    s.day = 28
    monthlyTick(s)
    expect(s.cash).toBeCloseTo(cash - b.total, 5)
    expect(s.finance.thisWeek.income).toBe(1600)
  })

  it('quits and rejoins McDoodle\'s', () => {
    const s = createNewGame({ company: 'C', founder: 'F', difficulty: 'normal', seed: 4 })
    quitDayJob(s)
    expect(s.dayJob.employed).toBe(false)
    expect(s.dayJob.quitDay).toBe(0)
    expect(monthlyBurn(s).dayJob).toBe(0)
    expect(rejoinDayJob(s)).toBe(true)
    expect(s.dayJob).toMatchObject({ employed: true, monthly: 1400, timesRejoined: 1 })
    expect(rejoinDayJob(s)).toBe(false)
  })

  it('moves office for the move-in price and validates desks', () => {
    const s = createNewGame({ company: 'C', founder: 'F', difficulty: 'normal', seed: 5 })
    s.cash = 100_000
    expect(moveOffice(s, 3).ok).toBe(true)
    expect(s.cash).toBe(100_000 - officeMoveCost(3))
    expect(s.office).toBe(3)
    s.staff = [hireling('a', 1), hireling('b', 1), hireling('c', 1)]
    expect(canMoveOffice(s, 1).ok).toBe(false) // only 1 desk there
    expect(moveOffice(s, 3).ok).toBe(false) // already here
    s.cash = 10
    expect(moveOffice(s, 4).ok).toBe(false)
  })

  it('goes bankrupt after 21 days below −$3,000 and can move back to Mom\'s', () => {
    const s = createNewGame({ company: 'C', founder: 'F', difficulty: 'normal', seed: 6 })
    s.office = 3
    s.staff = [hireling('a', 4000)]
    s.dayJob.employed = false
    s.cash = -5000
    s.unlocked.research = ['angle_aesthetic']
    s.playbook.combos['ap:pain_point:fadbook'] = 'great'
    for (let i = 0; i < 20; i++) economyDailyTick(s)
    expect(s.modals).toHaveLength(0)
    economyDailyTick(s)
    const m = s.modals.find(x => x.kind === 'bankrupt')!
    expect(m).toBeDefined()
    expect(m.options.map(o => o.id)).toContain('mom')
    resolveModal(s, m.id, 'mom')
    expect(s.modals).toHaveLength(0)
    expect(s.cash).toBe(500)
    expect(s.office).toBe(0)
    expect(s.staff).toHaveLength(0)
    expect(s.dayJob.employed).toBe(true)
    expect(s.gameOver ?? null).toBeNull()
    expect(s.unlocked.research).toContain('angle_aesthetic')
    expect(s.playbook.combos['ap:pain_point:fadbook']).toBe('great')
  })

  it('has no Mom option on hard — bankruptcy ends the game', () => {
    const s = createNewGame({ company: 'C', founder: 'F', difficulty: 'hard', seed: 7 })
    s.cash = -9000
    for (let i = 0; i < 21; i++) economyDailyTick(s)
    const m = s.modals.find(x => x.kind === 'bankrupt')!
    expect(m.options.map(o => o.id)).not.toContain('mom')
    resolveBankrupt(s, 'mom') // ignored on hard
    expect(s.gameOver?.reason).toBe('bankrupt')
    expect(s.modals).toHaveLength(0)
  })

  it('recovers the broke counter once cash is back above the floor', () => {
    const s = createNewGame({ company: 'C', founder: 'F', difficulty: 'normal', seed: 8 })
    s.cash = -4000
    for (let i = 0; i < 10; i++) economyDailyTick(s)
    expect(s.brokeDays).toBe(10)
    s.cash = 100
    economyDailyTick(s)
    expect(s.brokeDays).toBe(0)
  })
})
