import { describe, expect, it } from 'vitest'
import { createNewGame } from '../newGame'
import {
  activeTeam, canHire, fire, grantXp, hire, hiringFee, refreshCandidates, salaryFor, staffDailyTick, staffSlots, train, trainingCost, xpToNext,
} from '../staff'
import { COACH_PORTRAIT } from '../../core/assets'

const fresh = () => createNewGame({ company: 'Test Co', founder: 'Tess', difficulty: 'normal', seed: 99 })

describe('candidates', () => {
  it('generates 3–5 sane candidates, never with Coach Kev\'s portrait', () => {
    const s = fresh()
    for (let i = 0; i < 40; i++) {
      s.office = i % 6
      refreshCandidates(s)
      expect(s.candidates.length).toBeGreaterThanOrEqual(3)
      expect(s.candidates.length).toBeLessThanOrEqual(5)
      const portraits = new Set<string>()
      for (const c of s.candidates) {
        expect(c.portrait).not.toBe(COACH_PORTRAIT)
        expect(portraits.has(c.portrait)).toBe(false)
        portraits.add(c.portrait)
        for (const v of Object.values(c.stats)) { expect(v).toBeGreaterThanOrEqual(10); expect(v).toBeLessThanOrEqual(90) }
        expect(c.salary).toBe(salaryFor(c.stats))
        expect(c.name).toMatch(/^\S+ \S+$/)
      }
    }
  })

  it('better offices attract stronger candidates', () => {
    const avg = (office: number) => {
      const s = fresh()
      s.office = office
      let sum = 0; let n = 0
      for (let i = 0; i < 30; i++) { refreshCandidates(s); for (const c of s.candidates) { sum += c.stats.copy + c.stats.creative + c.stats.research + c.stats.speed; n++ } }
      return sum / n
    }
    expect(avg(5)).toBeGreaterThan(avg(1) + 40)
  })
})

describe('hiring respects slots', () => {
  it('no desks in the basement; one desk in the shared apartment', () => {
    const s = fresh()
    s.cash = 100_000
    expect(staffSlots(s)).toBe(0)
    const c0 = s.candidates[0]
    expect(hire(s, c0.id).ok).toBe(false)
    expect(s.staff).toHaveLength(0)

    s.office = 1
    expect(staffSlots(s)).toBe(1)
    const cashBefore = s.cash
    const fee = hiringFee(c0)
    expect(hire(s, c0.id)).toEqual({ ok: true })
    expect(s.staff).toHaveLength(1)
    expect(s.cash).toBe(cashBefore - fee)
    expect(s.candidates.find(c => c.id === c0.id)).toBeUndefined()

    const c1 = s.candidates[0]
    const second = hire(s, c1.id)
    expect(second.ok).toBe(false)
    expect(second.reason).toMatch(/desk/i)
    expect(s.staff).toHaveLength(1)

    s.office = 4
    expect(canHire(s, c1.id).ok).toBe(true)
    fire(s, s.staff[0].id)
    expect(s.staff).toHaveLength(0)
  })

  it('refuses when the signing bonus is unaffordable', () => {
    const s = fresh()
    s.office = 1
    s.cash = 10
    expect(hire(s, s.candidates[0].id).reason).toMatch(/cash/)
  })
})

describe('training & XP', () => {
  it('training benches a person for 14 days then raises the stat', () => {
    const s = fresh()
    s.office = 1
    s.cash = 100_000
    hire(s, s.candidates[0].id)
    const p = s.staff[0]
    const cost = trainingCost(s, p.id)
    expect(cost).toBe(1500 * p.level)
    const before = p.stats.copy
    expect(train(s, p.id, 'copy').ok).toBe(true)
    expect(activeTeam(s).map(x => x.id)).not.toContain(p.id)
    expect(train(s, p.id, 'creative').ok).toBe(false)
    for (let i = 0; i < 14; i++) { s.day++; staffDailyTick(s) }
    expect(p.trainingUntil).toBeUndefined()
    expect(p.stats.copy).toBeGreaterThanOrEqual(Math.min(100, before + 6))
    expect(activeTeam(s).map(x => x.id)).toContain(p.id)
  })

  it('XP levels people up and improves stats', () => {
    const s = fresh()
    const f = s.founder
    const sum0 = f.stats.copy + f.stats.creative + f.stats.research + f.stats.speed
    grantXp(s, f.id, xpToNext(1) + 5)
    expect(f.level).toBe(2)
    expect(f.xp).toBe(5)
    expect(f.stats.copy + f.stats.creative + f.stats.research + f.stats.speed).toBeGreaterThan(sum0)
  })
})
