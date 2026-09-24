// Balance-tuning regressions: market bar dynamics, viral/boost accounting, launch buzz, feed pacing, office gates.
import { describe, expect, it } from 'vitest'
import type { GameState, Launch } from '../../core/types'
import { createNewGame } from '../newGame'
import { tickDay } from '../index'
import { DEV, barFloor, nextMarketBar } from '../launch'
import { SALES, applyRevenueBoost, launchBuzz, weeklyProjection } from '../sales'
import { grantXp, staffDailyTick, salaryFor } from '../staff'
import { OFFICES } from '../../data/offices'
import { SIZES } from '../../data/sizes'

const fresh = (seed = 3) => createNewGame({ company: 'Balance Co', founder: 'Bea', difficulty: 'normal', seed })
/** Points whose per-size total is `k` × the current bar. */
const pts = (s: GameState, k: number, size: keyof typeof SIZES = 'test') => {
  const E = s.market.bar * SIZES[size].mult * k
  return { conv: 0.42 * E, traffic: 0.42 * E, aov: 0.16 * E }
}

function liveWinner(s: GameState): Launch {
  const l: Launch = {
    id: 'L_bal', name: 'Balance Roller', productId: 'pet-hair-roller', niche: 'pet', angle: 'wholesome', platform: 'fadbook',
    size: 'test', priceTier: 'standard', features: [], status: 'live', startDay: 0, stage: 2, stageProgress: 1, devDays: 30, daysElapsed: 30,
    sliders: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], points: { conv: 30, traffic: 30, aov: 10, research: 5, bugs: 1 }, areaPoints: {}, qcDays: 0,
    awaitingSliders: false, launchDay: 0,
    review: {
      ctr: 0.03, cvr: 0.04, aov: 30, cpm: 12, cpa: 10, roas: 3, breakEvenRoas: 1.5, marginPerOrder: 20, price: 27.99,
      scores: { ctr: 9, cvr: 9, aov: 5, roas: 10 }, overall: 8, verdict: 'solid', quotes: { ctr: '', cvr: '', aov: '', roas: '' },
      factors: { productAngle: 'great', anglePlatform: 'great', nichePlatform: 'great', focusAccuracy: [1, 1, 1], trendBonus: 1, bugPenalty: 0, convRatio: 1, trafficRatio: 1 },
    },
    sales: {
      weeks: [0, 1, 2, 3, 4, 5].map(w => ({ week: w, day: w * 7, spend: 700, revenue: 2000, units: 70, cogs: 600, fees: 80, profit: 620, roas: 2.9, fatigue: 0 })),
      budgetMult: 1, fatigue: 0, creativeGen: 1, startDay: 0, totalRevenue: 12000, totalProfit: 3700, totalSpend: 4200, units: 420,
      peakRevenue: 2000, priceMult: 1, marginBoost: 0, flags: { season0: 1, trend0: 1, cpm0: 1 },
    },
  }
  s.live.push(l)
  return l
}

describe('market bar', () => {
  it('jumps toward a bigger team\'s output, hypes on big reviews, and never eases off after a great review', () => {
    const s = fresh()
    const bar = s.market.bar
    // an upgrade (2× the points) with a 9.5 review: closes barK of the gap, plus hype
    const up = nextMarketBar(s, 'test', pts(s, 2), 9.5)
    expect(up).toBeGreaterThan(bar * (1 + DEV.barK) * 0.99)
    // a 9.3 on fewer points: the market does not lower expectations
    s.market.bar = 100
    expect(nextMarketBar(s, 'standard', pts(s, 0.8, 'standard'), 9.3)).toBeGreaterThanOrEqual(100)
  })

  it('relaxes toward a shrunken team when reviews suffer, but never below the difficulty floor', () => {
    const s = fresh()
    s.market.bar = 200
    const down = nextMarketBar(s, 'test', pts(s, 0.4), 5)
    expect(down).toBeLessThan(200 * (1 - DEV.barKDown * 0.5))
    s.market.bar = barFloor(s) * 1.05
    expect(nextMarketBar(s, 'test', pts(s, 0.1), 2)).toBeGreaterThanOrEqual(barFloor(s))
  })
})

describe('sales accounting', () => {
  it('a viral week pays ×3 once (not ×9) and does not end the run early', () => {
    const s = fresh()
    const l = liveWinner(s)
    const base = weeklyProjection(s, l).revenue
    applyRevenueBoost(s, l.id, 3, 1)
    l.sales!.flags.viral = 1 // world's informational flag (viralBoost() for the UI) must not stack on top
    const boosted = weeklyProjection(s, l)
    expect(boosted.revenue / base).toBeCloseTo(3, 5)
    expect(boosted.boost).toBeCloseTo(3, 5)
    // run a few sales weeks: the boosted peak must not make normal weeks count as "faded"
    for (let d = 0; d < 7 * 4; d++) tickDay(s)
    expect(s.live.some(x => x.id === l.id)).toBe(true)
    expect(Number(l.sales!.flags.lowWeeks ?? 0)).toBe(0)
  })

  it('launch buzz rewards great reviews in the first weeks only', () => {
    expect(launchBuzz(7.9, 1)).toBe(0)
    expect(launchBuzz(9, 1)).toBeGreaterThan(0.2)
    expect(launchBuzz(10, 1)).toBeLessThanOrEqual(SALES.buzzMax)
    expect(launchBuzz(9, 1)).toBeGreaterThan(launchBuzz(9, 3))
    expect(launchBuzz(9, SALES.buzzCurve.length)).toBe(0)
  })
})

describe('pacing & progression data', () => {
  it('one launch\'s level-ups land as a single toast', () => {
    const s = fresh()
    s.office = 2
    s.staff = s.candidates.slice(0, 2).map(p => ({ ...p, level: 1, xp: 0 }))
    const l = liveWinner(s)
    l.review!.verdict = 'winner'
    for (const p of [s.founder, ...s.staff]) p.xp = 90 // one winner's XP pushes everyone over the line
    const before = s.toasts.length
    staffDailyTick(s)
    const ups = s.toasts.slice(before).filter(t => t.text.startsWith('⬆️'))
    expect(ups).toHaveLength(1)
    expect(ups[0].text).toMatch(/leveled up the team/)
    grantXp(s, s.founder.id, 1) // plain grants still work outside a batch
  })

  it('offices get pricier to move into, and juniors cost less than stars', () => {
    for (let t = 1; t < OFFICES.length; t++) expect(OFFICES[t].moveCost).toBeGreaterThan(OFFICES[t - 1].moveCost)
    expect(OFFICES[5].moveCost).toBeGreaterThanOrEqual(OFFICES[1].moveCost * 100)
    const junior = salaryFor({ copy: 30, creative: 30, research: 30, speed: 30 })
    const star = salaryFor({ copy: 80, creative: 80, research: 80, speed: 80 })
    expect(junior).toBeLessThan(25 * 120)
    expect(star).toBeGreaterThan(25 * 320)
    expect(SIZES.standard.minOffice).toBe(2) // Standard needs the Studio's 3-person team
  })
})
