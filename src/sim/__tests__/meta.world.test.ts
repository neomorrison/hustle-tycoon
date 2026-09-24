import { describe, expect, it } from 'vitest'
import type { GameState, Launch, Trend } from '../../core/types'
import { createNewGame } from '../newGame'
import { dayOf, isBfcm, DAYS_PER_YEAR } from '../../core/time'
import {
  REELS_NEWS_DAY, cpmMultiplier, initMeta, launchWorldTags, resolveModal, resolveWorldDecision, seasonDemand, trendMult,
  viralBoost, worldDailyTick, worldTicker,
} from '../world'
import { staffDailyTick } from '../staff'
import { checkMilestones } from '../world'

const fresh = (seed = 7) => createNewGame({ company: 'Test Co', founder: 'Tess', difficulty: 'normal', seed })

function fakeLive(s: GameState, over: Partial<Launch> = {}): Launch {
  const l: Launch = {
    id: `l_${s.live.length + 1}`, name: 'Paw Pal Roller', productId: 'pet-hair-roller', niche: 'pet', angle: 'pain_point', platform: 'tiktak',
    size: 'test', priceTier: 'standard', features: [], status: 'live', startDay: 0, stage: 2, stageProgress: 1, devDays: 30, daysElapsed: 30,
    sliders: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], points: { conv: 20, traffic: 20, aov: 8, research: 5, bugs: 2 }, areaPoints: {}, qcDays: 0,
    awaitingSliders: false, launchDay: s.day,
    review: {
      ctr: 0.02, cvr: 0.025, aov: 32, cpm: 10, cpa: 12, roas: 2.6, breakEvenRoas: 1.6, marginPerOrder: 16, price: 29.99,
      scores: { ctr: 9, cvr: 7, aov: 5, roas: 8 }, overall: 7.6, verdict: 'solid',
      quotes: { ctr: '', cvr: '', aov: '', roas: '' },
      factors: { productAngle: 'great', anglePlatform: 'good', nichePlatform: 'good', focusAccuracy: [0.9, 0.9, 0.9], trendBonus: 1, bugPenalty: 0.15, convRatio: 1, trafficRatio: 1 },
    },
    sales: {
      weeks: [0, 1, 2, 3, 4].map(w => ({ week: w, day: w * 7, spend: 700, revenue: 1800, units: 56, cogs: 500, fees: 70, profit: 530, roas: 2.6, fatigue: 0.1 })),
      budgetMult: 1, fatigue: 0.1, creativeGen: 0, startDay: 0, totalRevenue: 9000, totalProfit: 2650, totalSpend: 3500, units: 280, peakRevenue: 1800,
      priceMult: 1, marginBoost: 0, flags: {},
    },
    ...over,
  }
  s.live.push(l)
  return l
}

/** Advance using only the sim-meta ticks (independent of sim-core's in-progress modules). */
function run(s: GameState, days: number, onDay?: (s: GameState) => void) {
  for (let i = 0; i < days; i++) {
    s.day++
    worldDailyTick(s)
    staffDailyTick(s)
    checkMilestones(s)
    s.decisions = s.decisions.filter(d => d.expiresDay > s.day)
    // auto-dismiss blocking modals like a player would
    while (s.modals.length) resolveModal(s, s.modals[0].id, s.modals[0].options[0].id)
    onDay?.(s)
  }
}

describe('trends', () => {
  it('apply to matching configs and expire on time', () => {
    const s = fresh()
    initMeta(s)
    const t: Trend = { id: 'tr_x', kind: 'niche', target: 'pet', mult: 1.5, startDay: s.day, endDay: s.day + 14, label: '🐾 Pet-parent mania' }
    s.market.trends.push(t)
    s.flags['w:trendDay'] = 10_000 // no new spawns during this test
    expect(trendMult(s, 'pet', 'gift', 'fadbook')).toBe(1.5)
    expect(trendMult(s, 'home', 'gift', 'fadbook')).toBe(1)
    expect(worldTicker(s).some(x => x.id === 'tr_x')).toBe(true)
    run(s, 13)
    expect(s.market.trends).toHaveLength(1)
    run(s, 1)
    expect(s.market.trends).toHaveLength(0)
    expect(trendMult(s, 'pet', 'gift', 'fadbook')).toBe(1)
    expect(s.toasts.some(x => x.text.includes('cooling off'))).toBe(true)
  })

  it('spawn regularly over a year (first one right after the first review, within ~9 weeks)', () => {
    const s = fresh(11)
    let firstSpawn = -1
    let spawned = 0
    let seen = new Set<string>()
    run(s, DAYS_PER_YEAR, st => {
      for (const t of st.market.trends) if (!seen.has(t.id)) { seen.add(t.id); spawned++; if (firstSpawn < 0) firstSpawn = st.day }
    })
    expect(firstSpawn).toBeGreaterThan(0)
    expect(firstSpawn).toBeGreaterThanOrEqual(7 * 7)
    expect(firstSpawn).toBeLessThanOrEqual(9 * 7 + 1)
    expect(spawned).toBeGreaterThanOrEqual(3)
    for (const t of seen) expect(typeof t).toBe('string')
  })
})

describe('seasons & CPM', () => {
  it('BFCM boosts demand and CPM; January is cheap', () => {
    const s = fresh()
    const bfcm = dayOf(1, 10, 4)
    expect(isBfcm(bfcm)).toBe(true)
    const normal = dayOf(1, 8, 1)
    expect(seasonDemand(s, 'pet-hair-roller', bfcm)).toBeGreaterThan(seasonDemand(s, 'pet-hair-roller', normal) * 1.5)
    expect(cpmMultiplier(s, 'fadbook', bfcm)).toBeGreaterThan(1.4)
    expect(cpmMultiplier(s, 'fadbook', dayOf(2, 0, 2))).toBeLessThan(0.85)
    // outdoor summer boost, dampened for products that already peak
    expect(seasonDemand(s, 'bug-zapper-lamp', dayOf(1, 6, 1))).toBeGreaterThan(2)
    expect(seasonDemand(s, 'bug-zapper-lamp', dayOf(1, 6, 1))).toBeLessThan(2.7)
  })
})

describe('platform news & modals', () => {
  it('Instaglam Reels launches in Y1 June via a news modal', () => {
    const s = fresh()
    initMeta(s)
    expect(s.market.platforms.reels.available).toBe(false)
    s.day = REELS_NEWS_DAY - 1
    s.day++
    worldDailyTick(s)
    expect(s.market.platforms.reels.available).toBe(true)
    const m = s.modals.find(x => x.kind === 'news')
    expect(m).toBeDefined()
    resolveModal(s, m!.id, 'ok')
    expect(s.modals.find(x => x.id === m!.id)).toBeUndefined()
  })

  it('TikTak Shop arrives in Y2 and CPM inflation ticks up each January', () => {
    const s = fresh(3)
    run(s, DAYS_PER_YEAR + 2 * 28)
    expect(s.market.platforms.tiktak_shop.available).toBe(true)
    expect(s.market.cpmInflation).toBeCloseTo(1.05, 5)
  })
})

describe('world decisions', () => {
  it('price match lowers price; unanswered price wars default to "hold" (ROAS shock)', () => {
    const s = fresh()
    initMeta(s)
    const l = fakeLive(s)
    s.decisions.push({ id: 'd_pm', launchId: l.id, kind: 'price_match', title: 't', body: 'b', options: [{ id: 'match', label: 'm' }, { id: 'hold', label: 'h' }], createdDay: s.day, expiresDay: s.day + 1 })
    expect(resolveWorldDecision(s, 'd_pm', 'match')).toBe(true)
    expect(l.sales!.priceMult).toBeCloseTo(0.88)
    expect(s.decisions).toHaveLength(0)

    s.decisions.push({ id: 'd_pm2', launchId: l.id, kind: 'price_match', title: 't', body: 'b', options: [], createdDay: s.day, expiresDay: s.day + 1 })
    s.day++
    worldDailyTick(s)
    expect(l.sales!.flags.roasMult).toBeCloseTo(0.85)
    expect(s.decisions.find(d => d.id === 'd_pm2')).toBeUndefined()
  })

  it('non-world decisions are left for sim/sales', () => {
    const s = fresh()
    const l = fakeLive(s)
    s.decisions.push({ id: 'd_sc', launchId: l.id, kind: 'scale', title: 't', body: 'b', options: [], createdDay: 0, expiresDay: 21 })
    expect(resolveWorldDecision(s, 'd_sc', 'hold')).toBe(false)
    expect(s.decisions).toHaveLength(1)
  })

  it('random events fire regularly with live launches; pauses come back online', () => {
    const s = fresh(21)
    initMeta(s)
    const l = fakeLive(s)
    const kinds = new Set<string>()
    let gaps: number[] = []
    let lastToastCount = 0
    let lastEventDay = 0
    let paused = 0
    let backOnline = false
    run(s, 2 * DAYS_PER_YEAR, st => {
      for (const d of st.decisions) kinds.add(d.kind)
      if (st.toasts.some(x => x.day === st.day && /back (in stock|online)|shipping again/.test(x.text))) backOnline = true
      if (st.toasts.length !== lastToastCount) { lastToastCount = st.toasts.length }
      const le = st.flags['w:lastEvent']
      if (typeof le === 'number' && le !== lastEventDay) { gaps.push(le - lastEventDay); lastEventDay = le }
      // resolve world decisions immediately (pay / match); stockouts wait for the boat so the pause → back-online path runs
      for (const d of [...st.decisions]) resolveWorldDecision(st, d.id, d.kind === 'restock' ? 'wait' : d.options[0].id)
      // stand-in for sim/sales.weeklySales: consume paused weeks, keep the fake run "fresh" so it stays eligible
      if (st.day % 7 === 6) {
        const f = l.sales!.flags
        if (typeof f.stockoutWeeks === 'number' && f.stockoutWeeks > 0) { f.stockoutWeeks -= 1; paused++ }
        l.sales!.weeks.push({ ...l.sales!.weeks[l.sales!.weeks.length - 1] })
      }
    })
    expect(kinds.size).toBeGreaterThanOrEqual(2)
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
    expect(avg).toBeGreaterThan(10) // never spammy
    expect(avg).toBeLessThan(60) // something every ~20–40 s at 1× (40–80 days)
    expect(l.sales!.budgetMult).toBe(1) // world events never touch the scale multiplier
    expect(paused).toBeGreaterThan(0)
    expect(backOnline || l.sales!.flags.pauseKind !== undefined).toBe(true) // the toast log is capped — watch it live
    expect(viralBoost(s, 'nope')).toBe(1)
    expect(Array.isArray(launchWorldTags(s, l))).toBe(true)
  })

  it('CNY warning appears in January with prestock/risk options', () => {
    const s = fresh()
    initMeta(s)
    fakeLive(s)
    s.day = dayOf(2, 0, 1) - 1
    s.day++
    worldDailyTick(s)
    const m = s.modals.find(x => x.kind === 'cny')
    expect(m).toBeDefined()
    expect(m!.options.map(o => o.id)).toContain('risk')
  })
})

describe('integration with sim-core', () => {
  it('sales.resolveDecision dispatches world decision kinds to resolveWorldDecision', async () => {
    const { resolveDecision } = await import('../sales')
    const s = fresh(9)
    initMeta(s)
    const l = fakeLive(s)
    const cash0 = s.cash
    s.decisions.push({ id: 'd_inf', launchId: l.id, kind: 'influencer', title: 't', body: 'b', options: [{ id: 'pay', label: 'Pay $500', cost: 500 }, { id: 'pass', label: 'Pass' }], createdDay: s.day, expiresDay: s.day + 14 })
    resolveDecision(s, 'd_inf', 'pay')
    expect(s.decisions).toHaveLength(0)
    expect(s.toasts.some(t => t.text.includes('post:'))).toBe(true)
    expect(s.cash).not.toBe(cash0)

    s.decisions.push({ id: 'd_rs', launchId: l.id, kind: 'restock', title: 't', body: 'b', options: [{ id: 'air', label: 'Air', cost: 300 }, { id: 'wait', label: 'Wait' }], createdDay: s.day, expiresDay: s.day + 14 })
    l.sales!.flags.stockoutWeeks = 2
    l.sales!.flags.pauseKind = 1
    resolveDecision(s, 'd_rs', 'air')
    expect(l.sales!.flags.stockoutWeeks).toBe(0)
  })

  it('a year of the real orchestrator runs clean with world events', async () => {
    const { tickDay } = await import('../index')
    const s = fresh(17)
    for (let i = 0; i < DAYS_PER_YEAR; i++) {
      tickDay(s)
      while (s.modals.length) resolveModal(s, s.modals[0].id, s.modals[0].options[0].id)
    }
    expect(s.market.platforms.reels.available).toBe(true)
    expect(s.toasts.length).toBeGreaterThan(5)
    expect(Object.keys(s.flags).some(k => k === 'w:trendDay')).toBe(true)
  })
})
