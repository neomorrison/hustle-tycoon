// OWNER: sim-core. Coach Kev's review one-liners — real numbers, real lessons, cheap jokes.
// Placeholders: {v} metric value · {be} break-even ROAS · {cpa} cost per order · {cpc} cost per click
//               {margin} margin per order · {price} unit price · {cpm} CPM · {plat} platform name
import type { Verdict } from '../core/types'

export type Metric = 'ctr' | 'cvr' | 'aov' | 'roas'
export type Bucket = 'bad' | 'meh' | 'good' | 'great'

/** Score (1..10) → bucket. */
export const bucketFor = (score: number): Bucket => (score < 4 ? 'bad' : score < 6 ? 'meh' : score < 8.5 ? 'good' : 'great')

export const QUOTES: Record<Metric, Record<Bucket, string[]>> = {
  ctr: {
    bad: [
      '{v} CTR. People scrolled past it like a gym ad in January. The hook needs work.',
      '{v} CTR — the thumb didn\'t even slow down. You get about 3 seconds; you used them on a logo.',
      '{v} CTR. Your ad is basically wallpaper. Open with the product DOING something.',
      '{v} CTR. Even your mom scrolled past, and she likes everything you post.',
      '{v} CTR — feed average is about 1%. At {cpc} a click you\'re renting eyeballs that never look.',
    ],
    meh: [
      '{v} CTR — fine. Forgettable. The side salad of ads.',
      '{v} CTR. Some clicks, zero buzz. A sharper hook pays for itself in cheaper clicks.',
      '{v} CTR — middle of the feed. Test three new openers before you think about scaling.',
      '{v} CTR. It works the way decaf works.',
      '{v} CTR at {cpc} per click. Not bleeding, not flexing.',
    ],
    good: [
      '{v} CTR — thumbs are slowing down. That hook has legs.',
      '{v} CTR. Above feed average, so every click costs less ({cpc}).',
      '{v} CTR — a legit scroll-stopper. Your CPC sends its regards.',
      '{v} CTR. People are curious, and curiosity is the cheapest traffic there is.',
    ],
    great: [
      '{v} CTR — thumbs are STOPPING. That hook slaps.',
      '{v} CTR?! The comments are just people tagging their friends.',
      '{v} CTR. The algorithm is handing you clicks like free samples at Costco. {cpc} each!',
      '{v} CTR — the kind of number agencies screenshot for their case studies.',
      '{v} CTR — this creative is a cheat code. Refresh it before fatigue finds it.',
    ],
  },
  cvr: {
    bad: [
      '{v} CVR — the page feels sketchy. Reviews? Trust badges? One real photo?',
      '{v} CVR. They clicked, looked and bounced. The page never answers "why this one?"',
      '{v} CVR — you\'re paying for window shoppers. {cpa} in ads per order is a horror movie.',
      '{v} CVR. The product page has "my cousin built it" energy. Nobody stays.',
      '{v} CVR — better copy and trust would fix this faster than more traffic. More traffic just loses money faster.',
    ],
    meh: [
      '{v} CVR — some buyers, lots of maybes. Sharpen the headline and add an FAQ.',
      '{v} CVR. The page is okay. "Okay" doesn\'t pay rent.',
      '{v} CVR — decent. A guarantee or a bundle could tip the fence-sitters.',
      '{v} CVR. Visitors like it. They just don\'t love it enough for {price} yet.',
      '{v} CVR means {cpa} in ads per order. Cut that and the whole launch flips.',
    ],
    good: [
      '{v} CVR — the page is doing its job. Visitors trust you.',
      '{v} CVR. That copy closes deals while you sleep.',
      '{v} CVR — typical dropship stores sit at 1–2%. You\'re beating them.',
      '{v} CVR. Clear offer, clear photos, clear Add to Cart. Chef\'s kiss.',
    ],
    great: [
      '{v} CVR — people are buying like it\'s the last one on Earth.',
      '{v} CVR?! That\'s Amazin-level conversion from a store built in Mom\'s basement.',
      '{v} CVR — this product page should be taught in schools.',
      '{v} CVR. Every visitor is basically a customer. Don\'t touch a single pixel.',
      '{v} CVR, only {cpa} in ads per order. That is a money printer with a Buy button.',
    ],
  },
  aov: {
    bad: [
      '{v} per order. After ads and shipping there\'s barely a margin left to lick.',
      '{v} AOV — cheap products need cheap clicks, and clicks are never cheap.',
      '{v} AOV. Bundle it, upsell it or raise the price. Paid ads need room to breathe.',
      '{v} AOV — that\'s selling lemonade with a Super Bowl ad budget.',
      '{v} basket, {margin} margin per order. Every ad dollar has to work a double shift.',
    ],
    meh: [
      '{v} AOV — workable. A "buy 2, save 15%" bundle would lift it.',
      '{v} per order. Not bad. Not quit-McDoodle\'s good either.',
      '{v} AOV leaves {margin} per order to pay for ads. Tight, but alive.',
      '{v} AOV. Try an upsell — people who buy one usually want a spare.',
    ],
    good: [
      '{v} AOV — a healthy basket with room to pay for ads and still profit.',
      '{v} per order. The offer is pulling its weight.',
      '{v} AOV — customers are grabbing extras. Love to see it.',
      '{v} AOV, {margin} margin per order. That\'s a cushion, not a rounding error.',
    ],
    great: [
      '{v} AOV — whales in the cart! Every order pays for a pile of clicks.',
      '{v} per order?! People are buying for their whole group chat.',
      '{v} AOV — premium pricing and nobody even blinked.',
      '{v} AOV. With {margin} margin per order you can outbid anyone for ad space.',
    ],
  },
  roas: {
    bad: [
      'ROAS {v} vs {be} break-even. Every $1 in ads loses money. Kill it before it kills you.',
      'ROAS {v}. You\'re paying {plat} to take your money. Cut it fast.',
      'ROAS {v} when you need {be}. That\'s a donation, not a business.',
      'ROAS {v} — setting cash on fire, but in a trendy way.',
      'ROAS {v} vs {be}. Losers don\'t get better with time. They just get more expensive.',
    ],
    meh: [
      'ROAS {v} vs {be} break-even. Roughly breaking even — fix one metric and it flips.',
      'ROAS {v}. Break-even is {be}. You\'re working for free, which you already do at McDoodle\'s.',
      'ROAS {v} vs {be} — close. A creative refresh or a better offer could push it over.',
      'ROAS {v}. Scaling this would just scale the sweat.',
    ],
    good: [
      'ROAS {v} vs {be} break-even — profitable. Every ad dollar comes back with friends.',
      'ROAS {v}, comfortably over {be}. That\'s a real business, baby.',
      'ROAS {v} vs {be}. Profitable and scalable. Watch the creative fatigue.',
      'ROAS {v}. Your accountant (Mom) is proud.',
    ],
    great: [
      'ROAS {v} vs {be} break-even — printing money.',
      'ROAS {v}! Scale it until something breaks.',
      'ROAS {v} when you only need {be}. This is the one. Start drafting your McDoodle\'s resignation.',
      'ROAS {v}. The ad account is a slot machine that only pays out.',
      'ROAS {v} vs {be} — margins so fat you could buy the ad platform.',
    ],
  },
}

/** Fill a template. */
export function fillQuote(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)
}

/** Pick a quote for a metric score; `r` in [0,1) chooses the template (pass a seeded random). */
export function quoteFor(metric: Metric, score: number, vars: Record<string, string>, r: number): string {
  const list = QUOTES[metric][bucketFor(score)]
  return fillQuote(list[Math.min(list.length - 1, Math.floor(r * list.length))], vars)
}

export const VERDICTS: Record<Verdict, { label: string; emoji: string; tone: 'gold' | 'good' | 'warn' | 'bad'; lines: string[] }> = {
  winner: {
    label: 'WINNER', emoji: '🏆', tone: 'gold',
    lines: ['Certified banger. Scale it, protect it, refresh it.', 'This is the one you tell people about at parties.', 'The ad account just became your favourite employee.'],
  },
  solid: {
    label: 'Solid', emoji: '✅', tone: 'good',
    lines: ['Profitable and steady. Feed it, don\'t overfeed it.', 'Not viral, but it pays the bills. Mom approves.', 'A reliable earner. Watch for fatigue and keep it fresh.'],
  },
  breakeven: {
    label: 'Break-even', emoji: '😐', tone: 'warn',
    lines: ['Coin-flip territory. One better metric and it\'s a winner.', 'You made the ad platforms some money. Mostly them.', 'Meh. The review screen is being polite.'],
  },
  flop: {
    label: 'Flop', emoji: '💀', tone: 'bad',
    lines: ['Kill it early and read the post-mortem. Every flop teaches a combo.', 'The market has spoken, and it said "no thanks".', 'Even the bots didn\'t click. Cut losses fast.'],
  },
}
