import { describe, expect, it } from 'vitest'
import { NavGrid, pathLength, type P2 } from '../navgrid'

const room = () => new NavGrid({ minX: -3, maxX: 3, minZ: -2.5, maxZ: 2.5 }, 0.2)

function crossesBlocked(g: NavGrid, path: P2[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02)
    for (let k = 0; k <= n; k++) {
      const t = k / n
      if (!g.isFree({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return true
    }
  }
  return false
}

describe('NavGrid', () => {
  it('gives a straight two-point path in an open room', () => {
    const g = room()
    const p = g.findPath({ x: -2, z: -2 }, { x: 2, z: 1.5 })!
    expect(p).not.toBeNull()
    expect(p.length).toBe(2)
    expect(p[0]).toEqual({ x: -2, z: -2 })
    expect(p[1].x).toBeCloseTo(2)
    expect(p[1].z).toBeCloseTo(1.5)
  })

  it('routes around a wall-like obstacle without crossing blocked cells, and smooths the A* staircase', () => {
    const g = room()
    // a long divider across most of the room with a gap near +Z
    g.blockRect({ minX: -0.1, maxX: 0.1, minZ: -2.5, maxZ: 1.2 }, 0.15)
    const from = { x: -2, z: -2 }, to = { x: 2, z: -2 }
    const p = g.findPath(from, to)!
    expect(p).not.toBeNull()
    expect(crossesBlocked(g, p)).toBe(false)
    // must go through the gap (z > 1.2)
    expect(Math.max(...p.map(q => q.z))).toBeGreaterThan(1.2)
    // smoothed: few corners, length close to the geometric optimum (~2 × hypot(2, 3.5))
    expect(p.length).toBeLessThanOrEqual(5)
    expect(pathLength(p)).toBeLessThan(2 * Math.hypot(2.1, 3.6) + 0.6)
  })

  it('never cuts corners diagonally between two blocked cells', () => {
    const g = new NavGrid({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, 0.2)
    // block cells (2,1) and (1,2) → the diagonal (1,1)->(2,2) must not be taken
    g.blocked[g.idx(2, 1)] = 1
    g.blocked[g.idx(1, 2)] = 1
    g.finalize()
    const a = g.center(1, 1), b = g.center(2, 2)
    // (1,1) and (2,2) are only connected around, via the border cells
    const p = g.findPath(a, b)
    expect(p).not.toBeNull()
    expect(crossesBlocked(g, p!)).toBe(false)
    expect(p!.length).toBeGreaterThan(2)
  })

  it('finds the nearest free cell for anchors inside furniture', () => {
    const g = room()
    const desk = [{ x: -1, z: -2.5 }, { x: 0.5, z: -2.5 }, { x: 0.5, z: -1.6 }, { x: -1, z: -1.6 }]
    g.blockPolygon(desk, 0.15)
    g.finalize()
    const seat = { x: -0.2, z: -1.9 } // under the desk
    expect(g.isFree(seat)).toBe(false)
    const n = g.nearestFree(seat)!
    expect(g.isFree(n)).toBe(true)
    // just outside the padded desk (z ≥ -1.45), not far away
    expect(n.z).toBeGreaterThan(-1.46)
    expect(Math.hypot(n.x - seat.x, n.z - seat.z)).toBeLessThan(0.7)
    // a path to the seat ends at that free cell
    const p = g.findPath({ x: 2, z: 2 }, seat)!
    expect(g.isFree(p[p.length - 1])).toBe(true)
  })

  it('handles rotated (oriented) footprints', () => {
    const g = room()
    const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4)
    const rect = [[-1, -0.3], [1, -0.3], [1, 0.3], [-1, 0.3]].map(([x, z]) => ({ x: x * c - z * s, z: x * s + z * c }))
    g.blockPolygon(rect, 0)
    g.finalize()
    expect(g.isFree({ x: 0, z: 0 })).toBe(false)
    expect(g.isFree({ x: 0.6, z: 0.6 })).toBe(false) // along the diagonal
    expect(g.isFree({ x: 0.7, z: -0.7 })).toBe(true) // across the diagonal
  })

  it('snaps goals to the start component when the goal area is enclosed', () => {
    const g = room()
    // a closed box around (2, 2)
    g.blockRect({ minX: 1.2, maxX: 3, minZ: 1.2, maxZ: 1.4 }, 0)
    g.blockRect({ minX: 1.2, maxX: 1.4, minZ: 1.2, maxZ: 2.5 }, 0)
    g.finalize()
    const p = g.findPath({ x: -2, z: -2 }, { x: 2.4, z: 2.0 })!
    expect(p).not.toBeNull()
    const end = p[p.length - 1]
    expect(g.componentAt(end)).toBe(g.componentAt({ x: -2, z: -2 }))
  })

  it('blocks a border band for walls', () => {
    const g = room()
    g.blockBorder(0.2)
    g.finalize()
    expect(g.isFree({ x: -2.95, z: 0 })).toBe(false)
    expect(g.isFree({ x: -2.7, z: 0 })).toBe(true)
  })
})
