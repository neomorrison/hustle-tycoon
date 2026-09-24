// Local avoidance between walking people (docs/3D.md §6 "Crowd"). Pure TS: no three.js, no DOM, unit tested.
// Coordinates are three.js floor coordinates (x, z) in metres.

/** Another person on the floor, as seen by a walker deciding its next step. */
export interface Neighbour {
  id: string
  x: number
  z: number
  /** unit walking direction (0, 0 when standing still) */
  dirX: number
  dirZ: number
  /** walking (true) or standing somewhere (false). Seated / lying / hidden people are not neighbours at all. */
  moving: boolean
}

export interface Steer {
  /** 0..1 multiplier for this frame's walking speed (0 = hold still and wait) */
  speed: number
  /** sideways nudge (metres per second, floor plane) to step around someone */
  sideX: number
  sideZ: number
  /** who we are waiting for, when speed is ~0 */
  blockedBy: string | null
  /** someone standing still close ahead in our corridor: worth planning a new path around them */
  standingAhead: boolean
}

export const CROWD = {
  /** personal radius: two people closer than 2 × this overlap */
  radius: 0.27,
  /** how far ahead a walker looks for someone in its way */
  look: 1.0,
  /** distance ahead at which a walker comes to a full stop behind someone */
  stop: 0.45,
  /** strongest sideways step (m/s) */
  side: 0.9,
  /** radius of a doorway zone (around a_door_exit / a_exit_door) */
  door: 0.95,
} as const

/**
 * One walker's avoidance decision against its neighbours.
 * - Someone standing in the corridor ahead (within `look`, less than two radii off the walking line): slow down
 *   and step sideways around them (away from their side; dead ahead = pass on the walker's right).
 * - Someone walking the same way ahead: follow, easing to a stop `stop` metres behind them (no overtaking).
 * - Two walkers blocking each other (each in the other's corridor, meeting head-on or crossing): the one with the
 *   larger id waits, the other side-steps and goes first, so they never both freeze.
 * - Anyone overlapping the personal radius (any direction) is pushed away from.
 * `ahead` limits the look-ahead (e.g. to the distance left to the goal) so nobody stops behind someone standing past
 * their destination.
 */
export function steer(self: { id: string; x: number; z: number; dirX: number; dirZ: number }, others: readonly Neighbour[], ahead: number = CROWD.look): Steer {
  const out: Steer = { speed: 1, sideX: 0, sideZ: 0, blockedBy: null, standingAhead: false }
  const len = Math.hypot(self.dirX, self.dirZ)
  if (len < 1e-6) return out
  const fx = self.dirX / len, fz = self.dirZ / len
  // walker's right-hand side (three.js: x right, z toward the viewer; right of forward (fx, fz) is (-fz, fx))
  const rx = -fz, rz = fx
  const look = Math.min(CROWD.look, Math.max(0, ahead) + CROWD.radius)
  const lane = CROWD.radius * 2
  for (const o of others) {
    if (o.id === self.id) continue
    const dx = o.x - self.x, dz = o.z - self.z
    const d = Math.hypot(dx, dz)
    if (d > CROWD.look + lane) continue
    // separation: overlapping personal space
    if (d < lane && d > 1e-6) {
      const k = ((lane - d) / lane) * CROWD.side
      out.sideX -= (dx / d) * k
      out.sideZ -= (dz / d) * k
    }
    const along = dx * fx + dz * fz
    const lat = dx * rx + dz * rz
    if (along <= 0 || along > look || Math.abs(lat) >= lane) continue
    // they are in our corridor
    let wait = false
    if (o.moving) {
      const theyFacing = -(o.dirX * fx + o.dirZ * fz)     // > 0: coming toward us
      const selfInTheirWay = -(dx * o.dirX + dz * o.dirZ) > 0 && Math.abs(dx * o.dirZ - dz * o.dirX) < lane
      if (selfInTheirWay && theyFacing > -0.2) wait = self.id > o.id  // mutual: the larger id yields
      else if (theyFacing <= -0.2) {
        // same direction, they are ahead: follow, keep the gap, no overtaking in tight rooms
        const s = clamp01((along - CROWD.stop) / (CROWD.look - CROWD.stop))
        if (s < out.speed) out.speed = s
        if (s < 0.05) out.blockedBy = o.id
        continue
      }
    }
    if (wait) {
      out.speed = 0
      out.blockedBy = o.id
      continue
    }
    if (!o.moving && along < CROWD.look * 0.8) out.standingAhead = true
    // step around them: away from their side, to our right when they are dead ahead
    const sideSign = Math.abs(lat) < 0.04 ? 1 : lat > 0 ? -1 : 1
    const k = (1 - Math.abs(lat) / lane) * CROWD.side * (1 - along / (look + 1e-6) * 0.5)
    out.sideX += rx * sideSign * k
    out.sideZ += rz * sideSign * k
    // slow while squeezing past, stop if they are right in front of us
    const s = Math.max(0.25, clamp01((along - CROWD.stop * 0.6) / (CROWD.look - CROWD.stop * 0.6)))
    if (s < out.speed) out.speed = s
  }
  const sl = Math.hypot(out.sideX, out.sideZ)
  if (sl > CROWD.side) { out.sideX *= CROWD.side / sl; out.sideZ *= CROWD.side / sl }
  return out
}

/**
 * People standing still that a new walk should plan around (as extra blockers on a copy of the walk grid): not the
 * walker, not anyone moving, and not anyone right at the walker's start or goal (so the walk can still begin and
 * end where it must).
 */
export function standingBlockers(self: { id: string; x: number; z: number }, goal: { x: number; z: number }, others: readonly Neighbour[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (const o of others) {
    if (o.id === self.id || o.moving) continue
    if (Math.hypot(o.x - self.x, o.z - self.z) < 0.6 || Math.hypot(o.x - goal.x, o.z - goal.z) < 0.7) continue
    out.push({ x: o.x, z: o.z })
  }
  return out
}

/**
 * Polite doorway wait: true when `self` should hold before entering the doorway zone around `door` because someone
 * else is in it (walking through, arriving, or standing there). Walkers already inside the zone never wait (they
 * clear it), and nobody waits for a zone they are not heading into.
 */
export function doorwayBusy(self: { id: string; x: number; z: number }, path: readonly { x: number; z: number }[], door: { x: number; z: number }, others: readonly Neighbour[], radius: number = CROWD.door): boolean {
  if (Math.hypot(self.x - door.x, self.z - door.z) <= radius) return false
  if (!pathEnters(path, door, radius)) return false
  return others.some(o => o.id !== self.id && Math.hypot(o.x - door.x, o.z - door.z) <= radius)
}

/** true when the polyline (starting at the walker) comes within `radius` of point `c` */
export function pathEnters(path: readonly { x: number; z: number }[], c: { x: number; z: number }, radius: number): boolean {
  for (let i = 0; i < path.length; i++) {
    const a = path[i]
    if (Math.hypot(a.x - c.x, a.z - c.z) <= radius) return true
    const b = path[i + 1]
    if (!b) break
    const abx = b.x - a.x, abz = b.z - a.z
    const l2 = abx * abx + abz * abz
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.z - a.z) * abz) / l2)) : 0
    if (Math.hypot(a.x + abx * t - c.x, a.z + abz * t - c.z) <= radius) return true
  }
  return false
}

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v }
