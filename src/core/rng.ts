// Seeded RNG for the simulation. State lives in GameState.rng so saves are deterministic.
// NEVER use Math.random() inside src/sim — always pass the (draft) state.

export interface RngHolder { rng: number }

/** mulberry32 step: returns float in [0, 1) and advances s.rng */
export function rand(s: RngHolder): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const randRange = (s: RngHolder, a: number, b: number) => a + (b - a) * rand(s)
/** inclusive integer range */
export const randInt = (s: RngHolder, a: number, b: number) => Math.floor(randRange(s, a, b + 1))
export const chance = (s: RngHolder, p: number) => rand(s) < p

/** standard normal via Box–Muller */
export function randn(s: RngHolder): number {
  let u = 0
  while (u === 0) u = rand(s)
  const v = rand(s)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** mean-1 multiplicative noise with log-sd `sigma` */
export const lognormal = (s: RngHolder, sigma: number) => Math.exp(sigma * randn(s) - (sigma * sigma) / 2)

/** Poisson sample; normal approximation for large lambda */
export function poisson(s: RngHolder, lambda: number): number {
  if (!(lambda > 0)) return 0
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * randn(s)))
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rand(s)
  } while (p > L)
  return k - 1
}

/** Binomial sample; approximations for large n */
export function binomial(s: RngHolder, n: number, p: number): number {
  n = Math.max(0, Math.floor(n))
  if (n === 0 || p <= 0) return 0
  if (p >= 1) return n
  if (n < 40) {
    let k = 0
    for (let i = 0; i < n; i++) if (rand(s) < p) k++
    return k
  }
  const mean = n * p
  if (mean < 15) return Math.min(n, poisson(s, mean))
  const sd = Math.sqrt(mean * (1 - p))
  return Math.min(n, Math.max(0, Math.round(mean + sd * randn(s))))
}

/** Stochastic rounding: 2.3 -> 2 (70%) or 3 (30%) */
export const stochRound = (s: RngHolder, x: number) => {
  const f = Math.floor(x)
  return f + (rand(s) < x - f ? 1 : 0)
}

export const pick = <T>(s: RngHolder, arr: readonly T[]): T => arr[Math.floor(rand(s) * arr.length)]

export function weightedPick<T>(s: RngHolder, items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((a, t) => a + Math.max(0, weight(t)), 0)
  let r = rand(s) * total
  for (const t of items) {
    r -= Math.max(0, weight(t))
    if (r <= 0) return t
  }
  return items[items.length - 1]
}

export function shuffle<T>(s: RngHolder, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
