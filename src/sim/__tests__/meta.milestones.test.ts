import { describe, expect, it } from 'vitest'
import { createNewGame } from '../newGame'
import { checkMilestones, milestoneDefs } from '../world'

const fresh = () => createNewGame({ company: 'Test Co', founder: 'Tess', difficulty: 'normal', seed: 5 })

describe('milestones', () => {
  it('~20+ defs with unique ids, icons and fun titles', () => {
    const defs = milestoneDefs()
    expect(defs.length).toBeGreaterThanOrEqual(20)
    expect(new Set(defs.map(d => d.id)).size).toBe(defs.length)
    for (const d of defs) { expect(d.icon).toBeTruthy(); expect(d.title).toBeTruthy(); expect(d.description).toBeTruthy() }
    expect(milestoneDefs()).toBe(defs) // stable reference for UI selectors
  })

  it('nothing fires on a fresh game', () => {
    const s = fresh()
    expect(checkMilestones(s)).toEqual([])
    expect(Object.keys(s.milestones)).toHaveLength(0)
  })

  it('fires once with a toast + confetti, one at a time, never again', () => {
    const s = fresh()
    s.day = 40
    s.stats.launches = 1
    s.stats.lifetimeRevenue = 250
    const fx = checkMilestones(s)
    expect(fx.some(f => f.kind === 'confetti')).toBe(true)
    expect(s.milestones.first_launch).toBe(40)
    expect(s.milestones.first_sale).toBeUndefined() // queued: milestones are spaced out so they don't flood the feed
    expect(s.toasts.filter(t => t.kind === 'milestone')).toHaveLength(1)
    s.day = 41
    expect(checkMilestones(s)).toEqual([])
    s.day = 42
    expect(checkMilestones(s).some(f => f.kind === 'confetti')).toBe(true)
    expect(s.milestones.first_sale).toBe(42)
    for (s.day = 43; s.day < 60; s.day++) expect(checkMilestones(s)).toEqual([])
    expect(s.toasts.filter(t => t.kind === 'milestone')).toHaveLength(2)
    expect(s.milestones.first_launch).toBe(40)
  })

  it('office / job / money milestones', () => {
    const s = fresh()
    s.office = 5
    s.dayJob.employed = false
    s.dayJob.quitDay = 10
    s.cash = 1_200_000
    for (s.day = 1; s.day < 30; s.day++) checkMilestones(s)
    for (const id of ['first_move', 'penthouse', 'quit_job', 'millionaire']) expect(s.milestones[id]).toBeDefined()
  })
})
