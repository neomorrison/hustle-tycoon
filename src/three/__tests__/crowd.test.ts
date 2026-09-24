import { describe, expect, it } from 'vitest'
import { CROWD, doorwayBusy, pathEnters, standingBlockers, steer, type Neighbour } from '../crowd'
import { planGear } from '../math'
import { NavGrid } from '../navgrid'

const walker = (id: string, x: number, z: number, dirX = 0, dirZ = 0): Neighbour => ({ id, x, z, dirX, dirZ, moving: !!(dirX || dirZ) })

/** simulate two walkers heading for goals with the steer() rule and return their closest approach */
function simulate(a: { id: string; x: number; z: number; gx: number; gz: number }, b: { id: string; x: number; z: number; gx: number; gz: number }, secs = 8) {
  const dt = 1 / 30
  let minD = Infinity
  const ppl = [{ ...a, dx: 0, dz: 0 }, { ...b, dx: 0, dz: 0 }]
  for (let t = 0; t < secs; t += dt) {
    const snap = ppl.map(p => walker(p.id, p.x, p.z, p.dx, p.dz))
    for (const p of ppl) {
      const hx = p.gx - p.x, hz = p.gz - p.z, l = Math.hypot(hx, hz)
      if (l < 0.05) { p.dx = p.dz = 0; continue }
      p.dx = hx / l; p.dz = hz / l
      const s = steer({ id: p.id, x: p.x, z: p.z, dirX: p.dx, dirZ: p.dz }, snap, l)
      const v = 1.35 * s.speed * dt
      p.x += p.dx * Math.min(v, l) + s.sideX * dt
      p.z += p.dz * Math.min(v, l) + s.sideZ * dt
    }
    minD = Math.min(minD, Math.hypot(ppl[0].x - ppl[1].x, ppl[0].z - ppl[1].z))
  }
  return { minD, a: ppl[0], b: ppl[1] }
}

describe('crowd steer', () => {
  it('walks freely with nobody around', () => {
    expect(steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, [])).toEqual({ speed: 1, sideX: 0, sideZ: 0, blockedBy: null, standingAhead: false })
  })
  it('ignores people behind and far to the side', () => {
    const s = steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, [walker('b', -0.6, 0), walker('c', 0.5, 1.2)])
    expect(s.speed).toBe(1)
    expect(s.blockedBy).toBeNull()
  })
  it('steps around someone standing dead ahead, to the right', () => {
    // facing -Z (into the screen): the walker's right is +X
    const s = steer({ id: 'a', x: 0, z: 0, dirX: 0, dirZ: -1 }, [walker('b', 0, -0.7)])
    expect(s.sideX).toBeGreaterThan(0)
    expect(s.speed).toBeLessThan(1)
    expect(s.speed).toBeGreaterThan(0)
  })
  it('steps away from the side a standing person is on', () => {
    const s = steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, [walker('b', 0.7, 0.2)])
    // they are on +Z (the walker's right when facing +X), so step toward -Z
    expect(s.sideZ).toBeLessThan(0)
  })
  it('the larger id waits when two walkers meet head-on, the other goes around', () => {
    const others = [walker('a', 0, 0, 1, 0), walker('b', 0.8, 0, -1, 0)]
    const sa = steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, others)
    const sb = steer({ id: 'b', x: 0.8, z: 0, dirX: -1, dirZ: 0 }, others)
    expect(sb.speed).toBe(0)
    expect(sb.blockedBy).toBe('a')
    expect(sa.speed).toBeGreaterThan(0)
    expect(Math.hypot(sa.sideX, sa.sideZ)).toBeGreaterThan(0)
  })
  it('follows someone walking the same way instead of overtaking', () => {
    const s = steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, [walker('b', CROWD.stop * 0.9, 0.05, 1, 0)])
    expect(s.speed).toBe(0)
    expect(s.blockedBy).toBe('b')
    const far = steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, [walker('b', 0.8, 0, 1, 0)])
    expect(far.speed).toBeGreaterThan(0)
    expect(far.speed).toBeLessThan(1)
  })
  it('does not stop for someone standing beyond its goal', () => {
    const s = steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, [walker('b', 0.9, 0)], 0.2)
    expect(s.speed).toBe(1)
  })
  it('pushes apart people who overlap', () => {
    const s = steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, [walker('b', -0.1, 0.2)])
    expect(s.sideZ).toBeLessThan(0)
    expect(s.sideX).toBeGreaterThan(0)
  })
  it('caps the side step', () => {
    const s = steer({ id: 'a', x: 0, z: 0, dirX: 1, dirZ: 0 }, [walker('b', 0.1, 0.01), walker('c', 0.4, 0.02), walker('d', -0.1, 0.05)])
    expect(Math.hypot(s.sideX, s.sideZ)).toBeLessThanOrEqual(CROWD.side + 1e-9)
  })
  it('two people crossing a room head-on never walk through each other and both arrive', () => {
    const r = simulate({ id: 'a', x: -3, z: 0, gx: 3, gz: 0 }, { id: 'b', x: 3, z: 0.05, gx: -3, gz: 0.05 })
    expect(r.minD).toBeGreaterThan(CROWD.radius * 1.2)
    expect(Math.hypot(r.a.x - 3, r.a.z)).toBeLessThan(0.1)
    expect(Math.hypot(r.b.x + 3, r.b.z - 0.05)).toBeLessThan(0.1)
  })
})

describe('planning around people standing still', () => {
  it('lists only still people away from the start and the goal', () => {
    const others = [walker('a', 0, 0), walker('b', 1.5, 0), walker('c', 3, 0.2, 1, 0), walker('d', 4, 0), walker('e', 0.3, 0.2)]
    expect(standingBlockers({ id: 'a', x: 0, z: 0 }, { x: 4.3, z: 0 }, others)).toEqual([{ x: 1.5, z: 0 }])
  })
  it('a walk plans around a person standing in a corridor when there is room', () => {
    const grid = new NavGrid({ minX: 0, maxX: 6, minZ: 0, maxZ: 3 }, 0.2)
    grid.finalize()
    const straight = grid.findPath({ x: 0.5, z: 1.5 }, { x: 5.5, z: 1.5 })!
    expect(straight.length).toBe(2)
    const around = grid.withBlockers([{ x: 3, z: 1.5 }], 0.37).findPath({ x: 0.5, z: 1.5 }, { x: 5.5, z: 1.5 })!
    expect(around.length).toBeGreaterThan(2)
    const closest = Math.min(...around.flatMap((p, i) => {
      const q = around[i + 1]
      if (!q) return [Math.hypot(p.x - 3, p.z - 1.5)]
      const t = Math.max(0, Math.min(1, ((3 - p.x) * (q.x - p.x) + (1.5 - p.z) * (q.z - p.z)) / ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 || 1)))
      return [Math.hypot(p.x + (q.x - p.x) * t - 3, p.z + (q.z - p.z) * t - 1.5)]
    }))
    expect(closest).toBeGreaterThan(0.3)
    // the original grid is untouched
    expect(grid.isFree({ x: 3, z: 1.5 })).toBe(true)
  })
})

describe('doorway wait', () => {
  const door = { x: 0, z: -3 }
  it('holds before a doorway someone else is in', () => {
    const path = [{ x: 0, z: 0 }, { x: 0, z: -3 }]
    expect(doorwayBusy({ id: 'a', x: 0, z: 0 }, path, door, [walker('b', 0.2, -2.8)])).toBe(true)
  })
  it('goes when the doorway is clear', () => {
    const path = [{ x: 0, z: 0 }, { x: 0, z: -3 }]
    expect(doorwayBusy({ id: 'a', x: 0, z: 0 }, path, door, [walker('b', 2, 0)])).toBe(false)
  })
  it('never waits once inside the doorway zone', () => {
    const path = [{ x: 0, z: -2.5 }, { x: 0, z: -3 }]
    expect(doorwayBusy({ id: 'a', x: 0, z: -2.5 }, path, door, [walker('b', 0.2, -3)])).toBe(false)
  })
  it('only waits for a doorway on its own path', () => {
    const path = [{ x: 0, z: 0 }, { x: 3, z: 0 }]
    expect(doorwayBusy({ id: 'a', x: 0, z: 0 }, path, door, [walker('b', 0, -3)])).toBe(false)
  })
  it('pathEnters checks segments, not only points', () => {
    expect(pathEnters([{ x: -2, z: -3 }, { x: 2, z: -3 }], door, 0.5)).toBe(true)
    expect(pathEnters([{ x: -2, z: 0 }, { x: 2, z: 0 }], door, 0.5)).toBe(false)
  })
})

describe('gear rule', () => {
  const room = (o: Partial<Parameters<typeof planGear>[1]> = {}) => ({ baked: new Set<string>(), deskDefault: null, hasDesk: true, floorAnchors: ['gear_floor_1', 'gear_floor_2'], ...o })
  it('places desk and floor gear, hyphen ids normalised', () => {
    const p = planGear([{ id: 'ring-light' }, { id: 'laptop-pro' }, { id: 'phone-pro' }], room())
    expect(p.map(q => `${q.node}@${q.anchor}`)).toEqual(['ring_light@gear_floor_1', 'laptop_pro@gear_desk', 'phone_pro@gear_desk'])
  })
  it('skips items the room bakes in', () => {
    const p = planGear([{ id: 'ring-light' }, { id: 'softbox-kit' }, { id: 'workstation' }], room({ baked: new Set(['ring_light', 'workstation']) }))
    expect(p.map(q => q.node)).toEqual(['softbox_kit'])
    // the skipped ring light does not use up a floor anchor
    expect(p[0].anchor).toBe('gear_floor_1')
  })
  it('shows the desk default when no computer was placed', () => {
    const p = planGear([], room({ deskDefault: 'laptop_old' }))
    expect(p).toEqual([{ node: 'laptop_old', anchor: 'gear_desk', slot: 0, of: 1, fallback: true }])
    const withPhone = planGear([{ id: 'phone-cracked' }], room({ deskDefault: 'laptop_old' }))
    expect(withPhone.map(q => q.node)).toEqual(['laptop_old', 'phone_cracked'])
  })
  it('a computer from setGear replaces the default', () => {
    const p = planGear([{ id: 'workstation' }], room({ deskDefault: 'laptop_old' }))
    expect(p.map(q => q.node)).toEqual(['workstation'])
  })
  it('no default when the room already bakes that computer, or there is no desk anchor', () => {
    expect(planGear([], room({ deskDefault: 'laptop_old', baked: new Set(['laptop_old']) }))).toEqual([])
    expect(planGear([], room({ deskDefault: 'laptop_old', hasDesk: false }))).toEqual([])
  })
  it('duplicates count once; floor items beyond the floor anchors are dropped; explicit anchors win', () => {
    const p = planGear([{ id: 'ring-light' }, { id: 'ring_light' }, { id: 'softbox-kit' }, { id: 'mirrorless-camera' }, { id: 'lav-mic', anchor: 'a_gear_floor_2' }], room())
    expect(p.map(q => `${q.node}@${q.anchor}`)).toEqual(['ring_light@gear_floor_1', 'softbox_kit@gear_floor_2', 'lav_mic@gear_floor_2'])
  })
  it('computers go in the middle of the desk', () => {
    const p = planGear([{ id: 'phone-pro' }, { id: 'laptop-old' }], room())
    expect(p.map(q => [q.node, q.slot, q.of])).toEqual([['laptop_old', 0, 2], ['phone_pro', 1, 2]])
  })
})
