// OWNER: sim-core. Hidden combo truth tables (GDT "genre × topic × platform") + ideal focus. DESIGN §2.
// Players only ever see ratings they have discovered (Playbook) — never import these into UI for unknown combos.
import type { AngleId, ComboRating, NicheId, PlatformId, Product } from '../core/types'
import { ANGLES } from './angles'
import { NICHES, findProduct, productsByNiche } from './catalog'
import { PLATFORMS } from './platforms'

export const COMBO_MULT: Record<ComboRating, number> = { great: 1.25, good: 1.08, ok: 0.9, bad: 0.62 }
export const COMBO_RANK: Record<ComboRating, number> = { bad: 0, ok: 1, good: 2, great: 3 }
export const COMBO_META: Record<ComboRating, { icon: string; label: string; tone: 'good' | 'info' | 'warn' | 'bad' }> = {
  great: { icon: '✓✓', label: 'Great', tone: 'good' },
  good: { icon: '✓', label: 'Good', tone: 'info' },
  ok: { icon: '~', label: 'OK', tone: 'warn' },
  bad: { icon: '✗', label: 'Bad', tone: 'bad' },
}

// ---------------------------------------------------------------------------
// Product × angle
// ---------------------------------------------------------------------------
/** catalog `bestAngles` vocabulary → AngleId ('aspirational' depends on price). */
export function mapCatalogAngle(tag: string, product: Product): AngleId | null {
  switch (tag) {
    case 'pain_point': case 'health': return 'pain_point'
    case 'convenience': case 'time_saving': return 'convenience'
    case 'gift': return 'gift'
    case 'social_proof': return 'social_proof'
    case 'savings': return 'budget'
    case 'aspirational': return product.perceivedValue >= 60 ? 'luxury' : 'aesthetic'
    case 'curiosity': return 'aesthetic'
    case 'pet_love': case 'parenting': case 'self_care': return 'wholesome'
    default: return null
  }
}
/** Mapped angles in catalog order, deduped (first = the product's natural angle). */
export function mappedAngles(product: Product): AngleId[] {
  const out: AngleId[] = []
  for (const tag of product.bestAngles) {
    const a = mapCatalogAngle(tag, product)
    if (a && !out.includes(a)) out.push(a)
  }
  return out
}
const CLEANING = /clean|scrub|vacuum|hair-roller|remover|window|steam|whiten|blackhead/

export function productAngleRating(product: Product, angle: AngleId): ComboRating {
  const mapped = mappedAngles(product)
  if (mapped[0] === angle) return 'great'
  if (mapped.includes(angle)) return 'good'
  const pv = product.perceivedValue
  switch (angle) {
    case 'gift': return product.giftable >= 0.6 ? 'good' : product.giftable < 0.3 ? 'bad' : 'ok'
    case 'aesthetic': return product.wow >= 0.7 ? 'good' : 'ok'
    case 'before_after':
      return (product.niche === 'beauty' || CLEANING.test(product.id)) && product.problemSolving >= 0.7 ? 'good' : 'bad'
    case 'luxury': return pv >= 60 ? 'good' : pv < 25 ? 'bad' : 'ok'
    case 'budget': return pv <= 25 ? 'good' : pv >= 60 ? 'bad' : 'ok'
    case 'wholesome': return product.niche === 'pet' || product.niche === 'baby' || product.niche === 'kids' ? 'good' : 'ok'
    // a "pain point" pitch for something that solves nothing reads as nonsense
    case 'pain_point': return product.problemSolving < 0.3 ? 'bad' : 'ok'
    default: return 'ok'
  }
}

// ---------------------------------------------------------------------------
// Angle × platform (9 × 6)
// ---------------------------------------------------------------------------
type Row = Record<PlatformId, ComboRating>
const G = 'great', g = 'good', o = 'ok', b = 'bad'
const row = (fadbook: ComboRating, tiktak: ComboRating, reels: ComboRating, pinterestt: ComboRating, poogle: ComboRating, tiktak_shop: ComboRating): Row =>
  ({ fadbook, tiktak, reels, pinterestt, poogle, tiktak_shop })

//                                             fadbook tiktak reels pinterestt poogle tt_shop
export const ANGLE_PLATFORM: Record<AngleId, Row> = {
  pain_point: row(G, g, o, o, G, o),
  convenience: row(g, g, o, g, G, g),
  gift: row(g, o, G, G, g, o),
  aesthetic: row(o, G, G, G, b, g),
  social_proof: row(G, g, g, o, o, G),
  budget: row(g, G, o, o, g, G),
  wholesome: row(G, g, g, o, b, o),
  before_after: row(g, G, G, g, o, g),
  luxury: row(o, b, G, g, g, b),
}
export const anglePlatformRating = (angle: AngleId, platform: PlatformId): ComboRating => ANGLE_PLATFORM[angle][platform]

// ---------------------------------------------------------------------------
// Niche × platform (fadbook / tiktak come from each product's platformFit)
// ---------------------------------------------------------------------------
type NRow = Record<'reels' | 'pinterestt' | 'poogle' | 'tiktak_shop', ComboRating>
const nrow = (reels: ComboRating, pinterestt: ComboRating, poogle: ComboRating, tiktak_shop: ComboRating): NRow => ({ reels, pinterestt, poogle, tiktak_shop })
//                                              reels pinterestt poogle tt_shop
export const NICHE_PLATFORM: Record<NicheId, NRow> = {
  pet: nrow(g, o, g, g),
  beauty: nrow(G, G, o, G),
  home: nrow(g, G, g, g),
  kitchen: nrow(g, G, g, g),
  fitness: nrow(G, o, g, g),
  wellness: nrow(g, g, G, o),
  car: nrow(o, b, G, o),
  gadgets: nrow(g, o, G, G),
  baby: nrow(o, G, G, o),
  kids: nrow(o, g, g, o),
  fashion: nrow(G, G, o, g),
  outdoor: nrow(g, g, g, o),
}
export const fitRating = (fit: number): ComboRating => (fit >= 0.8 ? 'great' : fit >= 0.65 ? 'good' : fit >= 0.45 ? 'ok' : 'bad')
export const isPerProductPlatform = (p: PlatformId): p is 'fadbook' | 'tiktak' => p === 'fadbook' || p === 'tiktak'

/** Engine truth for a product on a platform. */
export function productPlatformRating(product: Product, platform: PlatformId): ComboRating {
  if (isPerProductPlatform(platform)) return fitRating(product.platformFit[platform])
  return NICHE_PLATFORM[product.niche][platform]
}
/** Typical rating for a whole niche on a platform (fadbook/tiktak: niche-average platformFit). */
export function nicheTypicalRating(niche: NicheId, platform: PlatformId): ComboRating {
  if (!isPerProductPlatform(platform)) return NICHE_PLATFORM[niche][platform]
  const ps = productsByNiche(niche)
  if (!ps.length) return 'ok'
  return fitRating(ps.reduce((a, p) => a + p.platformFit[platform], 0) / ps.length)
}

// ---------------------------------------------------------------------------
// Playbook keys
// ---------------------------------------------------------------------------
export const keyPA = (productId: string, angle: AngleId) => `pa:${productId}:${angle}`
export const keyAP = (angle: AngleId, platform: PlatformId) => `ap:${angle}:${platform}`
export const keyNP = (niche: NicheId, platform: PlatformId) => `np:${niche}:${platform}`
export const keyPP = (productId: string, platform: PlatformId) => `pp:${productId}:${platform}`
/** The keys that decide a config's three combos. `np` is product-level ('pp:') on fadbook/tiktak. */
export function comboKeys(product: Product, angle: AngleId, platform: PlatformId): { pa: string; ap: string; np: string; nicheNp: string } {
  return {
    pa: keyPA(product.id, angle),
    ap: keyAP(angle, platform),
    np: isPerProductPlatform(platform) ? keyPP(product.id, platform) : keyNP(product.niche, platform),
    nicheNp: keyNP(product.niche, platform),
  }
}
/** Human label for any playbook key, e.g. "Pet Hair Roller × 🩹 Pain Point". */
export function comboLabel(key: string): string {
  const [kind, a, c] = key.split(':')
  const plat = (id: string) => { const p = PLATFORMS[id as PlatformId]; return p ? `${p.icon} ${p.name}` : id }
  const ang = (id: string) => { const x = ANGLES[id as AngleId]; return x ? `${x.icon} ${x.name}` : id }
  const prod = (id: string) => findProduct(id)?.name ?? id
  const niche = (id: string) => { const n = NICHES[id as NicheId]; return n ? `${n.icon} ${n.name}` : id }
  switch (kind) {
    case 'pa': return `${prod(a)} × ${ang(c)}`
    case 'ap': return `${ang(a)} × ${plat(c)}`
    case 'np': return `${niche(a)} × ${plat(c)}`
    case 'pp': return `${prod(a)} × ${plat(c)}`
    default: return key
  }
}
export function parseComboKey(key: string): { kind: 'pa' | 'ap' | 'np' | 'pp'; a: string; b: string } | null {
  const [kind, a, b] = key.split(':')
  if ((kind === 'pa' || kind === 'ap' || kind === 'np' || kind === 'pp') && a && b) return { kind, a, b }
  return null
}

// ---------------------------------------------------------------------------
// Ideal focus per angle (normalized per stage) + platform shifts
// ---------------------------------------------------------------------------
export type Triple = [number, number, number]
export const IDEAL_FOCUS: Record<AngleId, [Triple, Triple, Triple]> = {
  //             Sourcing [research, quality, pricing]  Store [copy, visuals, offer]  Marketing [hooks, targeting, influencers]
  pain_point: [[0.30, 0.50, 0.20], [0.55, 0.20, 0.25], [0.45, 0.40, 0.15]],
  convenience: [[0.35, 0.35, 0.30], [0.45, 0.30, 0.25], [0.35, 0.50, 0.15]],
  gift: [[0.25, 0.35, 0.40], [0.25, 0.40, 0.35], [0.35, 0.35, 0.30]],
  aesthetic: [[0.30, 0.30, 0.40], [0.15, 0.60, 0.25], [0.45, 0.15, 0.40]],
  social_proof: [[0.25, 0.45, 0.30], [0.35, 0.35, 0.30], [0.30, 0.30, 0.40]],
  budget: [[0.25, 0.25, 0.50], [0.30, 0.20, 0.50], [0.40, 0.45, 0.15]],
  wholesome: [[0.30, 0.40, 0.30], [0.40, 0.40, 0.20], [0.40, 0.25, 0.35]],
  before_after: [[0.35, 0.45, 0.20], [0.30, 0.50, 0.20], [0.55, 0.25, 0.20]],
  luxury: [[0.25, 0.55, 0.20], [0.35, 0.50, 0.15], [0.30, 0.25, 0.45]],
}

export const normalize3 = (w: readonly number[]): Triple => {
  const v = [0, 1, 2].map(i => Math.max(0, Number(w?.[i]) || 0))
  const sum = v[0] + v[1] + v[2]
  return sum > 0 ? [v[0] / sum, v[1] / sum, v[2] / sum] : [1 / 3, 1 / 3, 1 / 3]
}

/** Ideal normalized sliders per stage for an angle on a platform. */
export function idealFocusFor(angle: AngleId, platform: PlatformId): [Triple, Triple, Triple] {
  const base = IDEAL_FOCUS[angle]
  const s1: Triple = [...base[0]]
  const s2: Triple = [...base[1]]
  const s3: Triple = [...base[2]]
  const shift = (t: Triple, from: number, to: number, amt: number) => { t[to] += amt; t[from] -= amt }
  switch (platform) {
    case 'tiktak': case 'reels': shift(s3, 1, 0, 0.1); break // hooks +.10, targeting −.10
    case 'poogle': shift(s3, 0, 1, 0.15); break // targeting +.15, hooks −.15
    case 'tiktak_shop': shift(s3, 1, 2, 0.1); break // influencers +.10, targeting −.10
    case 'pinterestt': shift(s2, 0, 1, 0.1); break // visuals +.10, copy −.10
  }
  const fix = (t: Triple): Triple => normalize3(t.map(x => Math.max(0.05, x)))
  return [fix(s1), fix(s2), fix(s3)]
}
