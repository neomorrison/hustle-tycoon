// OWNER: sim-meta. Trend names (HUD ticker) + display labels for niches / angles / platforms used in world toasts.
import type { AngleId, NicheId, PlatformId } from '../core/types'

export const NICHE_LABEL: Record<NicheId, { name: string; emoji: string }> = {
  pet: { name: 'Pet', emoji: '🐾' }, beauty: { name: 'Beauty', emoji: '💄' }, home: { name: 'Home', emoji: '🏠' },
  kitchen: { name: 'Kitchen', emoji: '🍳' }, fitness: { name: 'Fitness', emoji: '💪' }, wellness: { name: 'Wellness', emoji: '🧘' },
  car: { name: 'Car', emoji: '🚗' }, gadgets: { name: 'Gadgets', emoji: '🔌' }, baby: { name: 'Baby', emoji: '🍼' },
  kids: { name: 'Kids', emoji: '🧸' }, fashion: { name: 'Fashion', emoji: '👜' }, outdoor: { name: 'Outdoor', emoji: '🏕️' },
}
export const ANGLE_LABEL: Record<AngleId, { name: string; emoji: string }> = {
  pain_point: { name: 'Pain Point', emoji: '🩹' }, convenience: { name: 'Convenience', emoji: '⚡' }, gift: { name: 'Gift', emoji: '🎁' },
  aesthetic: { name: 'Aesthetic', emoji: '✨' }, social_proof: { name: 'Social Proof', emoji: '⭐' }, budget: { name: 'Budget', emoji: '💸' },
  wholesome: { name: 'Wholesome', emoji: '🐶' }, before_after: { name: 'Before/After', emoji: '🔁' }, luxury: { name: 'Luxury', emoji: '💎' },
}
export const PLATFORM_LABEL: Record<PlatformId, { name: string; emoji: string }> = {
  fadbook: { name: 'Fadbook', emoji: '📘' }, tiktak: { name: 'TikTak', emoji: '🎵' }, reels: { name: 'Instaglam Reels', emoji: '📸' },
  pinterestt: { name: 'Pinterestt', emoji: '📌' }, poogle: { name: 'Poogle Shopping', emoji: '🔍' }, tiktak_shop: { name: 'TikTak Shop', emoji: '🛒' },
}

/** Trend names per target (label = `${emoji} ${name}`). */
export const TREND_NAMES: { niche: Record<NicheId, readonly string[]>; angle: Record<AngleId, readonly string[]>; platform: Record<PlatformId, readonly string[]> } = {
  niche: {
    pet: ['Pet-parent mania', 'Dogfluencer summer', 'Cat-Tok takeover'],
    beauty: ['Glass-skin craze', 'Glow-up season', 'Skincare-Tok frenzy'],
    home: ['Cozy-core nesting', 'Clean-Tok obsession', 'Apartment glow-up wave'],
    kitchen: ['Kitchen-gadget fever', 'Meal-prep mania', 'Home-barista boom'],
    fitness: ['Gym-Tok grind', '75-Hard challenge wave', 'Home-workout boom'],
    wellness: ['Sleepmaxxing craze', 'Self-care Sunday wave', 'Posture panic'],
    car: ['Car-detailing ASMR', 'Road-trip revival', 'Commuter-comfort craze'],
    gadgets: ['Desk-setup envy', 'Gadget-Tok gold rush', 'Tiny-tech fever'],
    baby: ['Baby-haul wave', 'Gentle-parenting boom'],
    kids: ['Montessori mania', 'Screen-free toy craze'],
    fashion: ['Quiet-luxury moment', 'Y2K revival', 'Clean-girl aesthetic'],
    outdoor: ['Glamping gold rush', 'Touch-grass movement', 'Backyard glow-up wave'],
  },
  angle: {
    pain_point: ['Life-hack mania', '"Why didn\'t I buy this sooner" wave'],
    convenience: ['Lazy-genius era', 'One-click-life craze'],
    gift: ['Gift-guide frenzy', 'Just-because gifting wave'],
    aesthetic: ['That-girl aesthetic', 'Aesthetic-everything era'],
    social_proof: ['Review-Tok boom', '"TikTak made me buy it"'],
    budget: ['Dupe culture', 'Thrifty-flex wave'],
    wholesome: ['Wholesome-content wave', 'Feel-good feed era'],
    before_after: ['Transformation-Tuesday craze', 'Glow-up reveal wave'],
    luxury: ['Quiet-luxury flex', 'Treat-yourself economy'],
  },
  platform: {
    fadbook: ['Fadbook Marketplace revival', 'Boomer shopping spree'],
    tiktak: ['For-You-page gold rush', 'TikTak algorithm is generous'],
    reels: ['Reels bonus season', 'Instaglam creator boom'],
    pinterestt: ['Pinterestt planning season', 'Mood-board mania'],
    poogle: ['Search is king again', 'Poogle Shopping promo season'],
    tiktak_shop: ['TikTak Shop live-sale frenzy', 'Shop-tab mania'],
  },
}

export function targetLabel(kind: 'niche' | 'angle' | 'platform', target: string): { name: string; emoji: string } {
  const src = kind === 'niche' ? NICHE_LABEL : kind === 'angle' ? ANGLE_LABEL : PLATFORM_LABEL
  return (src as Record<string, { name: string; emoji: string }>)[target] ?? { name: target, emoji: '📈' }
}
