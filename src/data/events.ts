// OWNER: sim-meta. World event copy: news, seasons, influencers, press, copycats, flavour toasts.
// Placeholders: {name} launch/person name · {company} · {founder} · {product} · {platform} · {handle} · {outlet}.
import type { NicheId } from '../core/types'

export const fill = (t: string, vars: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))

/** Month-start toasts for notable months (index = calendar month, 0 = Jan). */
export const SEASON_TOASTS: Partial<Record<number, string>> = {
  0: '❄️ January slump: demand ×0.8 but CPMs are 20% cheaper. New-Year fitness & wellness resolutions spike!',
  1: "💘 Valentine's month: giftable products ×1.3. (Factories close for Chinese New Year weeks 1–2.)",
  4: "🌸 Mother's Day month: gifts, wellness & beauty ×1.25.",
  5: "☀️ Summer's here: outdoor products ×1.35 through August.",
  7: '🎒 Back to school: gadgets & kids ×1.2.',
  9: '🎃 Q4 begins: CPMs creep up ×1.1. Black Friday is coming…',
  // November has its own BFCM heads-up (week 3) and the BFCM toast (week 4) — a month toast too was one too many
  11: '🎄 Holiday rush: giftable products ×1.3, CPMs ×1.2.',
}

export const NEWS = {
  reels: {
    title: 'Instaglam launches Reels!',
    emoji: '📸',
    body: "Instaglam just cloned TikTak's vertical video and is paying creators to use it. Early advertisers get cheap reach while everyone else figures it out. Instaglam Reels is now in 🧪 Research.",
  },
  tiktak_shop: {
    title: 'TikTak Shop is here!',
    emoji: '🛒',
    body: 'TikTak added in-app checkout — buyers never leave the feed. Impulse products, budget prices and social proof are about to print. TikTak Shop is now in 🧪 Research.',
  },
  algo: {
    title: 'Fadbook algorithm update',
    emoji: '📘',
    toast: '📘 Fadbook pushed an algorithm update — CPMs ×1.2 for ~8 weeks. Lean on other platforms.',
    end: '📘 Fadbook CPMs settled back down after the algorithm update.',
  },
  ban_scare: {
    title: 'TikTak ban scare!',
    emoji: '🎵',
    body: "Politicians are threatening to ban TikTak. Creators are panicking, brands are pausing and reach is down ~30% for the next few months. Diversified sellers won't even notice.",
    end: '🎵 The TikTak ban scare blew over. Reach is back to normal.',
  },
}

/** Influencer handles by niche (parody). */
export const INFLUENCERS: Record<NicheId | 'any', readonly string[]> = {
  pet: ['@doggo.dad.daniel', '@purrfectpaola', '@tailwagtina', '@catlady.carmen'],
  beauty: ['@glowwithgina', '@skinbyseo', '@dewydaniela', '@makeupmarco'],
  home: ['@cozycornercleo', '@cleantok.cass', '@tinyflat.tomas'],
  kitchen: ['@mealprepmo', '@chefinashoebox', '@snacksbysunny'],
  fitness: ['@liftwithlena', '@chadlifts', '@coach.kofi.fit'],
  wellness: ['@sleepyselfcare', '@zenwithzara', '@posture.pete'],
  car: ['@detailingdom', '@roadtrip.rae', '@carasmr.carlos'],
  gadgets: ['@gadgetgabe', '@desksetup.dana', '@techtok.tariq'],
  baby: ['@momhacks.daily', '@dadjokes.and.diapers', '@nurserynina'],
  kids: ['@playtime.priya', '@montessorimama', '@toyreview.tyler'],
  fashion: ['@thriftqueen.tia', '@fitcheck.felix', '@quietlux.lou'],
  outdoor: ['@glampgirl.gem', '@trail.tobias', '@backyard.bea'],
  any: ['@viralfinds.vic', '@tiktakmademebuyit', '@dealsbydestiny', '@unboxwithuma'],
}

export const COPYCATS: readonly string[] = [
  'DealzHub247', 'ViralFindsCo', 'ShopNowBuyNow', 'TrendyGadgetz', 'BestPricezz', 'CoolStuff4U', 'MegaMartXpress', 'WowFindsDaily',
]

export const PRESS_OUTLETS: readonly string[] = [
  'BuzzFreed', 'Business Insidr', 'TechCrunchy', 'Forbz', 'Mashabl', 'The Morning Hustle podcast', 'Good Morning Americana', 'Fast Compny',
]
export const PRESS_HEADLINES: readonly string[] = [
  'The fry cook who became an e-com mogul',
  '{company}: the brand everyone is secretly buying from',
  "Meet the founder who quit flipping burgers at McDoodle's",
  '10 stores to watch this year (we ranked {company} #4)',
  'How {founder} turns $700 into five figures',
  'Inside {company}, the scrappiest store on the internet',
]

export const WINDFALLS: readonly string[] = [
  '🧾 Tax refund came through',
  '🏆 Won a Shopifly hackathon side prize',
  '📦 Supplier credited you for a late shipment',
  '💳 Payment processor refunded a double fee',
  '🎰 Found cash in an old PayPals account',
]

export const BUZZ_GOOD: readonly string[] = [
  '🧵 A Reddot thread called {company} "actually legit". Brand +{n}.',
  '📦 A customer\'s unboxing video blew up (for the right reasons). Brand +{n}.',
  '💌 A customer mailed a handwritten thank-you card. Brand +{n}.',
]
export const BUZZ_BAD: readonly string[] = [
  '🧵 A Reddot thread roasted your shipping times. Brand −{n}.',
  '😬 Someone duetted your ad with "found it on AliExprez for $3". Brand −{n}.',
  '⭐ A one-star review about the packaging went semi-viral. Brand −{n}.',
]

export const FLAVOR: { basement: readonly string[]; dayJob: readonly string[]; any: readonly string[]; office: readonly string[]; rich: readonly string[] } = {
  basement: [
    '📞 Mom: "Are you eating real food down there, or just product samples?"',
    '📦 Mom signed for 14 packages today and would like to discuss it at dinner.',
    '📞 Mom: "Your cousin got promoted. Just saying."',
    '🧺 Mom did your laundry and found three ad-creative storyboards in your pockets.',
    '🍕 Mom left pizza rolls on the stairs. Productivity +1.',
  ],
  dayJob: [
    '🍔 Manager Gary: "Can you cover a double on Saturday?" (You said yes. Again.)',
    '🍟 You dreamt about ROAS during the lunch rush and gave someone 40 nuggets.',
    '🍔 A customer asked if you\'re "that guy from the TikTak ads".',
    '🍦 The McFlurry machine is broken. Some things never change.',
    '🧢 Your McDoodle\'s hat now has a lucky-launch sticker on it.',
  ],
  any: [
    '☕ Coffee #4. The spreadsheet is starting to make sense.',
    '📱 Your screen time report says 11 hours of "research".',
    '💬 Your group chat is 90% product links now.',
    '🌙 You caught yourself saying "that hook slaps" out loud at 2 am.',
    '📈 You refreshed Shopifly analytics 47 times today. New record.',
    '📞 Grandma called to ask what a "dropship" is. You tried your best.',
  ],
  office: [
    '🪴 Someone bought an office plant. It is thriving. Unlike your inbox.',
    '🎧 Office playlist war: lo-fi beats vs. hyperpop. Lo-fi is winning.',
    '🍩 Donut Friday is now a sacred company tradition.',
    '📸 Someone filmed a hook in the bathroom again. It tested great.',
  ],
  rich: [
    '🛥️ A yacht broker cold-emailed you. You laughed. Then you opened the brochure.',
    '🏦 Your bank assigned you a "relationship manager". Fancy.',
    "🍔 You drove past McDoodle's today. Gary waved.",
  ],
}

export const STAFF_MOMENTS: readonly string[] = [
  '🍕 {name} ordered pizza for the team. Morale: excellent.',
  '🎂 It\'s {name}\'s birthday — cake in the break room.',
  '💡 {name} had a 2 am shower idea and it\'s actually good.',
  '📚 {name} binge-watched ad teardowns all weekend.',
  '🏆 {name} won the office "best hook of the week" trophy.',
]
