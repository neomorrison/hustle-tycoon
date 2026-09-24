// Walkability grid + A* for actors (docs/3D.md §5 "Walkability", §6 "Actors"). Pure TS, no three.js.
// Coordinates are three.js floor coordinates (x, z) in metres.

export interface P2 { x: number; z: number }
export interface Bounds2 { minX: number; maxX: number; minZ: number; maxZ: number }

const SQRT2 = Math.SQRT2

/** Binary min-heap keyed by f score (indices into the grid). */
class Heap {
  private items: number[] = []
  private keys: number[] = []
  get size() { return this.items.length }
  push(item: number, key: number) {
    const a = this.items, k = this.keys
    a.push(item); k.push(key)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= k[i]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      ;[k[p], k[i]] = [k[i], k[p]]
      i = p
    }
  }
  pop(): number {
    const a = this.items, k = this.keys
    const top = a[0]
    const lastI = a.pop()!, lastK = k.pop()!
    if (a.length > 0) {
      a[0] = lastI; k[0] = lastK
      let i = 0
      for (;;) {
        const l = i * 2 + 1, r = l + 1
        let m = i
        if (l < a.length && k[l] < k[m]) m = l
        if (r < a.length && k[r] < k[m]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        ;[k[m], k[i]] = [k[i], k[m]]
        i = m
      }
    }
    return top
  }
}

export class NavGrid {
  readonly cell: number
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly z0: number
  /** 1 = blocked */
  readonly blocked: Uint8Array
  /** connected component id per free cell (-1 for blocked); valid after finalize() */
  comp: Int32Array
  private finalized = false

  constructor(bounds: Bounds2, cell = 0.2) {
    this.cell = cell
    this.x0 = bounds.minX
    this.z0 = bounds.minZ
    this.cols = Math.max(1, Math.round((bounds.maxX - bounds.minX) / cell))
    this.rows = Math.max(1, Math.round((bounds.maxZ - bounds.minZ) / cell))
    this.blocked = new Uint8Array(this.cols * this.rows)
    this.comp = new Int32Array(this.cols * this.rows).fill(-1)
  }

  idx(c: number, r: number) { return r * this.cols + c }
  inside(c: number, r: number) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows }
  center(c: number, r: number): P2 { return { x: this.x0 + (c + 0.5) * this.cell, z: this.z0 + (r + 0.5) * this.cell } }
  cellOf(p: P2): { c: number; r: number } {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - this.x0) / this.cell)))
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - this.z0) / this.cell)))
    return { c, r }
  }
  isFreeCell(c: number, r: number) { return this.inside(c, r) && this.blocked[this.idx(c, r)] === 0 }
  isFree(p: P2) {
    const c = Math.floor((p.x - this.x0) / this.cell), r = Math.floor((p.z - this.z0) / this.cell)
    return this.isFreeCell(c, r)
  }

  /** Block every cell whose centre lies inside the convex polygon inflated by `pad`. */
  blockPolygon(poly: P2[], pad = 0.15) {
    if (poly.length < 3) return
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z) }
    const a = this.cellOf({ x: minX - pad, z: minZ - pad }), b = this.cellOf({ x: maxX + pad, z: maxZ + pad })
    // orientation of the polygon (so "inside" works for either winding)
    let area = 0
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p.x * q.z - q.x * p.z }
    const sign = area >= 0 ? 1 : -1
    for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) {
      const p = this.center(c, r)
      if (pointInConvex(p, poly, sign) || distToPolygon(p, poly) <= pad) this.blocked[this.idx(c, r)] = 1
    }
    this.finalized = false
  }

  blockRect(b: Bounds2, pad = 0.15) {
    this.blockPolygon([{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.minZ }, { x: b.maxX, z: b.maxZ }, { x: b.minX, z: b.maxZ }], pad)
  }

  /** Block a band of `pad` metres along the outer edge of the grid (walls). */
  blockBorder(pad: number) {
    const n = Math.max(0, Math.round(pad / this.cell))
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (c < n || r < n || c >= this.cols - n || r >= this.rows - n) this.blocked[this.idx(c, r)] = 1
    }
    this.finalized = false
  }

  /** Label connected components of free cells (8-connected without corner cutting). */
  finalize() {
    this.comp.fill(-1)
    let id = 0
    const stack: number[] = []
    for (let i = 0; i < this.blocked.length; i++) {
      if (this.blocked[i] || this.comp[i] >= 0) continue
      this.comp[i] = id
      stack.push(i)
      while (stack.length) {
        const cur = stack.pop()!
        const c = cur % this.cols, r = (cur / this.cols) | 0
        this.forNeighbours(c, r, (nc, nr) => {
          const ni = this.idx(nc, nr)
          if (this.comp[ni] < 0) { this.comp[ni] = id; stack.push(ni) }
        })
      }
      id++
    }
    this.finalized = true
  }

  private forNeighbours(c: number, r: number, fn: (c: number, r: number, cost: number) => void) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue
      const nc = c + dc, nr = r + dr
      if (!this.isFreeCell(nc, nr)) continue
      if (dc && dr && (!this.isFreeCell(c + dc, r) || !this.isFreeCell(c, r + dr))) continue // no corner cutting
      fn(nc, nr, dc && dr ? SQRT2 : 1)
    }
  }

  private ensure() { if (!this.finalized) this.finalize() }

  /**
   * Nearest free cell centre to `p` (BFS over the grid). With `component` set, only cells of that component count.
   * Returns null when nothing qualifies.
   */
  nearestFree(p: P2, component?: number): P2 | null {
    this.ensure()
    const { c, r } = this.cellOf(p)
    const ok = (i: number) => this.blocked[i] === 0 && (component === undefined || this.comp[i] === component)
    const start = this.idx(c, r)
    // exact position free: keep the point itself (not snapped) when it is inside the grid
    if (ok(start) && this.isFree(p)) return { x: p.x, z: p.z }
    // expanding rings, choosing the closest centre (euclidean) inside the first ring that has any hit
    const maxRing = Math.max(this.cols, this.rows)
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: P2 | null = null, bestD = Infinity
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue
        const nc = c + dc, nr = r + dr
        if (!this.inside(nc, nr) || !ok(this.idx(nc, nr))) continue
        const q = this.center(nc, nr)
        const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
        if (d < bestD) { bestD = d; best = q }
      }
      // a later ring can still be closer in euclidean terms by at most one ring; check the next ring too
      if (best) {
        const next = ring + 1
        for (let dr = -next; dr <= next; dr++) for (let dc = -next; dc <= next; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== next) continue
          const nc = c + dc, nr = r + dr
          if (!this.inside(nc, nr) || !ok(this.idx(nc, nr))) continue
          const q = this.center(nc, nr)
          const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
          if (d < bestD) { bestD = d; best = q }
        }
        return best
      }
    }
    return null
  }

  /**
   * A copy of this grid with extra round blockers (people standing still), for planning a walk around them. Cells
   * within `radius` of each point (plus the usual corner rule) are blocked; components are recomputed.
   */
  withBlockers(points: readonly P2[], radius = 0.3): NavGrid {
    const g = new NavGrid({ minX: this.x0, maxX: this.x0 + this.cols * this.cell, minZ: this.z0, maxZ: this.z0 + this.rows * this.cell }, this.cell)
    g.blocked.set(this.blocked)
    for (const p of points) {
      const a = g.cellOf({ x: p.x - radius, z: p.z - radius }), b = g.cellOf({ x: p.x + radius, z: p.z + radius })
      for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) {
        const q = g.center(c, r)
        if (Math.hypot(q.x - p.x, q.z - p.z) <= radius) g.blocked[g.idx(c, r)] = 1
      }
    }
    g.finalize()
    return g
  }

  componentAt(p: P2): number {
    this.ensure()
    const { c, r } = this.cellOf(p)
    return this.comp[this.idx(c, r)]
  }

  /** True when every sample along a→b lies in a free cell. */
  lineOfSight(a: P2, b: P2): boolean {
    const dx = b.x - a.x, dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.25)))
    // a slightly thick line: never squeeze diagonally between two blocked cells
    const e = 0.03
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = a.x + dx * t, z = a.z + dz * t
      if (!this.isFree({ x, z })) return false
      if (i > 0 && i < steps && (!this.isFree({ x: x - e, z: z - e }) || !this.isFree({ x: x + e, z: z - e }) || !this.isFree({ x: x - e, z: z + e }) || !this.isFree({ x: x + e, z: z + e }))) return false
    }
    return true
  }

  /**
   * A* from `from` to `to` (both snapped to the nearest free cell of a shared component), then line-of-sight
   * smoothing. The result starts at `from` and ends at the reachable goal. Null if no free cell exists at all.
   */
  findPath(from: P2, to: P2): P2[] | null {
    this.ensure()
    const s = this.nearestFree(from)
    if (!s) return null
    const comp = this.componentAt(s)
    const g = this.nearestFree(to, comp)
    if (!g) return null
    const sc = this.cellOf(s), gc = this.cellOf(g)
    const cells = this.astar(sc.c, sc.r, gc.c, gc.r)
    if (!cells) return null
    const raw: P2[] = [s, ...cells.slice(1, -1).map(i => this.center(i % this.cols, (i / this.cols) | 0)), g]
    const smooth = this.smooth(raw)
    const out: P2[] = []
    if (Math.hypot(from.x - s.x, from.z - s.z) > 1e-3) out.push({ x: from.x, z: from.z })
    out.push(...smooth)
    return dedupe(out)
  }

  /** Greedy string pulling: keep only the points needed to stay in line of sight. */
  smooth(path: P2[]): P2[] {
    if (path.length <= 2) return path.slice()
    const out: P2[] = [path[0]]
    let i = 0
    while (i < path.length - 1) {
      let j = path.length - 1
      while (j > i + 1 && !this.lineOfSight(path[i], path[j])) j--
      out.push(path[j])
      i = j
    }
    return out
  }

  private astar(sc: number, sr: number, gc: number, gr: number): number[] | null {
    const n = this.cols * this.rows
    const start = this.idx(sc, sr), goal = this.idx(gc, gr)
    if (start === goal) return [start]
    const gScore = new Float32Array(n).fill(Infinity)
    const came = new Int32Array(n).fill(-1)
    const closed = new Uint8Array(n)
    const h = (c: number, r: number) => {
      const dx = Math.abs(c - gc), dy = Math.abs(r - gr)
      return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy)
    }
    const open = new Heap()
    gScore[start] = 0
    open.push(start, h(sc, sr))
    while (open.size) {
      const cur = open.pop()
      if (cur === goal) break
      if (closed[cur]) continue
      closed[cur] = 1
      const c = cur % this.cols, r = (cur / this.cols) | 0
      this.forNeighbours(c, r, (nc, nr, cost) => {
        const ni = this.idx(nc, nr)
        if (closed[ni]) return
        const t = gScore[cur] + cost
        if (t < gScore[ni]) {
          gScore[ni] = t
          came[ni] = cur
          open.push(ni, t + h(nc, nr) * 1.0001)
        }
      })
    }
    if (came[goal] < 0) return null
    const out: number[] = []
    for (let i = goal; i >= 0; i = came[i]) { out.push(i); if (i === start) break }
    return out.reverse()
  }
}

function dedupe(p: P2[]): P2[] {
  const out: P2[] = []
  for (const q of p) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(last.x - q.x, last.z - q.z) > 1e-3) out.push(q)
  }
  return out
}

function pointInConvex(p: P2, poly: P2[], sign: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)
    if (cross * sign < 0) return false
  }
  return true
}

function distToPolygon(p: P2, poly: P2[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const abx = b.x - a.x, abz = b.z - a.z
    const len2 = abx * abx + abz * abz
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2)) : 0
    const dx = a.x + abx * t - p.x, dz = a.z + abz * t - p.z
    best = Math.min(best, Math.hypot(dx, dz))
  }
  return best
}

/** Total length of a polyline. */
export function pathLength(p: P2[]): number {
  let s = 0
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z)
  return s
}
