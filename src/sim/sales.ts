// OWNER: sim-core. Sales runs, scale calls, kill/refresh/scale actions. PUBLIC API.
import type { Decision, DecisionOption, FX, GameState, Launch, LaunchRecord, SalesRun, SalesWeek } from '../core/types'
import { clamp, randRange } from '../core/rng'
import { uid } from '../core/ids'
import { earn, spend } from '../core/money'
import { toast } from '../core/notify'
import { isBfcm } from '../core/time'
import { landedCost, productById } from '../data/catalog'
import { SIZES, sizeRank } from '../data/sizes'
import { PLATFORMS } from '../data/platforms'
import { VERDICTS } from '../data/quotes'
import { buildPostMortem, VERDICT_RANK } from './evaluate'
import { recordLaunchKnowledge } from './playbook'
import { cpmMultiplier, resolveWorldDecision, seasonDemand, trendMult } from './world'

// ---------------------------------------------------------------------------
// Tuning (DESIGN §5)
// ---------------------------------------------------------------------------
export const SALES = {
  /** product life constant L (weeks) by trend kind */
  life: { evergreen: 22, rising: 14, fad: 7, declining: 9 } as Record<string, number>,
  brandLifeBonus: 1.2,
  /** * week 0 while the ad account learns (DESIGN 0.8) */
  learningWeek: 0.85,
  /** * weeks at peak before the decay starts (week 0 is the learning week) — winners get a real run before they fade */
  plateauWeeks: 4,
  /** * weekly seasonality swings are dampened (the launch-time season is already in the review); BFCM stays full strength */
  seasonExp: 0.5,
  noise: 0.1,
  fatigueCap: 0.9,
  /** run ends when revenue < endFrac × peak for endWeeks consecutive weeks (after minWeeks) */
  endFrac: 0.12, endWeeks: 2, minWeeks: 4, maxWeeks: 104,
  /** * scaling cap per size (keeps a test launch a test launch) */
  maxBudgetMult: { test: 3, standard: 2.5, big: 4, mega: 4 } as Record<string, number>,
  /** * days a scale call stays in the tray (DESIGN 21 = 10.5 s at 1× — too quick to read, think and click) */
  decisionDays: 28,
  scaleRatio: 1.25, killRatio: 0.85,
  /** * refresh call threshold (DESIGN 0.25): at 0.25 every TikTak launch asked for new creatives every 3 weeks */
  refreshFatigue: 0.3,
  /** after a call's expiry window, wait this many days before asking the same thing again (per launch) */
  reaskDays: 14,
  /** * "dead on arrival": a first week this far under break-even raises the kill call right away */
  doaRatio: 0.5,
  /** organic repeat orders per fan per week (with email flows) */
  organicRate: 0.0008,
  /** * launch buzz: a great review brings word-of-mouth orders (no ad spend) in the first sales weeks —
   *  +buzzPerPoint × (score − buzzFrom), capped, fading over buzzCurve. Big reviews = big early cash pops. */
  buzzFrom: 8, buzzPerPoint: 0.25, buzzMax: 0.5, buzzCurve: [0.6, 1, 0.7, 0.4] as number[],
  fansPerOrder: 0.6,
  bulkMarginBoost: 0.18,
}

/** Mutable weekly flags (SalesRun.flags keys) */
type RunFlags = SalesRun['flags']
const num = (f: RunFlags, k: string, d = 0) => (typeof f[k] === 'number' ? (f[k] as number) : d)

const usd0 = (x: number) => `${x < 0 ? '−' : ''}$${Math.round(Math.abs(x)).toLocaleString('en-US')}`

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------
/** Find a launch anywhere: in development, live, or recently ended (archive). */
export function findLaunch(s: GameState, id: string): Launch | undefined {
  if (s.current?.id === id) return s.current
  return s.live.find(l => l.id === id) ?? s.archive?.find(l => l.id === id)
}
export const findRecord = (s: GameState, id: string): LaunchRecord | undefined => s.history.find(r => r.id === id)
export const decisionsFor = (s: GameState, launchId: string) => s.decisions.filter(d => d.launchId === launchId)

/** Fresh sales run for a launch that just went live. */
export function newSalesRun(s: GameState, l: Launch): SalesRun {
  const feats = l.features
  return {
    weeks: [],
    budgetMult: 1,
    fatigue: 0,
    creativeGen: 1,
    startDay: s.day,
    totalRevenue: 0,
    totalProfit: -(l.upfront ?? SIZES[l.size].upfront),
    totalSpend: 0,
    units: 0,
    peakRevenue: 0,
    priceMult: 1,
    marginBoost: feats.includes('private_label') ? 0.08 : 0,
    flags: {
      season0: (seasonDemand(s, l.productId, s.day) || 1) / (isBfcm(s.day) ? 1.8 : 1),
      trend0: trendMult(s, l.niche, l.angle, l.platform) || 1,
      cpm0: cpmMultiplier(s, l.platform, s.day) || 1,
      prevLaunches: s.playbook.launchedProducts[l.productId] ?? 0,
      scales: 0, refreshes: 0, peakMult: 1, extraCosts: 0,
      builtOnShifts: s.dayJob.employed,
    },
  }
}

// ---------------------------------------------------------------------------
// Weekly projection (shared by the sim and the UI)
// ---------------------------------------------------------------------------
export interface WeekProjection {
  budget: number
  roas: number
  revenue: number
  units: number
  orders: number
  cogs: number
  fees: number
  profit: number
  breakEvenRoas: number
  /** roas / break-even */
  ratio: number
  /** one-off revenue multiplier in this week (viral / press / influencer boosts; 1 = none) */
  boost: number
}

/** Expected numbers for this launch's next sales week (noise-free unless `noise` is given). */
export function weeklyProjection(s: GameState, l: Launch, noise = 1): WeekProjection {
  const run = l.sales
  const rv = l.review
  if (!run || !rv) return { budget: 0, roas: 0, revenue: 0, units: 0, orders: 0, cogs: 0, fees: 0, profit: 0, breakEvenRoas: 99, ratio: 0, boost: 1 }
  const p = productById(l.productId)
  const fl = run.flags
  const t = run.weeks.length
  const stockout = num(fl, 'stockoutWeeks') > 0
  const cap = SALES.maxBudgetMult[l.size] ?? 4
  const budget = stockout ? 0 : SIZES[l.size].weeklyBudget * Math.min(run.budgetMult, cap)
  const L = (SALES.life[p.trendKind] ?? 22) * (s.brand >= 50 ? SALES.brandLifeBonus : 1)
  const life = t === 0 ? SALES.learningWeek : Math.exp(-Math.max(0, t - SALES.plateauWeeks) / L)
  const bfcm = isBfcm(s.day) ? 1.8 : 1
  const season = clamp(Math.pow(((seasonDemand(s, p.id, s.day) || 1) / bfcm) / num(fl, 'season0', 1), SALES.seasonExp), 0.4, 2) * bfcm
  const trend = clamp((trendMult(s, l.niche, l.angle, l.platform) || 1) / num(fl, 'trend0', 1), 0.4, 2.5)
  const cpm = clamp(num(fl, 'cpm0', 1) / (cpmMultiplier(s, l.platform, s.day) || 1), 0.3, 2)
  const feats = l.features
  const scaleEff = Math.pow(Math.max(0.05, run.budgetMult), feats.includes('automation') ? -0.14 : -0.2)
  const look = l.platform === 'fadbook' && feats.includes('lookalikes') ? 1.05 : 1
  const priceEff = Math.pow(Math.max(0.3, run.priceMult), -0.5)
  const learning = num(fl, 'learning') ? 0.85 : 1
  // viral weeks arrive through applyRevenueBoost (world.rollViral); viralBoost() is the UI's view of the same ×3 — never both
  const buzz = launchBuzz(rv.overall, t)
  const boost = (num(fl, 'boostWeeks') > 0 ? num(fl, 'boostMult', 1) : 1) * (1 + buzz)
  const shock = num(fl, 'roasMult', 1)
  const roas = rv.roas * life * (1 - run.fatigue) * season * trend * cpm * scaleEff * look * priceEff * learning * shock * noise
  const revenue = budget * roas * boost
  const price = rv.price * run.priceMult
  const aov = rv.aov * run.priceMult
  const orders = revenue / Math.max(0.01, aov)
  const units = revenue / Math.max(0.01, price)
  const landed = landedCost(p, { features: feats, size: l.size }) * (1 - run.marginBoost)
  const cogs = units * landed
  const fees = 0.03 * revenue + 0.3 * orders
  const margin = aov - landed * (aov / price) - 0.03 * aov - 0.3
  const breakEvenRoas = margin > 0.01 ? aov / margin : 99
  return {
    budget, roas: budget > 0 ? revenue / budget : 0, revenue, units, orders, cogs, fees,
    profit: revenue - budget - cogs - fees, breakEvenRoas, ratio: budget > 0 ? revenue / budget / breakEvenRoas : 0, boost,
  }
}

/** Word-of-mouth share of extra (organic) revenue in sales week `t` for a review score (0 = none). */
export function launchBuzz(overall: number, t: number): number {
  const w = SALES.buzzCurve[t] ?? 0
  return w * Math.min(SALES.buzzMax, SALES.buzzPerPoint * Math.max(0, overall - SALES.buzzFrom))
}

/** Health badge for a live launch based on its last week. */
export function launchHealth(l: Launch): { label: string; tone: 'gold' | 'good' | 'warn' | 'bad' | 'info'; ratio: number } {
  const w = l.sales?.weeks.at(-1)
  if (!w || !l.sales) return { label: 'Warming up', tone: 'info', ratio: 0 }
  const be = num(l.sales.flags, 'lastBe', l.review?.breakEvenRoas ?? 99)
  const ratio = w.spend > 0 ? num(l.sales.flags, 'lastRatio', w.roas / be) : 0
  if (w.spend <= 0) return { label: 'Paused', tone: 'warn', ratio }
  if (ratio >= 1.6) return { label: 'On fire', tone: 'gold', ratio }
  if (ratio >= 1.1) return { label: 'Profitable', tone: 'good', ratio }
  if (ratio >= 0.9) return { label: 'Break-even', tone: 'warn', ratio }
  return { label: 'Bleeding', tone: 'bad', ratio }
}

export function refreshCost(s: GameState, launchId: string): number {
  const l = s.live.find(x => x.id === launchId)
  if (!l || !l.sales) return 0
  const size = SIZES[l.size]
  return Math.round(0.08 * size.weeklyBudget * l.sales.budgetMult + 150 * size.mult)
}
/** Upfront cost of going bulk: 4 × last week's COGS (min: 4 × projected COGS). */
export function bulkCost(s: GameState, launchId: string): number {
  const l = s.live.find(x => x.id === launchId)
  if (!l || !l.sales) return 0
  const last = l.sales.weeks.at(-1)?.cogs ?? 0
  return Math.round(4 * Math.max(last, weeklyProjection(s, l).cogs))
}

// ---------------------------------------------------------------------------
// Weekly sales
// ---------------------------------------------------------------------------
function runWeek(s: GameState, l: Launch): SalesWeek {
  const run = l.sales as SalesRun
  const fl = run.flags
  const pj = weeklyProjection(s, l, randRange(s, 1 - SALES.noise, 1 + SALES.noise))
  const t = run.weeks.length
  spend(s, pj.budget, 'adSpend')
  earn(s, pj.revenue, 'revenue')
  spend(s, pj.cogs, 'cogs')
  spend(s, pj.fees, 'fees')
  s.stats.lifetimeProfit += pj.profit

  const week: SalesWeek = {
    week: t, day: s.day, spend: pj.budget, revenue: pj.revenue, units: pj.units, cogs: pj.cogs, fees: pj.fees,
    profit: pj.profit, roas: pj.roas, fatigue: run.fatigue,
  }
  run.weeks.push(week)
  run.totalRevenue += pj.revenue
  run.totalProfit += pj.profit
  run.totalSpend += pj.budget
  run.units += pj.units
  run.peakRevenue = Math.max(run.peakRevenue, pj.revenue)
  // demand fade is judged on revenue per unit of budget (throttles, cuts and scaling don't count as fading),
  // without one-off boosts — a viral week must not make every normal week after it look "faded"
  const norm = pj.budget > 0 ? pj.revenue / Math.max(1, pj.boost) / Math.max(0.05, run.budgetMult) : 0
  fl.peakNorm = Math.max(num(fl, 'peakNorm'), norm)

  // audience & reputation
  const email = l.features.includes('email_flows')
  s.fans += Math.round(pj.orders * SALES.fansPerOrder * (email ? 1.5 : 1))
  if (pj.budget > 0) {
    const brandDelta = (pj.ratio >= 1.3 ? 0.12 : pj.ratio >= 1 ? 0.04 : pj.ratio < 0.85 ? -0.1 : 0) - (l.review?.factors.bugPenalty ?? 0) * 0.3
    s.brand = clamp(s.brand + brandDelta, 0, 100)
  }
  if (isBfcm(s.day)) fl.bfcmRevenue = num(fl, 'bfcmRevenue') + pj.revenue

  // creative fatigue, one-off effects
  run.fatigue = Math.min(SALES.fatigueCap, run.fatigue + PLATFORMS[l.platform].fatigue * (pj.budget > 0 ? 1 : 0.3))
  fl.maxFatigue = Math.max(num(fl, 'maxFatigue'), run.fatigue)
  if (num(fl, 'learning')) fl.learning = 0
  if (num(fl, 'boostWeeks') > 0) fl.boostWeeks = num(fl, 'boostWeeks') - 1
  if (num(fl, 'stockoutWeeks') > 0) fl.stockoutWeeks = num(fl, 'stockoutWeeks') - 1

  // loser tracking ("kept a loser running N weeks")
  if (pj.budget > 0 && pj.ratio < SALES.killRatio) {
    fl.losing = num(fl, 'losing') + 1
    if (num(fl, 'losing') > 2) {
      fl.lossWeeksIgnored = num(fl, 'lossWeeksIgnored') + 1
      fl.lossAfterSignal = num(fl, 'lossAfterSignal') + Math.min(0, pj.profit)
    }
  } else if (pj.budget > 0) fl.losing = 0

  // fade-out tracking
  if (pj.budget > 0 && t >= 1 && norm < SALES.endFrac * num(fl, 'peakNorm')) fl.lowWeeks = num(fl, 'lowWeeks') + 1
  else if (pj.budget > 0) fl.lowWeeks = 0
  fl.lastRatio = Math.round((pj.ratio / Math.max(1, pj.boost)) * 1000) / 1000
  fl.lastBe = Math.round(pj.breakEvenRoas * 1000) / 1000
  return week
}

function pushDecision(s: GameState, l: Launch, kind: Decision['kind'], title: string, body: string, options: DecisionOption[]) {
  s.decisions.push({ id: uid(s, 'd'), launchId: l.id, kind, title, body, options, createdDay: s.day, expiresDay: s.day + SALES.decisionDays })
  // don't re-ask the same thing right after it expires
  ;(l.sales as SalesRun).flags[`cd_${kind}`] = s.day + SALES.decisionDays + SALES.reaskDays
}

function maybeDecision(s: GameState, l: Launch, w: SalesWeek) {
  const run = l.sales as SalesRun
  const rv = l.review
  if (!rv || s.decisions.some(d => d.launchId === l.id)) return
  const fl = run.flags
  const t = run.weeks.length
  const be = num(fl, 'lastBe', rv.breakEvenRoas)
  const ratio = w.spend > 0 ? num(fl, 'lastRatio', w.roas / be) : 0
  const ready = (k: string) => s.day >= num(fl, `cd_${k}`)
  const size = SIZES[l.size]
  const budgetNow = size.weeklyBudget * run.budgetMult

  const doa = w.spend > 0 && ratio < SALES.doaRatio && t <= 2
  if ((num(fl, 'losing') >= 2 || doa) && ready('kill')) {
    pushDecision(s, l, 'kill', doa ? `💀 ${l.name} is dead on arrival` : `🩸 ${l.name} is bleeding`,
      doa
        ? `ROAS ${w.roas.toFixed(2)} vs ${be.toFixed(2)} break-even in week ${t} — losing ${usd0(-w.profit)}/wk. No amount of hope fixes that gap.`
        : `ROAS ${w.roas.toFixed(2)} vs ${be.toFixed(2)} break-even for ${num(fl, 'losing')} weeks — losing ${usd0(-w.profit)}/wk.`,
      [
        { id: 'kill', label: 'Kill it', tone: 'critical', hint: 'End the run, get the post-mortem' },
        { id: 'cut', label: 'Cut budget 50%', hint: `${usd0(budgetNow * 0.5)}/wk` },
        { id: 'keep', label: 'Keep going', hint: 'Hope is not a strategy' },
      ])
    return // first_kill tip: world.coachTriggers (spaced one lesson at a time)
  }
  if (run.fatigue >= SALES.refreshFatigue && t >= 2 && ratio >= 0.6 && ready('refresh')) {
    const cost = refreshCost(s, l.id)
    pushDecision(s, l, 'refresh', `😴 Ad fatigue on ${l.name}`,
      `CTR down ~${Math.round(run.fatigue * 100)}% — people have seen these ads a dozen times. Fresh creatives for ${usd0(cost)}?`,
      [
        { id: 'refresh', label: 'Refresh creatives', cost, tone: 'primary', hint: 'Resets fatigue to 0%' },
        { id: 'ignore', label: 'Ignore' },
      ])
    return // first_refresh tip: world.coachTriggers
  }
  const sinceScale = t - num(fl, 'lastScaleWeek', -99)
  if (ratio >= SALES.scaleRatio && sinceScale >= 2 && run.budgetMult < (SALES.maxBudgetMult[l.size] ?? 4) - 0.01 && ready('scale') && w.spend > 0) {
    pushDecision(s, l, 'scale', `🔥 ${l.name} is printing`,
      `ROAS ${w.roas.toFixed(2)} vs ${be.toFixed(2)} break-even (${usd0(w.profit)} profit last week). Pour on more fuel?`,
      [
        { id: 'scale50', label: '+50% budget', tone: 'primary', hint: `${usd0(budgetNow * 1.5)}/wk` },
        { id: 'double', label: 'Double it', hint: `${usd0(budgetNow * 2)}/wk · learning phase −15% next week` },
        { id: 'hold', label: 'Hold' },
      ])
    return // first_scale tip: world.coachTriggers
  }
  const bulkable = s.unlocked.features.includes('warehouse_3pl') && VERDICT_RANK[rv.verdict] >= 2 && sizeRank(l.size) >= 1 &&
    run.marginBoost < SALES.bulkMarginBoost && !num(fl, 'bulk') && t >= 2 && ratio >= 1
  if (bulkable && ready('go_bulk')) {
    const cost = bulkCost(s, l.id)
    pushDecision(s, l, 'go_bulk', `📦 Go bulk on ${l.name}?`,
      `Pre-buy a container at warehouse prices: ${usd0(cost)} now for ~${Math.round(SALES.bulkMarginBoost * 100)}% cheaper units for the rest of the run.`,
      [
        { id: 'bulk', label: 'Buy in bulk', cost, tone: 'primary', hint: 'Fatter margin on every order' },
        { id: 'skip', label: 'Not now' },
      ])
  }
}

/** Company-level organic repeat revenue from the fan list (needs Email flows). */
function organicWeek(s: GameState): number {
  if (!s.activeFeatures.includes('email_flows') || s.fans < 50) return 0
  const aov = typeof s.flags.lastAov === 'number' ? s.flags.lastAov : 35
  const revenue = s.fans * SALES.organicRate * aov * (0.8 + 0.4 * (s.brand / 100))
  const cost = revenue * 0.4
  earn(s, revenue, 'revenue')
  spend(s, cost, 'cogs')
  s.stats.lifetimeProfit += revenue - cost
  s.flags.organicRevenue = (typeof s.flags.organicRevenue === 'number' ? s.flags.organicRevenue : 0) + revenue
  return revenue
}

/** Weekly update for every live launch (called at week start). */
export function weeklySales(s: GameState): FX[] {
  const fx: FX[] = []
  let weekRevenue = 0
  let anyProfit = false
  const ending: string[] = []
  for (const l of s.live) {
    if (l.status !== 'live' || !l.sales || !l.review) continue
    const w = runWeek(s, l)
    weekRevenue += w.revenue
    if (Math.abs(w.profit) >= 1) fx.push({ kind: 'cash', amount: Math.round(w.profit) })
    if (w.profit > 0) anyProfit = true
    s.flags.lastAov = Math.round(l.review.aov * 100) / 100
    const fl = l.sales.flags
    const t = l.sales.weeks.length
    if ((t >= SALES.minWeeks && num(fl, 'lowWeeks') >= SALES.endWeeks) || t >= SALES.maxWeeks) ending.push(l.id)
    else maybeDecision(s, l, w)
  }
  weekRevenue += organicWeek(s)
  for (const id of ending) endLaunch(s, id, 'faded')
  if (weekRevenue > s.stats.peakWeekRevenue) s.stats.peakWeekRevenue = weekRevenue
  if (anyProfit) fx.push({ kind: 'sound', sound: 'chaching' })
  // surface queued post-mortems one at a time
  if (!s.flags.pendingPostMortem && typeof s.flags.postMortemQueue === 'string' && s.flags.postMortemQueue) {
    const [next, ...rest] = s.flags.postMortemQueue.split(',')
    s.flags.pendingPostMortem = next
    s.flags.postMortemQueue = rest.join(',')
  }
  return fx
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
export function scaleLaunch(s: GameState, launchId: string, mult: number): void {
  const l = s.live.find(x => x.id === launchId)
  if (!l?.sales || !(mult > 0)) return
  const run = l.sales
  const before = run.budgetMult
  run.budgetMult = clamp(run.budgetMult * mult, 0.25, SALES.maxBudgetMult[l.size] ?? 4)
  if (mult > 1) {
    run.flags.scales = num(run.flags, 'scales') + 1
    run.flags.lastScaleWeek = run.weeks.length
    run.flags.peakMult = Math.max(num(run.flags, 'peakMult', 1), run.budgetMult)
    if (mult >= 2) run.flags.learning = 1
    toast(s, 'good', `📈 ${l.name}: budget ${before.toFixed(1)}× → ${run.budgetMult.toFixed(1)}× (${usd0(SIZES[l.size].weeklyBudget * run.budgetMult)}/wk).`)
  } else {
    run.flags.losing = 0
    toast(s, 'info', `✂️ ${l.name}: budget cut to ${usd0(SIZES[l.size].weeklyBudget * run.budgetMult)}/wk.`)
  }
}

export function refreshCreatives(s: GameState, launchId: string): void {
  const l = s.live.find(x => x.id === launchId)
  if (!l?.sales) return
  const cost = refreshCost(s, launchId)
  spend(s, cost, 'expenses')
  s.stats.lifetimeProfit -= cost
  const run = l.sales
  run.totalProfit -= cost
  run.flags.extraCosts = num(run.flags, 'extraCosts') + cost
  run.flags.refreshes = num(run.flags, 'refreshes') + 1
  run.fatigue = 0
  run.creativeGen += 1
  toast(s, 'info', `🎨 Fresh creatives for ${l.name} (v${run.creativeGen}). Fatigue reset.`, -cost)
}

export function goBulk(s: GameState, launchId: string): void {
  const l = s.live.find(x => x.id === launchId)
  if (!l?.sales) return
  const cost = bulkCost(s, launchId)
  spend(s, cost, 'cogs')
  s.stats.lifetimeProfit -= cost * 0.5 // half of it is inventory that sells through; the rest is the real cost of commitment
  const run = l.sales
  run.totalProfit -= cost * 0.5
  run.flags.extraCosts = num(run.flags, 'extraCosts') + cost * 0.5
  run.flags.bulk = 1
  run.marginBoost = Math.max(run.marginBoost, SALES.bulkMarginBoost)
  toast(s, 'good', `📦 Container ordered for ${l.name}! Unit costs down ~${Math.round(SALES.bulkMarginBoost * 100)}%.`, -cost)
}

export function killLaunch(s: GameState, launchId: string): void {
  endLaunch(s, launchId, 'killed')
}

/** End a run: post-mortem, history, playbook, flags.pendingPostMortem = launchId. */
export function endLaunch(s: GameState, launchId: string, reason: 'faded' | 'killed'): void {
  const idx = s.live.findIndex(l => l.id === launchId)
  if (idx < 0) return
  const l = s.live[idx]
  l.status = reason === 'killed' ? 'killed' : 'ended'
  recordLaunchKnowledge(s, l)
  const pm = buildPostMortem(s, l)
  l.postMortem = pm
  const rv = l.review
  s.history.push({
    id: l.id, name: l.name, productId: l.productId, angle: l.angle, platform: l.platform, size: l.size,
    launchDay: l.launchDay ?? l.startDay, endDay: s.day,
    overall: rv?.overall ?? 0, verdict: rv?.verdict ?? 'flop',
    revenue: pm.totals.revenue, profit: pm.totals.profit,
    niche: l.niche, priceTier: l.priceTier, review: rv, postMortem: pm,
    weeklyRevenue: (l.sales?.weeks ?? []).map(w => Math.round(w.revenue)),
    endReason: reason,
  })
  s.live.splice(idx, 1)
  if (!s.archive) s.archive = []
  s.archive.push(l)
  if (s.archive.length > 12) s.archive.splice(0, s.archive.length - 12)
  s.decisions = s.decisions.filter(d => d.launchId !== launchId)
  if (s.flags.pendingPostMortem && s.flags.pendingPostMortem !== launchId) {
    const q = typeof s.flags.postMortemQueue === 'string' && s.flags.postMortemQueue ? s.flags.postMortemQueue.split(',') : []
    q.push(launchId)
    s.flags.postMortemQueue = q.join(',')
  } else s.flags.pendingPostMortem = launchId
  const v = rv ? VERDICTS[rv.verdict] : VERDICTS.flop
  toast(s, pm.totals.profit >= 0 ? 'money' : 'bad',
    reason === 'killed' ? `✂️ Killed ${l.name} after ${pm.totals.weeks} weeks. Post-mortem ready.` : `📉 ${l.name} has run its course (${v.emoji} ${usd0(pm.totals.profit)} total). Post-mortem ready.`,
    Math.round(pm.totals.profit))
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------
export type DecisionHandler = (s: GameState, d: Decision, optionId: string) => void
/** Registry for decision kinds owned by other modules (world events: price_match, influencer, restock, custom). */
function handlerMap(): Map<string, DecisionHandler> {
  // stored on the (hoisted) function object so registration works even during circular module init
  const holder = handlerMap as unknown as { m?: Map<string, DecisionHandler> }
  if (!holder.m) holder.m = new Map()
  return holder.m
}
export function registerDecisionHandler(kind: Decision['kind'] | string, fn: DecisionHandler): void {
  handlerMap().set(kind, fn)
}

export function resolveDecision(s: GameState, decisionId: string, optionId: string): void {
  const i = s.decisions.findIndex(d => d.id === decisionId)
  if (i < 0) return
  const d = s.decisions[i]
  s.decisions.splice(i, 1)
  const l = s.live.find(x => x.id === d.launchId)
  const cd = (k: string, days: number) => { if (l?.sales) l.sales.flags[`cd_${k}`] = s.day + days }
  switch (d.kind) {
    case 'scale':
      if (!l) return
      if (optionId === 'scale50') scaleLaunch(s, l.id, 1.5)
      else if (optionId === 'double') scaleLaunch(s, l.id, 2)
      else cd('scale', 14)
      return
    case 'refresh':
      if (!l) return
      if (optionId === 'refresh') refreshCreatives(s, l.id)
      else cd('refresh', 21)
      return
    case 'kill':
      if (!l) return
      if (optionId === 'kill') killLaunch(s, l.id)
      else if (optionId === 'cut') { scaleLaunch(s, l.id, 0.5); cd('kill', 14) }
      else cd('kill', 14)
      return
    case 'go_bulk':
      if (!l) return
      if (optionId === 'bulk') goBulk(s, l.id)
      else cd('go_bulk', 56)
      return
    default: {
      const h = handlerMap().get(d.kind)
      if (h) h(s, d, optionId)
      else resolveWorldDecision(s, d, optionId) // influencer / price_match / restock (sim-meta); anything else is dismissed
    }
  }
}

// ---------------------------------------------------------------------------
// Hooks for world events (sim-meta): boosts, stockouts, price changes
// ---------------------------------------------------------------------------
/** Multiply a live launch's revenue for the next `weeks` sales weeks (viral moment, press, influencer). */
export function applyRevenueBoost(s: GameState, launchId: string, mult: number, weeks = 1): void {
  const l = s.live.find(x => x.id === launchId)
  if (!l?.sales) return
  l.sales.flags.boostMult = Math.max(num(l.sales.flags, 'boostWeeks') > 0 ? num(l.sales.flags, 'boostMult', 1) : 1, mult)
  l.sales.flags.boostWeeks = Math.max(num(l.sales.flags, 'boostWeeks'), weeks)
}
/** Pause ads & sales for `weeks` sales weeks (supplier stockout, ad account ban). */
export function applyStockout(s: GameState, launchId: string, weeks: number): void {
  const l = s.live.find(x => x.id === launchId)
  if (!l?.sales) return
  l.sales.flags.stockoutWeeks = Math.max(num(l.sales.flags, 'stockoutWeeks'), weeks)
}
/** Change a live launch's price (competitor undercut / price match). mult 0.85 = −15%. */
export function setPriceMult(s: GameState, launchId: string, mult: number): void {
  const l = s.live.find(x => x.id === launchId)
  if (!l?.sales) return
  l.sales.priceMult = clamp(mult, 0.4, 2)
}
/** Scale ROAS for the rest of the run (e.g. competitor undercut you didn't match: 0.85). */
export function applyRoasShock(s: GameState, launchId: string, mult: number): void {
  const l = s.live.find(x => x.id === launchId)
  if (!l?.sales) return
  l.sales.flags.roasMult = clamp(num(l.sales.flags, 'roasMult', 1) * mult, 0.2, 3)
}
