// Pure helpers shared by the runtime and its unit tests (no three.js, no DOM).
import type { ActorTask } from './types'

// ---------------------------------------------------------------------------
// Wall cutaway
// ---------------------------------------------------------------------------
export type WallSide = 'n' | 'e' | 's' | 'w'
/** outward wall normals in three.js floor coordinates (x, z). North = −Z. */
export const WALL_NORMALS: Record<WallSide, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }

/** dot(outward normal, horizontal direction from the room centre to the camera) */
export function wallFacing(side: WallSide, camX: number, camZ: number): number {
  const len = Math.hypot(camX, camZ) || 1
  const [nx, nz] = WALL_NORMALS[side]
  return (nx * camX + nz * camZ) / len
}

/** Hysteresis so walls do not flicker around the threshold: cut above `on`, restore below `off`. */
export function nextCutState(cut: boolean, dot: number, on = 0.2, off = 0.1): boolean {
  return cut ? dot > off : dot > on
}

/** Camera azimuth convention: yaw 0 = camera due south (+Z) of the target, 90 = east (+X). Default 45 = south-east. */
export function yawToDir(yawDeg: number): [number, number] {
  const a = (yawDeg * Math.PI) / 180
  return [Math.sin(a), Math.cos(a)]
}

// ---------------------------------------------------------------------------
// Easing / damping
// ---------------------------------------------------------------------------
/** frame-rate independent exponential approach factor */
export function damp(rate: number, dt: number): number { return 1 - Math.exp(-rate * dt) }
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const easeOut = (t: number) => 1 - (1 - t) ** 3
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** shortest signed angle difference b − a in radians, in (−π, π] */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}

// ---------------------------------------------------------------------------
// Inventory boxes (setBoxes)
// ---------------------------------------------------------------------------
export interface BoxRegion { w: number; d: number; layers: number }
export const BOX_UNIT = { x: 0.4, y: 0.3, z: 0.3 } as const
/** units at which every region is full */
export const BOXES_FULL_AT = 1500

/** boxes per row / column / layer in a region (boxes may sit flush when the region is exactly a multiple) */
export function regionGrid(r: BoxRegion) {
  const fit = (len: number, unit: number) => Math.max(1, Math.floor((len + 0.06) / (unit + 0.02)))
  const nx = fit(r.w, BOX_UNIT.x), nz = fit(r.d, BOX_UNIT.z)
  const gap = (len: number, n: number, unit: number) => (n > 1 ? clamp((len - n * unit) / (n - 1), 0, 0.03) : 0)
  return { nx, nz, layers: Math.max(1, Math.round(r.layers || 1)), gx: gap(r.w, nx, BOX_UNIT.x), gz: gap(r.d, nz, BOX_UNIT.z) }
}

export function regionSlots(r: BoxRegion): number {
  const g = regionGrid(r)
  return g.nx * g.nz * g.layers
}

export function boxCapacity(regions: BoxRegion[]): number {
  return regions.reduce((s, r) => s + regionSlots(r), 0)
}

/** Log-scale mapping from stock units to visible boxes: 0 → 0, ≥1 → ≥1, BOXES_FULL_AT+ → capacity. */
export function boxCount(units: number, capacity: number, fullAt = BOXES_FULL_AT): number {
  if (!(units > 0) || capacity <= 0) return 0
  const t = Math.log1p(units) / Math.log1p(fullAt)
  return clamp(Math.ceil(capacity * Math.min(1, t)), 1, capacity)
}

/** deterministic 0..1 hash for jitter */
export function hash01(i: number, salt = 0): number {
  let h = (i * 374761393 + salt * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) % 10000) / 10000
}

export interface BoxSlot { x: number; y: number; z: number; rot: number }
/**
 * Slot positions inside a region in the anchor's local frame (x across w, z across d, y up; the region is centred on
 * the anchor and sits on it). Order: bottom layer first, back row first, so stacks look natural as they grow.
 */
export function regionSlotList(r: BoxRegion, regionIndex = 0): BoxSlot[] {
  const { nx, nz, layers, gx, gz } = regionGrid(r)
  const spanX = nx * BOX_UNIT.x + (nx - 1) * gx, spanZ = nz * BOX_UNIT.z + (nz - 1) * gz
  const out: BoxSlot[] = []
  let k = 0
  for (let l = 0; l < layers; l++) for (let iz = nz - 1; iz >= 0; iz--) for (let ix = 0; ix < nx; ix++) {
    const j = hash01(k + regionIndex * 97, 7), j2 = hash01(k + regionIndex * 97, 11), j3 = hash01(k + regionIndex * 97, 13)
    out.push({
      x: -spanX / 2 + BOX_UNIT.x / 2 + ix * (BOX_UNIT.x + gx) + (j - 0.5) * 0.02,
      y: l * BOX_UNIT.y,
      z: -spanZ / 2 + BOX_UNIT.z / 2 + iz * (BOX_UNIT.z + gz) + (j2 - 0.5) * 0.02,
      rot: (j3 - 0.5) * (l === 0 ? 0.06 : 0.14),
    })
    k++
  }
  return out
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
/** 'a_bed_lie' and 'bed_lie' both mean the anchor bed_lie */
export function normAnchor(name: string): string { return name.startsWith('a_') ? name.slice(2) : name }

/** Stable identity of a task: the same key means the same task (idempotent `task()`). */
export function taskKey(t: ActorTask): string {
  switch (t.kind) {
    case 'idle': return `idle|${t.at ? normAnchor(t.at) : ''}|${t.anim ?? ''}`
    case 'wander': return 'wander'
    case 'sit': return `sit|${normAnchor(t.at)}|${t.anim ?? ''}`
    case 'lie': return `lie|${normAnchor(t.at)}`
    case 'use': return `use|${normAnchor(t.at)}|${t.anim}`
    case 'goto': return `goto|${t.point.x.toFixed(2)}|${t.point.z.toFixed(2)}`
    case 'leave': return `leave|${t.at ? normAnchor(t.at) : ''}`
    case 'hidden': return 'hidden'
  }
}

export function sameTask(a: ActorTask | null | undefined, b: ActorTask | null | undefined): boolean {
  if (!a || !b) return a === b
  return taskKey(a) === taskKey(b)
}

/** The anchor a task occupies (reserved exclusively), or null. */
export function taskAnchor(t: ActorTask): string | null {
  switch (t.kind) {
    case 'idle': return t.at ? normAnchor(t.at) : null
    case 'sit': case 'lie': case 'use': return normAnchor(t.at)
    default: return null
  }
}

/** Related standing anchor to approach a seat/bed from: bed_lie → bed_stand, computer_sit → computer_stand. */
export function approachAnchor(anchor: string, has: (n: string) => boolean): string | null {
  const m = /^(.*)_(sit|lie)(_\d+)?$/.exec(anchor)
  if (!m) return null
  const cand = [`${m[1]}_stand`, `${m[1]}${m[3] ?? ''}_stand`]
  for (const c of cand) if (c !== anchor && has(c)) return c
  return null
}

/** Exit anchor for `leave`: explicit, else door_exit (homes) or exit_door (mcdoodles). */
export function exitAnchor(explicit: string | undefined, has: (n: string) => boolean): string | null {
  if (explicit) { const a = normAnchor(explicit); if (has(a)) return a }
  for (const c of ['door_exit', 'exit_door']) if (has(c)) return c
  return null
}

/** Standing anchor just inside an exit: door_exit → door_stand, exit_door → exit_stand. */
export function exitStandAnchor(exit: string, has: (n: string) => boolean): string | null {
  const c = exit === 'exit_door' ? 'exit_stand' : exit.replace(/_exit$/, '_stand')
  return has(c) ? c : null
}

/** Exclusive anchor reservations: one actor per anchor; the second waits nearby. */
export class Reservations {
  private byAnchor = new Map<string, string>()
  private byActor = new Map<string, string>()
  holder(anchor: string): string | undefined { return this.byAnchor.get(anchor) }
  of(actor: string): string | undefined { return this.byActor.get(actor) }
  /** true when `actor` holds `anchor` after the call */
  reserve(anchor: string, actor: string): boolean {
    const h = this.byAnchor.get(anchor)
    if (h && h !== actor) return false
    this.release(actor)
    this.byAnchor.set(anchor, actor)
    this.byActor.set(actor, anchor)
    return true
  }
  release(actor: string) {
    const a = this.byActor.get(actor)
    if (a !== undefined) { this.byAnchor.delete(a); this.byActor.delete(actor) }
  }
  clear() { this.byAnchor.clear(); this.byActor.clear() }
}

/** darken/lighten a hex colour by factor (f < 1 darkens) */
export function shadeHex(hex: string, f: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  const ch = (s: number) => clamp(Math.round(((n >> s) & 255) * f), 0, 255)
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------
export const DESK_GEAR = new Set(['phone_cracked', 'phone_pro', 'laptop_old', 'laptop_pro', 'workstation', 'lav_mic'])
export const FLOOR_GEAR = new Set(['ring_light', 'softbox_kit', 'mirrorless_camera'])
export function gearNode(id: string): string { return id.trim().toLowerCase().replace(/-/g, '_') }
/** desk gear that counts as "the computer on the desk" (the a_gear_desk default stands in for these) */
export const COMPUTER_GEAR = new Set(['laptop_old', 'laptop_pro', 'workstation'])

export interface GearPlacement {
  /** props.glb node name */
  node: string
  /** anchor name without the a_ prefix */
  anchor: string
  /** position among the items sharing a desk anchor (0 = centre) and how many share it */
  slot: number
  of: number
  /** true for the a_gear_desk default (not one of the requested items) */
  fallback: boolean
}

/**
 * The gear rule (docs/3D.md section 7, "Baked gear"):
 * 1. Ids are normalised ('ring-light' = 'ring_light'); duplicates count once.
 * 2. An item the room already shows as furniture (a node tagged extras {gear:"<id>"}, e.g. tier2's ring light or a
 *    main desk with monitors = 'workstation') is not placed again.
 * 3. Desk items go on a_gear_desk (computers in the middle, phones / mics beside them); floor items take
 *    a_gear_floor_1, _2 in order (an item with no free floor anchor is dropped); an explicit `anchor` wins.
 * 4. When no computer (laptop_old / laptop_pro / workstation) ends up on a_gear_desk and the anchor has an extras
 *    `default` the room does not already bake, that default is placed there, so a bare desk is never empty (Hustle
 *    never calls setGear and still gets the laptop).
 */
export function planGear(items: readonly { id: string; anchor?: string }[], room: { baked: ReadonlySet<string>; deskDefault: string | null; hasDesk: boolean; floorAnchors: readonly string[] }): GearPlacement[] {
  const seen = new Set<string>()
  const desk: { node: string; anchor: string; fallback: boolean }[] = []
  const out: GearPlacement[] = []
  let floorI = 0
  for (const it of items) {
    const node = gearNode(it.id)
    if (!node || seen.has(node)) continue
    seen.add(node)
    if (room.baked.has(node)) continue
    const anchor = it.anchor ? normAnchor(it.anchor) : FLOOR_GEAR.has(node) ? room.floorAnchors[floorI++] : 'gear_desk'
    if (!anchor) continue
    if (anchor === 'gear_desk') { if (room.hasDesk) desk.push({ node, anchor, fallback: false }) }
    else out.push({ node, anchor, slot: 0, of: 1, fallback: false })
  }
  const def = room.deskDefault ? gearNode(room.deskDefault) : ''
  if (room.hasDesk && def && !room.baked.has(def) && !desk.some(d => COMPUTER_GEAR.has(d.node))) desk.push({ node: def, anchor: 'gear_desk', fallback: true })
  // desk: computers in the middle, phones/mics at the sides
  const order = (n: string) => (COMPUTER_GEAR.has(n) ? 0 : 1)
  desk.sort((a, b) => order(a.node) - order(b.node))
  desk.forEach((d, i) => out.push({ node: d.node, anchor: d.anchor, slot: i, of: desk.length, fallback: d.fallback }))
  return out
}
