import { describe, expect, it } from 'vitest'
import { createNewGame } from '../newGame'
import {
  affordableResearch, canResearch, featureMonthlyCost, hasBoost, research, researchNodes, researchState, toggleFeature,
} from '../research'
import { FEATURES } from '../../data/features'

const fresh = () => createNewGame({ company: 'Test Co', founder: 'Tess', difficulty: 'normal', seed: 1234 })

describe('research tree data', () => {
  it('has ~40 nodes with unique ids, valid prerequisites and no cycles', () => {
    const nodes = researchNodes()
    expect(nodes.length).toBeGreaterThanOrEqual(38)
    const ids = new Set(nodes.map(n => n.id))
    expect(ids.size).toBe(nodes.length)
    for (const n of nodes) {
      for (const r of n.requires) expect(ids.has(r), `${n.id} requires unknown ${r}`).toBe(true)
      expect(n.icon.length).toBeGreaterThan(0)
      expect(n.description.length).toBeGreaterThan(10)
      if (n.unlocks.feature) expect(FEATURES[n.unlocks.feature as keyof typeof FEATURES]).toBeDefined()
    }
    // topological check: every node reachable by repeatedly researching nodes whose requirements are met
    const done = new Set<string>()
    let progress = true
    while (progress) {
      progress = false
      for (const n of nodes) if (!done.has(n.id) && n.requires.every(r => done.has(r))) { done.add(n.id); progress = true }
    }
    expect(done.size).toBe(nodes.length)
  })
})

describe('canResearch / research', () => {
  it('spends RP and unlocks an angle', () => {
    const s = fresh()
    expect(canResearch(s, 'angle_aesthetic').ok).toBe(false)
    expect(canResearch(s, 'angle_aesthetic').reason).toMatch(/RP/)
    s.rp = 100
    expect(research(s, 'angle_aesthetic')).toBe(true)
    expect(s.unlocked.angles).toContain('aesthetic')
    expect(s.unlocked.research).toContain('angle_aesthetic')
    expect(s.rp).toBe(70)
    expect(s.toasts.some(t => t.kind === 'research')).toBe(true)
    // twice is refused and changes nothing
    expect(research(s, 'angle_aesthetic')).toBe(false)
    expect(s.rp).toBe(70)
    expect(researchState(s, 'angle_aesthetic')).toBe('owned')
  })

  it('respects prerequisites, office gates, cash costs and news gates', () => {
    const s = fresh()
    s.rp = 5000
    expect(canResearch(s, 'angle_luxury').reason).toMatch(/Needs/)
    expect(researchState(s, 'angle_luxury')).toBe('locked')

    expect(canResearch(s, 'size_standard').reason).toMatch(/office/i)
    s.office = 1
    expect(canResearch(s, 'size_standard').reason).toMatch(/office/i) // a 2-person team can't carry Standard yet
    s.office = 2
    expect(research(s, 'size_standard')).toBe(true)
    expect(s.unlocked.sizes).toContain('standard')

    // cash + RP
    research(s, 'plat_tiktak')
    research(s, 'plat_pinterestt')
    s.cash = 500
    expect(canResearch(s, 'plat_poogle').reason).toMatch(/cash/)
    s.cash = 5000
    expect(research(s, 'plat_poogle')).toBe(true)
    expect(s.cash).toBe(4000)
    expect(s.unlocked.platforms).toEqual(expect.arrayContaining(['tiktak', 'pinterestt', 'poogle']))

    // Reels only after the world announces it
    expect(canResearch(s, 'plat_reels').ok).toBe(false)
    s.market.platforms.reels.available = true
    expect(research(s, 'plat_reels')).toBe(true)
  })

  it('features become active on research and can be toggled (monthly fees follow)', () => {
    const s = fresh()
    s.rp = 500
    expect(research(s, 'feat_reviews')).toBe(true)
    expect(s.unlocked.features).toContain('reviews')
    expect(s.activeFeatures).toContain('reviews')
    expect(featureMonthlyCost(s)).toBe(FEATURES.reviews.monthly)
    research(s, 'feat_trust_badges')
    expect(featureMonthlyCost(s)).toBe(FEATURES.reviews.monthly + FEATURES.trust_badges.monthly)
    toggleFeature(s, 'reviews', false)
    expect(s.activeFeatures).not.toContain('reviews')
    expect(featureMonthlyCost(s)).toBe(FEATURES.trust_badges.monthly)
    // cannot toggle something never researched
    toggleFeature(s, 'automation', true)
    expect(s.activeFeatures).not.toContain('automation')
  })

  it('boosts apply (copy bootcamp raises team copy) and affordable list tracks RP', () => {
    const s = fresh()
    expect(affordableResearch(s)).toHaveLength(0)
    s.rp = 50
    expect(affordableResearch(s).length).toBeGreaterThan(0)
    const before = s.founder.stats.copy
    expect(research(s, 'boost_copy_bootcamp')).toBe(true)
    expect(hasBoost(s, 'copy_bootcamp')).toBe(true)
    expect(s.founder.stats.copy).toBe(before + 4)
  })
})
