import { describe, expect, it } from 'vitest'
import type { AngleId, GameState, Launch, PlatformId, PriceTier, SizeId } from '../../core/types'
import { createNewGame } from '../newGame'
import {
  comboRatings, evaluate, expectedPoints, focusAccuracy, idealFocus, scoreAov, scoreCtr, scoreCvr, scoreRoas, softRoasRatio, TUNING, verdictFor,
} from '../evaluate'
import { productById } from '../../data/catalog'
import { ANGLE_PLATFORM, COMBO_MULT, IDEAL_FOCUS, NICHE_PLATFORM, productAngleRating, productPlatformRating } from '../../data/combos'
import { QUOTES } from '../../data/quotes'
import { PRODUCTS } from '../../data/catalog'

function fakeLaunch(s: GameState, o: {
  productId: string; angle: AngleId; platform: PlatformId; size?: SizeId; tier?: PriceTier
  rho: number; sliders: [number, number, number][]; bugsShare?: number
}): Launch {
  const p = productById(o.productId)
  const size = o.size ?? 'test'
  const e = expectedPoints(s, size)
  return {
    id: 'L_t', name: 'Test', productId: p.id, niche: p.niche, angle: o.angle, platform: o.platform, size,
    priceTier: o.tier ?? 'standard', features: [], status: 'qc', startDay: 0, stage: 2, stageProgress: 1,
    devDays: 40, daysElapsed: 40, sliders: o.sliders,
    points: { conv: e.conv * o.rho, traffic: e.traffic * o.rho, aov: e.aov * o.rho, research: 10, bugs: e.bugs * (o.bugsShare ?? 0.3) },
    areaPoints: {}, qcDays: 0, awaitingSliders: false,
  }
}

describe('evaluate()', () => {
  it('scores a great combo with ideal sliders as a winner-ish launch', () => {
    const s = createNewGame({ company: 'T', founder: 'T', difficulty: 'normal', seed: 42 })
    // Pet hair roller: pet_love → Wholesome is its natural angle; Wholesome × Fadbook is great; Fadbook fit .85 = great
    const r = comboRatings(s, 'pet-hair-roller', 'wholesome', 'fadbook')
    expect(r).toEqual({ productAngle: 'great', anglePlatform: 'great', nichePlatform: 'great' })
    const scores: number[] = []
    for (let i = 0; i < 10; i++) {
      const l = fakeLaunch(s, { productId: 'pet-hair-roller', angle: 'wholesome', platform: 'fadbook', rho: 1.2, sliders: idealFocus('wholesome', 'fadbook') as [number, number, number][] })
      const rv = evaluate(s, l)
      scores.push(rv.overall)
      expect(rv.factors.focusAccuracy.every(a => a > 0.99)).toBe(true)
      expect(rv.roas).toBeGreaterThan(rv.breakEvenRoas * 1.5)
      expect(rv.quotes.roas).toMatch(/ROAS/)
    }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    expect(avg).toBeGreaterThanOrEqual(8.3)
    expect(scores.filter(x => verdictFor(x) === 'winner').length).toBeGreaterThanOrEqual(5)
  })

  it('flops a bad combo with terrible sliders', () => {
    const s = createNewGame({ company: 'T', founder: 'T', difficulty: 'normal', seed: 7 })
    // $9 lick mat pitched as Luxury on TikTak: bad × bad
    const r = comboRatings(s, 'dog-lick-mat', 'luxury', 'tiktak')
    expect(r.productAngle).toBe('bad')
    expect(r.anglePlatform).toBe('bad')
    for (let i = 0; i < 10; i++) {
      const l = fakeLaunch(s, { productId: 'dog-lick-mat', angle: 'luxury', platform: 'tiktak', rho: 0.6, bugsShare: 1.5, sliders: [[1, 0, 0], [1, 0, 0], [0, 1, 0]] })
      const rv = evaluate(s, l)
      expect(rv.verdict).toBe('flop')
      expect(rv.overall).toBeLessThan(4)
      expect(rv.roas).toBeLessThan(rv.breakEvenRoas)
    }
  })

  it('rewards focus accuracy, points and combos monotonically', () => {
    const s = createNewGame({ company: 'T', founder: 'T', difficulty: 'normal', seed: 3 })
    const base = { productId: 'spin-scrubber', angle: 'pain_point' as AngleId, platform: 'fadbook' as PlatformId }
    const avgOverall = (o: Partial<Parameters<typeof fakeLaunch>[1]>) => {
      let t = 0
      for (let i = 0; i < 12; i++) t += evaluate(s, fakeLaunch(s, { ...base, rho: 1, sliders: idealFocus('pain_point', 'fadbook') as [number, number, number][], ...o })).overall
      return t / 12
    }
    const ideal = avgOverall({})
    const even = avgOverall({ sliders: [[1, 1, 1], [1, 1, 1], [1, 1, 1]] })
    const low = avgOverall({ rho: 0.6 })
    const high = avgOverall({ rho: 1.6 })
    expect(ideal).toBeGreaterThan(even)
    expect(high).toBeGreaterThan(ideal)
    expect(ideal).toBeGreaterThan(low)
  })

  it('keeps ROAS inside the auction-pressure ceiling and scores inside 1..10', () => {
    expect(softRoasRatio(1.5)).toBe(1.5)
    expect(softRoasRatio(TUNING.roasKnee)).toBe(TUNING.roasKnee)
    expect(softRoasRatio(10)).toBeLessThan(TUNING.roasCap)
    expect(softRoasRatio(10)).toBeGreaterThan(softRoasRatio(3))
    for (const x of [0, 0.004, 0.012, 0.03, 0.2]) {
      expect(scoreCtr(x)).toBeGreaterThanOrEqual(1)
      expect(scoreCtr(x)).toBeLessThanOrEqual(10)
      expect(scoreCvr(x)).toBeGreaterThanOrEqual(1)
    }
    expect(scoreCtr(0.012)).toBeCloseTo(5.5, 5)
    expect(scoreCvr(0.025)).toBeCloseTo(7, 5)
    expect(scoreAov(30)).toBeCloseTo(5, 5)
    expect(scoreAov(30, true)).toBeCloseTo(6, 5)
    expect(scoreRoas(1)).toBeCloseTo(5, 5)
    expect(scoreRoas(3)).toBe(10)
  })
})

describe('combo & focus tables', () => {
  it('ideal focus rows are normalized, with platform shifts applied', () => {
    for (const rows of Object.values(IDEAL_FOCUS)) for (const r of rows) expect(r[0] + r[1] + r[2]).toBeCloseTo(1, 5)
    const tik = idealFocus('aesthetic', 'tiktak')
    expect(tik[2][0]).toBeGreaterThan(IDEAL_FOCUS.aesthetic[2][0]) // hooks up on TikTak
    const poo = idealFocus('pain_point', 'poogle')
    expect(poo[2][1]).toBeGreaterThan(IDEAL_FOCUS.pain_point[2][1]) // targeting up on Poogle
    for (const f of [tik, poo]) for (const r of f) expect(r[0] + r[1] + r[2]).toBeCloseTo(1, 5)
    expect(focusAccuracy([1, 1, 1], [1 / 3, 1 / 3, 1 / 3])).toBeCloseTo(1, 5)
    expect(focusAccuracy([1, 0, 0], [0, 0, 1])).toBeCloseTo(0, 5)
  })

  it('angle × platform matches the DESIGN examples', () => {
    expect(ANGLE_PLATFORM.aesthetic.tiktak).toBe('great')
    expect(ANGLE_PLATFORM.luxury.tiktak).toBe('bad')
    expect(ANGLE_PLATFORM.pain_point.poogle).toBe('great')
    expect(ANGLE_PLATFORM.aesthetic.poogle).toBe('bad')
    expect(ANGLE_PLATFORM.budget.tiktak_shop).toBe('great')
    expect(ANGLE_PLATFORM.gift.pinterestt).toBe('great')
    expect(Object.keys(NICHE_PLATFORM)).toHaveLength(12)
    expect(COMBO_MULT.great).toBeGreaterThan(COMBO_MULT.bad)
  })

  it('every product has a natural (great) angle and valid platform fits', () => {
    const angles: AngleId[] = ['pain_point', 'convenience', 'gift', 'aesthetic', 'social_proof', 'budget', 'wholesome', 'before_after', 'luxury']
    for (const p of PRODUCTS) {
      expect(angles.some(a => productAngleRating(p, a) === 'great')).toBe(true)
      for (const pl of ['fadbook', 'tiktak', 'reels', 'pinterestt', 'poogle', 'tiktak_shop'] as PlatformId[]) {
        expect(['great', 'good', 'ok', 'bad']).toContain(productPlatformRating(p, pl))
      }
    }
  })

  it('has 4–6 coach quotes per metric × bucket, each using the real number', () => {
    for (const m of Object.values(QUOTES)) {
      for (const list of Object.values(m)) {
        expect(list.length).toBeGreaterThanOrEqual(4)
        expect(list.length).toBeLessThanOrEqual(6)
        for (const q of list) expect(q).toContain('{v}')
      }
    }
  })
})
