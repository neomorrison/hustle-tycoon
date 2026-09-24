// Headless balance & pacing bots (DESIGN §10). Plays full games day by day through the real sim (tickDay + actions).
//
//   npm run sim                               all difficulties × expert/casual/random, 6 seeds × 8 years → target check + pacing
//   npm run sim -- 8 12 --diff=normal         years, seeds, one difficulty (--bots=expert,casual to pick personalities)
//   npm run sim -- --tables                   per-seed yearly tables
//   npm run sim -- --verdicts                 median profit per launch by size × review verdict
//   npm run sim -- --timeline                 the first 15 real minutes (1× = 0.5 s/day) of an expert run, beat by beat
//                                             (--seed=N offset, --minutes=N, --diff=easy|normal|hard)
//   npm run sim -- --ablation                 expert without research / staff / apps / office moves (does each system matter?)
//   npm run sim -- --toasts                   what fills the message feed (per real minute); --echo = toasts caused by the
//                                             player's own clicks; --emoji groups by leading emoji; --top=N rows
// Debug env: DUMP=1|casual (every launch of the first seed; DUMP_ALL=1 all seeds, DUMP_N=n first n) · TRACE=<seed>
//   (monthly cash/burn/team trace; TRACE_BOT=casual) · BK=1 (what drained the cash before each bankruptcy) · FW=1
//   (first-winner launch numbers) · BURST=1 / BURST2=1 (print the densest 10-second message window, onboarding / steady).
//
// Personalities
//   expert — learns combos from post-mortems (Playbook), near-ideal sliders, kills losers, scales winners, refreshes,
//            researches with a plan, hires, moves up when launches pay for it, quits McDoodle's at 2× the paycheck.
//   casual — a sensible first-timer: reads product traits and angle/platform blurbs, sliders "roughly right" from the
//            angle's hint (then the Playbook), usually takes the kill call, scales sometimes, researches whatever is shiny.
//   random — random products/angles/platforms/sliders, never kills or scales (decisions expire), random research.
import type { AngleId, ComboRating, Difficulty, GameState, LaunchConfig, PlatformId, PriceTier, Product, SizeId, Verdict } from '../src/core/types'
import { createNewGame } from '../src/sim/newGame'
import { tickDay } from '../src/sim'
import { launchNow, setStageSliders, startLaunch, startQC, estimateLaunch, teamPowerPerDay, devDaysFor, upfrontCost } from '../src/sim/launch'
import { resolveDecision, refreshCost, bulkCost } from '../src/sim/sales'
import { idealFocus, expectedPoints, previewEconomics, VERDICT_RANK } from '../src/sim/evaluate'
import { knownCombosFor } from '../src/sim/playbook'
import { moveOffice, quitDayJob, monthlyBurn, rejoinDayJob, resolveBankrupt } from '../src/sim/economy'
import { canResearch, research, researchLockReason, researchNodes, toggleFeature } from '../src/sim/research'
import { fire, hire, staffSlots } from '../src/sim/staff'
import { resolveModal } from '../src/sim/world'
import { PRODUCTS, priceFor, competitionLabel, trendLabel, productTraits } from '../src/data/catalog'
import { SIZES, SIZE_IDS } from '../src/data/sizes'
import { COMBO_MULT, anglePlatformRating, productAngleRating, productPlatformRating } from '../src/data/combos'
import { officeRent, officeMoveCost, MAX_OFFICE } from '../src/data/offices'
import { DAYS_PER_YEAR, monthOf, yearOf, monthName, weekOfMonth } from '../src/core/time'

type Personality = 'expert' | 'casual' | 'random'
interface Variant { noResearch?: boolean; noStaff?: boolean; noApps?: boolean; maxOffice?: number; label?: string }

/** 1× game speed: real seconds per in-game day (core/engine MS_PER_DAY). */
const SEC_PER_DAY = 0.5

// Bot-private RNG (bot choices never consume the game's RNG stream)
function mulberry(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------
type BeatKind = 'review' | 'postmortem' | 'decision' | 'modal' | 'sliders' | 'toast' | 'coach' | 'milestone' | 'research' | 'cash'
interface Beat { day: number; kind: BeatKind; major: boolean; text: string; echo?: boolean }
interface LaunchRow {
  id: string; name: string; size: SizeId; verdict: Verdict; overall: number; profit: number; killed: boolean
  startDay: number; launchDay: number; endDay: number; ratio: number; team: number; weeks: number
}
interface Track {
  firstReviewDay: number | null
  firstWinnerLaunch: number | null
  firstWinnerDay: number | null
  firstWinnerId: string | null
  quitDay: number | null
  millionDay: number | null
  officeDay: (number | null)[]
  sizeDay: Partial<Record<SizeId, number>>
  bankruptcies: number
  gameOverDay: number | null
  firstBankruptDay: number | null
  minCashY1: number
  overdraftDaysY1: number
  launches: LaunchRow[]
  beats: Beat[]
  sliderPauses: number
  maxFlopStreak: number
  /** days on which the world director/news/trends/viral fired (flags['w:lastEvent']) */
  worldEvents: number[]
  /** open decision cards per day (tray load), first 15 real minutes */
  trayLoad: number[]
  /** live launches per day, first 15 real minutes */
  liveCount: number[]
}

const RANK: Record<ComboRating, number> = { bad: 0, ok: 1, good: 2, great: 3 }
const flopish = (v: Verdict) => v === 'flop'

// ---------------------------------------------------------------------------
// What the New Launch dialog shows about a product (bots never read hidden stats)
// ---------------------------------------------------------------------------
const COMP_SCORE = { Low: 1, Medium: 0.9, High: 0.78, Brutal: 0.66 } as const
const TREND_SCORE: Record<string, number> = { Rising: 1.1, Fad: 1.04, Evergreen: 1, Cooling: 0.88 }
/** A player's read of a product from its card: price & break-even ROAS, competition label, trend arrow, trait badges. */
function visibleValue(s: GameState, p: Product, tier: PriceTier = 'standard', savvy = 1): number {
  const price = priceFor(p, tier)
  const be = previewEconomics(s, p.id, tier, 'test', s.activeFeatures).breakEvenRoas
  const traits = productTraits(p).join(' ')
  let v = Math.min(1.4, Math.max(0.2, 1.7 / be)) // lower break-even = more room for ad costs
  v *= COMP_SCORE[competitionLabel(p).label] ** savvy
  v *= (TREND_SCORE[trendLabel(p).label] ?? 1) ** savvy
  if (traits.includes('Wow factor')) v *= 1.15
  if (traits.includes('Impulse buy')) v *= 1.08
  if (traits.includes('Solves a real problem')) v *= 1.06
  if (traits.includes('Flaky suppliers')) v *= 1 - 0.1 * savvy
  if (traits.includes('Tiny price tag')) v *= 1 - 0.25 * savvy
  // impulse price points: $20–60 is the sweet spot for cold traffic
  v *= price < 15 ? 0.8 : price > 120 ? 0.8 : price > 70 ? 0.9 : 1
  return v
}

// ---------------------------------------------------------------------------
// Expert brain
// ---------------------------------------------------------------------------
function expertPrior(s: GameState, rng: () => number, p: Product, angle: AngleId, platform: PlatformId) {
  const k = knownCombosFor(s, p.id, angle, platform)
  // unknown combos: an expert reads product traits & platform blurbs — a noisy gut feeling
  const gut = (truth: ComboRating, hit: number): ComboRating => (rng() < hit ? truth : 'ok')
  const pa = k.productAngle ?? gut(productAngleRating(p, angle), 0.3)
  const ap = k.anglePlatform ?? gut(anglePlatformRating(angle, platform), 0.8) // platform cards describe their crowd
  const np = (!k.nicheTypical && k.nichePlatform) ? k.nichePlatform : gut(productPlatformRating(p, platform), 0.25)
  return { pa, ap, np, unknown: [k.productAngle, k.anglePlatform, k.nichePlatform].filter(x => !x).length }
}

/** Can the wallet run a launch of this size: upfront + `careful` weeks of ads + two months of bills (+ extra payroll)? */
function canCarry(s: GameState, id: SizeId, careful = 3, extraMonthly = 0): boolean {
  if (id === 'test') return true
  // no Mom's basement on Hard: an expert keeps twice the runway
  const cushion = Math.max(0, monthlyBurn(s).total + extraMonthly) * (s.meta.difficulty === 'hard' ? 3 : 1)
  return s.cash >= upfrontCost(s, id) + SIZES[id].weeklyBudget * careful + cushion
}

function sizeFor(s: GameState, careful: number): SizeId {
  // biggest size the team can carry and the wallet can survive
  let size: SizeId = 'test'
  for (const id of SIZE_IDS) {
    if (!s.unlocked.sizes.includes(id) || s.office < SIZES[id].minOffice) continue
    const expPts = teamPowerPerDay(s, id) * devDaysFor(s, id) * 0.9
    const ratio = expPts / expectedPoints(s, id).total
    // a strong Playbook (features, brand, known combos) carries a launch a bit below the market bar
    if (canCarry(s, id, careful) && ratio >= (s.brand >= 60 ? 0.65 : 0.8)) size = id
  }
  return size
}

function expertPickLaunch(s: GameState, rng: () => number): LaunchConfig | null {
  const size = sizeFor(s, 3)
  let best: { cfg: LaunchConfig; v: number } | null = null
  const history = new Map<string, number>()
  for (const r of s.history) history.set(r.productId, Math.max(history.get(r.productId) ?? 0, r.overall))
  for (const p of PRODUCTS) {
    if (!s.unlocked.niches.includes(p.niche)) continue
    let q = visibleValue(s, p)
    const sat = s.market.saturation[p.id] ?? 0
    q *= 1 - 0.45 * Math.min(1, sat) // the New Launch card shows "launched N×" — experts rotate products
    const past = history.get(p.id)
    if (past !== undefined) q *= past >= 7 ? 1.15 : past < 5 ? 0.6 : 0.9
    for (const angle of s.unlocked.angles) {
      for (const platform of s.unlocked.platforms) {
        const pr = expertPrior(s, rng, p, angle, platform)
        let v = q * COMBO_MULT[pr.pa] * COMBO_MULT[pr.ap] * COMBO_MULT[pr.np] * (1 + 0.04 * pr.unknown) * (0.9 + 0.2 * rng())
        const tier: PriceTier = angle === 'luxury' ? 'premium' : angle === 'budget' && priceFor(p, 'standard') <= 25 ? 'budget' : 'standard'
        if (RANK[pr.pa] === 0 || RANK[pr.ap] === 0) v *= 0.5
        if (!best || v > best.v) best = { v, cfg: { name: '', productId: p.id, angle, platform, size, priceTier: tier, features: [...s.activeFeatures] } }
      }
    }
  }
  return best?.cfg ?? null
}

function expertSliders(s: GameState, rng: () => number): [number, number, number] {
  const l = s.current!
  const ideal = idealFocus(l.angle, l.platform)[l.stage]
  const knows = !!s.playbook.focus[l.angle]
  const noise = knows ? 0.06 : 0.3
  return ideal.map(x => Math.max(0.02, x + (rng() * 2 - 1) * noise)) as [number, number, number]
}

const RESEARCH_PRIORITY = [
  'plat_tiktak', 'feat_reviews', 'angle_aesthetic', 'size_standard', 'feat_trust_badges', 'angle_wholesome', 'feat_bundles',
  'niche_beauty', 'angle_social_proof', 'feat_upsell', 'size_big', 'boost_hook_lab', 'angle_budget', 'niche_fitness', 'feat_email_flows',
  'plat_reels', 'boost_mentorship', 'boost_recruiter', 'size_mega', 'niche_wellness', 'feat_speed_booster', 'plat_pinterestt', 'niche_car', 'boost_copy_bootcamp', 'plat_poogle',
  'angle_before_after', 'feat_ugc_library', 'niche_kids', 'niche_baby', 'feat_lookalikes', 'angle_luxury',
  'feat_chargeback_shield', 'supply_sourcing_agent', 'feat_ai_copywriter', 'niche_outdoor', 'niche_fashion', 'plat_tiktak_shop',
  'feat_automation', 'feat_influencer_network', 'supply_warehouse_3pl', 'size_mega', 'supply_private_label',
]

function expertResearch(s: GameState, v: Variant) {
  const nodes = researchNodes()
  const ids = [...RESEARCH_PRIORITY, ...nodes.map(n => n.id)].filter(id => !v.noResearch || id.startsWith('size_'))
  for (let guard = 0; guard < 6; guard++) {
    // follow the plan: first open (not locked) item on the list; save up for it if it's not affordable yet
    const next = ids.find(id => !s.unlocked.research.includes(id) && nodes.some(n => n.id === id) && !researchLockReason(s, id))
    if (!next) return
    const node = nodes.find(n => n.id === next)!
    if (!canResearch(s, next).ok || node.cash > s.cash * 0.4) return
    if (next.startsWith('feat_') && s.cash < 3000) return
    research(s, next)
  }
}

function recentMonthlyProfit(s: GameState): number {
  const w = s.finance.weeks.slice(-8)
  if (!w.length) return 0
  const launch = w.reduce((a, x) => a + x.revenue - x.adSpend - x.cogs - x.fees, 0)
  return (launch / w.length) * 4
}

function expertStaffAndOffice(s: GameState, v: Variant) {
  const burn = monthlyBurn(s)
  const recentProfit = recentMonthlyProfit(s)
  // quit McDoodle's when launches reliably beat 2× the paycheck
  if (s.dayJob.employed && recentProfit > 2 * s.dayJob.monthly && s.cash > 6000) quitDayJob(s)
  // move up — only when the biggest unlocked launch size needs more desks than we have (or the next size needs the tier)
  const next = s.office + 1
  const nextSize = SIZE_IDS.find(z => !s.unlocked.sizes.includes(z))
  // staff for the biggest launch the wallet can actually run (desks beyond that are idle payroll)
  const avgSalary = s.candidates.length ? s.candidates.reduce((a, c) => a + c.salary, 0) / s.candidates.length : 0
  const runnable = s.unlocked.sizes.filter(z => z === 'test' || (s.office >= SIZES[z].minOffice &&
    canCarry(s, z, 3, avgSalary * Math.max(0, SIZES[z].maxTeam - 1 - s.staff.length))))
  const wantTeam = Math.max(...runnable.map(z => SIZES[z].maxTeam)) - 1
  // the next launch size (and its research) needs a bigger office, or the team we can afford needs more desks
  const needDesks = (!v.noStaff && wantTeam > staffSlots(s)) || (s.office === 0) ||
    (!!nextSize && SIZES[nextSize].minOffice > s.office)
  if (next <= Math.min(MAX_OFFICE, v.maxOffice ?? MAX_OFFICE) && !s.dayJob.employed && needDesks) {
    const rent = officeRent(next)
    const reserve = officeMoveCost(next) + (rent * 6 + (burn.salaries + 3000) * 4) * (s.meta.difficulty === 'hard' ? 2 : 1)
    if (s.cash > reserve && recentProfit > rent * 2.5 + burn.salaries) moveOffice(s, next)
  }
  // hire into free desks
  if (!v.noStaff && s.staff.length < Math.min(staffSlots(s), wantTeam) && s.candidates.length) {
    const best = [...s.candidates].sort((a, b) => score(b) - score(a))[0]
    const monthly = burn.rent + burn.salaries + burn.features + best.salary
    if (s.cash > monthly * 4 && recentProfit > monthly * 0.9) hire(s, best.id)
  }
  // defence (Coach Kev: "kill flops, fire expensive hires, or rejoin McDoodle's"): payroll the launches can't carry goes first
  const burnNow = monthlyBurn(s)
  const winnerRunning = s.live.some(l => Number(l.sales?.flags.lastRatio ?? 0) >= 1.3)
  if (!v.noStaff && s.staff.length && s.cash < burnNow.total * 0.25 && recentProfit < burnNow.total && !winnerRunning) {
    const priciest = [...s.staff].sort((a, b) => b.salary - a.salary)[0]
    fire(s, priciest.id)
  }
  if (s.cash < 0) for (const f of [...s.activeFeatures]) if (!['reviews', 'trust_badges', 'bundles'].includes(f)) toggleFeature(s, f, false)
  // emergency: bleeding cash with no income → rejoin
  if (!s.dayJob.employed && s.cash < -1500 && s.live.every(l => (l.sales?.flags.lastRatio as number ?? 0) < 1)) rejoinDayJob(s)
  function score(p: GameState['staff'][number]) { return (p.stats.copy + p.stats.creative + p.stats.research + p.stats.speed * 0.5) / Math.sqrt(p.salary) }
}

function expertApps(s: GameState, v: Variant) {
  if (v.noApps || s.cash < 5000) return
  for (const f of s.unlocked.features) if (!s.activeFeatures.includes(f)) toggleFeature(s, f, true)
}

function expertDecisions(s: GameState) {
  for (const d of [...s.decisions]) {
    const l = s.live.find(x => x.id === d.launchId)
    if (!l) { resolveDecision(s, d.id, d.options[d.options.length - 1]?.id ?? 'x'); continue }
    const ratio = Number(l.sales?.flags.lastRatio ?? 0)
    switch (d.kind) {
      case 'kill': resolveDecision(s, d.id, 'kill'); break
      case 'scale': {
        const budget = SIZES[l.size].weeklyBudget * (l.sales?.budgetMult ?? 1)
        const afford = s.cash > budget * 3
        resolveDecision(s, d.id, !afford ? 'hold' : ratio >= 1.9 ? 'double' : 'scale50')
        break
      }
      case 'refresh': resolveDecision(s, d.id, ratio >= 0.95 && s.cash > refreshCost(s, l.id) * 2 ? 'refresh' : 'ignore'); break
      case 'go_bulk': resolveDecision(s, d.id, s.cash > bulkCost(s, l.id) * 3 ? 'bulk' : 'skip'); break
      default: {
        // world events: take the cheapest sensible option
        const opt = [...d.options].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0]
        resolveDecision(s, d.id, opt?.id ?? 'x')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Casual brain (a sensible first-timer)
// ---------------------------------------------------------------------------
function casualAngle(s: GameState, p: Product, rng: () => number): AngleId {
  const has = (a: AngleId) => s.unlocked.angles.includes(a)
  // best angle already learned for this product
  let known: AngleId | null = null
  for (const a of s.unlocked.angles) {
    const r = s.playbook.combos[`pa:${p.id}:${a}`]
    if (r && (!known || RANK[r] > RANK[s.playbook.combos[`pa:${p.id}:${known}`]])) known = a
  }
  if (known && RANK[s.playbook.combos[`pa:${p.id}:${known}`]] >= 2) return known
  // otherwise read the product's badges
  const traits = productTraits(p).join(' ')
  const price = priceFor(p, 'standard')
  const opts: AngleId[] = []
  if (traits.includes('Solves a real problem')) opts.push('pain_point')
  if (traits.includes('Very giftable')) opts.push('gift')
  if (traits.includes('Wow factor') && has('aesthetic')) opts.push('aesthetic')
  if ((p.niche === 'pet' || p.niche === 'baby' || p.niche === 'kids') && has('wholesome')) opts.push('wholesome')
  if (price <= 20 && has('budget')) opts.push('budget')
  if (price >= 70 && has('luxury')) opts.push('luxury')
  if (!opts.length) opts.push('convenience')
  const pool = opts.filter(has)
  return pool.length ? pool[Math.floor(rng() * pool.length)] : s.unlocked.angles[Math.floor(rng() * s.unlocked.angles.length)]
}

function casualPickLaunch(s: GameState, rng: () => number): LaunchConfig | null {
  const sizes = SIZE_IDS.filter(z => s.unlocked.sizes.includes(z) && s.office >= SIZES[z].minOffice && s.cash >= upfrontCost(s, z) + SIZES[z].weeklyBudget * 2)
  if (!sizes.length) return null
  const size = rng() < 0.7 ? sizes[sizes.length - 1] : sizes[Math.max(0, sizes.length - 2)]
  const prods = PRODUCTS.filter(p => s.unlocked.niches.includes(p.niche) && (s.playbook.launchedProducts[p.id] ?? 0) < 3)
  // a sensible first-timer glances at the card: break-even, badges, competition — and loves repeating a hit
  const weight = (p: Product) => Math.pow(visibleValue(s, p, 'standard', 0.6), 3) * (s.history.some(h => h.productId === p.id && VERDICT_RANK[h.verdict] >= 2) ? 2 : 1)
  const total = prods.reduce((a, p) => a + weight(p), 0)
  let r = rng() * total
  let p = prods[0]
  for (const x of prods) { r -= weight(x); if (r <= 0) { p = x; break } }
  const angle = casualAngle(s, p, rng)
  // platform: reads the angle blurb + platform crowd description — usually right, sometimes not
  const plats = s.unlocked.platforms
  const good = plats.filter(pl => RANK[s.playbook.combos[`ap:${angle}:${pl}`] ?? anglePlatformRating(angle, pl)] >= 2)
  const platform = good.length && rng() < 0.7 ? good[Math.floor(rng() * good.length)] : plats[Math.floor(rng() * plats.length)]
  const tier: PriceTier = angle === 'luxury' ? 'premium' : angle === 'budget' ? 'budget' : rng() < 0.85 ? 'standard' : rng() < 0.5 ? 'budget' : 'premium'
  return { name: '', productId: p.id, angle, platform, size, priceTier: tier, features: [...s.activeFeatures] }
}

function casualSliders(s: GameState, rng: () => number): [number, number, number] {
  const l = s.current!
  const ideal = idealFocus(l.angle, l.platform)[l.stage]
  const known = s.playbook.focus[l.angle]?.sliders[l.stage]
  const base = known ?? ideal
  const noise = known ? 0.12 : 0.22 // the Sliders dialog shows the angle's "wants" hint
  return base.map(x => Math.max(0.02, x + (rng() * 2 - 1) * noise)) as [number, number, number]
}

function casualDecisions(s: GameState, rng: () => number) {
  for (const d of [...s.decisions]) {
    if (d.createdDay === s.day) continue // takes a few days to notice the card
    if (rng() < 0.4) continue
    const l = s.live.find(x => x.id === d.launchId)
    if (!l) continue
    switch (d.kind) {
      case 'kill': resolveDecision(s, d.id, rng() < 0.7 ? 'kill' : 'cut'); break
      case 'scale': resolveDecision(s, d.id, s.cash > SIZES[l.size].weeklyBudget * 2 ? 'scale50' : 'hold'); break
      case 'refresh': resolveDecision(s, d.id, s.cash > refreshCost(s, l.id) * 3 ? 'refresh' : 'ignore'); break
      case 'go_bulk': resolveDecision(s, d.id, 'skip'); break
      default: {
        const affordable = d.options.filter(o => (o.cost ?? 0) <= s.cash * 0.3)
        const opt = affordable[Math.floor(rng() * affordable.length)] ?? d.options[d.options.length - 1]
        resolveDecision(s, d.id, opt.id)
      }
    }
  }
}

function casualWeekly(s: GameState, rng: () => number) {
  const nodes = researchNodes().filter(n => canResearch(s, n.id).ok && n.cash <= s.cash * 0.3)
  if (nodes.length && rng() < 0.6) {
    const shiny = nodes.filter(n => ['angle', 'platform', 'size', 'feature'].includes(n.category))
    const pool = shiny.length ? shiny : nodes
    research(s, pool[Math.floor(rng() * pool.length)].id)
  }
  const burn = monthlyBurn(s)
  const profit = recentMonthlyProfit(s)
  if (s.dayJob.employed && s.cash > 12_000 && profit > s.dayJob.monthly) quitDayJob(s)
  if (!s.dayJob.employed && s.cash < -1500) rejoinDayJob(s)
  // Kev: "move when your launches can carry the rent 3× over" · "hire when cash can carry it"
  const next = s.office + 1
  if (next <= MAX_OFFICE && !s.dayJob.employed && s.cash > (officeMoveCost(next) + officeRent(next) * 4 + burn.salaries * 3) * 1.5 && profit > officeRent(next) * 3 + burn.salaries) moveOffice(s, next)
  if (s.staff.length < staffSlots(s) && s.candidates.length) {
    const c = s.candidates[Math.floor(rng() * s.candidates.length)]
    if (s.cash > (burn.rent + burn.salaries + c.salary) * 5 && profit > (burn.salaries + c.salary) * 1.5) hire(s, c.id)
  }
  // the monthly bills toast turns red below ~2 months of runway: a sensible player trims payroll the launches can't carry
  const billsNow = burn.rent + burn.salaries + burn.features
  if (s.staff.length && s.cash < billsNow * 1.5 && profit < billsNow) fire(s, [...s.staff].sort((a, b) => b.salary - a.salary)[0].id)
  // the 🚨 overdraft toast + Kev's bankrupt_danger tip: fire the priciest hire, grab the McDoodle's paycheck
  if (s.brokeDays >= 5 && s.staff.length) fire(s, [...s.staff].sort((a, b) => b.salary - a.salary)[0].id)
  if (s.brokeDays >= 5 && !s.dayJob.employed) rejoinDayJob(s)
  // switch off apps when broke (the overdraft coach tip says so) — and back on once there's money again
  if (s.cash < 0) for (const f of [...s.activeFeatures]) toggleFeature(s, f, false)
  else if (s.cash > 8000) for (const f of s.unlocked.features) if (!s.activeFeatures.includes(f)) toggleFeature(s, f, true)
}

// ---------------------------------------------------------------------------
// Random brain
// ---------------------------------------------------------------------------
function randomPickLaunch(s: GameState, rng: () => number): LaunchConfig | null {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)]
  const prods = PRODUCTS.filter(p => s.unlocked.niches.includes(p.niche))
  const sizes = SIZE_IDS.filter(z => s.unlocked.sizes.includes(z) && s.office >= SIZES[z].minOffice && s.cash >= upfrontCost(s, z))
  if (!sizes.length) return null
  return {
    name: '', productId: pick(prods).id, angle: pick(s.unlocked.angles), platform: pick(s.unlocked.platforms),
    size: pick(sizes), priceTier: pick(['budget', 'standard', 'premium'] as PriceTier[]), features: [...s.activeFeatures],
  }
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------
interface YearRow { year: number; cash: number; rev: number; profit: number; launches: number; winPct: number; office: number; staff: number; job: string; bar: number; rp: number; fans: number; brand: number; res: number; sizes: string }

const MAJOR_TOAST = /TREND|VIRAL|Milestone|joined as|Moved into|hairnet|launched —|post-mortem|Post-mortem|BLACK FRIDAY|Chinese New Year stockout|Chargeback wave|📰|🤳|Ad account restored|Expo/i

function play(personality: Personality, seed: number, years: number, difficulty: Difficulty, v: Variant = {}) {
  const s = createNewGame({ company: `${personality}-${seed}`, founder: 'Bot', difficulty, seed })
  const rng = mulberry(seed * 7919 + (personality === 'expert' ? 1 : personality === 'casual' ? 3 : 2))
  const tr: Track = {
    firstReviewDay: null, firstWinnerLaunch: null, firstWinnerDay: null, firstWinnerId: null, quitDay: null, millionDay: null,
    officeDay: [0, null, null, null, null, null], sizeDay: {}, bankruptcies: 0, gameOverDay: null, firstBankruptDay: null,
    minCashY1: s.cash, overdraftDaysY1: 0, launches: [], beats: [], sliderPauses: 0, maxFlopStreak: 0, worldEvents: [], trayLoad: [], liveCount: [],
  }
  const rows: YearRow[] = []
  let yearStartLaunches = 0, yearStartWinners = 0
  const endDay = years * DAYS_PER_YEAR
  let lastHistory = 0
  let lastToastSeq = 0
  let flopStreak = 0
  const seenDecisions = new Set<string>()
  const seenModals = new Set<string>()
  const startDays = new Map<string, number>()
  let echo = false // toasts raised by the player's own clicks (scale, refresh, kill, research, hire…) vs the sim's own
  const beat = (kind: BeatKind, major: boolean, text: string) => tr.beats.push({ day: s.day, kind, major, text, echo })
  const scan = (isEcho = false) => {
    echo = isEcho
    for (const t of s.toasts) {
      const seq = parseInt(t.id.split('_')[1] ?? '0', 36)
      if (seq <= lastToastSeq) continue
      lastToastSeq = seq
      const kind: BeatKind = t.kind === 'coach' ? 'coach' : t.kind === 'milestone' ? 'milestone' : t.kind === 'research' ? 'research' : 'toast'
      beat(kind, kind === 'milestone' || kind === 'research' || MAJOR_TOAST.test(t.text), t.text)
    }
    for (const d of s.decisions) if (!seenDecisions.has(d.id)) { seenDecisions.add(d.id); beat('decision', true, `[${d.kind}] ${d.title}`) }
    for (const m of s.modals) if (!seenModals.has(m.id)) { seenModals.add(m.id); beat('modal', true, `[${m.kind}] ${m.title}`) }
  }

  while (s.day < endDay) {
    scan()
    // blocking popups
    for (const m of [...s.modals]) {
      if (m.kind === 'bankrupt') {
        if (process.env.BK) {
          const recent = s.history.filter(h => h.endDay > s.day - 200).map(h => `${h.size[0]}${h.verdict[0]}${fmt$(h.profit)}`).join(' ')
          const lv = s.live.map(l => `${l.size[0]}${l.review?.verdict[0]}${fmt$(l.sales?.totalProfit ?? 0)}`).join(' ')
          const fw = s.finance.weeks.slice(-26)
          const sum = (k: keyof typeof fw[number]) => fw.reduce((a, w) => a + (w[k] as number), 0)
          console.log(`BANKRUPT ${personality} ${difficulty} ${seed} ${when(s.day)} office ${s.office} staff ${s.staff.length} bar ${s.market.bar} | 26wk rev ${fmt$(sum('revenue'))} ads ${fmt$(sum('adSpend'))} cogs ${fmt$(sum('cogs'))} fees ${fmt$(sum('fees'))} exp ${fmt$(sum('expenses'))} inc ${fmt$(sum('income'))} | ended: ${recent} | live: ${lv}`)
        }
        tr.bankruptcies++
        if (tr.firstBankruptDay === null) tr.firstBankruptDay = s.day
        resolveBankrupt(s, s.meta.difficulty === 'hard' ? 'restart' : 'mom')
        if (s.gameOver) break
        continue
      }
      const opt = personality === 'expert'
        ? ([...m.options].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0])
        : m.options[Math.floor(rng() * m.options.length)]
      resolveModal(s, m.id, opt?.id ?? '')
      if (s.modals.some(x => x.id === m.id)) s.modals = s.modals.filter(x => x.id !== m.id)
    }
    if (s.gameOver) { tr.gameOverDay = s.day; break }
    // the Review / Post-mortem dialogs clear these
    if (s.flags.pendingReview) { beat('review', true, `review ${String(s.flags.pendingReview)}`); delete s.flags.pendingReview }
    if (s.flags.pendingPostMortem) { beat('postmortem', true, `post-mortem ${String(s.flags.pendingPostMortem)}`); delete s.flags.pendingPostMortem }

    // dev loop
    const cur = s.current
    if (cur) {
      if (cur.awaitingSliders) {
        tr.sliderPauses++
        beat('sliders', false, `sliders stage ${cur.stage + 1}`)
        const w: [number, number, number] = personality === 'expert' ? expertSliders(s, rng) : personality === 'casual' ? casualSliders(s, rng) : [rng(), rng(), rng()]
        setStageSliders(s, w)
      }
      if (cur.status === 'qc' && !cur.polishing) {
        const bugRatio = cur.points.bugs / expectedPoints(s, cur.size).bugs
        const polish = personality === 'expert' ? bugRatio > 0.35 : personality === 'casual' ? bugRatio > 0.6 && rng() < 0.6 : rng() < 0.5
        if (polish) startQC(s)
        else launchNow(s)
      } else if (cur.status === 'ready') launchNow(s)
    } else if (!s.gameOver) {
      const cfg = personality === 'expert' ? expertPickLaunch(s, rng) : personality === 'casual' ? casualPickLaunch(s, rng) : randomPickLaunch(s, rng)
      if (cfg && s.cash >= estimateLaunch(s, cfg).upfront) {
        const id = startLaunch(s, cfg)
        if (id) startDays.set(id, s.day)
        if (s.current && tr.sizeDay[cfg.size] === undefined) tr.sizeDay[cfg.size] = s.day
      }
    }
    if (v.noApps) for (const f of [...s.activeFeatures]) toggleFeature(s, f, false)

    if (personality === 'expert') {
      expertDecisions(s)
      if (s.day % 7 === 0) { expertResearch(s, v); expertStaffAndOffice(s, v); expertApps(s, v) }
    } else if (personality === 'casual') {
      casualDecisions(s, rng)
      if (s.day % 7 === 0) casualWeekly(s, rng)
    } else if (s.day % 7 === 0) {
      const nodes = researchNodes().filter(n => canResearch(s, n.id).ok && n.cash <= s.cash * 0.5)
      if (nodes.length && rng() < 0.5) research(s, nodes[Math.floor(rng() * nodes.length)].id)
      if (s.dayJob.employed && s.cash > 12000) quitDayJob(s)
      if (!s.dayJob.employed && s.cash < -2000) rejoinDayJob(s)
    }
    scan(true) // everything raised by the actions above is an echo of the player's own clicks

    if (process.env.TRACE && Number(process.env.TRACE) === seed && personality === (process.env.TRACE_BOT ?? 'expert') && s.day % 28 === 0) {
      const b = monthlyBurn(s)
      const lv = s.live.map(l => `${l.name.split(' ')[1] ?? l.name}:${l.size[0]}${l.review?.verdict[0]}${Number(l.sales?.flags.lastRatio ?? 0).toFixed(1)}`).join(' ')
      console.log(`  ${when(s.day)} cash ${fmt$(s.cash).padStart(7)} burn ${fmt$(b.total).padStart(6)} (rent ${b.rent} sal ${b.salaries} apps ${b.features}) office ${s.office} staff ${s.staff.length} bar ${s.market.bar.toFixed(0)} cur ${s.current ? s.current.size + ':' + s.current.productId : '-'} live ${lv}`)
    }
    const liveBefore = s.live.length
    tickDay(s)
    if (s.live.length && s.day % 7 === 0 && liveBefore) beat('cash', false, 'weekly sales')

    // tracking
    if (s.flags['w:lastEvent'] === s.day && tr.worldEvents[tr.worldEvents.length - 1] !== s.day) tr.worldEvents.push(s.day)
    if (s.day <= 1800) { tr.trayLoad.push(s.decisions.length); tr.liveCount.push(s.live.length) }
    if (tr.firstReviewDay === null && s.stats.launches > 0) tr.firstReviewDay = s.day
    if (s.stats.winners > 0 && tr.firstWinnerLaunch === null) {
      tr.firstWinnerLaunch = s.stats.launches
      tr.firstWinnerDay = s.day
      tr.firstWinnerId = [...s.live].reverse().find(l => l.review?.verdict === 'winner')?.id ?? null
    }
    if (!s.dayJob.employed && tr.quitDay === null) tr.quitDay = s.day
    if (s.stats.lifetimeRevenue >= 1_000_000 && tr.millionDay === null) tr.millionDay = s.day
    for (let o = 1; o <= s.office; o++) if (tr.officeDay[o] === null) tr.officeDay[o] = s.day
    if (s.day < DAYS_PER_YEAR) {
      tr.minCashY1 = Math.min(tr.minCashY1, s.cash)
      if (s.cash < 0) tr.overdraftDaysY1++
    }
    while (lastHistory < s.history.length) {
      const r = s.history[lastHistory++]
      const rv = r.review
      if (process.env.DUMP && personality === (process.env.DUMP === '1' ? 'expert' : process.env.DUMP) && (seed === SEED0 || process.env.DUMP_ALL) && lastHistory <= Number(process.env.DUMP_N ?? 999) && rv) {
        console.log(`  ${seed} #${lastHistory} ${when(r.launchDay)} ${r.size.padEnd(8)} ${r.name.slice(0, 18).padEnd(18)} ${r.angle.slice(0, 8).padEnd(8)} ${r.platform.slice(0, 6).padEnd(6)} ${[rv.factors.productAngle, rv.factors.anglePlatform, rv.factors.nichePlatform].map(c => ({ great: 'G', good: 'g', ok: 'o', bad: 'b' })[c]).join('')} ov ${rv.overall.toFixed(1)} C ${rv.factors.convRatio.toFixed(2)} T ${rv.factors.trafficRatio.toFixed(2)} acc ${rv.factors.focusAccuracy.map(x => x.toFixed(2)).join('/')} roas/be ${(rv.roas / rv.breakEvenRoas).toFixed(2)} wks ${r.weeklyRevenue?.length} profit ${fmt$(r.profit)} ${r.endReason} staff ${s.staff.length} bar ${s.market.bar.toFixed(0)}`)
      }
      tr.launches.push({
        id: r.id, name: r.name, size: r.size, verdict: r.verdict, overall: r.overall, profit: r.profit, killed: r.endReason === 'killed',
        startDay: startDays.get(r.id) ?? r.launchDay, launchDay: r.launchDay, endDay: r.endDay,
        ratio: rv ? (rv.factors.convRatio + rv.factors.trafficRatio) / 2 : 0, team: 0, weeks: r.weeklyRevenue?.length ?? 0,
      })
      flopStreak = flopish(r.verdict) ? flopStreak + 1 : 0
      tr.maxFlopStreak = Math.max(tr.maxFlopStreak, flopStreak)
    }
    if (s.day % DAYS_PER_YEAR === 0) {
      const launches = s.stats.launches - yearStartLaunches
      const wins = s.stats.winners - yearStartWinners
      rows.push({
        year: s.day / DAYS_PER_YEAR, cash: s.cash, rev: s.stats.lifetimeRevenue, profit: s.stats.lifetimeProfit, launches,
        winPct: launches ? (100 * wins) / launches : 0, office: s.office, staff: s.staff.length, job: s.dayJob.employed ? 'McD' : 'free',
        bar: s.market.bar, rp: s.rp, fans: s.fans, brand: s.brand, res: s.unlocked.research.length, sizes: s.unlocked.sizes.map(z => z[0]).join(''),
      })
      yearStartLaunches = s.stats.launches
      yearStartWinners = s.stats.winners
    }
  }
  scan()
  return { s, rows, tr, personality, seed, difficulty }
}
type Run = ReturnType<typeof play>

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const fmt$ = (x: number) => {
  const a = Math.abs(x)
  const b = a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${(a / 1e3).toFixed(0)}k` : a.toFixed(0)
  return `${x < 0 ? '-' : ''}$${b}`
}
const when = (d: number | null) => (d === null ? '—' : `Y${yearOf(d)} ${monthName(monthOf(d))}`)
const pad = (x: string | number, n: number) => String(x).padStart(n)
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)
const median = (v: number[]) => { if (!v.length) return null; const a = [...v].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] }
const pctl = (v: number[], p: number) => { if (!v.length) return null; const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))] }
const nums = (runs: Run[], f: (r: Run) => number | null) => runs.map(f).filter((x): x is number => x !== null)
const whenAvg = (runs: Run[], f: (r: Run) => number | null) => {
  const v = nums(runs, f)
  if (!v.length) return `— (0/${runs.length})`
  return `${when(Math.round(mean(v)!))} (${when(Math.min(...v))}–${when(Math.max(...v))}, ${v.length}/${runs.length})`
}
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—')
const row = (k: string, v: string, t: string) => console.log(`  ${k.padEnd(30)} ${v.padEnd(50)} ${t}`)
const secs = (days: number) => days * SEC_PER_DAY
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
const profitOf = (runs: Run[], size: SizeId, verdict: Verdict) => {
  const v = runs.flatMap(r => r.tr.launches.filter(b => b.size === size && b.verdict === verdict).map(b => b.profit))
  return v.length ? `${fmt$(median(v)!)} med · ${fmt$(mean(v)!)} avg (n=${v.length})` : '—'
}
const winPctBetween = (runs: Run[], y0: number, y1: number) => {
  const v = runs.flatMap(r => r.tr.launches.filter(l => yearOf(l.launchDay) >= y0 && yearOf(l.launchDay) <= y1))
  return `${pct(v.filter(l => l.verdict === 'winner').length, v.length)} (n=${v.length})`
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------
/** A clearly bad test launch managed like an expert (killed on the first kill call). */
function probeFlopCost(seed: number, killIt = true): number {
  const s = createNewGame({ company: 'probe', founder: 'Bot', difficulty: 'normal', seed })
  s.cash = 20_000
  startLaunch(s, { name: '', productId: 'sunset-lamp', angle: 'pain_point', platform: 'fadbook', size: 'test', priceTier: 'standard', features: [] })
  for (let guard = 0; guard < 2000 && !s.history.length; guard++) {
    const cur = s.current
    if (cur?.awaitingSliders) setStageSliders(s, [1, 1, 1])
    if (cur && (cur.status === 'qc' || cur.status === 'ready')) launchNow(s)
    s.modals = []
    if (killIt) expertDecisions(s)
    else for (const d of [...s.decisions]) if (d.kind !== 'kill' && d.createdDay < s.day - 20) resolveDecision(s, d.id, d.options[d.options.length - 1].id)
    tickDay(s)
  }
  return s.history[0]?.profit ?? 0
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
function printTables(r: Run) {
  console.log(`\n=== ${r.personality.toUpperCase()} · ${r.difficulty} · seed ${r.seed} ${r.tr.gameOverDay !== null ? `· GAME OVER ${when(r.tr.gameOverDay)}` : ''}`)
  console.log(' yr       cash   lifetimeRev  lifetimeProfit  launches  win%  office  staff  job    bar     rp    fans  brand  res sizes')
  for (const y of r.rows) {
    console.log(`${pad(y.year, 3)} ${pad(fmt$(y.cash), 10)} ${pad(fmt$(y.rev), 13)} ${pad(fmt$(y.profit), 15)} ${pad(y.launches, 9)} ${pad(y.winPct.toFixed(0), 5)} ${pad(y.office, 7)} ${pad(y.staff, 6)}  ${y.job.padEnd(5)} ${pad(y.bar.toFixed(0), 4)} ${pad(Math.round(y.rp), 6)} ${pad(Math.round(y.fans), 7)} ${pad(y.brand.toFixed(0), 6)} ${pad(y.res, 4)} ${y.sizes}`)
  }
  const t = r.tr
  const top = [...t.launches].sort((a, b) => b.profit - a.profit).slice(0, 3).map(b => `${b.name} (${b.size}, ${b.verdict}) ${fmt$(b.profit)}`)
  console.log(`  first winner: launch #${t.firstWinnerLaunch ?? '—'} (${when(t.firstWinnerDay)}) · quit McDoodle's: ${when(t.quitDay)} · $1M revenue: ${when(t.millionDay)} · penthouse: ${when(t.officeDay[5])} · bankruptcies: ${t.bankruptcies}`)
  console.log(`  top: ${top.join(' · ')}`)
}

function expertReport(ex: Run[]) {
  const fw = nums(ex, r => r.tr.firstWinnerLaunch)
  if (process.env.FW) console.log('   first-winner launch #s:', [...fw].sort((a, b) => a - b).join(' '))
  row('first winner (launch #)', fw.length ? `${mean(fw)!.toFixed(1)} avg, ${median(fw)} med (${Math.min(...fw)}–${Math.max(...fw)}, ${fw.length}/${ex.length})` : '—', '~3–5')
  const fwp = ex.map(r => r.tr.launches.find(l => l.id === r.tr.firstWinnerId)?.profit).filter((x): x is number => x !== undefined)
  row('first winner profit', fwp.length ? `${fmt$(median(fwp)!)} med (${fmt$(Math.min(...fwp))}…${fmt$(Math.max(...fwp))})` : '—', 'feels huge (≥3× starting cash)')
  row("quit McDoodle's", whenAvg(ex, r => r.tr.quitDay), 'Y1 M7–M11 (Sep–Jan)')
  row('$1M lifetime revenue', whenAvg(ex, r => r.tr.millionDay), 'Y3–4')
  for (const o of [1, 3, 4]) row(`office ${o}`, whenAvg(ex, r => r.tr.officeDay[o]), o === 1 ? 'Y1–2' : o === 3 ? 'Y3' : 'Y4')
  row('penthouse', whenAvg(ex, r => r.tr.officeDay[5]), 'Y5–7')
  for (const z of ['standard', 'big', 'mega'] as SizeId[]) row(`first ${z} launch`, whenAvg(ex, r => r.tr.sizeDay[z] ?? null), '')
  const after = ex.flatMap(r => r.tr.launches.filter(l => l.launchDay >= DAYS_PER_YEAR))
  row('winners after Y1', `${pct(after.filter(x => x.verdict === 'winner').length, after.length)} of ${after.length}`, '≥40% (pressure: not ~100%)')
  row('  win% Y2–3 / Y4–5 / Y6–8', `${winPctBetween(ex, 2, 3)} / ${winPctBetween(ex, 4, 5)} / ${winPctBetween(ex, 6, 8)}`, '')
  const scores = ex.flatMap(r => r.tr.launches.filter(l => l.launchDay >= DAYS_PER_YEAR).map(l => l.overall))
  row('  review score after Y1', `${mean(scores)!.toFixed(2)} avg · p10 ${pctl(scores, 0.1)!.toFixed(1)} · p90 ${pctl(scores, 0.9)!.toFixed(1)}`, 'hovering around the winner line')
  const flops = ex.flatMap(r => r.tr.launches.filter(l => l.launchDay >= DAYS_PER_YEAR && l.verdict === 'flop')).length
  row('  flops after Y1', `${pct(flops, after.length)}`, 'some (the bar bites)')
  row('test winner', profitOf(ex, 'test', 'winner'), '$4–15k')
  row('standard winner', profitOf(ex, 'standard', 'winner'), '$30–80k')
  row('big winner', profitOf(ex, 'big', 'winner'), '$200–600k')
  row('mega winner', profitOf(ex, 'mega', 'winner'), '$1–5M')
  row('lifetime revenue @ end', `${fmt$(median(ex.map(r => r.s.stats.lifetimeRevenue))!)} med`, '')
  row('bankruptcies / game overs', `${ex.reduce((a, r) => a + r.tr.bankruptcies, 0)} / ${ex.filter(r => r.tr.gameOverDay !== null).length}`, '0')
}

/** Median profit per launch by size × verdict (what each review grade is worth). */
function verdictTable(runs: Run[], label: string) {
  const vs: Verdict[] = ['winner', 'solid', 'breakeven', 'flop']
  const cells = (z: SizeId) => vs.map(v => {
    const p = runs.flatMap(r => r.tr.launches.filter(l => l.size === z && l.verdict === v).map(l => l.profit))
    return (p.length ? `${fmt$(median(p)!)} n${p.length}` : '—').padStart(15)
  }).join('')
  console.log(`  ${label} profit/launch (median)  ${vs.map(v => v.padStart(15)).join('')}`)
  for (const z of SIZE_IDS) console.log(`    ${z.padEnd(29)}${cells(z)}`)
}

function casualReport(cs: Run[]) {
  const all = cs.flatMap(r => r.tr.launches)
  row('winners', `${pct(all.filter(v => v.verdict === 'winner').length, all.length)} of ${all.length} · solid+ ${pct(all.filter(v => VERDICT_RANK[v.verdict] >= 2).length, all.length)}`, '~20–40%')
  const fw = nums(cs, r => r.tr.firstWinnerLaunch)
  row('first winner (launch #)', fw.length ? `${median(fw)} med (${fw.length}/${cs.length} runs)` : '—', '≤ ~8')
  row('min cash in Y1', `${fmt$(median(cs.map(r => r.tr.minCashY1))!)} med (worst ${fmt$(Math.min(...cs.map(r => r.tr.minCashY1)))})`, '> −$3,000')
  row('overdraft days in Y1', `${median(cs.map(r => r.tr.overdraftDaysY1))} med`, 'few')
  row('bankrupt in Y1', `${cs.filter(r => r.tr.firstBankruptDay !== null && r.tr.firstBankruptDay < DAYS_PER_YEAR).length}/${cs.length} runs`, '0 (early flops never bankrupt)')
  row('bankrupt in Y2–3', `${cs.filter(r => r.tr.firstBankruptDay !== null && r.tr.firstBankruptDay >= DAYS_PER_YEAR && r.tr.firstBankruptDay < 3 * DAYS_PER_YEAR).length}/${cs.length} runs`, '≤ 1 in 4 (over-expansion is a lesson)')
  row('bankruptcies (all years)', `${cs.reduce((a, r) => a + r.tr.bankruptcies, 0)}`, 'rare')
  row("quit McDoodle's", whenAvg(cs, r => r.tr.quitDay), 'later than expert')
  row('penthouse', whenAvg(cs, r => r.tr.officeDay[5]), 'later than expert / never')
  row('max flop streak', `${median(cs.map(r => r.tr.maxFlopStreak))} med, ${Math.max(...cs.map(r => r.tr.maxFlopStreak))} max`, '')
  row('lifetime profit @ end', `${fmt$(median(cs.map(r => r.s.stats.lifetimeProfit))!)} med`, '> 0')
}

function randomReport(rnd: Run[]) {
  const all = rnd.flatMap(r => r.tr.launches)
  row('winners', `${pct(all.filter(v => v.verdict === 'winner').length, all.length)} of ${all.length}`, '≤10%')
  row('first bankruptcy', whenAvg(rnd, r => r.tr.firstBankruptDay), 'stagnates or bust within ~3 years')
  row('bankruptcies (all runs)', String(rnd.reduce((a, r) => a + r.tr.bankruptcies, 0)), '—')
  row('lifetime profit @ end', fmt$(median(rnd.map(r => r.s.stats.lifetimeProfit)) ?? 0), '< 0 (stagnates)')
  row('test flop (never killed)', profitOf(rnd, 'test', 'flop'), '(bleeds until it fades)')
}

/** Pacing at 1× (0.5 s/day): dev lengths, first review, beat gaps, toast density. */
function pacingReport(runs: Run[], horizonDays = 1800) {
  const firstReview = nums(runs, r => r.tr.firstReviewDay).map(secs)
  row('first review (clock)', `${median(firstReview)!.toFixed(0)} s med (${Math.min(...firstReview).toFixed(0)}–${Math.max(...firstReview).toFixed(0)})`, '≤ ~40 s')
  for (const z of SIZE_IDS) {
    const d = runs.flatMap(r => r.tr.launches.filter(l => l.size === z).map(l => secs(l.launchDay - l.startDay)))
    if (d.length) row(`dev time ${z}`, `${median(d)!.toFixed(0)} s med (${pctl(d, 0.1)!.toFixed(0)}–${pctl(d, 0.9)!.toFixed(0)} p10–p90)`, '')
  }
  const gapsMajor: number[] = []
  const gapsAny: number[] = []
  const perMinToasts: number[] = []
  const perMinEcho: number[] = []
  const burstSteady: number[] = []
  const worldGaps: number[] = []
  const burst10: number[] = []
  const blockingPerMin: number[] = []
  for (const r of runs) {
    const b = r.tr.beats.filter(x => x.day <= horizonDays)
    const major = [...new Set(b.filter(x => x.major).map(x => x.day))].sort((x, y) => x - y)
    for (let i = 1; i < major.length; i++) gapsMajor.push(secs(major[i] - major[i - 1]))
    const any = [...new Set(b.filter(x => x.kind !== 'cash').map(x => x.day))].sort((x, y) => x - y)
    for (let i = 1; i < any.length; i++) gapsAny.push(secs(any[i] - any[i - 1]))
    const allToasts = b.filter(x => x.kind === 'toast' || x.kind === 'coach' || x.kind === 'milestone' || x.kind === 'research')
    const toasts = allToasts.filter(x => !x.echo)
    const minutes = Math.min(horizonDays, r.s.day) * SEC_PER_DAY / 60
    perMinToasts.push(toasts.length / minutes)
    perMinEcho.push((allToasts.length - toasts.length) / minutes)
    // densest 10 s (20 days) window
    let mx = 0
    let at = 0
    for (let i = 0, j = 0; i < toasts.length; i++) { while (toasts[i].day - toasts[j].day >= 20) j++; if (i - j + 1 > mx) { mx = i - j + 1; at = j } }
    burst10.push(mx)
    let mx2 = 0
    const steady = toasts.filter(t => t.day >= 360) // after the first 3 real minutes (onboarding "firsts" excluded)
    let at2 = 0
    for (let i = 0, j = 0; i < steady.length; i++) { while (steady[i].day - steady[j].day >= 20) j++; if (i - j + 1 > mx2) { mx2 = i - j + 1; at2 = j } }
    if (process.env.BURST2 && r === runs[0]) console.log(steady.slice(at2, at2 + mx2).map(t => `    d${t.day} ${t.kind} ${t.text.slice(0, 100)}`).join('\n'))
    burstSteady.push(mx2)
    if (process.env.BURST && r === runs[0]) console.log(toasts.slice(at, at + mx).map(t => `    d${t.day} ${t.kind} ${t.text.slice(0, 90)}`).join('\n'))
    const blocking = b.filter(x => x.kind === 'modal' || x.kind === 'sliders' || x.kind === 'review' || x.kind === 'postmortem').length
    blockingPerMin.push(blocking / minutes)
  }
  row('gap between major beats', `${median(gapsMajor)!.toFixed(1)} s med · p90 ${pctl(gapsMajor, 0.9)!.toFixed(0)} s · max ${Math.max(...gapsMajor).toFixed(0)} s`, 'something every ~20–40 s')
  row('gap between any message', `${median(gapsAny)!.toFixed(1)} s med · p90 ${pctl(gapsAny, 0.9)!.toFixed(0)} s · max ${Math.max(...gapsAny).toFixed(0)} s`, '')
  row('sim messages per real minute', `${mean(perMinToasts)!.toFixed(1)} avg (+${mean(perMinEcho)!.toFixed(1)} echoes of your own clicks)`, 'frequent, not spammy')
  row('densest 10 s of sim messages', `${median(burst10)} med · ${Math.max(...burst10)} max (first-launch "firsts") · ${median(burstSteady)} med after minute 3`, 'feed shows 4 cards')
  for (const r of runs) {
    const w = r.tr.worldEvents.filter(d => d <= horizonDays)
    for (let i = 1; i < w.length; i++) worldGaps.push(secs(w[i] - w[i - 1]))
  }
  row('gap between world events', `${median(worldGaps)!.toFixed(0)} s med · p10 ${pctl(worldGaps, 0.1)!.toFixed(0)} s · p90 ${pctl(worldGaps, 0.9)!.toFixed(0)} s`, 'news/trends/offers/viral/press… ~every 10–40 s')
  const calls = runs.map(r => r.tr.beats.filter(b => b.kind === 'decision' && b.day <= horizonDays).length / (Math.min(horizonDays, r.s.day) * SEC_PER_DAY / 60))
  const load = runs.flatMap(r => r.tr.trayLoad)
  row('decision cards', `${mean(calls)!.toFixed(1)} new per minute · ${mean(load)!.toFixed(1)} open on avg · p90 ${pctl(load, 0.9)} open`, 'a few at a time')
  const kinds = new Map<string, number>()
  for (const r of runs) for (const b of r.tr.beats) if (b.kind === 'decision' && b.day <= horizonDays) { const k = b.text.slice(1, b.text.indexOf(']')); kinds.set(k, (kinds.get(k) ?? 0) + 1) }
  const mins = runs.reduce((a, r) => a + Math.min(horizonDays, r.s.day) * SEC_PER_DAY / 60, 0)
  row('  by kind (per minute)', [...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / mins).toFixed(1)}`).join(' · '), '')
  const live = runs.map(r => mean(r.tr.liveCount.filter((_, i) => i < 1800)) ?? 0)
  row('live launches at once', `${mean(live)!.toFixed(1)} avg`, '')
  row('blocking popups per minute', `${mean(blockingPerMin)!.toFixed(2)} avg (sliders/review/post-mortem/modals)`, '')
}

/** The first `minutes` real minutes (clock time at 1×) of one expert run, beat by beat + a per-minute strip. */
function timeline(r: Run, minutes = 15) {
  const horizon = (minutes * 60) / SEC_PER_DAY
  const s = r.s
  console.log(`\n=== TIMELINE · expert · ${r.difficulty} · seed ${r.seed} · first ${minutes} real minutes at 1× (0.5 s/day, dialogs paused)`)
  const tags: Record<string, string> = { review: '⭐ REVIEW', postmortem: '📋 POST-MORTEM', decision: '🃏 CALL', modal: '🪟 POPUP', milestone: '🏅 MILESTONE', research: '🧪 RESEARCH', toast: '💬', coach: '🧢 KEV', sliders: '🎚️', cash: '💵' }
  let lastMinute = -1
  const launchName = (id: string) => s.history.find(h => h.id === id) ?? s.live.find(l => l.id === id)
  for (const b of r.tr.beats) {
    if (b.day > horizon) break
    const sec = secs(b.day)
    const minute = Math.floor(sec / 60)
    if (minute !== lastMinute) {
      lastMinute = minute
      const inMin = r.tr.beats.filter(x => Math.floor(secs(x.day) / 60) === minute)
      const toasts = inMin.filter(x => x.kind === 'toast' || x.kind === 'coach' || x.kind === 'milestone' || x.kind === 'research').length
      const cash = inMin.filter(x => x.kind === 'cash').length
      const pauses = inMin.filter(x => x.kind === 'sliders' || x.kind === 'review' || x.kind === 'postmortem' || x.kind === 'modal').length
      console.log(`  ── minute ${minute + 1} (${when(minute * 120)}): ${toasts} messages, ${cash} weekly cash pops, ${pauses} pauses`)
    }
    if (!b.major && b.kind !== 'sliders') continue
    let text = b.text
    if (b.kind === 'review' || b.kind === 'postmortem') {
      const id = text.split(' ').pop()!
      const h = launchName(id)
      if (h && 'review' in h && h.review) {
        const rv = h.review
        text = b.kind === 'review'
          ? `${h.name} (${h.size}) ${rv.overall.toFixed(1)}/10 ${rv.verdict.toUpperCase()} · ROAS ${rv.roas.toFixed(2)} vs BE ${rv.breakEvenRoas.toFixed(2)}`
          : `${h.name}: ${'profit' in h ? fmt$(h.profit as number) : ''}`
      }
    }
    if (b.kind === 'sliders' && !text.endsWith('1')) continue // one line per launch start is enough
    if (b.kind === 'sliders') text = 'dev started (sliders ×3 over the build)'
    console.log(`  ${mmss(secs(b.day)).padStart(5)} ${`Y${yearOf(b.day)} ${monthName(monthOf(b.day))} W${weekOfMonth(b.day)}`.padEnd(13)} ${(tags[b.kind] ?? b.kind).padEnd(14)} ${text.slice(0, 120)}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const flag = (k: string) => argv.includes(`--${k}`)
const opt = (k: string, d: string) => argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const pos = argv.filter(a => !a.startsWith('--'))
const YEARS = Number(pos[0] ?? 8)
const SEEDS = Number(pos[1] ?? 6)
const SEED0 = 1000
const DIFFS: Difficulty[] = opt('diff', 'all') === 'all' ? ['easy', 'normal', 'hard'] : [opt('diff', 'normal') as Difficulty]
const BOTS = opt('bots', 'expert,casual,random').split(',') as Personality[]
const t0 = Date.now()
const seeds = Array.from({ length: SEEDS }, (_, i) => SEED0 + i * 17)

if (flag('toasts')) {
  // what fills the message feed: toast templates per real minute across expert runs (first 15 minutes)
  const runs = seeds.map(sd => play('expert', sd, 6, DIFFS[0] === 'easy' && DIFFS.length > 1 ? 'normal' : DIFFS[0]))
  const counts = new Map<string, number>()
  let n = 0
  for (const r of runs) for (const b of r.tr.beats) {
    if (b.day > 1800 || !['toast', 'coach', 'milestone', 'research'].includes(b.kind) || (!!b.echo !== flag('echo'))) continue
    n++
    const key = flag('emoji') ? `${b.kind.padEnd(9)} ${[...b.text][0]}${[...b.text][1] ?? ''}` : `${b.kind.padEnd(9)} ${b.text.replace(/[\d,.$−-]+/g, '#').replace(/^(\S+ )?[A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+( [IVX#]+)?/, '$1<launch>').slice(0, 60)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const perMin = (x: number) => (x / runs.length / 15).toFixed(2)
  console.log(`=== MESSAGE FEED · expert · ${runs.length} runs · ${perMin(n)} ${flag('echo') ? 'echoes of your own clicks' : 'sim messages'} per real minute (first 15 min)`)
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, Number(opt('top', '45')))) console.log(`  ${perMin(v).padStart(5)}/min  ${k}`)
} else if (flag('timeline')) {
  const r = play('expert', SEED0 + Number(opt('seed', '0')), 6, (opt('diff', 'normal') === 'all' ? 'normal' : opt('diff', 'normal')) as Difficulty)
  timeline(r, Number(opt('minutes', '15')))
} else if (flag('ablation')) {
  const variants: Variant[] = [
    { label: 'full expert' },
    { label: 'no research (sizes only)', noResearch: true },
    { label: 'no staff', noStaff: true },
    { label: 'no store apps', noApps: true },
    { label: 'office capped at Studio', maxOffice: 2 },
  ]
  console.log(`=== ABLATION · expert · normal · ${SEEDS} seeds × ${YEARS} years`)
  console.log(`  ${'variant'.padEnd(26)} ${'win% Y2+'.padStart(9)} ${'avg score'.padStart(9)} ${'pts/bar'.padStart(8)} ${'rev @Y3'.padStart(9)} ${'rev @Y6'.padStart(9)} ${'rev @end'.padStart(9)} ${'profit @end'.padStart(11)} ${'penthouse'.padStart(10)} bankr`)
  for (const v of variants) {
    const runs = seeds.map(sd => play('expert', sd, YEARS, 'normal', v))
    const after = runs.flatMap(r => r.tr.launches.filter(l => l.launchDay >= DAYS_PER_YEAR))
    const revAt = (y: number) => median(runs.map(r => r.rows.find(x => x.year === y)?.rev ?? r.s.stats.lifetimeRevenue))!
    console.log(`  ${v.label!.padEnd(26)} ${pct(after.filter(l => l.verdict === 'winner').length, after.length).padStart(9)} ${mean(after.map(l => l.overall))!.toFixed(2).padStart(9)} ${mean(after.map(l => l.ratio))!.toFixed(2).padStart(8)} ${fmt$(revAt(3)).padStart(9)} ${fmt$(revAt(6)).padStart(9)} ${fmt$(median(runs.map(r => r.s.stats.lifetimeRevenue))!).padStart(9)} ${fmt$(median(runs.map(r => r.s.stats.lifetimeProfit))!).padStart(11)} ${(nums(runs, r => r.tr.officeDay[5]).length ? when(Math.round(mean(nums(runs, r => r.tr.officeDay[5]))!)) : '—').padStart(10)} ${runs.reduce((a, r) => a + r.tr.bankruptcies, 0)}`)
  }
} else {
  const all: Run[] = []
  for (const difficulty of DIFFS) {
    for (const personality of BOTS) {
      for (const seed of seeds) {
        const r = play(personality, seed, YEARS, difficulty)
        all.push(r)
        if (flag('tables')) printTables(r)
      }
    }
  }
  console.log(`\n=== DESIGN §10 CHECK (${SEEDS} seeds × ${YEARS} years, ${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  for (const difficulty of DIFFS) {
    const of = (p: Personality) => all.filter(r => r.difficulty === difficulty && r.personality === p)
    console.log(`\n--- ${difficulty.toUpperCase()} ---`)
    if (of('expert').length) { console.log(`  ${'EXPERT'.padEnd(30)} ${'result'.padEnd(50)} target`); expertReport(of('expert')); if (flag('verdicts')) verdictTable(of('expert'), 'expert') }
    if (of('casual').length) { console.log(`  CASUAL (sensible first-timer)`); casualReport(of('casual')); if (flag('verdicts')) verdictTable(of('casual'), 'casual') }
    if (of('random').length) { console.log('  RANDOM'); randomReport(of('random')) }
    if (of('expert').length) { console.log('  PACING · expert · first 15 real minutes at 1×'); pacingReport(of('expert')) }
  }
  if (DIFFS.includes('normal')) {
    const probes = Array.from({ length: 12 }, (_, i) => probeFlopCost(500 + i)).sort((a, b) => a - b)
    const probesKeep = Array.from({ length: 12 }, (_, i) => probeFlopCost(500 + i, false)).sort((a, b) => a - b)
    console.log('\n--- FLOP COST PROBES (normal, sunset lamp as a pain-point test on Fadbook) ---')
    row('test flop, killed at first call', `${fmt$(probes[6])} median of 12 (${fmt$(probes[0])}…${fmt$(probes[11])})`, '−$500–900')
    row('test flop, kill call ignored', `${fmt$(probesKeep[6])} median of 12 (${fmt$(probesKeep[0])}…${fmt$(probesKeep[11])})`, 'hurts, but survivable')
  }
}
