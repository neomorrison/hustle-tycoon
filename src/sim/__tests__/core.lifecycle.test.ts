import { describe, expect, it } from 'vitest'
import type { FX, GameState } from '../../core/types'
import { createNewGame } from '../newGame'
import { tickDay } from '../index'
import { canStartLaunch, estimateLaunch, launchNow, setStageSliders, startLaunch, startQC } from '../launch'
import { idealFocus } from '../evaluate'
import { findLaunch, killLaunch, resolveDecision, weeklyProjection } from '../sales'
import { knownCombosFor } from '../playbook'

function strongGame(seed = 11): GameState {
  const s = createNewGame({ company: 'Lifecycle Co', founder: 'Tess', difficulty: 'normal', seed })
  s.cash = 50_000
  s.dayJob.employed = false
  s.unlocked.angles.push('wholesome')
  s.founder.stats = { copy: 45, creative: 45, research: 40, speed: 40 }
  return s
}

describe('launch lifecycle via tickDay', () => {
  it('develops with bubbles, pauses for sliders, goes live, sells, raises decisions and ends with a post-mortem', () => {
    const s = strongGame()
    expect(canStartLaunch(s).ok).toBe(true)
    const est = estimateLaunch(s, { name: '', productId: 'pet-hair-roller', angle: 'wholesome', platform: 'fadbook', size: 'test', priceTier: 'standard', features: [] })
    expect(est.upfront).toBe(300)
    const cash0 = s.cash
    const id = startLaunch(s, { name: 'Fur Fighter', productId: 'pet-hair-roller', angle: 'wholesome', platform: 'fadbook', size: 'test', priceTier: 'standard', features: [] })
    expect(id).toBeTruthy()
    expect(s.cash).toBe(cash0 - 300)
    expect(s.current?.awaitingSliders).toBe(true)
    expect(canStartLaunch(s).ok).toBe(false)

    // paused: ticking does not progress dev while sliders are pending
    tickDay(s)
    expect(s.current!.daysElapsed).toBe(0)

    const ideal = idealFocus('wholesome', 'fadbook') as [number, number, number][]
    const fx: FX[] = []
    let pauses = 0
    for (let guard = 0; guard < 400 && s.current && s.current.status === 'dev'; guard++) {
      if (s.current.awaitingSliders) {
        pauses++
        setStageSliders(s, ideal[s.current.stage])
        expect(s.current.awaitingSliders).toBe(false)
      }
      fx.push(...tickDay(s))
    }
    expect(pauses).toBe(3) // one per stage
    const bubbles = fx.filter(f => f.kind === 'bubble')
    expect(bubbles.length).toBeGreaterThan(20)
    expect(bubbles.every(b => b.personId === 'founder' && (b.amount ?? 0) >= 1)).toBe(true)
    expect(new Set(bubbles.map(b => b.point))).toEqual(new Set(['conv', 'traffic', 'aov', 'research', 'bugs']))
    const l = s.current!
    expect(l.status).toBe('qc')
    expect(l.points.conv).toBeGreaterThan(0)
    expect(l.points.traffic).toBeGreaterThan(0)

    // polish a few days, then launch
    const bugsBefore = l.points.bugs
    startQC(s)
    for (let i = 0; i < 3 && s.current?.status === 'qc'; i++) tickDay(s)
    expect(s.current!.points.bugs).toBeLessThanOrEqual(bugsBefore)
    const launchFx = launchNow(s)
    expect(launchFx.some(f => f.kind === 'sound' && f.sound === 'launch')).toBe(true)
    expect(s.current).toBeNull()
    expect(s.live).toHaveLength(1)
    const live = s.live[0]
    expect(live.status).toBe('live')
    expect(live.review).toBeDefined()
    expect(s.flags.pendingReview).toBe(id)
    expect(s.stats.launches).toBe(1)
    expect(live.review!.overall).toBeGreaterThanOrEqual(7)
    expect(weeklyProjection(s, live).budget).toBe(700)

    // sales weeks + scale calls
    const kinds = new Set<string>()
    for (let day = 0; day < 7 * 10 && s.live.length; day++) {
      for (const d of [...s.decisions]) {
        kinds.add(d.kind)
        resolveDecision(s, d.id, d.kind === 'scale' ? 'scale50' : d.kind === 'refresh' ? 'refresh' : d.options[d.options.length - 1].id)
      }
      tickDay(s)
    }
    const run = findLaunch(s, id!)!.sales!
    expect(run.weeks.length).toBeGreaterThanOrEqual(8)
    expect(run.totalRevenue).toBeGreaterThan(0)
    expect(s.stats.lifetimeRevenue).toBeGreaterThan(0)
    expect(kinds.has('scale') || kinds.has('refresh')).toBe(true)
    expect(run.budgetMult).toBeGreaterThanOrEqual(1)

    // end it → post-mortem, history, playbook
    if (s.live.length) killLaunch(s, id!)
    expect(s.live).toHaveLength(0)
    expect(s.flags.pendingPostMortem).toBe(id)
    const rec = s.history.find(h => h.id === id)!
    expect(rec).toBeDefined()
    expect(rec.postMortem!.headline.length).toBeGreaterThan(10)
    expect(rec.postMortem!.combos).toHaveLength(3)
    expect(rec.postMortem!.notes.length).toBeGreaterThanOrEqual(3)
    expect(findLaunch(s, id!)!.postMortem).toBeDefined()
    const known = knownCombosFor(s, 'pet-hair-roller', 'wholesome', 'fadbook')
    expect(known).toMatchObject({ productAngle: 'great', anglePlatform: 'great', nichePlatform: 'great' })
    expect(s.playbook.focus.wholesome?.accuracy).toBeGreaterThan(0.9)
    expect(s.playbook.launchedProducts['pet-hair-roller']).toBe(1)
  })

  it('raises a kill call for a bleeding launch and kills it on request', () => {
    const s = strongGame(5)
    s.founder.stats = { copy: 15, creative: 15, research: 10, speed: 15 }
    const id = startLaunch(s, { name: 'Doomed', productId: 'dog-lick-mat', angle: 'gift', platform: 'fadbook', size: 'test', priceTier: 'premium', features: [] })!
    for (let guard = 0; guard < 400 && s.current; guard++) {
      if (s.current.awaitingSliders) setStageSliders(s, [1, 0, 0])
      if (s.current.status === 'qc' || s.current.status === 'ready') launchNow(s)
      else tickDay(s)
    }
    const l = s.live.find(x => x.id === id)!
    expect(['flop', 'breakeven']).toContain(l.review!.verdict)
    let kill: string | undefined
    for (let day = 0; day < 7 * 8 && !kill; day++) {
      tickDay(s)
      kill = s.decisions.find(d => d.launchId === id && d.kind === 'kill')?.id
      for (const d of s.decisions.filter(d => d.kind !== 'kill')) resolveDecision(s, d.id, d.options[d.options.length - 1].id)
    }
    expect(kill).toBeDefined()
    resolveDecision(s, kill!, 'kill')
    expect(s.live.find(x => x.id === id)).toBeUndefined()
    const rec = s.history.find(h => h.id === id)!
    expect(rec.endReason).toBe('killed')
    expect(rec.profit).toBeLessThan(0)
    expect(rec.profit).toBeGreaterThan(-2500) // killing early caps the damage
  })

  it('rejects invalid configs without charging', () => {
    const s = createNewGame({ company: 'X', founder: 'Y', difficulty: 'normal', seed: 1 })
    const cash = s.cash
    expect(startLaunch(s, { name: '', productId: 'led-face-mask', angle: 'pain_point', platform: 'fadbook', size: 'test', priceTier: 'standard', features: [] })).toBeNull() // beauty locked
    expect(startLaunch(s, { name: '', productId: 'pet-hair-roller', angle: 'luxury', platform: 'fadbook', size: 'test', priceTier: 'standard', features: [] })).toBeNull() // angle locked
    expect(startLaunch(s, { name: '', productId: 'pet-hair-roller', angle: 'pain_point', platform: 'fadbook', size: 'standard', priceTier: 'standard', features: [] })).toBeNull() // size locked
    expect(s.cash).toBe(cash)
    expect(s.current).toBeNull()
  })
})
