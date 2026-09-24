// OWNER: sim-core. Launch scoring (review), combos, ideal focus, post-mortem. PUBLIC API.
import type { AngleId, ComboRating, FeatureId, GameState, Launch, PlatformId, PostMortem, PriceTier, Product, Review, SizeId, Verdict } from '../core/types'
import { clamp, rand, randRange } from '../core/rng'
import { PRICE_TIERS, landedCost, priceFor, productById } from '../data/catalog'
import { PLATFORMS } from '../data/platforms'
import { SIZES } from '../data/sizes'
import { ANGLES } from '../data/angles'
import { AREAS, POINT_TYPES, STAGES } from '../data/areas'
import {
  COMBO_MULT, anglePlatformRating, comboKeys, comboLabel, idealFocusFor, mappedAngles, normalize3,
  productAngleRating, productPlatformRating, type Triple,
} from '../data/combos'
import { quoteFor, VERDICTS } from '../data/quotes'
import { isBfcm } from '../core/time'
import { cpmMultiplier, seasonDemand, trendMult } from './world'

// ---------------------------------------------------------------------------
// Tuning (DESIGN §4 formulas; constants marked * were calibrated with `npm run sim`)
// ---------------------------------------------------------------------------
export const TUNING = {
  /** expected points split (share of E) */
  expConv: 0.42, expTraffic: 0.42, expAov: 0.16, expBugs: 0.25,
  /** * execution multipliers on the platform base rates (a well-built launch beats the platform average) */
  ctrK: 1.6, cvrK: 1.5,
  /** * price friction: CVR × (refPrice / price)^elasticity — expensive items convert worse */
  refPrice: 32, priceElasticity: 0.8,
  /** noise on CTR / CVR at review time (±) */
  reviewNoise: 0.08,
  /** * focus accuracy weight on CTR (Marketing sliders) and CVR (Store sliders): metric × (1 − w + w·acc). DESIGN had 0.3;
   *  0.45 makes the GDT slider lesson bite — a first launch with no Playbook recipe rarely wins on product choice alone */
  focusWeight: 0.45,
  /** focus accuracy weight on AOV (Sourcing sliders) */
  focusWeightAov: 0.2,
  /** * auction pressure: ROAS/break-even above the knee gets squeezed by rising CPMs, asymptotically to the cap */
  roasKnee: 2.1, roasCap: 3.0,
}

/** Soft ceiling for ROAS / break-even (winning ads attract copycats and pricier auctions). */
export function softRoasRatio(raw: number): number {
  const { roasKnee: k, roasCap: c } = TUNING
  if (raw <= k) return raw
  return k + (c - k) * (1 - Math.exp(-(raw - k) / (c - k)))
}

const pw = (x: number, pts: readonly [number, number][]): number => {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    if (x <= x1) {
      const [x0, y0] = pts[i - 1]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return pts[pts.length - 1][1]
}
const r1 = (x: number) => Math.round(x * 10) / 10
const clampScore = (x: number) => r1(clamp(x, 1, 10))

// score curves (DESIGN §4). CTR/CVR in %, AOV in $, ROAS as ROAS / break-even.
export const scoreCtr = (ctr: number) => clampScore(pw(ctr * 100, [[0.2, 1], [0.4, 1], [0.8, 3.5], [1.2, 5.5], [1.8, 7.5], [2.5, 9], [3.2, 10]]))
export const scoreCvr = (cvr: number) => clampScore(pw(cvr * 100, [[0.5, 1], [1, 3.5], [1.5, 5], [2.5, 7], [3.5, 8.5], [4.7, 10]]))
export const scoreAov = (aov: number, lifted = false) => clampScore(pw(aov, [[7.5, 1], [15, 2], [30, 5], [50, 7], [80, 8.5], [120, 10]]) + (lifted ? 1 : 0))
export const scoreRoas = (roasOverBe: number) => clampScore(pw(roasOverBe, [[0.5, 1], [0.8, 3], [1, 5], [1.3, 7], [1.7, 8.5], [2.2, 10]]))
export const overallScore = (sc: Review['scores']) => r1(clamp(0.2 * sc.ctr + 0.25 * sc.cvr + 0.15 * sc.aov + 0.4 * sc.roas, 1, 10))
export const verdictFor = (overall: number): Verdict => (overall >= 8.5 ? 'winner' : overall >= 7 ? 'solid' : overall >= 5 ? 'breakeven' : 'flop')
export const VERDICT_RANK: Record<Verdict, number> = { flop: 0, breakeven: 1, solid: 2, winner: 3 }

// ---------------------------------------------------------------------------
// Combos & focus
// ---------------------------------------------------------------------------
/** Hidden combo ratings for a config (engine truth). */
export function comboRatings(_s: GameState, productId: string, angle: AngleId, platform: PlatformId): { productAngle: ComboRating; anglePlatform: ComboRating; nichePlatform: ComboRating } {
  const p = productById(productId)
  return { productAngle: productAngleRating(p, angle), anglePlatform: anglePlatformRating(angle, platform), nichePlatform: productPlatformRating(p, platform) }
}
/** Ideal slider distribution per stage for an angle on a platform (normalized). */
export function idealFocus(angle: AngleId, platform: PlatformId): [number, number, number][] {
  return idealFocusFor(angle, platform)
}
/** Focus accuracy for one stage: 1 − 0.5 × L1(normalized sliders, ideal) → 0..1 */
export function focusAccuracy(sliders: readonly number[] | undefined, ideal: readonly number[]): number {
  const n = normalize3(sliders ?? [1, 1, 1])
  const l1 = Math.abs(n[0] - ideal[0]) + Math.abs(n[1] - ideal[1]) + Math.abs(n[2] - ideal[2])
  return clamp(1 - 0.5 * l1, 0, 1)
}
export function launchFocusAccuracy(l: Pick<Launch, 'angle' | 'platform' | 'sliders'>): [number, number, number] {
  const ideal = idealFocusFor(l.angle, l.platform)
  return [0, 1, 2].map(i => focusAccuracy(l.sliders[i], ideal[i])) as [number, number, number]
}

// ---------------------------------------------------------------------------
// Expectations & unit economics
// ---------------------------------------------------------------------------
export interface ExpectedPoints { total: number; conv: number; traffic: number; aov: number; bugs: number }
/** What the market expects from a launch of this size right now (GDT reviewer bar). */
export function expectedPoints(s: GameState, size: SizeId): ExpectedPoints {
  const E = s.market.bar * SIZES[size].mult
  return { total: E, conv: TUNING.expConv * E, traffic: TUNING.expTraffic * E, aov: TUNING.expAov * E, bugs: TUNING.expBugs * E }
}

export interface UnitEconomics { price: number; landed: number; marginPerOrder: number; breakEvenRoas: number }
/** marginPerOrder = AOV − landed·(AOV/price) − 3%·AOV − $0.30; breakEvenRoas = AOV / margin. */
export function unitEconomics(product: Product, price: number, aov: number, features: readonly FeatureId[], size: SizeId, marginBoost = 0): UnitEconomics {
  const landed = landedCost(product, { features, size }) * (1 - marginBoost)
  const margin = aov - landed * (aov / price) - 0.03 * aov - 0.3
  return { price, landed, marginPerOrder: margin, breakEvenRoas: margin > 0.01 ? aov / margin : 99 }
}
/** Quick economics preview for the New Launch dialog (no points yet: AOV = price). */
export function previewEconomics(s: GameState, productId: string, tier: PriceTier, size: SizeId, features: readonly FeatureId[] = s.activeFeatures): UnitEconomics {
  const p = productById(productId)
  const price = priceFor(p, tier)
  return unitEconomics(p, price, price, features, size)
}

/** Product-level conversion appeal: price friction × impulse. Cheap impulse buys convert; $200 robots don't. */
export function productAppeal(p: Product, price: number): number {
  const friction = clamp(Math.pow(TUNING.refPrice / Math.max(1, price), TUNING.priceElasticity), 0.25, 1.6)
  return friction * (0.75 + 0.5 * p.impulse)
}
/** Relaunching the same product hits an audience that has already seen it (applies to CTR and CVR). */
export const audienceFatigue = (saturation: number) => 1 - 0.3 * clamp(saturation, 0, 1.5)
/** Crowded markets convert worse (catalog competitors: 2 … 90). */
export const competitionFactor = (p: Product) => 1 - 0.3 * clamp((p.competitors - 10) / 80, 0, 1)

const tierCvrFor = (tier: PriceTier, angle: AngleId) =>
  tier === 'premium' && angle === 'luxury' ? 0.95 : tier === 'budget' && angle === 'budget' ? 1.4 : PRICE_TIERS[tier].cvr
/** premium buyers punish defects harder; bargain hunters shrug */
const tierBugSensitivity: Record<PriceTier, number> = { budget: 0.75, standard: 1, premium: 1.4 }

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
const pctStr = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`
const usd = (x: number) => (Math.abs(x) >= 100 ? `$${Math.round(x).toLocaleString('en-US')}` : `$${x.toFixed(2)}`)

export function evaluate(s: GameState, l: Launch): Review {
  const p = productById(l.productId)
  const plat = PLATFORMS[l.platform]
  const feats = new Set<FeatureId>(l.features)
  const exp = expectedPoints(s, l.size)
  const C = l.points.conv / exp.conv
  const T = l.points.traffic / exp.traffic
  const A = l.points.aov / exp.aov
  const B = Math.max(0, l.points.bugs) / exp.bugs
  const acc = launchFocusAccuracy(l)
  const combos = comboRatings(s, l.productId, l.angle, l.platform)
  const fitPA = COMBO_MULT[combos.productAngle]
  const fitAP = COMBO_MULT[combos.anglePlatform]
  const fitNP = COMBO_MULT[combos.nichePlatform]
  const trend = trendMult(s, l.niche, l.angle, l.platform) || 1
  // BFCM's one-week cart frenzy is a sales-week effect (sim/sales), not part of the launch's fundamentals
  const season = (seasonDemand(s, p.id, s.day) || 1) / (isBfcm(s.day) ? 1.8 : 1)
  const seasonCtr = 1 + 0.3 * (season - 1)
  const noise = () => randRange(s, 1 - TUNING.reviewNoise, 1 + TUNING.reviewNoise)
  const sat = s.market.saturation[p.id] ?? 0
  const tapped = audienceFatigue(sat)

  // CTR
  const ctr = plat.baseCtr * TUNING.ctrK * Math.pow(clamp(T, 0.2, 2.5), 0.6) * fitAP * (0.7 + 0.6 * p.wow) *
    Math.sqrt(fitNP) * Math.sqrt(trend) * (1 - TUNING.focusWeight + TUNING.focusWeight * acc[2]) * seasonCtr * tapped * noise()

  // CVR
  const price = priceFor(p, l.priceTier)
  const bugPenalty = Math.min(0.45, 0.25 * B) * (feats.has('chargeback_shield') ? 0.5 : 1) * tierBugSensitivity[l.priceTier]
  const featCvr = 1 + (feats.has('reviews') ? 0.12 : 0) + (feats.has('trust_badges') ? 0.05 : 0) + (feats.has('speed_booster') ? 0.04 : 0) + (feats.has('private_label') ? 0.1 : 0)
  const demand = 0.6 + 0.6 * p.baseDemand * season * (1 - 0.5 * Math.min(1, sat)) * competitionFactor(p)
  const cvr = plat.baseCvr * TUNING.cvrK * Math.pow(clamp(C, 0.2, 2.5), 0.6) * fitPA * Math.sqrt(fitNP) * tierCvrFor(l.priceTier, l.angle) *
    (1 - Math.min(0.6, bugPenalty)) * featCvr * (1 + s.brand / 400) * demand * (1 - TUNING.focusWeight + TUNING.focusWeight * acc[1]) * Math.sqrt(trend) *
    productAppeal(p, price) * tapped * noise()

  // AOV
  const liftFeatures = (feats.has('bundles') ? 0.12 : 0) + (feats.has('upsell') ? 0.06 : 0)
  const aov = price * (1 + 0.15 * clamp(A - 0.5, 0, 1.5) + liftFeatures) * (1 - TUNING.focusWeightAov + TUNING.focusWeightAov * acc[0])

  // Ads
  const econ = unitEconomics(p, price, aov, l.features, l.size)
  let cpm = plat.cpm * (cpmMultiplier(s, l.platform, s.day) || 1) * Math.pow(fitNP, -0.3)
  const rawRatio = (aov / (cpm / (1000 * ctr) / cvr)) / econ.breakEvenRoas
  const soft = softRoasRatio(rawRatio)
  if (soft < rawRatio) cpm *= rawRatio / soft
  const cpc = cpm / (1000 * ctr)
  const cpa = cpc / cvr
  const roas = aov / cpa

  const scores = {
    ctr: scoreCtr(ctr),
    cvr: scoreCvr(cvr),
    aov: scoreAov(aov, liftFeatures >= 0.1),
    roas: scoreRoas(roas / econ.breakEvenRoas),
  }
  const overall = overallScore(scores)
  const verdict = verdictFor(overall)
  const vars = { be: econ.breakEvenRoas.toFixed(2), cpa: usd(cpa), cpc: usd(cpc), margin: usd(econ.marginPerOrder), price: usd(price), cpm: usd(cpm), plat: plat.name }
  const quotes = {
    ctr: quoteFor('ctr', scores.ctr, { ...vars, v: pctStr(ctr) }, rand(s)),
    cvr: quoteFor('cvr', scores.cvr, { ...vars, v: pctStr(cvr) }, rand(s)),
    aov: quoteFor('aov', scores.aov, { ...vars, v: usd(aov) }, rand(s)),
    roas: quoteFor('roas', scores.roas, { ...vars, v: roas.toFixed(2) }, rand(s)),
  }
  return {
    ctr, cvr, aov, cpm, cpa, roas,
    breakEvenRoas: econ.breakEvenRoas,
    marginPerOrder: econ.marginPerOrder,
    price,
    scores, overall, verdict, quotes,
    factors: {
      productAngle: combos.productAngle,
      anglePlatform: combos.anglePlatform,
      nichePlatform: combos.nichePlatform,
      focusAccuracy: acc,
      trendBonus: trend,
      bugPenalty,
      convRatio: C,
      trafficRatio: T,
    },
  }
}

// ---------------------------------------------------------------------------
// Post-mortem
// ---------------------------------------------------------------------------
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const money0 = (x: number) => `${x < 0 ? '−' : ''}$${Math.round(Math.abs(x)).toLocaleString('en-US')}`
const moneyK = (x: number) => (Math.abs(x) >= 10_000 ? `${x < 0 ? '−' : ''}$${(Math.abs(x) / 1000).toFixed(1)}k` : money0(x))

/** Per-stage focus advice ("Store: more ✍️ Copy, less 📸 Visuals suits Pain Point"). */
export function focusTipsFor(l: Pick<Launch, 'angle' | 'platform' | 'sliders'>): string[] {
  const ideal = idealFocusFor(l.angle, l.platform)
  const angle = ANGLES[l.angle]
  const tips: string[] = []
  let spotOn = 0
  STAGES.forEach((st, i) => {
    const n = normalize3(l.sliders[i] ?? [1, 1, 1])
    const d = n.map((x, k) => x - ideal[i][k])
    const l1 = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2])
    if (l1 < 0.12) { spotOn++; return }
    const under = [0, 1, 2].reduce((a, k) => (d[k] < d[a] ? k : a), 0)
    const over = [0, 1, 2].reduce((a, k) => (d[k] > d[a] ? k : a), 0)
    const A = (k: number) => { const ar = AREAS[st.areas[k]]; return `${ar.icon} ${ar.name}` }
    const plat = PLATFORMS[l.platform]
    const onPlat = (i === 2 && ['tiktak', 'reels', 'poogle', 'tiktak_shop'].includes(l.platform)) || (i === 1 && l.platform === 'pinterestt') ? ` on ${plat.short}` : ''
    const strength = l1 >= 0.45 ? 'way ' : ''
    tips.push(`${st.icon} ${st.name}: ${strength}more ${A(under)}, less ${A(over)} suits ${angle.icon} ${angle.name}${onPlat}.`)
  })
  if (spotOn === 3) tips.push(`🎯 Focus was spot-on in every stage for ${angle.icon} ${angle.name}. Save that recipe.`)
  else if (spotOn > 0 && tips.length) tips.push(`🎯 The other ${spotOn === 1 ? 'stage was' : `${spotOn} stages were`} dialed in nicely.`)
  return tips
}

function productClue(p: Product): string | null {
  const natural = mappedAngles(p)[0]
  switch (natural) {
    case 'pain_point': return `Buyers kept mentioning the problem ${p.name} fixes.`
    case 'convenience': return `Reviews kept saying "saves me so much time".`
    case 'gift': return `Lots of orders shipped to a different address than the buyer's — gifts?`
    case 'wholesome': return p.niche === 'pet' ? 'The comments were wall-to-wall pet photos.' : p.niche === 'baby' || p.niche === 'kids' ? 'Parents in the comments were getting emotional.' : 'Customers talked about how it made them feel, not what it does.'
    case 'aesthetic': return 'Every UGC video was about how it looks on camera.'
    case 'luxury': return 'Your richest customers were the happiest ones.'
    case 'budget': return 'Half the comments were "wait, how is it this cheap?"'
    case 'social_proof': return 'People bought after seeing friends buy it.'
    default: return null
  }
}

const COMBO_LINES: Record<'pa' | 'ap' | 'np', Record<ComboRating, string>> = {
  pa: {
    great: '✓✓ {prod} + {angle} is a match made in heaven.',
    good: '✓ {angle} suits {prod} well.',
    ok: '~ {angle} was only okay for {prod}.',
    bad: '✗ {angle} was a bad pitch for {prod} — buyers didn\'t buy the story.',
  },
  ap: {
    great: '✓✓ {angle} ads feel native on {plat}.',
    good: '✓ {angle} ads work on {plat}.',
    ok: '~ {angle} ads on {plat} were so-so.',
    bad: '✗ {angle} ads flopped on {plat} — wrong crowd for that pitch.',
  },
  np: {
    great: '✓✓ {plat} is exactly where {prod} buyers hang out.',
    good: '✓ {plat} has plenty of {prod} buyers.',
    ok: '~ {plat} was a lukewarm home for {prod}.',
    bad: '✗ {prod} buyers barely use {plat}.',
  },
}

export function buildPostMortem(s: GameState, l: Launch): PostMortem {
  const p = productById(l.productId)
  const angle = ANGLES[l.angle]
  const plat = PLATFORMS[l.platform]
  const rv = l.review
  const run = l.sales
  const upfront = l.upfront ?? SIZES[l.size].upfront
  const extra = Number(run?.flags.extraCosts ?? 0)
  const c2 = (x: number) => Math.round(x * 100) / 100
  const totals = {
    revenue: c2(run?.totalRevenue ?? 0),
    spend: c2((run?.totalSpend ?? 0) + upfront + extra),
    profit: c2(run ? run.totalProfit : -upfront),
    units: Math.round(run?.units ?? 0),
    weeks: run?.weeks.length ?? 0,
  }
  const verdict: Verdict = rv?.verdict ?? 'flop'
  const killed = l.status === 'killed'

  // headline
  let headline: string
  const name = l.name
  if (killed && totals.weeks <= 4 && totals.profit < 0) headline = `✂️ ${name} got the axe in week ${totals.weeks}. Smart cut — only ${money0(-totals.profit)} lost.`
  else if (totals.profit >= 0) {
    headline = verdict === 'winner' ? `🏆 ${name} was a certified banger: ${moneyK(totals.profit)} profit in ${totals.weeks} weeks.`
      : verdict === 'solid' ? `✅ ${name} paid the bills: ${moneyK(totals.profit)} profit over ${totals.weeks} weeks.`
        : verdict === 'breakeven' ? `😐 ${name} scraped by with ${moneyK(totals.profit)} profit.`
          : `🍀 ${name} reviewed badly but still squeaked out ${moneyK(totals.profit)}.`
  } else {
    headline = VERDICT_RANK[verdict] >= 2 ? `😬 ${name} reviewed well but finished ${moneyK(-totals.profit)} in the red.`
      : verdict === 'breakeven' ? `😕 ${name} hovered around break-even and ended ${moneyK(-totals.profit)} in the red.`
        : `💀 ${name} flopped: ${moneyK(-totals.profit)} down the drain.`
  }

  // combos (revealed)
  const keys = comboKeys(p, l.angle, l.platform)
  const ratings = comboRatings(s, l.productId, l.angle, l.platform)
  const combos: PostMortem['combos'] = [
    { key: keys.pa, rating: ratings.productAngle, label: comboLabel(keys.pa) },
    { key: keys.ap, rating: ratings.anglePlatform, label: comboLabel(keys.ap) },
    { key: keys.np, rating: ratings.nichePlatform, label: comboLabel(keys.np) },
  ]

  const fill = (t: string) => t.replace('{prod}', p.name).replace('{angle}', `${angle.icon} ${angle.name}`).replace('{plat}', `${plat.icon} ${plat.name}`)
  const notes: string[] = [
    fill(COMBO_LINES.pa[ratings.productAngle]),
    fill(COMBO_LINES.ap[ratings.anglePlatform]),
    fill(COMBO_LINES.np[ratings.nichePlatform]),
  ]
  if (ratings.productAngle === 'ok' || ratings.productAngle === 'bad') {
    const clue = productClue(p)
    if (clue) notes.push(`🕵️ Clue: ${clue}`)
  }

  if (rv) {
    const f = rv.factors
    if (f.trafficRatio < 0.75) notes.push(`${POINT_TYPES.traffic.icon} Traffic points hit only ${Math.round(f.trafficRatio * 100)}% of what the market expects. More 🎬 Hooks/🎯 Targeting — or more people on the team.`)
    if (f.convRatio < 0.75) notes.push(`${POINT_TYPES.conv.icon} Conversion points hit only ${Math.round(f.convRatio * 100)}% of the market bar. A copywriter would earn their salary here.`)
    if (f.trafficRatio >= 1.3 && f.convRatio >= 1.3) notes.push(`💪 Your team out-built the market (${Math.round(((f.trafficRatio + f.convRatio) / 2) * 100)}% of expected points). Time to think bigger?`)
    if (f.bugPenalty >= 0.12) notes.push(`${POINT_TYPES.bugs.icon} ${Math.round(l.points.bugs)} complaints cost ~${Math.round(f.bugPenalty * 100)}% of your conversion rate. More 🧪 Quality, or Polish before launching.`)
    else if ((l.bugsFixed ?? 0) >= 1) notes.push(`🧽 Polish cleared ${Math.round(l.bugsFixed ?? 0)} ${POINT_TYPES.bugs.icon} before launch. Buyers noticed.`)
    if (l.priceTier === 'premium' && l.angle !== 'luxury' && rv.scores.cvr < 6) notes.push('💎 Premium pricing scared buyers off. Save it for 💎 Luxury angles (or a famous brand).')
    if (l.priceTier === 'budget' && l.angle !== 'budget' && rv.breakEvenRoas > 2) notes.push(`🪙 Budget pricing left only ${usd(rv.marginPerOrder)} per order (break-even ROAS ${rv.breakEvenRoas.toFixed(2)}). Cheap only works for 💸 Budget angles.`)
    else if (rv.breakEvenRoas >= 2.6) notes.push(`🧮 Break-even ROAS of ${rv.breakEvenRoas.toFixed(2)} is brutal — ${usd(rv.marginPerOrder)} margin per order can't feed paid ads. Pick pricier products or bundle.`)
    if (f.trendBonus >= 1.1) notes.push(`📈 A trend was on your side (+${Math.round((f.trendBonus - 1) * 100)}% demand). Timing matters.`)
    if (run?.flags.builtOnShifts && (f.trafficRatio < 0.85 || f.convRatio < 0.85)) notes.push("🍔 Built on McDoodle's shifts at half speed. Once launches pay 2× your paycheck, quitting doubles your output.")
  }
  // seasonality: launching a seasonal product off-peak
  const season0 = run ? Number(run.flags.season0 ?? 1) : 1
  const peak = p.seasonality.indexOf(Math.max(...p.seasonality))
  if (season0 <= 0.88 && Math.max(...p.seasonality) >= 1.2) {
    notes.push(`📅 Off-season launch: demand sat ~${Math.round((1 - season0) * 100)}% below normal. ${p.name} peaks in ${MONTHS_LONG[peak]} — seasonal products want their season.`)
  } else if (season0 >= 1.15) notes.push(`📅 Perfect timing — you launched into ${p.name}'s high season (+${Math.round((season0 - 1) * 100)}% demand).`)
  const prevLaunches = run ? Number(run.flags.prevLaunches ?? 0) : Math.max(0, (s.playbook.launchedProducts[p.id] ?? 1) - 1)
  if (prevLaunches >= 1) notes.push(`♻️ You've launched ${p.name} ${prevLaunches === 1 ? 'before' : `${prevLaunches} times before`} — its audience was partly tapped out. Variety keeps demand fresh.`)

  if (run) {
    const fl = run.flags
    const lossWeeks = Number(fl.lossWeeksIgnored ?? 0)
    const lossAmt = Number(fl.lossAfterSignal ?? 0)
    const scales = Number(fl.scales ?? 0)
    const refreshes = Number(fl.refreshes ?? 0)
    const maxFat = Number(fl.maxFatigue ?? 0)
    if (killed && totals.weeks <= 4 && VERDICT_RANK[verdict] <= 1) notes.push(`✂️ Killed in week ${totals.weeks}. Cutting losers fast is the #1 dropshipping skill.`)
    if (lossWeeks >= 3) notes.push(`🩸 Kept a loser running ${lossWeeks} weeks after the numbers turned (${moneyK(lossAmt)}). When ROAS sits under break-even, kill or cut.`)
    const scaledTxt = scales === 1 ? 'once' : `${scales} times`
    if (scales >= 1 && totals.profit > 0) notes.push(`🚀 Scaled up ${scaledTxt} (budget peaked at ${Number(fl.peakMult ?? run.budgetMult).toFixed(1)}×) and it paid off.`)
    else if (scales >= 1 && totals.profit <= 0) notes.push(`📉 Scaled up ${scaledTxt}, but bigger budgets bought pricier customers. Scale only while ROAS stays well above break-even.`)
    if (scales === 0 && VERDICT_RANK[verdict] >= 2 && totals.profit > 0) notes.push(`🐢 Never scaled a ${VERDICTS[verdict].label.toLowerCase()} launch. Winners deserve bigger budgets — money left on the table.`)
    if (refreshes >= 1) notes.push(`🎨 ${refreshes} creative refresh${refreshes > 1 ? 'es' : ''} kept it alive longer.`)
    else if (maxFat >= 0.45 && totals.weeks >= 6) notes.push(`😴 Creatives hit ${Math.round(maxFat * 100)}% fatigue and never got refreshed. Fresh ads = fresh ROAS.`)
    if (run.marginBoost >= 0.18) notes.push('📦 Going bulk cut unit costs — fatter margin on every order.')
    if (Number(fl.bfcmRevenue ?? 0) > 0) notes.push(`🛍️ Black Friday week brought in ${moneyK(Number(fl.bfcmRevenue))}.`)
  }

  return { headline, notes, combos, focusTips: focusTipsFor(l), totals }
}

/** Seeded-free helper for UIs: normalized sliders as percentages. */
export const sliderPercents = (w: readonly number[]): Triple => normalize3(w).map(x => Math.round(x * 100)) as Triple
