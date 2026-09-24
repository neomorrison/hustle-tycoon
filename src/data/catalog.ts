// OWNER: sim-core. Typed loader over catalog.json + niches + price tiers + unit-cost helpers.
// Hidden product stats (wow, problemSolving, ...) are engine inputs — UI shows only the friendly labels below.
import raw from './catalog.json'
import type { FeatureId, NicheId, PriceTier, Product, SizeId } from '../core/types'

export const PRODUCTS: readonly Product[] = raw as Product[]

const BY_ID = new Map<string, Product>(PRODUCTS.map(p => [p.id, p]))

/** Catalog product by id (throws on unknown ids — ids always come from the catalog). */
export function productById(id: string): Product {
  const p = BY_ID.get(id)
  if (!p) throw new Error(`Unknown product "${id}"`)
  return p
}
/** Safe lookup (undefined for unknown ids). */
export const findProduct = (id: string): Product | undefined => BY_ID.get(id)

export function productsByNiche(niche: NicheId): Product[] {
  return PRODUCTS.filter(p => p.niche === niche)
}

// ---------------------------------------------------------------------------
// Niches
// ---------------------------------------------------------------------------
export interface NicheDef { id: NicheId; name: string; icon: string; blurb: string }
export const NICHES: Record<NicheId, NicheDef> = {
  pet: { id: 'pet', name: 'Pet', icon: '🐾', blurb: 'Pet parents spend like their fur baby is royalty. Because it is.' },
  home: { id: 'home', name: 'Home', icon: '🏠', blurb: 'Cleaning hacks, cozy lights, and things that make chores vanish.' },
  kitchen: { id: 'kitchen', name: 'Kitchen', icon: '🍳', blurb: 'Gadgets that chop, froth and impress dinner guests.' },
  gadgets: { id: 'gadgets', name: 'Gadgets', icon: '🔌', blurb: 'Shiny tech toys. Great on camera, crowded with copycats.' },
  beauty: { id: 'beauty', name: 'Beauty', icon: '💄', blurb: 'Self-care rituals and glow-ups. Visual, viral, a bit risky on claims.' },
  fitness: { id: 'fitness', name: 'Fitness', icon: '🏋️', blurb: 'New-year energy, all year round (it peaks in January).' },
  wellness: { id: 'wellness', name: 'Wellness', icon: '🧘', blurb: 'Sleep better, ache less, breathe deeper. Pain points galore.' },
  car: { id: 'car', name: 'Car', icon: '🚗', blurb: 'Dads, commuters and road-trippers. Practical buys, search-driven.' },
  baby: { id: 'baby', name: 'Baby', icon: '🍼', blurb: 'Tired parents will pay anything for five more minutes of sleep.' },
  kids: { id: 'kids', name: 'Kids', icon: '🧸', blurb: 'Toys that are secretly for the parents. Gift-season monsters.' },
  fashion: { id: 'fashion', name: 'Fashion', icon: '👜', blurb: 'Accessories with style. Pinterestt and Reels eat it up.' },
  outdoor: { id: 'outdoor', name: 'Outdoor', icon: '⛺', blurb: 'Patios, camping and backyard glow-ups. Very seasonal.' },
}
export const NICHE_IDS = Object.keys(NICHES) as NicheId[]
export const START_NICHES: NicheId[] = ['pet', 'home', 'kitchen', 'gadgets']

// ---------------------------------------------------------------------------
// Price tiers
// ---------------------------------------------------------------------------
export interface PriceTierDef { id: PriceTier; name: string; icon: string; mult: number; cvr: number; blurb: string }
export const PRICE_TIERS: Record<PriceTier, PriceTierDef> = {
  budget: { id: 'budget', name: 'Budget', icon: '🪙', mult: 0.7, cvr: 1.25, blurb: 'Undercut everyone. Easy yes, thin margins.' },
  standard: { id: 'standard', name: 'Standard', icon: '🏷️', mult: 0.95, cvr: 1.0, blurb: 'Priced like the market. The safe default.' },
  premium: { id: 'premium', name: 'Premium', icon: '💎', mult: 1.35, cvr: 0.72, blurb: 'Fat margins, fewer buyers. Luxury angles barely flinch.' },
}
export const PRICE_TIER_IDS: PriceTier[] = ['budget', 'standard', 'premium']

/** Round to a charm price ending in .99 */
export const charmPrice = (x: number) => Math.max(0.99, Math.round(x) - 0.01)

/** Selling price for a tier (perceived value × tier multiplier, rounded to x.99). */
export function priceFor(product: Product, tier: PriceTier): number {
  return charmPrice(product.perceivedValue * PRICE_TIERS[tier].mult)
}
/** [budget price, premium price] for "price range" labels. */
export function priceRange(product: Product): [number, number] {
  return [priceFor(product, 'budget'), priceFor(product, 'premium')]
}

export interface CostOptions { features?: readonly FeatureId[]; size?: SizeId }
/**
 * Landed unit cost = cogs + shipping + 25% duty on cogs.
 * sourcing_agent −5%, warehouse_3pl −15% on standard+ launches.
 */
export function landedCost(product: Product, opts: CostOptions = {}): number {
  let c = product.cogs + product.shipCost + 0.25 * product.cogs
  const f = opts.features ?? []
  if (f.includes('sourcing_agent')) c *= 0.95
  if (f.includes('warehouse_3pl') && opts.size && opts.size !== 'test') c *= 0.85
  return Math.round(c * 100) / 100
}

// ---------------------------------------------------------------------------
// Friendly labels for hidden stats (UI)
// ---------------------------------------------------------------------------
export function competitionLabel(p: Product): { label: 'Low' | 'Medium' | 'High' | 'Brutal'; tone: 'good' | 'info' | 'warn' | 'bad' } {
  if (p.competitors <= 10) return { label: 'Low', tone: 'good' }
  if (p.competitors <= 25) return { label: 'Medium', tone: 'info' }
  if (p.competitors <= 50) return { label: 'High', tone: 'warn' }
  return { label: 'Brutal', tone: 'bad' }
}
export function trendLabel(p: Product): { arrow: string; label: string } {
  switch (p.trendKind) {
    case 'rising': return { arrow: '↗', label: 'Rising' }
    case 'fad': return { arrow: '⚡', label: 'Fad' }
    case 'declining': return { arrow: '↘', label: 'Cooling' }
    default: return { arrow: '→', label: 'Evergreen' }
  }
}
/** Short, player-facing traits (never raw numbers). */
export function productTraits(p: Product): string[] {
  const t: string[] = []
  if (p.wow >= 0.75) t.push('🤩 Wow factor')
  if (p.problemSolving >= 0.75) t.push('🩹 Solves a real problem')
  if (p.giftable >= 0.7) t.push('🎁 Very giftable')
  if (p.impulse >= 0.8) t.push('⚡ Impulse buy')
  if (p.perceivedValue >= 90) t.push('💎 High ticket')
  if (p.repeatRate >= 0.1) t.push('🔁 Repeat buys')
  if (p.defectRate >= 0.2) t.push('⚠️ Flaky suppliers')
  if (p.claimRisk >= 0.4) t.push('🚩 Claims get flagged')
  if (p.perceivedValue <= 12) t.push('🪙 Tiny price tag')
  return t
}
