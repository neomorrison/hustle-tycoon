// OWNER: sim-meta. Store features ("apps") — researched in the Lab, then toggled on/off in 🧩 Features.
// Only ACTIVE features (s.activeFeatures) cost their monthly fee and apply to new launches.
// Effect numbers mirror DESIGN §3–§5 (the sim-core formulas read the FeatureId, these are the player-facing words).
import type { FeatureId } from '../core/types'

export type FeatureGroup = 'conversion' | 'aov' | 'retention' | 'creative' | 'ads' | 'supply'

export interface FeatureDef {
  id: FeatureId
  name: string
  emoji: string
  group: FeatureGroup
  /** monthly app fee while active */
  monthly: number
  /** short effect line, e.g. "CVR +12%" */
  effect: string
  /** one-sentence flavour / real-world lesson */
  blurb: string
  /** research node that unlocks it */
  researchId: string
}

const f = (id: FeatureId, name: string, emoji: string, group: FeatureGroup, monthly: number, effect: string, blurb: string, researchId: string): FeatureDef =>
  ({ id, name, emoji, group, monthly, effect, blurb, researchId })

export const FEATURES: Record<FeatureId, FeatureDef> = {
  reviews: f('reviews', 'Reviews app', '⭐', 'conversion', 15, 'CVR +12%',
    'Stars under the Add to Cart button. Nobody buys from a page with zero reviews.', 'feat_reviews'),
  trust_badges: f('trust_badges', 'Trust badges', '🛡️', 'conversion', 10, 'CVR +5%',
    '"Secure checkout", "30-day money back" — tiny badges, real lift.', 'feat_trust_badges'),
  speed_booster: f('speed_booster', 'Speed booster', '⚡', 'conversion', 25, 'CVR +4%',
    'Every extra second of load time loses buyers. This app compresses everything.', 'feat_speed_booster'),
  bundles: f('bundles', 'Bundles', '🎁', 'aov', 20, 'AOV +12%',
    '"Buy 2, get 1 half off." Same ad click, bigger basket.', 'feat_bundles'),
  upsell: f('upsell', 'Post-purchase upsell', '➕', 'aov', 30, 'AOV +6%',
    'One-click add-on after checkout. Customers already said yes once.', 'feat_upsell'),
  email_flows: f('email_flows', 'Email flows', '📧', 'retention', 50, 'Fans ×1.5 + repeat orders',
    'Welcome, abandoned-cart and win-back emails. Free revenue from people who already know you.', 'feat_email_flows'),
  chargeback_shield: f('chargeback_shield', 'Chargeback shield', '🧯', 'conversion', 40, 'Complaint 🔴 penalty ×0.5',
    'Tracking updates and fast refunds before customers call their bank.', 'feat_chargeback_shield'),
  ugc_library: f('ugc_library', 'UGC library', '🎥', 'creative', 80, 'Hooks 🎬 & Visuals 📸 ×1.15',
    'A vault of real-customer videos. Authentic beats polished on the feed.', 'feat_ugc_library'),
  ai_copywriter: f('ai_copywriter', 'AI copywriter', '🤖', 'creative', 60, 'Copy ✍️ ×1.15',
    'Fifty headline variations before your coffee cools. You still pick the good one.', 'feat_ai_copywriter'),
  lookalikes: f('lookalikes', 'Lookalike audiences', '👯', 'ads', 50, 'Fadbook ROAS ×1.05',
    'Feed your buyer list to the algorithm and it finds more people just like them.', 'feat_lookalikes'),
  automation: f('automation', 'Ad automation', '⚙️', 'ads', 150, 'Scaling hurts ROAS less',
    'Rules that nudge budgets up slowly instead of shocking the algorithm.', 'feat_automation'),
  influencer_network: f('influencer_network', 'Influencer network', '🤳', 'creative', 200, 'Influencers 🤳 ×1.3, better deals',
    'A roster of creators on speed dial. Better fits, better rates.', 'feat_influencer_network'),
  sourcing_agent: f('sourcing_agent', 'Sourcing agent', '🧑‍💼', 'supply', 250, 'Upfront −5%, unit cost −5%, complaints ×0.75',
    'Someone on the ground at the factory who actually checks the samples. CNY-proof.', 'supply_sourcing_agent'),
  warehouse_3pl: f('warehouse_3pl', '3PL warehouse', '🏭', 'supply', 400, 'Unit cost −15% (Standard+), Go-bulk calls',
    'Stock lives near your buyers: faster shipping, cheaper per unit.', 'supply_warehouse_3pl'),
  private_label: f('private_label', 'Private label', '🏷️', 'supply', 300, 'CVR +10%',
    'Your logo on the box. Customers trust a brand more than a random listing.', 'supply_private_label'),
}

export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[]
export const featureDef = (id: FeatureId): FeatureDef => FEATURES[id]
export const FEATURE_GROUP_LABELS: Record<FeatureGroup, string> = {
  conversion: 'Conversion', aov: 'Order value', retention: 'Retention', creative: 'Creative', ads: 'Ads', supply: 'Supply chain',
}
