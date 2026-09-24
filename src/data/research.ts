// OWNER: sim-meta. The Lab — research tree (DESIGN §7). Costs are 🟣 RP (+ cash for the big ones).
// `unlocks` keys: angle | niche | platform | size | feature | boost. Boost ids are read with hasResearch().
import type { ResearchNode } from '../sim/research'

type Cat = ResearchNode['category']
const n = (
  category: Cat, id: string, icon: string, name: string, cost: number, description: string,
  unlocks: Record<string, string>, opts: { cash?: number; requires?: string[]; minOffice?: number } = {},
): ResearchNode => ({ id, name, description, category, cost, cash: opts.cash ?? 0, requires: opts.requires ?? [], unlocks, minOffice: opts.minOffice, icon })

export const RESEARCH: readonly ResearchNode[] = [
  // ---------------------------------------------------------------- angles (= GDT genres)
  n('angle', 'angle_aesthetic', '✨', 'Aesthetic angle', 30,
    'Make it pretty, make it scroll-stopping. Visual-first products on visual-first apps.', { angle: 'aesthetic' }),
  n('angle', 'angle_budget', '💸', 'Budget angle', 45,
    'Cheaper than a latte. Impulse buys that live and die on price — TikTak Shop gold.', { angle: 'budget' }),
  n('angle', 'angle_social_proof', '⭐', 'Social Proof angle', 45,
    '"12,000 happy customers can\'t be wrong." Needs a reviews app to flex.', { angle: 'social_proof' }, { requires: ['feat_reviews'] }),
  n('angle', 'angle_wholesome', '🐶', 'Wholesome angle', 60,
    'Pets, parents and warm fuzzies. The algorithm loves a good happy-cry.', { angle: 'wholesome' }),
  n('angle', 'angle_before_after', '🔁', 'Before / After angle', 110,
    'Split-screen transformations. Converts like crazy — and gets ad accounts banned.', { angle: 'before_after' }, { requires: ['angle_aesthetic'] }),
  n('angle', 'angle_luxury', '💎', 'Luxury angle', 180,
    'Premium price, premium vibes. Needs gorgeous visuals and a product worth $60+.', { angle: 'luxury' }, { cash: 1500, requires: ['angle_aesthetic', 'angle_social_proof'] }),

  // ---------------------------------------------------------------- niches
  n('niche', 'niche_beauty', '💄', 'Beauty niche', 30,
    'Glow-ups sell themselves. Huge on visual apps — watch the skincare claims.', { niche: 'beauty' }),
  n('niche', 'niche_fitness', '💪', 'Fitness niche', 45,
    "New Year's resolutions = January gold rush. Summer bodies = spring rush.", { niche: 'fitness' }),
  n('niche', 'niche_car', '🚗', 'Car niche', 45,
    'Dads with detailing hobbies and commuters with crumbs. Fadbook loves them.', { niche: 'car' }),
  n('niche', 'niche_wellness', '🧘', 'Wellness niche', 60,
    'Sleep, stress, posture — pain points everywhere, and people pay to fix them.', { niche: 'wellness' }, { requires: ['niche_fitness'] }),
  n('niche', 'niche_outdoor', '🏕️', 'Outdoor niche', 70,
    'Wildly seasonal. Bug zappers go brrr in July, heated vests in December.', { niche: 'outdoor' }, { requires: ['niche_fitness'] }),
  n('niche', 'niche_kids', '🧸', 'Kids niche', 75,
    'Parents buy fast and grandparents buy faster. A Q4 gift monster.', { niche: 'kids' }),
  n('niche', 'niche_baby', '🍼', 'Baby niche', 75,
    'Sleep-deprived parents with credit cards at 3 am. Trust is everything.', { niche: 'baby' }, { requires: ['niche_kids'] }),
  n('niche', 'niche_fashion', '👜', 'Fashion niche', 90,
    'Trend-driven and fast-moving. Lives and dies on TikTak and Reels.', { niche: 'fashion' }, { requires: ['niche_beauty'] }),

  // ---------------------------------------------------------------- platforms
  n('platform', 'plat_tiktak', '🎵', 'TikTak ads', 20,
    'Cheap reach, short attention spans, young buyers. Hooks are king here.', { platform: 'tiktak' }),
  n('platform', 'plat_reels', '📸', 'Instaglam Reels', 70,
    "Instaglam's answer to TikTak. Aesthetic, luxury and gift products shine.", { platform: 'reels' }, { requires: ['plat_tiktak'] }),
  n('platform', 'plat_pinterestt', '📌', 'Pinterestt ads', 110,
    'Planners and mood-boarders. Cheap clicks, slow burn, barely any ad fatigue.', { platform: 'pinterestt' }, { requires: ['plat_tiktak'] }),
  n('platform', 'plat_poogle', '🔍', 'Poogle Shopping', 150,
    'Search intent: people already want it. Pricey clicks, killer conversion.', { platform: 'poogle' }, { cash: 1000, requires: ['plat_pinterestt'] }),
  n('platform', 'plat_tiktak_shop', '🛒', 'TikTak Shop', 160,
    'In-app checkout. Impulse buys at the speed of a thumb. Budget & social proof rule.', { platform: 'tiktak_shop' }, { cash: 1500, requires: ['plat_tiktak'] }),

  // ---------------------------------------------------------------- launch sizes (= GDT game sizes)
  n('size', 'size_standard', '📦', 'Standard launches', 90,
    '5× the ad budget, 2.5× the expectations and a longer build. Needs a team of three to keep up.', { size: 'standard' }, { minOffice: 2 }),
  n('size', 'size_big', '🚚', 'Big launches', 300,
    'Real inventory, real spend, real headlines. ×6.5 expectations — bring a team of six.', { size: 'big' }, { cash: 5000, requires: ['size_standard'], minOffice: 3 }),
  n('size', 'size_mega', '🦄', 'Mega launches', 1200,
    "Brand-defining launches. ×13 expectations, over 100× a Test launch's ad budget — and the stress to match.", { size: 'mega' }, { cash: 25000, requires: ['size_big'], minOffice: 5 }),

  // ---------------------------------------------------------------- store features (toggle in 🧩 Features)
  n('feature', 'feat_reviews', '⭐', 'Reviews app', 25,
    'CVR +12%. Stars under the Add to Cart button. Nobody trusts zero reviews.', { feature: 'reviews' }),
  n('feature', 'feat_trust_badges', '🛡️', 'Trust badges', 25,
    'CVR +5%. "Secure checkout" and money-back badges calm nervous buyers.', { feature: 'trust_badges' }),
  n('feature', 'feat_speed_booster', '⚡', 'Speed booster', 40,
    'CVR +4%. Pages load before thumbs get bored.', { feature: 'speed_booster' }),
  n('feature', 'feat_bundles', '🎁', 'Bundles', 40,
    'AOV +12%. "Buy 2, get 1 half off" — same click, bigger basket.', { feature: 'bundles' }),
  n('feature', 'feat_upsell', '➕', 'Post-purchase upsell', 50,
    'AOV +6%. One-click add-on right after checkout.', { feature: 'upsell' }, { requires: ['feat_bundles'] }),
  n('feature', 'feat_email_flows', '📧', 'Email flows', 60,
    'Fans grow 1.5× faster and bring repeat orders. Your list is your moat.', { feature: 'email_flows' }, { requires: ['feat_reviews'] }),
  n('feature', 'feat_chargeback_shield', '🧯', 'Chargeback shield', 70,
    'Halves the damage from complaints 🔴 and chargeback waves.', { feature: 'chargeback_shield' }, { requires: ['feat_trust_badges'] }),
  n('feature', 'feat_ugc_library', '🎥', 'UGC library', 80,
    'Hooks 🎬 & Visuals 📸 ×1.15. Real customers on camera beat studio polish.', { feature: 'ugc_library' }, { requires: ['plat_tiktak'] }),
  n('feature', 'feat_lookalikes', '👯', 'Lookalike audiences', 90,
    'Fadbook ROAS ×1.05. Feed the algorithm your buyers; it finds their twins.', { feature: 'lookalikes' }, { requires: ['feat_email_flows'] }),
  n('feature', 'feat_ai_copywriter', '🤖', 'AI copywriter', 120,
    'Copy ✍️ ×1.15. Fifty headlines before your coffee cools.', { feature: 'ai_copywriter' }, { cash: 500, requires: ['boost_copy_bootcamp'] }),
  n('feature', 'feat_influencer_network', '🤳', 'Influencer network', 140,
    'Influencers 🤳 ×1.3 and better influencer deals when creators come knocking.', { feature: 'influencer_network' }, { cash: 2500, requires: ['feat_ugc_library'] }),
  n('feature', 'feat_automation', '⚙️', 'Ad automation', 150,
    'Scale budgets without tanking ROAS. Rules > panic.', { feature: 'automation' }, { cash: 2000, requires: ['feat_lookalikes'] }),

  // ---------------------------------------------------------------- supply chain
  n('supply', 'supply_sourcing_agent', '🧑‍💼', 'Sourcing agent', 100,
    'Upfront −5%, unit cost −5%, complaints ×0.75 — and Chinese New Year stops hurting.', { feature: 'sourcing_agent' }, { cash: 1500 }),
  n('supply', 'supply_backup_supplier', '🔄', 'Backup supplier', 80,
    'Stockouts become rare and air-freight restocks cost half.', { boost: 'backup_supplier' }, { requires: ['supply_sourcing_agent'] }),
  n('supply', 'supply_warehouse_3pl', '🏭', '3PL warehouse', 250,
    'Unit cost −15% on Standard+ launches and unlocks "Go bulk" calls on hits.', { feature: 'warehouse_3pl' }, { cash: 10000, requires: ['supply_sourcing_agent'], minOffice: 4 }),
  n('supply', 'supply_private_label', '🏷️', 'Private label', 400,
    'CVR +10%. Your logo, your packaging, your brand — not another random listing.', { feature: 'private_label' }, { cash: 20000, requires: ['supply_warehouse_3pl'] }),

  // ---------------------------------------------------------------- boosts
  n('boost', 'boost_copy_bootcamp', '✍️', 'Copy bootcamp', 50,
    'Copy ✍️ points ×1.1 and the whole team gets +4 Copy right now.', { boost: 'copy_bootcamp' }),
  n('boost', 'boost_hook_lab', '🎬', 'Hook lab', 60,
    'Hooks 🎬 points ×1.1. Three-second openers, A/B tested to death.', { boost: 'hook_lab' }, { requires: ['plat_tiktak'] }),
  n('boost', 'boost_data_dashboard', '📊', 'Data dashboard', 70,
    'Shows combo hints (✓/✗) in New Launch for niches you already sell in.', { boost: 'data_dashboard' }),
  n('boost', 'boost_market_radar', '📡', 'Market radar', 90,
    'See trends 2 weeks before they hit, and they stick around 3 weeks longer.', { boost: 'market_radar' }, { requires: ['boost_data_dashboard'] }),
  n('boost', 'boost_crisis_pr', '📣', 'Crisis PR', 80,
    'Ad bans half as likely, agency accounts half price, chargeback waves halved.', { boost: 'crisis_pr' }, { requires: ['feat_chargeback_shield'] }),
  n('boost', 'boost_growth_hacks', '🚀', 'Growth hacks', 110,
    'Viral odds ×1.6 and the press calls more often. Stunts, stitches and duets.', { boost: 'growth_hacks' }, { requires: ['boost_hook_lab'] }),
  n('boost', 'boost_recruiter', '🤝', 'Recruiter network', 60,
    '5 candidates a month with +8 stats. Better people, same pizza budget.', { boost: 'recruiter' }, { cash: 1000, minOffice: 2 }),
  n('boost', 'boost_mentorship', '🎓', 'Mentorship program', 100,
    'Training 25% cheaper and +3 bigger, and everyone earns 25% more XP.', { boost: 'mentorship' }, { minOffice: 2 }),
]

export const RESEARCH_BY_ID: Record<string, ResearchNode> = Object.fromEntries(RESEARCH.map(r => [r.id, r]))

export const RESEARCH_CATEGORIES: readonly { id: Cat; label: string; emoji: string }[] = [
  { id: 'angle', label: 'Angles', emoji: '🎯' },
  { id: 'niche', label: 'Niches', emoji: '🗂️' },
  { id: 'platform', label: 'Platforms', emoji: '📱' },
  { id: 'size', label: 'Launch sizes', emoji: '📦' },
  { id: 'feature', label: 'Store features', emoji: '🧩' },
  { id: 'supply', label: 'Supply chain', emoji: '🚢' },
  { id: 'boost', label: 'Boosts', emoji: '⚗️' },
]
