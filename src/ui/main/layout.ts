// Office scene layout: hotspot loading + avatar seats per office tier (percent of the 16:9 room art).
import { useEffect, useState } from 'react'
import { asset } from '../../core/assets'

export interface Box { x: number; y: number; w: number; h: number }
export type Hotspots = Record<string, Record<string, Box>>
export interface Seat { x: number; y: number }

/** Used only if hotspots.json can't be fetched. */
const FALLBACK_COMPUTER: Record<number, Box> = {
  0: { x: 38.5, y: 35, w: 10.8, h: 20 },
  1: { x: 38, y: 36, w: 12, h: 14 },
  2: { x: 42.5, y: 30, w: 13, h: 16 },
  3: { x: 38.5, y: 34, w: 12.5, h: 17 },
  4: { x: 53, y: 26, w: 15, h: 18.5 },
  5: { x: 40.5, y: 31, w: 16.5, h: 19 },
}

let cache: Hotspots | null = null
let pending: Promise<Hotspots | null> | null = null
function loadHotspots(): Promise<Hotspots | null> {
  if (cache) return Promise.resolve(cache)
  pending ??= fetch(asset('rooms/hotspots.json'))
    .then(r => (r.ok ? (r.json() as Promise<Hotspots>) : null))
    .then(j => (cache = j))
    .catch(() => null)
  return pending
}

export function useHotspots(): Hotspots | null {
  const [h, setH] = useState<Hotspots | null>(cache)
  useEffect(() => {
    if (cache) return
    let alive = true
    void loadHotspots().then(r => { if (alive && r) setH(r) })
    return () => { alive = false }
  }, [])
  return h
}

export function hotspot(h: Hotspots | null, tier: number, name: string): Box | null {
  const t = Math.max(0, Math.min(5, tier))
  const b = h?.[`tier${t}`]?.[name]
  if (b) return b
  return name === 'computer' ? FALLBACK_COMPUTER[t] ?? FALLBACK_COMPUTER[0] : null
}

/** Founder sits in front of the computer hotspot. */
export function founderSeat(h: Hotspots | null, tier: number): Seat {
  const b = hotspot(h, tier, 'computer') ?? FALLBACK_COMPUTER[0]
  const adj = FOUNDER_NUDGE[tier] ?? { x: 0, y: 0 }
  return { x: b.x + b.w / 2 + adj.x, y: b.y + b.h * 0.72 + adj.y }
}
const FOUNDER_NUDGE: Record<number, Seat> = {
  0: { x: 1.5, y: 3.5 },
  1: { x: 3.5, y: 3 },
  2: { x: 1.5, y: 3.5 },
  3: { x: -3, y: 0.5 },
  4: { x: -0.5, y: 2 },
  5: { x: 0, y: 3 },
}

/** Floor positions for staff, per tier (enough for the tier's slots, plus spares). */
const STAFF_SEATS: Record<number, Seat[]> = {
  0: [{ x: 58, y: 63 }, { x: 50, y: 72 }],
  1: [{ x: 58, y: 63 }, { x: 51, y: 72 }],
  2: [{ x: 63, y: 60 }, { x: 57, y: 71 }, { x: 68, y: 70 }],
  3: [{ x: 60, y: 50 }, { x: 51, y: 63 }, { x: 66, y: 62 }, { x: 58, y: 73 }],
  4: [{ x: 66, y: 36 }, { x: 40, y: 67 }, { x: 57, y: 69 }, { x: 64.5, y: 66 }, { x: 42, y: 41 }, { x: 49, y: 72 }],
  5: [{ x: 58, y: 45 }, { x: 40, y: 54 }, { x: 64, y: 53 }, { x: 53, y: 60 }, { x: 45, y: 67 }, { x: 60, y: 69 }, { x: 70, y: 61 }, { x: 34, y: 60 }],
}

export function staffSeat(tier: number, i: number): Seat {
  const seats = STAFF_SEATS[Math.max(0, Math.min(5, tier))] ?? STAFF_SEATS[0]
  const base = seats[i % seats.length]
  const lap = Math.floor(i / seats.length)
  return lap ? { x: base.x + lap * 4, y: base.y + lap * 3 } : base
}
