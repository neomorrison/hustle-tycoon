// Office scene layout for the 2D art scene: hotspots + seats (percent of the 16:9 room still).
// Both JSON files are written by blender/stills.py next to the stills, so avatars sit on the chairs in the art.
import { useEffect, useState } from 'react'
import { asset } from '../../core/assets'

export interface Box { x: number; y: number; w: number; h: number }
export type Hotspots = Record<string, Record<string, Box>>
export interface Seat { x: number; y: number }
/** seat anchor floor point (x, y) and a seated head top (top), in percent of the still */
export interface StillSeat { x: number; y: number; top: number }
export type Seats = Record<string, Record<string, StillSeat>>

/** Used only if hotspots.json can't be fetched. */
const FALLBACK_COMPUTER: Record<number, Box> = {
  0: { x: 36.9, y: 25.1, w: 10.3, h: 20.5 },
  1: { x: 31.4, y: 30.4, w: 9.9, h: 20 },
  2: { x: 29.3, y: 29.8, w: 9.6, h: 18.7 },
  3: { x: 31.7, y: 28.3, w: 9.3, h: 16.7 },
  4: { x: 30.6, y: 23.3, w: 9.5, h: 16.1 },
  5: { x: 31, y: 25, w: 10, h: 17 },
}

function jsonLoader<T>(path: string) {
  let cache: T | null = null
  let pending: Promise<T | null> | null = null
  const load = (): Promise<T | null> => {
    if (cache) return Promise.resolve(cache)
    pending ??= fetch(asset(path))
      .then(r => (r.ok ? (r.json() as Promise<T>) : null))
      .then(j => (cache = j))
      .catch(() => null)
    return pending
  }
  return function useJson(): T | null {
    const [v, setV] = useState<T | null>(cache)
    useEffect(() => {
      if (cache) return
      let alive = true
      void load().then(r => { if (alive && r) setV(r) })
      return () => { alive = false }
    }, [])
    return v
  }
}

export const useHotspots = jsonLoader<Hotspots>('rooms/hotspots.json')
export const useSeats = jsonLoader<Seats>('rooms/seats.json')

const clampTier = (tier: number) => Math.max(0, Math.min(5, tier))

export function hotspot(h: Hotspots | null, tier: number, name: string): Box | null {
  const t = clampTier(tier)
  const b = h?.[`tier${t}`]?.[name]
  if (b) return b
  return name === 'computer' ? FALLBACK_COMPUTER[t] ?? FALLBACK_COMPUTER[0] : null
}

/** An avatar bubble centred on a seated person's head in the still. */
const onSeat = (s: StillSeat): Seat => ({ x: s.x, y: s.top + (s.y - s.top) * 0.36 })

/** Founder sits on the computer chair (seats.json), else in front of the computer hotspot. */
export function founderSeat(h: Hotspots | null, seats: Seats | null, tier: number): Seat {
  const s = seats?.[`tier${clampTier(tier)}`]?.computer_sit
  if (s) return onSeat(s)
  const b = hotspot(h, tier, 'computer') ?? FALLBACK_COMPUTER[0]
  return { x: b.x + b.w / 2, y: b.y + b.h * 0.72 }
}

/** Floor spots for staff beyond the desks (or before seats.json arrives), per tier. */
const SPARE_SEATS: Record<number, Seat[]> = {
  0: [{ x: 52, y: 58 }, { x: 46, y: 64 }],
  1: [{ x: 50, y: 66 }, { x: 44, y: 62 }],
  2: [{ x: 50, y: 64 }, { x: 56, y: 70 }, { x: 44, y: 60 }],
  3: [{ x: 42, y: 52 }, { x: 46, y: 57 }, { x: 50, y: 62 }, { x: 60, y: 60 }],
  4: [{ x: 54, y: 61 }, { x: 58, y: 65 }, { x: 61, y: 70 }, { x: 49, y: 68 }, { x: 53, y: 72 }, { x: 44, y: 60 }],
  5: [{ x: 48, y: 55 }, { x: 51, y: 59 }, { x: 55, y: 63 }, { x: 58, y: 67 }, { x: 44, y: 61 }, { x: 47, y: 64 }, { x: 50, y: 69 }, { x: 40, y: 56 }],
}

/** Staff i (hire order) sits at staffdesk i+1 of the tier; extras stand on spare spots. */
export function staffSeat(seats: Seats | null, tier: number, i: number): Seat {
  const t = clampTier(tier)
  const s = seats?.[`tier${t}`]?.[`staff_${i + 1}_sit`]
  if (s) return onSeat(s)
  const spare = SPARE_SEATS[t] ?? SPARE_SEATS[0]
  const base = spare[i % spare.length]
  const lap = Math.floor(i / spare.length)
  return lap ? { x: base.x + lap * 4, y: base.y + lap * 3 } : base
}
