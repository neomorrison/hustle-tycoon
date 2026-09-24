// The office "director": turns game state into what each 3D person is doing (GDT desks + Sims-style little lives).
// Plain TS over the Stage's public API; UI-side randomness only (never in src/sim).
import type { ActorTask, Look, Mood, Stage } from '../../three'

/** What the game wants from a person right now. */
export type Mode =
  | 'work'   // on the launch team while it's being built: typing
  | 'think'  // founder while a focus call / launch call waits
  | 'wait'   // team member while the launch waits on the founder
  | 'bench'  // launch running without them: idle at the desk, phone breaks
  | 'life'   // no launch in development: coffee runs, chats, stretches, window gazing
  | 'away'   // at training (out of the office)

export interface Cast {
  id: string
  name: string
  look: Look
  /** seat anchor ('computer_sit', 'staff_2_sit') or null when there's no desk for them */
  seat: string | null
  mode: Mode
  mood: Mood
  /** films content on breaks (founder, video creators) */
  films?: boolean
}

type TripKind = 'coffee' | 'window' | 'stretch' | 'chat' | 'couch' | 'phone' | 'lunch' | 'film' | 'nap' | 'walk'
interface Trip { kind: TripKind; left: number; at?: string; partner?: string; talkIn?: number; point?: { x: number; z: number } }
interface Person {
  cast: Cast
  lookKey: string
  taskKey: string
  hold: string | null
  mood: Mood | null
  trip: Trip | null
  /** seconds (animation time) at the desk before the next break */
  deskFor: number
  deskAnim: 'sit_idle' | 'sit_type'
  /** seconds left holding a coffee after a coffee run */
  mug: number
}
interface AnchorPos { x: number; y: number; z: number; yaw: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length) % xs.length]

export class Director {
  private people = new Map<string, Person>()
  private anchors = new Map<string, AnchorPos>()
  private placedOnce = false
  private timers = new Set<number>()

  constructor(private stage: Stage) {}

  /** Call after every setRoom: anchors changed, trips to missing anchors end. */
  onRoom() {
    this.anchors.clear()
    try {
      for (const a of this.stage.debugAnchors()) this.anchors.set(a.name, { x: a.x, y: a.y, z: a.z, yaw: a.yaw })
    } catch { /* room not ready */ }
    for (const p of this.people.values()) { if (p.trip && p.trip.kind !== 'stretch' && p.trip.kind !== 'phone') p.trip = null; this.apply(p) }
  }

  anchor(name: string): AnchorPos | undefined { return this.anchors.get(name.startsWith('a_') ? name.slice(2) : name) }
  private has(name: string) { return this.anchors.size === 0 || this.anchors.has(name) }

  sync(list: Cast[]) {
    const ids = new Set(list.map(c => c.id))
    for (const id of [...this.people.keys()]) {
      if (!ids.has(id)) { this.stage.removeActor(id); this.people.delete(id) }
    }
    const arrivals: string[] = []
    for (const c of list) {
      let p = this.people.get(c.id)
      const lookKey = JSON.stringify(c.look) + '|' + c.name
      if (!p) {
        p = { cast: c, lookKey, taskKey: '', hold: null, mood: null, trip: null, deskFor: rand(4, 16), deskAnim: 'sit_idle', mug: 0 }
        this.people.set(c.id, p)
        this.stage.setActor(c.id, { look: c.look, name: c.name })
        // later hires walk in through the door (the first task of a new actor places it directly)
        if (this.placedOnce && c.mode !== 'away') { this.stage.task(c.id, { kind: 'hidden' }); arrivals.push(c.id) }
      } else if (p.lookKey !== lookKey) {
        p.lookKey = lookKey
        this.stage.setActor(c.id, { look: c.look, name: c.name })
      }
      const was = p.cast.mode
      p.cast = c
      if (was !== c.mode) {
        if (c.mode !== 'life' && c.mode !== 'bench') p.trip = null
        else if (c.mode === 'bench' && p.trip && !['phone', 'stretch', 'coffee'].includes(p.trip.kind)) p.trip = null
        if (c.mode === 'life' || c.mode === 'bench') p.deskFor = rand(3, 10)
      }
      this.apply(p)
    }
    if (list.length) this.placedOnce = true
    if (arrivals.length) {
      // the team says hi to the new face
      this.later(3200, () => { for (const p of this.people.values()) if (!arrivals.includes(p.cast.id) && p.cast.mode !== 'away') this.stage.emote(p.cast.id, 'wave') })
    }
  }

  private later(ms: number, fn: () => void) {
    const t = window.setTimeout(() => { this.timers.delete(t); fn() }, ms)
    this.timers.add(t)
  }

  dispose() {
    for (const t of this.timers) window.clearTimeout(t)
    this.timers.clear()
  }

  /** Everyone in the office cheers (winner confetti, level ups, office moves). */
  cheer() {
    let i = 0
    for (const p of this.people.values()) {
      if (p.cast.mode === 'away') continue
      const id = p.cast.id
      this.later(i++ * 120, () => this.stage.emote(id, 'cheer'))
    }
  }

  /** Player clicked something in the room: Sims-style, the founder goes and does it (when not busy). */
  founderGoes(kind: 'coffee' | 'nap' | 'couch' | 'walk', point?: { x: number; z: number }): boolean {
    const p = this.people.get('founder')
    if (!p || (p.cast.mode !== 'life')) return false
    const at = kind === 'coffee' ? 'fridge_stand' : kind === 'nap' ? 'bed_lie' : kind === 'couch' ? 'couch_sit' : undefined
    if (at && !this.has(at)) return false
    p.trip = { kind, left: kind === 'walk' ? 9 : kind === 'nap' ? 16 : 13, at, point }
    p.deskFor = rand(10, 20)
    this.apply(p)
    return true
  }

  // -------------------------------------------------------------------------
  // per-tick (dt = animation seconds: real time × game speed, 0 while paused)
  // -------------------------------------------------------------------------
  tick(dt: number) {
    if (dt <= 0) return
    const all = [...this.people.values()]
    const onBreak = () => all.filter(p => p.trip).length
    const cap = Math.max(1, Math.ceil(all.length * 0.4))
    for (const p of all) {
      if (p.mug > 0) { p.mug -= dt; if (p.mug <= 0) this.apply(p) }
      const m = p.cast.mode
      if (m !== 'life' && m !== 'bench') continue
      if (p.trip) {
        p.trip.left -= dt
        if (p.trip.kind === 'chat' && p.trip.talkIn !== undefined) {
          p.trip.talkIn -= dt
          if (p.trip.talkIn <= 0) {
            p.trip.talkIn = rand(2.4, 3.6)
            this.stage.emote(p.cast.id, 'talk')
            if (p.trip.partner) { const q = p.trip.partner; this.later(900, () => this.stage.emote(q, 'talk')) }
          }
        }
        if (p.trip.left <= 0) {
          if (p.trip.kind === 'coffee') p.mug = rand(14, 24)
          p.trip = null
          p.deskFor = m === 'bench' ? rand(10, 22) : rand(7, 18)
          p.deskAnim = p.cast.id === 'founder' && Math.random() < 0.45 ? 'sit_type' : Math.random() < 0.2 ? 'sit_type' : 'sit_idle'
          this.apply(p)
        }
        continue
      }
      p.deskFor -= dt
      if (p.deskFor > 0) continue
      if (onBreak() >= cap) { p.deskFor = rand(2, 5); continue }
      // stressed people have a little moment at the desk instead of a break, now and then
      if (p.cast.mood === 'stressed' && Math.random() < 0.35) { this.stage.emote(p.cast.id, 'stressed'); p.deskFor = rand(6, 12); continue }
      this.startTrip(p, all)
    }
  }

  private startTrip(p: Person, all: Person[]) {
    const bench = p.cast.mode === 'bench'
    const w: [TripKind, number][] = bench
      ? [['phone', 4], ['stretch', 2], ['coffee', 2]]
      : [['coffee', 4], ['window', 3], ['stretch', 2], ['chat', 3], ['couch', 1.2], ['phone', 2], ['lunch', 1], ['film', p.cast.films ? 1.6 : 0]]
    const partners = all.filter(q => q !== p && !q.trip && q.cast.seat && (q.cast.mode === 'life' || q.cast.mode === 'bench'))
    const ok = (k: TripKind) => {
      switch (k) {
        case 'coffee': return this.has('fridge_stand')
        case 'couch': return this.has('couch_sit')
        case 'lunch': return this.has('eat_sit')
        case 'film': return this.has('film_stand')
        case 'window': return [...this.anchors.keys()].some(n => n.startsWith('idle_'))
        case 'chat': return partners.length > 0 && this.anchors.size > 0
        case 'stretch': case 'phone': return !!p.cast.seat
        default: return true
      }
    }
    const opts = w.filter(([k, n]) => n > 0 && ok(k))
    if (!opts.length) { p.deskFor = rand(8, 16); return }
    let r = Math.random() * opts.reduce((a, [, n]) => a + n, 0)
    let kind = opts[0][0]
    for (const [k, n] of opts) { r -= n; if (r <= 0) { kind = k; break } }
    const t: Trip = { kind, left: 10 }
    switch (kind) {
      case 'coffee': t.at = 'fridge_stand'; t.left = rand(11, 14); break
      case 'window': t.at = pick([...this.anchors.keys()].filter(n => n.startsWith('idle_'))); t.left = rand(10, 15); break
      case 'stretch': t.left = rand(3.5, 4.5); break
      case 'phone': t.left = rand(5, 8); break
      case 'couch': t.at = 'couch_sit'; t.left = rand(13, 18); break
      case 'lunch': t.at = 'eat_sit'; t.left = rand(13, 17); break
      case 'film': t.at = 'film_stand'; t.left = rand(11, 15); break
      case 'chat': {
        const q = pick(partners)
        const seat = q.cast.seat ? this.anchor(q.cast.seat) : undefined
        if (!seat) { p.deskFor = rand(4, 8); return }
        // stand beside their chair, a little behind: forward = (sin yaw, cos yaw)
        const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw)
        const side = Math.random() < 0.5 ? 1 : -1
        t.point = { x: seat.x + fz * 0.8 * side - fx * 0.35, z: seat.z - fx * 0.8 * side - fz * 0.35 }
        t.partner = q.cast.id
        t.talkIn = 4
        t.left = rand(11, 15)
        q.deskFor = Math.max(q.deskFor, t.left + 2)
        break
      }
    }
    p.trip = t
    this.apply(p)
  }

  // -------------------------------------------------------------------------
  private apply(p: Person) {
    const c = p.cast
    let task: ActorTask
    let hold: string | null = p.mug > 0 ? 'mug' : null
    const desk = (anim: 'sit_idle' | 'sit_type' | 'sit_think'): ActorTask => (c.seat ? { kind: 'sit', at: c.seat, anim } : { kind: 'wander' })
    switch (c.mode) {
      case 'away': task = { kind: 'leave' }; hold = null; break
      case 'work': task = desk('sit_type'); break
      case 'think': task = desk('sit_think'); break
      case 'wait': task = desk('sit_idle'); break
      default: {
        const t = p.trip
        if (!t) { task = desk(c.mode === 'bench' ? 'sit_idle' : p.deskAnim); break }
        switch (t.kind) {
          case 'coffee': task = { kind: 'use', at: t.at!, anim: 'idle' }; break
          case 'window': task = { kind: 'idle', at: t.at! }; break
          case 'stretch': task = { kind: 'idle', anim: 'stretch' }; hold = null; break
          case 'phone': task = { kind: 'idle', anim: 'phone' }; hold = 'phone'; break
          case 'couch': task = { kind: 'sit', at: t.at!, anim: 'sit_idle' }; break
          case 'lunch': task = { kind: 'sit', at: t.at!, anim: 'eat_sit' }; hold = 'burger'; break
          case 'film': task = { kind: 'use', at: t.at!, anim: 'film' }; hold = 'phone'; break
          case 'nap': task = { kind: 'lie', at: t.at! }; hold = null; break
          case 'chat': case 'walk': task = { kind: 'goto', point: t.point! }; break
        }
      }
    }
    const key = JSON.stringify(task)
    if (key !== p.taskKey) { p.taskKey = key; this.stage.task(c.id, task) }
    if (hold !== p.hold) { p.hold = hold; this.stage.hold(c.id, hold) }
    if (c.mood !== p.mood) { p.mood = c.mood; this.stage.mood(c.id, c.mood) }
  }

  /** QA: what everyone is up to. */
  debug() { return [...this.people.values()].map(p => ({ id: p.cast.id, mode: p.cast.mode, trip: p.trip?.kind ?? null, desk: +p.deskFor.toFixed(1) })) }
}
