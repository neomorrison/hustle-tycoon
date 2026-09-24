// OWNER: sim-meta. Calendar events, trends, platforms, random events, modals, coach, milestones. PUBLIC API.
import type { AngleId, Decision, DecisionOption, EventModal, FX, GameState, Launch, NicheId, PlatformId, Trend } from '../core/types'
import { chance, clamp, lognormal, pick, randInt, randRange, weightedPick } from '../core/rng'
import { uid } from '../core/ids'
import { earn, spend } from '../core/money'
import { coach, toast } from '../core/notify'
import { compact, money } from '../core/format'
import { DAYS_PER_WEEK, DAYS_PER_YEAR, dayOf, isBfcm, isMonthStart, isWeekStart, monthOf, weekOfMonth, yearOf } from '../core/time'
import { resolveBankrupt } from './economy'
import { applyRevenueBoost, applyRoasShock, applyStockout, registerDecisionHandler, setPriceMult } from './sales'
import { affordableResearch, hasActiveFeature, hasBoost } from './research'
import { drainFX, grantXp, queueFX, refreshCandidates } from './staff'
import { findProduct } from '../data/catalog'
import { SIZES } from '../data/sizes'
import { MILESTONES } from '../data/milestones'
import { COACH, type CoachId } from '../data/coach'
import { officeMoveCost } from '../data/offices'
import { ANGLE_LABEL, NICHE_LABEL, PLATFORM_LABEL, TREND_NAMES, targetLabel } from '../data/trends'
import {
  BUZZ_BAD, BUZZ_GOOD, COPYCATS, FLAVOR, INFLUENCERS, NEWS, PRESS_HEADLINES, PRESS_OUTLETS, SEASON_TOASTS, STAFF_MOMENTS, WINDFALLS, fill,
} from '../data/events'

// ============================================================================ constants & helpers
const ALL_NICHES = Object.keys(NICHE_LABEL) as NicheId[]
const ALL_ANGLES = Object.keys(ANGLE_LABEL) as AngleId[]
const ALL_PLATFORMS = Object.keys(PLATFORM_LABEL) as PlatformId[]
/** Y1 · Jun · W1 — Instaglam Reels launches */
export const REELS_NEWS_DAY = dayOf(1, 5, 1)
/** Y2 · Mar · W1 — TikTak Shop launches */
export const TIKTAK_SHOP_NEWS_DAY = dayOf(2, 2, 1)
const ALGO_MIN_DAY = dayOf(1, 8, 1)
/** Revenue multiplier for a launch's viral week (applied through sales.applyRevenueBoost). */
export const VIRAL_MULT = 3
/** * "new research affordable" toast: at most every N weeks, and only if you haven't researched for M weeks */
const RESEARCH_NUDGE_COOLDOWN_WEEKS = 10
const RESEARCH_NUDGE_IDLE_WEEKS = 6
/** * weeks between any two viral moments company-wide (was 2: a TikTak-heavy catalog went viral every ~70 real seconds) */
const VIRAL_GLOBAL_COOLDOWN_WEEKS = 5
/** * days an influencer / copycat card stays open (was 14 = 7 s at 1×). Restock cards keep 14: the boat lands by then. */
const OFFER_DAYS = 21
const VIRAL_PLATFORMS: PlatformId[] = ['tiktak', 'reels', 'tiktak_shop']
const INFLUENCER_ANGLES = new Set<AngleId>(['aesthetic', 'social_proof', 'gift', 'luxury', 'wholesome', 'before_after'])
export const WORLD_DECISION_KINDS: Decision['kind'][] = ['influencer', 'price_match', 'restock']

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const flagNum = (s: GameState, k: string, d = 0) => num(s.flags[k], d)
const r3 = (x: number) => Math.round(x * 1000) / 1000
const round50 = (x: number) => Math.max(50, Math.round(x / 50) * 50)
const $ = (n: number) => money(n, { cents: false })
const platName = (p: PlatformId) => PLATFORM_LABEL[p]?.name ?? p
const first = (name: string) => name.split(' ')[0]
/** Stable pick from a list keyed by a string (so decision copy can be re-derived at resolve time). */
function stablePick<T>(list: readonly T[], key: string): T {
  let h = 7
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return list[Math.abs(h) % list.length]
}

const lastWeek = (l: Launch) => (l.sales && l.sales.weeks.length ? l.sales.weeks[l.sales.weeks.length - 1] : undefined)
const weeksLive = (l: Launch) => l.sales?.weeks.length ?? 0
/** Live launches with a review and a sales run. */
const runs = (s: GameState) => s.live.filter(l => l.status === 'live' && !!l.sales && !!l.review)
const hasDecision = (s: GameState, launchId: string) => s.decisions.some(d => d.launchId === launchId)
const weeklyBudget = (l: Launch) => (SIZES[l.size]?.weeklyBudget ?? 700) * (l.sales?.budgetMult ?? 1)
const lastSpend = (l: Launch) => lastWeek(l)?.spend || weeklyBudget(l)
const goodVerdict = (l: Launch) => l.review?.verdict === 'solid' || l.review?.verdict === 'winner'

function pushModal(s: GameState, m: Omit<EventModal, 'id'>) {
  s.modals.push({ id: uid(s, 'm'), ...m })
  s.flags['w:lastEvent'] = s.day
}
function pushDecision(s: GameState, d: Omit<Decision, 'id' | 'createdDay' | 'expiresDay'>, days = 21): Decision {
  const dec: Decision = { id: uid(s, 'd'), createdDay: s.day, expiresDay: s.day + days, ...d }
  s.decisions.push(dec)
  s.flags['w:lastEvent'] = s.day
  return dec
}
/** coach() that reports whether it actually fired (for 1-tip-per-day pacing). */
function tryCoach(s: GameState, id: CoachId, force = false): boolean {
  if (s.flags.coachOff) return false
  if (!force && s.flags[`coach:${id}`] !== undefined) return false
  coach(s, id, COACH[id], force)
  return true
}
/** Coach Kev tip by id (fires once per save). */
export function coachTip(s: GameState, id: CoachId, force = false): void { tryCoach(s, id, force) }
/** First time a dialog opens — ui calls act(s => coachDialog(s, 'research')). */
export function coachDialog(s: GameState, dialogId: string): void {
  const id = `dlg:${dialogId}`
  if (id in COACH) tryCoach(s, id as CoachId)
}

// ============================================================================ pauses (stockouts / ad bans / CNY)
// Built on sim/sales.applyStockout (ads & sales pause for N sales weeks; paused weeks never count as "fading").
// We remember WHY a launch is paused so the card can show it and we can toast when it's back.
export type PauseKind = 'stockout' | 'ban' | 'cny'
const PAUSE_CODE: Record<PauseKind, number> = { stockout: 1, ban: 2, cny: 3 }
const PAUSE_BY_CODE: Record<number, PauseKind> = { 1: 'stockout', 2: 'ban', 3: 'cny' }
/** Why a live launch's ads are paused (null = running). */
export function pauseKind(l: Launch): PauseKind | null {
  const f = l.sales?.flags
  if (!f || num(f.stockoutWeeks) <= 0) return null
  return PAUSE_BY_CODE[num(f.pauseKind)] ?? 'stockout'
}
function pauseLaunch(s: GameState, l: Launch, kind: PauseKind, weeks: number) {
  if (!l.sales) return
  applyStockout(s, l.id, weeks)
  l.sales.flags.pauseKind = PAUSE_CODE[kind]
}
function unpauseLaunch(l: Launch) {
  if (!l.sales) return
  l.sales.flags.stockoutWeeks = 0
  delete l.sales.flags.pauseKind
}
/** Week start (after weeklySales consumed a paused week): toast launches that are back online (one toast per cause). */
function tickPauses(s: GameState) {
  const back: Record<PauseKind, string[]> = { ban: [], cny: [], stockout: [] }
  for (const l of s.live) {
    const f = l.sales?.flags
    if (!f || f.pauseKind === undefined || num(f.stockoutWeeks) > 0) continue
    const kind = PAUSE_BY_CODE[num(f.pauseKind)]
    delete f.pauseKind
    if (l.status !== 'live' || !kind) continue
    back[kind].push(l.name)
  }
  const list = (names: string[]) => (names.length === 1 ? `${names[0]} is` : `${names.length} launches are`)
  if (back.ban.length) toast(s, 'good', `✅ Ad account restored — ${list(back.ban)} back online.`)
  if (back.cny.length) toast(s, 'good', `🧧 Factories are back — ${back.cny.length === 1 ? `${back.cny[0]} is` : `${back.cny.length} products are`} shipping again.`)
  if (back.stockout.length) toast(s, 'good', `📦 ${back.stockout.length === 1 ? `${back.stockout[0]} is` : `${back.stockout.length} launches are`} back in stock — ads at full speed.`)
}

// ============================================================================ seasons & CPM
const giftWeight = (giftable: number) => clamp((giftable - 0.3) / 0.4, 0, 1)
export const cnyActive = (day: number) => monthOf(day) === 1 && weekOfMonth(day) <= 2

/** Seasonal demand multiplier: the product's own seasonality × holiday rules (dampened where the product already peaks). */
export function seasonDemand(_s: GameState, productId: string, day: number): number {
  const p = findProduct(productId)
  const m = monthOf(day)
  const base = p?.seasonality?.[m] ?? 1
  const g = p ? giftWeight(p.giftable) : 0
  const niche = p?.niche
  let slump = 1
  let boost = 1
  if (m === 0) slump = 0.8
  if (m === 1) boost *= 1 + 0.3 * g
  if (m === 4) boost *= niche === 'wellness' || niche === 'beauty' ? 1.25 : 1 + 0.25 * g
  if (m >= 5 && m <= 7 && niche === 'outdoor') boost *= 1.35
  if (m === 7 && (niche === 'gadgets' || niche === 'kids')) boost *= 1.2
  if (m === 11) boost *= 1 + 0.3 * g
  // products whose seasonality already encodes the holiday peak only get part of the boost
  const w = clamp((1.6 - base) / 0.6, 0.3, 1)
  let mult = base * slump * Math.pow(boost, w)
  if (isBfcm(day)) mult *= 1.8
  return r3(mult)
}

/** Seasonal CPM factor only (Jan ×0.8, Oct ×1.1, Nov ×1.15, BFCM ×1.5, Dec ×1.2). */
export function seasonCpm(day: number): number {
  const m = monthOf(day)
  if (isBfcm(day)) return 1.5
  return m === 0 ? 0.8 : m === 9 ? 1.1 : m === 10 ? 1.15 : m === 11 ? 1.2 : 1
}
/** Reach lost to the TikTak ban scare: same budget, 30% fewer eyeballs → effectively CPM ÷ 0.7. */
function scareFactor(s: GameState, platform: PlatformId, day: number): number {
  if (platform !== 'tiktak' && platform !== 'tiktak_shop') return 1
  const start = s.flags['news:ban_scare']
  return typeof start === 'number' && day >= start && flagNum(s, 'pe:scareUntil') > day ? 1 / 0.7 : 1
}
/** CPM multiplier = season × BFCM × yearly inflation × platform drift (algorithm updates, maturity) × ban-scare reach loss. */
export function cpmMultiplier(s: GameState, platform: PlatformId, day: number): number {
  return r3(seasonCpm(day) * (s.market.cpmInflation || 1) * (s.market.platforms[platform]?.cpmMult ?? 1) * scareFactor(s, platform, day))
}

export interface SeasonInfo { emoji: string; text: string; tone: 'good' | 'bad' | 'info' }
/** Short HUD label for the current season (null for plain months). */
export function seasonLabel(day: number): SeasonInfo | null {
  if (isBfcm(day)) return { emoji: '🛍️', text: 'BFCM week — revenue ×1.8, CPM ×1.5', tone: 'good' }
  if (cnyActive(day)) return { emoji: '🧧', text: 'Chinese New Year — factories closed', tone: 'bad' }
  switch (monthOf(day)) {
    case 0: return { emoji: '❄️', text: 'January slump — cheap CPMs', tone: 'info' }
    case 1: return { emoji: '💘', text: "Valentine's — gifts ×1.3", tone: 'good' }
    case 4: return { emoji: '🌸', text: "Mother's Day — gifts & beauty up", tone: 'good' }
    case 5: case 6: return { emoji: '☀️', text: 'Summer — outdoor ×1.35', tone: 'good' }
    case 7: return { emoji: '🎒', text: 'Back to school — gadgets & kids ×1.2', tone: 'good' }
    case 9: return { emoji: '🎃', text: 'Q4 — CPMs ×1.1', tone: 'info' }
    case 10: return { emoji: '🦃', text: 'Pre-BFCM — CPMs ×1.15', tone: 'info' }
    case 11: return { emoji: '🎄', text: 'Holiday rush — gifts ×1.3', tone: 'good' }
    default: return null
  }
}

// ============================================================================ platforms
function recomputePlatforms(s: GameState) {
  const years = s.day / DAYS_PER_YEAR
  const algo = flagNum(s, 'pe:algoUntil') > s.day
  const scare = flagNum(s, 'pe:scareUntil') > s.day
  const age = (p: PlatformId) => { const d = s.flags[`news:${p}`]; return typeof d === 'number' ? Math.max(0, s.day - d) / DAYS_PER_YEAR : 0 }
  const set = (p: PlatformId, cpm: number, reach: number) => {
    const st = s.market.platforms[p]
    if (!st) return
    const c = r3(cpm)
    const r = r3(reach)
    if (st.cpmMult !== c) st.cpmMult = c
    if (st.reach !== r) st.reach = r
  }
  set('fadbook', (1 + Math.min(0.12, 0.03 * years)) * (algo ? 1.2 : 1), 1)
  set('tiktak', 1 + Math.min(0.15, 0.05 * years), Math.min(1, 0.8 + 0.1 * years) * (scare ? 0.7 : 1))
  set('reels', 0.85 + Math.min(0.15, 0.1 * age('reels')), Math.min(1, 0.7 + 0.2 * age('reels')))
  set('pinterestt', 1, 1)
  set('poogle', 1 + Math.min(0.08, 0.02 * years), 1)
  set('tiktak_shop', 0.85 + Math.min(0.15, 0.1 * age('tiktak_shop')), Math.min(1, 0.75 + 0.2 * age('tiktak_shop')) * (scare ? 0.7 : 1))
}

function newsModal(s: GameState, key: 'reels' | 'tiktak_shop') {
  const n = NEWS[key]
  s.flags[`news:${key}`] = s.day
  const st = s.market.platforms[key]
  if (st) st.available = true
  recomputePlatforms(s)
  pushModal(s, { kind: 'news', title: n.title, emoji: n.emoji, body: n.body, options: [{ id: 'ok', label: 'Noted 📝', tone: 'primary' }], data: { platform: key } })
}

// ============================================================================ trends
function trendPool(s: GameState, kind: Trend['kind'], unlockedOnly: boolean): { target: string; w: number }[] {
  const active = new Set(s.market.trends.map(t => `${t.kind}:${t.target}`))
  const list: string[] = kind === 'niche' ? ALL_NICHES : kind === 'angle' ? ALL_ANGLES
    : ALL_PLATFORMS.filter(p => s.market.platforms[p]?.available)
  const owned: readonly string[] = kind === 'niche' ? s.unlocked.niches : kind === 'angle' ? s.unlocked.angles : s.unlocked.platforms
  return list
    .filter(t => !active.has(`${kind}:${t}`))
    .map(t => ({ target: t, w: owned.includes(t) ? 5 : unlockedOnly ? 0 : 1 }))
    .filter(x => x.w > 0)
}
function rollTrendTarget(s: GameState, unlockedOnly: boolean): { kind: Trend['kind']; target: string } | null {
  const kinds: Trend['kind'][] = ['niche', 'angle', 'platform']
  const weights: Record<Trend['kind'], number> = { niche: 0.45, angle: 0.35, platform: 0.2 }
  const avail = kinds.filter(k => trendPool(s, k, unlockedOnly).length > 0)
  if (!avail.length) return null
  const kind = weightedPick(s, avail, k => weights[k])
  const pool = trendPool(s, kind, unlockedOnly)
  return { kind, target: weightedPick(s, pool, x => x.w).target }
}
/** * weeks until the first trend: lands just after the first review (a 7-week test build at McDoodle's speed) so launch #2
 *  can ride it on purpose — at 3–5 weeks it inflated launch #1, and half of expert games "won" before learning anything */
const FIRST_TREND_WEEKS: [number, number] = [7, 9]
function scheduleNextTrend(s: GameState, firstTrend = false) {
  const gap = firstTrend ? randInt(s, FIRST_TREND_WEEKS[0], FIRST_TREND_WEEKS[1]) : randInt(s, 8, 14)
  s.flags['w:trendDay'] = s.day + gap * DAYS_PER_WEEK
  const t = rollTrendTarget(s, firstTrend)
  if (t) {
    s.flags['w:trendKind'] = t.kind
    s.flags['w:trendTarget'] = t.target
  } else {
    delete s.flags['w:trendKind']
    delete s.flags['w:trendTarget']
  }
  delete s.flags['w:radarWarned']
}
function trendName(s: GameState, kind: Trend['kind'], target: string): string {
  const names = (TREND_NAMES[kind] as Record<string, readonly string[]>)[target]
  const lbl = targetLabel(kind, target)
  return `${lbl.emoji} ${names?.length ? pick(s, names) : `${lbl.name} craze`}`
}
function isOwnedTarget(s: GameState, kind: Trend['kind'], target: string) {
  const owned: readonly string[] = kind === 'niche' ? s.unlocked.niches : kind === 'angle' ? s.unlocked.angles : s.unlocked.platforms
  return owned.includes(target)
}
function spawnTrend(s: GameState) {
  let kind = s.flags['w:trendKind'] as Trend['kind'] | undefined
  let target = s.flags['w:trendTarget'] as string | undefined
  if (!kind || !target || s.market.trends.some(t => t.kind === kind && t.target === target)) {
    const t = rollTrendTarget(s, false)
    kind = t?.kind
    target = t?.target
  }
  if (kind && target) {
    const mult = Math.round(randRange(s, 1.3, 1.6) * 20) / 20
    const weeks = randInt(s, 10, 16) + (hasBoost(s, 'market_radar') ? 3 : 0)
    const trend: Trend = { id: uid(s, 'tr'), kind, target, mult, startDay: s.day, endDay: s.day + weeks * DAYS_PER_WEEK, label: trendName(s, kind, target) }
    s.market.trends.push(trend)
    const name = targetLabel(kind, target).name
    const what = kind === 'niche' ? `${name} products` : kind === 'angle' ? `${name}-angle launches` : `Launches on ${name}`
    const locked = !isOwnedTarget(s, kind, target)
    toast(s, 'info', `📈 TREND: ${trend.label}! ${what} ×${mult.toFixed(2)} for ~${weeks} weeks${locked ? ' — research it to cash in' : ''}.`)
    tryCoach(s, 'first_trend')
    s.flags['w:lastEvent'] = s.day
  }
  scheduleNextTrend(s)
}
function expireTrends(s: GameState) {
  if (!s.market.trends.some(t => t.endDay <= s.day)) return
  for (const t of s.market.trends) if (t.endDay <= s.day) toast(s, 'info', `📉 ${t.label} is cooling off.`)
  s.market.trends = s.market.trends.filter(t => t.endDay > s.day)
}
const trendActive = (s: GameState, t: Trend) => t.startDay <= s.day && t.endDay > s.day

/** Demand multiplier from active trends for a launch config (1 = none). */
export function trendMult(s: GameState, niche: NicheId, angle: AngleId, platform: PlatformId): number {
  let m = 1
  for (const t of s.market.trends) {
    if (!trendActive(s, t)) continue
    if ((t.kind === 'niche' && t.target === niche) || (t.kind === 'angle' && t.target === angle) || (t.kind === 'platform' && t.target === platform)) m *= t.mult
  }
  return Math.min(2.5, r3(m))
}
/** Active trends touching a config (for New Launch badges). */
export function trendsFor(s: GameState, sel: { niche?: NicheId; angle?: AngleId; platform?: PlatformId }): Trend[] {
  return s.market.trends.filter(t => trendActive(s, t) &&
    ((t.kind === 'niche' && t.target === sel.niche) || (t.kind === 'angle' && t.target === sel.angle) || (t.kind === 'platform' && t.target === sel.platform)))
}
export const activeTrends = (s: GameState) => s.market.trends.filter(t => trendActive(s, t))

// ============================================================================ viral
/** ×3 while a launch's viral week is pending, else 1. Informational (UI) — the boost itself is applied via sales.applyRevenueBoost. */
export function viralBoost(s: GameState, launchId: string): number {
  const l = s.live.find(x => x.id === launchId)
  return num(l?.sales?.flags.viral) > 0 ? VIRAL_MULT : 1
}
function decayViral(s: GameState) {
  for (const l of s.live) {
    const f = l.sales?.flags
    if (!f || num(f.viral) <= 0) continue
    // set on an earlier week start → its boosted week has just been paid out by weeklySales
    if (num(f.viralDay) < s.day) f.viral = Math.max(0, num(f.viral) - 1)
  }
}
function rollViral(s: GameState, fx: FX[]) {
  if (flagNum(s, 'cd:viral') > s.day) return
  const p = 0.08 * (hasBoost(s, 'growth_hacks') ? 1.6 : 1)
  for (const l of runs(s)) {
    const f = l.sales!.flags
    if (!VIRAL_PLATFORMS.includes(l.platform) || (l.review!.scores.ctr ?? 0) < 8) continue
    if (num(f.viral) > 0 || num(f.viralCd) > s.day) continue
    if (!chance(s, p)) continue
    applyRevenueBoost(s, l.id, VIRAL_MULT, 1)
    f.viral = 1
    f.viralDay = s.day
    f.viralCd = s.day + 6 * DAYS_PER_WEEK
    const views = compact(Math.round(randRange(s, 1.2, 9.5) * 10) * 100_000)
    const fans = Math.round(clamp((lastWeek(l)?.units ?? 60) * 1.5, 150, 60_000))
    s.fans += fans
    s.brand = Math.min(100, s.brand + 3)
    s.flags['w:viralCount'] = flagNum(s, 'w:viralCount') + 1
    s.flags['cd:viral'] = s.day + VIRAL_GLOBAL_COOLDOWN_WEEKS * DAYS_PER_WEEK
    s.flags['w:lastEvent'] = s.day
    toast(s, 'good', `🚀 ${l.name} went VIRAL on ${platName(l.platform)} — ${views} views! Next week's sales ×${VIRAL_MULT}, +${fans.toLocaleString('en-US')} fans.`)
    tryCoach(s, 'viral')
    fx.push({ kind: 'confetti' }, { kind: 'sound', sound: 'winner' })
    return
  }
}

// ============================================================================ bonus sales (influencer posts)
function bonusSales(s: GameState, l: Launch, targetRevenue: number): { orders: number; revenue: number; gross: number } {
  const r = l.review!
  const sales = l.sales!
  const pm = sales.priceMult || 1
  const aov = Math.max(1, r.aov * pm)
  const margin = clamp((r.marginPerOrder - r.aov * (1 - pm)) / aov, 0.05, 0.9)
  const orders = Math.max(1, Math.round(targetRevenue / aov))
  const revenue = Math.round(orders * aov)
  const cogs = Math.round(revenue * (1 - margin))
  earn(s, revenue, 'revenue')
  spend(s, cogs, 'cogs')
  sales.totalRevenue += revenue
  sales.totalProfit += revenue - cogs
  sales.units += orders
  s.stats.lifetimeProfit += revenue - cogs
  s.fans += Math.round(orders * (hasActiveFeature(s, 'email_flows') ? 0.9 : 0.6))
  return { orders, revenue, gross: revenue - cogs }
}

// ============================================================================ world decisions (non-blocking cards)
const influencerHandle = (d: { id: string }, l?: Launch) => stablePick(l ? [...INFLUENCERS[l.niche], ...INFLUENCERS.any] : INFLUENCERS.any, d.id)
const copycatStore = (d: { id: string }) => stablePick(COPYCATS, d.id)

function influencerOffer(s: GameState, l: Launch) {
  const net = hasActiveFeature(s, 'influencer_network')
  const cost = round50(Math.max(300, lastSpend(l) * randRange(s, 0.6, 1.1)) * (net ? 0.8 : 1))
  const followers = compact(Math.round(cost / randRange(s, 0.006, 0.012) / 1000) * 1000)
  const p = findProduct(l.productId)
  const giftCost = Math.round(Math.max(40, (p?.cogs ?? 8) * 5))
  const id = uid(s, 'd')
  const handle = influencerHandle({ id }, l)
  s.decisions.push({
    id, launchId: l.id, kind: 'influencer', createdDay: s.day, expiresDay: s.day + OFFER_DAYS,
    title: `🤳 ${handle} wants to post ${l.name}`,
    body: `${followers} followers in ${NICHE_LABEL[l.niche].name}. Paid post for ${$(cost)} — or they might do it for free product.`,
    options: [
      { id: 'pay', label: `Pay ${$(cost)}`, cost, tone: 'primary', hint: 'Bonus sales + fans (a gamble)' },
      { id: 'gift', label: 'Send free product', cost: giftCost, hint: '~40% chance they post' },
      { id: 'pass', label: 'Pass' },
    ],
  })
  s.flags['w:lastEvent'] = s.day
  tryCoach(s, 'influencer')
}

function priceMatchOffer(s: GameState, l: Launch) {
  const cut = randInt(s, 15, 30)
  const cost = round50(lastSpend(l) * 0.5 + 200)
  const d = pushDecision(s, {
    launchId: l.id, kind: 'price_match', title: '', body: '',
    options: [
      { id: 'match', label: 'Match price (−12%)', tone: 'primary', hint: 'Keep volume, thinner margin' },
      { id: 'outbrand', label: `Out-brand them (${$(cost)})`, cost, hint: 'Fresh UGC + brand +2' },
      { id: 'hold', label: 'Hold the line', tone: 'critical', hint: 'ROAS −15% for the rest of the run' },
    ],
  }, OFFER_DAYS)
  const store = copycatStore(d)
  d.title = `🥷 ${store} is copying ${l.name}`
  d.body = `Same product, ${cut}% cheaper, running your exact ad angle. Customers are comparison-shopping.`
  tryCoach(s, 'price_match')
}

function stockoutEvent(s: GameState, l: Launch) {
  pauseLaunch(s, l, 'stockout', 2)
  const backup = hasBoost(s, 'backup_supplier')
  const cogs = lastWeek(l)?.cogs || weeklyBudget(l) * 0.4
  const cost = round50((cogs * 0.5 + 150) * (backup ? 0.5 : 1))
  pushDecision(s, {
    launchId: l.id, kind: 'restock', title: `📦 Stockout: ${l.name}`,
    body: 'Your AliExprez supplier ran dry — ads are paused because orders can\'t ship. The slow boat takes ~2 weeks.',
    options: [
      { id: 'air', label: `Air-freight (${$(cost)})`, cost, tone: 'primary', hint: 'Back to selling next week' },
      { id: 'wait', label: 'Wait for the boat', hint: '2 weeks with ads paused' },
    ],
  }, 14)
  toast(s, 'bad', `📦 ${l.name} is out of stock! Ads paused until the restock lands.`)
  tryCoach(s, 'stockout')
}

/**
 * Resolve a world-made decision ('influencer' | 'price_match' | 'restock').
 * sim/sales.resolveDecision delegates these kinds here. Removes the decision. Returns false if not a world decision.
 */
export function resolveWorldDecision(s: GameState, decision: Decision | string, optionId: string): boolean {
  const d = typeof decision === 'string' ? s.decisions.find(x => x.id === decision) : decision
  if (!d || !WORLD_DECISION_KINDS.includes(d.kind)) return false
  const id = d.id
  const kind = d.kind
  const launchId = d.launchId
  const opt = d.options.find(o => o.id === optionId)
  const cost = opt?.cost ?? 0
  s.decisions = s.decisions.filter(x => x.id !== id)
  const l = s.live.find(x => x.id === launchId && x.status === 'live')
  if (!l || !l.sales || !l.review) return true
  const sales = l.sales

  if (kind === 'influencer') {
    const handle = influencerHandle({ id }, l)
    if (optionId === 'pay' || optionId === 'gift') {
      const paid = optionId === 'pay'
      spend(s, cost, paid ? 'adSpend' : 'cogs')
      sales.totalSpend += paid ? cost : 0
      sales.totalProfit -= cost
      s.stats.lifetimeProfit -= cost
      if (!paid && !chance(s, 0.4)) {
        toast(s, 'info', `📭 ${handle} kept the free ${l.name} and ghosted you. Classic.`)
        return true
      }
      const fit = (0.6 + 0.4 * (l.review.scores.cvr ?? 5) / 7) * (INFLUENCER_ANGLES.has(l.angle) ? 1.15 : 1) *
        (hasActiveFeature(s, 'influencer_network') ? 1.25 : 1)
      const stake = paid ? cost : Math.max(cost * 4, lastSpend(l) * 0.4)
      const mult = 2.6 * fit * lognormal(s, 0.55) * (paid ? 1 : 0.6)
      const res = bonusSales(s, l, stake * mult)
      const net = res.gross - cost
      toast(s, net >= 0 ? 'money' : 'bad',
        `🤳 ${handle}'s post: ${res.orders.toLocaleString('en-US')} orders, +${$(res.revenue)} revenue (${net >= 0 ? 'net +' : 'net '}${$(net)}).`, net)
      if (mult >= 4.5) queueFX({ kind: 'confetti' }, { kind: 'sound', sound: 'chaching' })
      else if (net > 0) queueFX({ kind: 'sound', sound: 'chaching' })
    }
    return true
  }

  if (kind === 'price_match') {
    const store = copycatStore({ id })
    if (optionId === 'match') {
      setPriceMult(s, l.id, r3((sales.priceMult || 1) * 0.88))
      toast(s, 'info', `🏷️ Matched ${store}'s price on ${l.name} (−12%). Volume protected, margins thinner.`)
    } else if (optionId === 'outbrand') {
      spend(s, cost, 'adSpend')
      sales.totalSpend += cost
      sales.totalProfit -= cost
      s.stats.lifetimeProfit -= cost
      sales.fatigue = Math.max(0, sales.fatigue - 0.2)
      s.brand = Math.min(100, s.brand + 2)
      toast(s, 'good', `💅 Fresh UGC + a brand glow-up: ${l.name} looks like the original again (brand +2).`)
    } else {
      applyRoasShock(s, l.id, 0.85)
      toast(s, 'bad', `🥷 Customers drifted to ${store}. ${l.name}'s ROAS takes a −15% hit for the rest of the run.`)
    }
    return true
  }

  // restock
  if (optionId === 'air') {
    spend(s, cost, 'cogs')
    sales.totalProfit -= cost
    s.stats.lifetimeProfit -= cost
    unpauseLaunch(l)
    toast(s, 'good', `✈️ Air-freight landed — ${l.name} is back to full speed.`)
  } else {
    toast(s, 'info', `🚢 Slow boat it is. ${l.name} will be restocked in ~2 weeks.`)
  }
  return true
}

// sim/sales.resolveDecision dispatches these kinds to us (registry survives circular module init).
for (const kind of WORLD_DECISION_KINDS) registerDecisionHandler(kind, (s, d, optionId) => { resolveWorldDecision(s, d, optionId) })

/** Unanswered world decisions resolve to their default when they expire (price war → you held the line). */
function applyDecisionDefaults(s: GameState) {
  const due = s.decisions.filter(d => d.kind === 'price_match' && d.expiresDay <= s.day)
  for (const d of due) resolveWorldDecision(s, d.id, 'hold')
}

// ============================================================================ blocking modals (news, CNY, bans, expo)
function adBan(s: GameState, l: Launch) {
  const crisis = hasBoost(s, 'crisis_pr')
  const affected = runs(s).filter(x => x.platform === l.platform && pauseKind(x) === null)
  const weekly = affected.reduce((a, x) => a + lastSpend(x), 0)
  const cost = round50((weekly * 0.6 + 400) * (crisis ? 0.5 : 1))
  const reason = l.angle === 'before_after' ? 'before/after claims' : 'bold health claims'
  const plat = platName(l.platform)
  const options: DecisionOption[] = []
  if (s.cash >= cost) options.push({ id: 'agency', label: `Rent an agency account (${$(cost)})`, cost, tone: 'primary', hint: 'Ads back online right away' })
  options.push({ id: 'appeal', label: 'Appeal and wait', tone: options.length ? 'default' : 'primary', hint: 'Ads dark for ~2 weeks' })
  pushModal(s, {
    kind: 'ad_ban', emoji: '🚫', title: `${plat} disabled your ad account!`,
    body: `"${l.name}" got flagged for ${reason}. ${affected.length > 1 ? `All ${affected.length} of your ${plat} launches are` : 'Its ads are'} dark until you sort it out.`,
    options, data: { launchIds: affected.map(x => x.id), cost, platform: l.platform },
  })
  tryCoach(s, 'ad_ban')
}
function rollAdBan(s: GameState) {
  if (flagNum(s, 'cd:ban') > s.day) return
  const risky = runs(s).filter(l => pauseKind(l) === null && (l.angle === 'before_after' || (findProduct(l.productId)?.claimRisk ?? 0) >= 0.5))
  if (!risky.length) return
  if (!chance(s, 0.06 * (hasBoost(s, 'crisis_pr') ? 0.5 : 1))) return
  adBan(s, pick(s, risky))
  s.flags['cd:ban'] = s.day + 10 * DAYS_PER_WEEK
}

function cnyWarning(s: GameState, year: number) {
  s.flags[`w:cny${year}`] = 'pending'
  const live = runs(s)
  const cost = round50(live.reduce((a, l) => a + (lastWeek(l)?.cogs || weeklyBudget(l) * 0.3), 0) * 0.8 + 100 * live.length)
  const agent = hasActiveFeature(s, 'sourcing_agent')
  const devNote = agent ? ' Your Sourcing Agent has quality covered.' : ' Launches in development during CNY pick up ~30% more complaints 🔴 (a Sourcing Agent prevents that).'
  const options: DecisionOption[] = []
  if (live.length) {
    if (s.cash >= cost) options.push({ id: 'prestock', label: `Pre-stock (${$(cost)})`, cost, tone: 'primary', hint: 'No stockouts in February' })
    options.push({ id: 'risk', label: 'Risk it', tone: options.length ? 'critical' : 'primary', hint: 'Live products pause for a week' })
  } else {
    options.push({ id: 'ok', label: 'Noted 👍', tone: 'primary' })
  }
  pushModal(s, {
    kind: 'cny', emoji: '🧧', title: 'Chinese New Year is coming',
    body: `Factories close for two weeks in February (W1–W2).${live.length ? ` Pre-stock your ${live.length} live product${live.length > 1 ? 's' : ''} now, or risk a 1-week stockout.` : ''}${devNote}`,
    options, data: { year, cost },
  })
  tryCoach(s, 'cny')
}
function cnyStart(s: GameState, year: number) {
  const choice = s.flags[`w:cny${year}`]
  const live = runs(s)
  if (!live.length && !s.current) return
  if (choice === 'prestock') {
    toast(s, 'good', '🧧 Chinese New Year: factories closed, but your warehouse is stocked. Business as usual.')
  } else if (live.length) {
    for (const l of live) if (pauseKind(l) === null) pauseLaunch(s, l, 'cny', 1)
    toast(s, 'bad', `🧧 Chinese New Year stockout: ${live.length} live product${live.length > 1 ? 's pause' : ' pauses'} ads for a week.`)
  }
  if (s.current && (s.current.status === 'dev' || s.current.status === 'qc') && !hasActiveFeature(s, 'sourcing_agent')) {
    toast(s, 'bad', `🧧 Your supplier is on holiday — expect ~30% more complaints 🔴 on ${s.current.name} for two weeks.`)
  }
  s.flags['w:lastEvent'] = s.day
}
/** During CNY, launches in development accrue +30% complaints unless a Sourcing Agent is active. */
function cnyDevBugs(s: GameState) {
  const cur = s.current
  const key = 'w:cnyBugs'
  if (!cur || cur.status !== 'dev' || !cnyActive(s.day) || hasActiveFeature(s, 'sourcing_agent')) {
    if (s.flags[key] !== undefined) { delete s.flags[key]; delete s.flags['w:cnyBugsId'] }
    return
  }
  const last = s.flags[key]
  if (typeof last === 'number' && s.flags['w:cnyBugsId'] === cur.id && cur.points.bugs > last) {
    cur.points.bugs += 0.3 * (cur.points.bugs - last)
  }
  s.flags[key] = cur.points.bugs
  s.flags['w:cnyBugsId'] = cur.id
}

function expoEvent(s: GameState, year: number) {
  s.flags[`w:expo${year}`] = 1
  if (s.office < 1) {
    toast(s, 'info', "🎪 The Ecom Expo is in town — booths need a real office address. Next year!")
    s.flags['w:lastEvent'] = s.day
    return
  }
  const options: DecisionOption[] = [{ id: 'skip', label: 'Skip it' }]
  if (s.cash >= 500) options.push({ id: 'booth', label: 'Booth ($500)', cost: 500, hint: '+200 fans, +20 🟣 RP' })
  if (s.office >= 3 && s.cash >= 5000) options.push({ id: 'premium', label: 'Premium booth ($5,000)', cost: 5000, hint: '+2,000 fans, brand +5, +60 🟣 RP' })
  if (s.office >= 5 && s.cash >= 40000) options.push({ id: 'keynote', label: 'Keynote slot ($40,000)', cost: 40000, hint: '+15,000 fans, brand +12, +200 🟣 RP' })
  options[options.length - 1].tone = 'primary'
  pushModal(s, {
    kind: 'expo', emoji: '🎪', title: `Ecom Expo — Year ${year}`,
    body: 'The biggest e-commerce trade show of the year: suppliers, creators, and 40,000 people holding free tote bags. Grab a booth?',
    options, data: { year },
  })
  tryCoach(s, 'expo')
}
const EXPO_REWARDS: Record<string, { cost: number; fans: number; brand: number; rp: number; text: string }> = {
  booth: { cost: 500, fans: 200, brand: 0, rp: 20, text: '🎪 Your folding-table booth was a hit' },
  premium: { cost: 5000, fans: 2000, brand: 5, rp: 60, text: '🎪 Premium booth packed all weekend' },
  keynote: { cost: 40000, fans: 15000, brand: 12, rp: 200, text: '🎤 Your keynote got a standing ovation' },
}

/** Resolve a blocking modal (all world kinds; 'bankrupt' delegates to sim/economy.resolveBankrupt). */
export function resolveModal(s: GameState, modalId: string, optionId: string): void {
  const idx = s.modals.findIndex(m => m.id === modalId)
  if (idx < 0) return
  const m = s.modals[idx]
  const kind = m.kind
  const data = (m.data ?? {}) as Record<string, unknown>
  const opt = m.options.find(o => o.id === optionId)
  s.modals.splice(idx, 1)

  switch (kind) {
    case 'bankrupt': case 'gameover': case 'game_over': {
      resolveBankrupt(s, optionId)
      return
    }
    case 'cny': {
      const year = num(data.year, yearOf(s.day))
      if (optionId === 'prestock') {
        spend(s, opt?.cost ?? num(data.cost), 'cogs')
        s.flags[`w:cny${year}`] = 'prestock'
        toast(s, 'good', '📦 Pre-stocked for Chinese New Year. Sleep easy.')
      } else {
        s.flags[`w:cny${year}`] = optionId === 'risk' ? 'risk' : 'ok'
      }
      return
    }
    case 'ad_ban': {
      const ids = Array.isArray(data.launchIds) ? (data.launchIds as string[]) : []
      const hit = s.live.filter(l => ids.includes(l.id) && l.status === 'live')
      if (optionId === 'agency') {
        spend(s, opt?.cost ?? num(data.cost), 'expenses')
        toast(s, 'info', `🕶️ Agency account rented — ${hit.length > 1 ? `${hit.length} launches are` : 'your ads are'} back online.`)
      } else {
        for (const l of hit) pauseLaunch(s, l, 'ban', 2)
        toast(s, 'bad', `📝 Appeal filed. ${hit.length > 1 ? `${hit.length} launches stay` : 'Ads stay'} dark for ~2 weeks.`)
      }
      return
    }
    case 'expo': {
      const r = EXPO_REWARDS[optionId]
      if (!r) return
      spend(s, opt?.cost ?? r.cost, 'expenses')
      s.fans += r.fans
      s.brand = Math.min(100, s.brand + r.brand)
      s.rp += r.rp
      s.flags['w:expoCount'] = flagNum(s, 'w:expoCount') + 1
      toast(s, 'good', `${r.text}: +${r.fans.toLocaleString('en-US')} fans${r.brand ? `, brand +${r.brand}` : ''}, +${r.rp} 🟣 RP!`)
      if (optionId !== 'booth') {
        refreshCandidates(s)
        toast(s, 'info', '🤝 You met some serious talent at the Expo — fresh candidates in 👥 Staff.')
      }
      queueFX({ kind: 'confetti' }, { kind: 'sound', sound: 'winner' })
      return
    }
    default:
      return // 'news' and informational modals just close
  }
}

// ============================================================================ random events (weekly director)
interface WorldEvent { id: string; weight: number; cooldown: number; run: () => void }

function pressEvent(s: GameState, fx: FX[]) {
  const outlet = pick(s, PRESS_OUTLETS)
  const headline = fill(pick(s, PRESS_HEADLINES), { company: s.meta.company, founder: s.meta.founder })
  const b = randInt(s, 3, 5)
  s.brand = Math.min(100, s.brand + b)
  const fans = Math.round(randRange(s, 150, 600) * (1 + s.brand / 25) * (1 + s.office * 0.5))
  s.fans += fans
  const star = runs(s).filter(goodVerdict).sort((a, b2) => (lastWeek(b2)?.revenue ?? 0) - (lastWeek(a)?.revenue ?? 0))[0]
  if (star) applyRevenueBoost(s, star.id, 1.3, 1)
  toast(s, 'good', `📰 ${outlet}: “${headline}” — brand +${b}, +${fans.toLocaleString('en-US')} fans${star ? `, ${star.name} sales +30% next week` : ''}!`)
  tryCoach(s, 'press')
  fx.push({ kind: 'confetti' }, { kind: 'sound', sound: 'ping' })
}
function chargebackEvent(s: GameState, l: Launch) {
  const shield = l.features.includes('chargeback_shield') || hasActiveFeature(s, 'chargeback_shield')
  const rev = lastWeek(l)?.revenue ?? weeklyBudget(l)
  const cost = Math.round((rev * randRange(s, 0.05, 0.1) + 40) * (shield ? 0.5 : 1) * (hasBoost(s, 'crisis_pr') ? 0.5 : 1))
  spend(s, cost, 'fees')
  if (l.sales) l.sales.totalProfit -= cost
  s.stats.lifetimeProfit -= cost
  const hit = shield ? 1 : 2
  s.brand = Math.max(0, s.brand - hit)
  toast(s, 'bad', `💳 Chargeback wave on ${l.name}: −${$(cost)}, brand −${hit}. Complaints 🔴 came home to roost.`, -cost)
  tryCoach(s, 'chargeback')
}
function buzzEvent(s: GameState) {
  const good = chance(s, 0.6)
  const n = 2
  s.brand = clamp(s.brand + (good ? n : -n), 0, 100)
  toast(s, good ? 'good' : 'bad', fill(pick(s, good ? BUZZ_GOOD : BUZZ_BAD), { company: s.meta.company, n }))
}
function windfallEvent(s: GameState) {
  const amt = round50(randRange(s, 150, 600) * (1 + s.office * 0.6))
  earn(s, amt, 'income')
  toast(s, 'money', `${pick(s, WINDFALLS)}: +${$(amt)}`, amt)
}
function staffMoment(s: GameState) {
  const p = pick(s, s.staff)
  toast(s, 'info', fill(pick(s, STAFF_MOMENTS), { name: first(p.name) }))
  grantXp(s, p.id, 10)
}
function flavorEvent(s: GameState) {
  const pool: string[] = [...FLAVOR.any, ...(s.office === 0 ? FLAVOR.basement : FLAVOR.office)]
  if (s.dayJob.employed) pool.push(...FLAVOR.dayJob, ...FLAVOR.dayJob)
  if (s.cash >= 250_000) pool.push(...FLAVOR.rich)
  const lastText = s.flags['w:lastFlavor']
  const options = pool.filter(t => t !== lastText)
  const text = pick(s, options.length ? options : pool)
  s.flags['w:lastFlavor'] = text
  toast(s, 'info', text)
}

function eligibleEvents(s: GameState, fx: FX[]): WorldEvent[] {
  const list: WorldEvent[] = []
  const ready = (id: string) => flagNum(s, `cd:${id}`) <= s.day
  const live = runs(s)
  const free = live.filter(l => !hasDecision(s, l.id))

  const inf = free.filter(l => weeksLive(l) >= 1 && l.review!.verdict !== 'flop')
  if (inf.length && ready('influencer')) list.push({ id: 'influencer', weight: 3, cooldown: 6, run: () => influencerOffer(s, pick(s, inf)) })

  const pm = free.filter(l => weeksLive(l) >= 4 && goodVerdict(l) && (l.sales!.priceMult || 1) > 0.8)
  if (pm.length && ready('price_match')) list.push({ id: 'price_match', weight: 2.5, cooldown: 8, run: () => priceMatchOffer(s, pick(s, pm)) })

  const rs = free.filter(l => weeksLive(l) >= 2 && pauseKind(l) === null)
  const stockW = 2 * (hasBoost(s, 'backup_supplier') ? 0.3 : 1) * (hasActiveFeature(s, 'sourcing_agent') ? 0.7 : 1)
  if (rs.length && ready('restock')) list.push({ id: 'restock', weight: stockW, cooldown: 8, run: () => stockoutEvent(s, pick(s, rs)) })

  if ((live.some(goodVerdict) || s.brand >= 25) && ready('press')) {
    list.push({ id: 'press', weight: 1.5 * (hasBoost(s, 'growth_hacks') ? 1.5 : 1), cooldown: 10, run: () => pressEvent(s, fx) })
  }
  const cb = live.filter(l => weeksLive(l) >= 2 && (l.review!.factors?.bugPenalty ?? 0) >= 0.1)
  if (cb.length && ready('chargeback')) list.push({ id: 'chargeback', weight: 2, cooldown: 8, run: () => chargebackEvent(s, pick(s, cb)) })

  if (s.history.length + live.length > 0 && ready('buzz')) list.push({ id: 'buzz', weight: 1, cooldown: 10, run: () => buzzEvent(s) })
  if (ready('windfall')) list.push({ id: 'windfall', weight: 0.8, cooldown: 14, run: () => windfallEvent(s) })
  if (s.staff.length && ready('staff_moment')) list.push({ id: 'staff_moment', weight: 1.2, cooldown: 6, run: () => staffMoment(s) })
  if (ready('flavor')) list.push({ id: 'flavor', weight: 2, cooldown: 2, run: () => flavorEvent(s) })
  return list
}

/** Weekly roll: at least 3 weeks between random events, then rising odds (guaranteed by ~8 weeks). */
function director(s: GameState, fx: FX[]) {
  const weeks = (s.day - flagNum(s, 'w:lastEvent')) / DAYS_PER_WEEK
  if (weeks < 3) return
  if (!chance(s, clamp(0.25 + 0.15 * (weeks - 3), 0.25, 1))) return
  const events = eligibleEvents(s, fx)
  if (!events.length) return
  const e = weightedPick(s, events, x => x.weight)
  e.run()
  s.flags['w:lastEvent'] = s.day
  s.flags[`cd:${e.id}`] = s.day + e.cooldown * DAYS_PER_WEEK
}

// ============================================================================ calendar
function monthStart(s: GameState) {
  const d = s.day
  const m = monthOf(d)
  const y = yearOf(d)
  if (m === 0 && flagNum(s, 'w:inflYear') !== y) {
    s.flags['w:inflYear'] = y
    s.market.cpmInflation = Math.round((s.market.cpmInflation || 1) * 1.05 * 10000) / 10000
    const prevWeeks = s.finance.weeks.filter(w => yearOf(w.week * DAYS_PER_WEEK) === y - 1)
    const rev = prevWeeks.reduce((a, w) => a + w.revenue, 0)
    const launches = [...s.history.map(h => h.launchDay), ...s.live.map(l => l.launchDay ?? -1)].filter(ld => ld >= 0 && yearOf(ld) === y - 1).length
    toast(s, 'info', `🎆 Happy New Year — welcome to Year ${y}! Last year: ${$(rev)} revenue, ${launches} launch${launches === 1 ? '' : 'es'}. Ad costs +5% (inflation).`)
    s.flags['w:seasonSaid'] = d // January's slump line would land in the same instant — the ticker shows it
  }
  if (m === 2 && y >= 2 && flagNum(s, 'w:bday') !== y) {
    s.flags['w:bday'] = y
    const age = y - 1
    toast(s, 'good', `🎂 ${s.meta.company} turns ${age}! ${age === 1 ? "A year ago you were flipping burgers full-time." : `${age} years of hustle and counting.`}`)
  }
  const season = SEASON_TOASTS[m]
  if (season && flagNum(s, 'w:seasonSaid', -1) !== d) toast(s, 'info', season)
  // quit-McDoodle's nudge: last 4 weeks of business profit vs the paycheck
  if (s.dayJob.employed) {
    const recent = s.finance.weeks.slice(-4)
    const biz = recent.reduce((a, w) => a + w.profit - w.income, 0)
    if (biz > 4 * s.dayJob.monthly) { if (!tryCoach(s, 'quit_nudge')) tryCoach(s, 'quit_nudge_big') }
    else if (biz > 2 * s.dayJob.monthly) tryCoach(s, 'quit_nudge')
  }
}

function weekStart(s: GameState, fx: FX[]) {
  const d = s.day
  const m = monthOf(d)
  const w = weekOfMonth(d)
  const y = yearOf(d)

  decayViral(s)
  tickPauses(s)

  // ---- platform news
  if (!s.flags['news:reels'] && d >= REELS_NEWS_DAY) newsModal(s, 'reels')
  if (!s.flags['news:tiktak_shop'] && d >= TIKTAK_SHOP_NEWS_DAY) newsModal(s, 'tiktak_shop')
  if (!s.flags['news:ban_scare'] && y >= 3 && ((y === 3 && m >= 3 && m <= 8 && chance(s, 0.12)) || y > 3 || (y === 3 && m >= 9))) {
    s.flags['news:ban_scare'] = d
    s.flags['pe:scareUntil'] = d + 12 * DAYS_PER_WEEK
    recomputePlatforms(s)
    pushModal(s, { kind: 'news', emoji: NEWS.ban_scare.emoji, title: NEWS.ban_scare.title, body: NEWS.ban_scare.body, options: [{ id: 'ok', label: 'Yikes 😬', tone: 'primary' }], data: { platform: 'tiktak' } })
    tryCoach(s, 'ban_scare')
  }
  if (d >= ALGO_MIN_DAY && flagNum(s, 'pe:algoUntil') <= d && flagNum(s, 'cd:algo') <= d && chance(s, 0.04)) {
    s.flags['pe:algoUntil'] = d + 8 * DAYS_PER_WEEK
    s.flags['cd:algo'] = d + 38 * DAYS_PER_WEEK
    recomputePlatforms(s)
    toast(s, 'bad', NEWS.algo.toast)
    tryCoach(s, 'algo_update')
    s.flags['w:lastEvent'] = d
  }

  // ---- BFCM
  if (m === 10 && w === 3) {
    toast(s, 'info', '🛍️ Black Friday / Cyber Monday is NEXT WEEK. Get your winners live and scaled!')
    tryCoach(s, 'bfcm_prep')
  }
  if (isBfcm(d)) {
    toast(s, 'good', '🛍️ BLACK FRIDAY / CYBER MONDAY! Carts ×1.8, CPMs ×1.5 — the biggest week of the year.')
    tryCoach(s, 'bfcm')
    fx.push({ kind: 'confetti' }, { kind: 'sound', sound: 'chaching' })
    s.flags['w:lastEvent'] = d
  }

  // ---- Chinese New Year
  if (m === 0 && w === 1 && s.flags[`w:cny${y}`] === undefined) cnyWarning(s, y)
  if (m === 1 && w === 1 && !s.flags[`w:cnyStart${y}`]) { s.flags[`w:cnyStart${y}`] = 1; cnyStart(s, y) }

  // ---- Ecom Expo (Sep W2)
  if (m === 8 && w === 2 && !s.flags[`w:expo${y}`]) expoEvent(s, y)

  // ---- trends
  const trendDay = flagNum(s, 'w:trendDay', Infinity)
  if (d >= trendDay) spawnTrend(s)
  else if (hasBoost(s, 'market_radar') && d >= trendDay - 2 * DAYS_PER_WEEK && s.flags['w:radarWarned'] !== trendDay) {
    const kind = s.flags['w:trendKind'] as Trend['kind'] | undefined
    const target = s.flags['w:trendTarget'] as string | undefined
    if (kind && target) {
      s.flags['w:radarWarned'] = trendDay
      toast(s, 'research', `📡 Market radar: a ${targetLabel(kind, target).name} trend is brewing — about 2 weeks out.`)
    }
  }

  // ---- independent rolls
  rollViral(s, fx)
  rollAdBan(s)

  // ---- weekly director (only when nothing else happened this week)
  if (flagNum(s, 'w:lastEvent') < d) director(s, fx)

  // ---- research badge nudge (transition 0 → n, with a cooldown; the 🧪 dock badge does the rest — players who
  //      research regularly don't need a toast every time their RP ticks over the next price)
  const n = affordableResearch(s).length
  const researchedLately = d - flagNum(s, 'lastResearchDay', -999) < RESEARCH_NUDGE_IDLE_WEEKS * DAYS_PER_WEEK
  if (n > 0 && flagNum(s, 'w:resAff') === 0) {
    if (!(coachSpaced(s) && tryCoach(s, 'research_affordable')) && flagNum(s, 'w:resAffCd') <= d && !researchedLately) {
      toast(s, 'research', `🧪 New research affordable — ${n} option${n > 1 ? 's' : ''} waiting in the Lab.`)
      s.flags['w:resAffCd'] = d + RESEARCH_NUDGE_COOLDOWN_WEEKS * DAYS_PER_WEEK
    }
  }
  s.flags['w:resAff'] = n
}

// ============================================================================ coach triggers (one lesson at a time)
/** * days a Coach Kev tip gets to itself before the next trigger-driven tip (1 day = 0.5 s at 1×; bubbles live 15 s and
 *  the feed shows 2 — the first launch used to fire 4 tips inside 3 seconds, each bumping the last one off) */
const COACH_SPACING_DAYS = 6
/** True when no tip (from any module) fired in the last COACH_SPACING_DAYS. */
function coachSpaced(s: GameState): boolean {
  let last = -Infinity
  for (const k in s.flags) {
    if (!k.startsWith('coach:')) continue
    const v = s.flags[k]
    if (typeof v === 'number' && v <= s.day && v > last) last = v
  }
  return s.day - last >= COACH_SPACING_DAYS
}
function coachTriggers(s: GameState) {
  if (s.flags.coachOff) return
  const d = s.day
  const busy = !!s.current || s.live.length > 0
  if (busy) s.flags['w:lastBusy'] = d
  const spaced = coachSpaced(s)
  const checks: [boolean, CoachId, boolean?][] = [
    [d >= 1, 'welcome'],
    [!!s.current && s.dayJob.employed, 'dayjob_slow'],
    [s.live.some(l => !!l.review) || s.history.length > 0, 'first_review'],
    [s.stats.winners > 0 || s.live.some(l => l.review?.verdict === 'winner'), 'first_winner'],
    [s.live.some(l => l.review?.verdict === 'flop') || s.history.some(h => h.verdict === 'flop'), 'first_loser'],
    [s.decisions.some(x => x.kind === 'scale'), 'first_scale'],
    [s.decisions.some(x => x.kind === 'refresh'), 'first_refresh'],
    [s.decisions.some(x => x.kind === 'kill'), 'first_kill'],
    [s.office === 0 && s.history.length >= 2 && s.cash >= officeMoveCost(1) * 3, 'move_out'],
    [s.office >= 1 && s.staff.length === 0 && s.candidates.length > 0, 'hire_first'],
  ]
  if (spaced) for (const [cond, id] of checks) if (cond && tryCoach(s, id)) return
  // repeating nudges: economy fires 'overdraft' / 'bankrupt_danger' — re-arm them once you've recovered for 8 weeks
  if (s.cash >= 0 && s.brokeDays === 0) {
    for (const id of ['overdraft', 'bankrupt_danger'] as CoachId[]) {
      const at = s.flags[`coach:${id}`]
      if (typeof at === 'number' && d - at >= 8 * DAYS_PER_WEEK) delete s.flags[`coach:${id}`]
    }
  }
  if (!busy && d >= 28 && d - flagNum(s, 'w:lastBusy') >= 28 && flagNum(s, 'w:idleCd') <= d) {
    s.flags['w:idleCd'] = d + 8 * DAYS_PER_WEEK
    tryCoach(s, 'idle', true)
  }
}

/** New live launches: note trend riders (milestone + toast). */
function scanNewLaunches(s: GameState) {
  for (const l of s.live) {
    if (!l.review || !l.sales || l.sales.flags.metaSeen) continue
    l.sales.flags.metaSeen = true
    const tm = trendMult(s, l.niche, l.angle, l.platform)
    if (tm > 1.01) {
      s.flags['w:trendRider'] = flagNum(s, 'w:trendRider') + 1
      toast(s, 'good', `🏄 ${l.name} launched straight into a trend — demand ×${tm.toFixed(2)}!`)
    }
  }
}

function endPlatformEffects(s: GameState) {
  const algo = s.flags['pe:algoUntil']
  if (typeof algo === 'number' && algo <= s.day) { delete s.flags['pe:algoUntil']; toast(s, 'info', NEWS.algo.end) }
  const scare = s.flags['pe:scareUntil']
  if (typeof scare === 'number' && scare <= s.day) { delete s.flags['pe:scareUntil']; toast(s, 'good', NEWS.ban_scare.end) }
}

// ============================================================================ public: init + daily tick
/**
 * Idempotent world setup (platform availability, first trend, candidates). Safe to call from createNewGame;
 * worldDailyTick calls it lazily on the first tick otherwise.
 */
export function initMeta(s: GameState): void {
  if (s.flags['w:init']) return
  s.flags['w:init'] = 1
  for (const p of ['fadbook', 'tiktak', 'pinterestt', 'poogle'] as PlatformId[]) {
    const st = s.market.platforms[p]
    if (st) st.available = true
  }
  if (s.flags['w:trendDay'] === undefined) scheduleNextTrend(s, true)
  if (s.flags['w:lastEvent'] === undefined) s.flags['w:lastEvent'] = s.day
  if (!s.candidates.length) refreshCandidates(s)
  recomputePlatforms(s)
}

export function worldDailyTick(s: GameState): FX[] {
  const fx: FX[] = drainFX()
  initMeta(s)
  expireTrends(s)
  endPlatformEffects(s)
  recomputePlatforms(s)
  if (isMonthStart(s.day)) monthStart(s)
  if (isWeekStart(s.day)) weekStart(s, fx)
  cnyDevBugs(s)
  applyDecisionDefaults(s)
  scanNewLaunches(s)
  coachTriggers(s)
  return fx
}

// ============================================================================ HUD helpers
export interface TickerItem { id: string; emoji: string; text: string; tone: 'good' | 'bad' | 'info'; untilDay?: number }
/** Everything worth showing in the HUD ticker right now (season, BFCM/CNY, trends, platform news). Derive with useMemo. */
export function worldTicker(s: GameState): TickerItem[] {
  const out: TickerItem[] = []
  const sl = seasonLabel(s.day)
  if (sl) out.push({ id: 'season', ...sl })
  for (const t of activeTrends(s)) {
    const lbl = targetLabel(t.kind, t.target)
    const weeksLeft = Math.max(1, Math.ceil((t.endDay - s.day) / DAYS_PER_WEEK))
    const name = t.label.startsWith(lbl.emoji) ? t.label.slice(lbl.emoji.length).trim() : t.label
    out.push({ id: t.id, emoji: lbl.emoji, text: `${name} · ${lbl.name} ×${t.mult.toFixed(2)} · ${weeksLeft}w left`, tone: 'good', untilDay: t.endDay })
  }
  const algo = flagNum(s, 'pe:algoUntil')
  if (algo > s.day) out.push({ id: 'algo', emoji: '📘', text: 'Fadbook algorithm update — CPM ×1.2', tone: 'bad', untilDay: algo })
  const scare = flagNum(s, 'pe:scareUntil')
  if (scare > s.day) out.push({ id: 'scare', emoji: '🎵', text: 'TikTak ban scare — reach ×0.7', tone: 'bad', untilDay: scare })
  return out
}

export interface LaunchTag { id: string; emoji: string; label: string; tone: 'good' | 'bad' | 'info' }
/** World status chips for a live launch card (viral, stockout, ad ban, CNY, trend). */
export function launchWorldTags(s: GameState, l: Launch): LaunchTag[] {
  const tags: LaunchTag[] = []
  if (num(l.sales?.flags.viral) > 0) tags.push({ id: 'viral', emoji: '🚀', label: `Viral ×${VIRAL_MULT}`, tone: 'good' })
  const pk = pauseKind(l)
  if (pk === 'stockout') tags.push({ id: 'stockout', emoji: '📦', label: 'Stockout', tone: 'bad' })
  if (pk === 'ban') tags.push({ id: 'ban', emoji: '🚫', label: 'Ad account banned', tone: 'bad' })
  if (pk === 'cny') tags.push({ id: 'cny', emoji: '🧧', label: 'CNY stockout', tone: 'bad' })
  const tm = trendMult(s, l.niche, l.angle, l.platform)
  if (tm > 1.01) tags.push({ id: 'trend', emoji: '📈', label: `Trending ×${tm.toFixed(2)}`, tone: 'good' })
  return tags
}

// ============================================================================ milestones
export interface MilestoneDef { id: string; title: string; description: string; icon: string }
const MILESTONE_DEFS: MilestoneDef[] = MILESTONES.map(({ id, title, description, icon }) => ({ id, title, description, icon }))
/** Stable list (same reference every call). */
export function milestoneDefs(): MilestoneDef[] { return MILESTONE_DEFS }

/** Days between milestone toasts: a first winner used to unlock 4 milestones in the same instant (the feed shows 4). */
const MILESTONE_SPACING_DAYS = 2
export function checkMilestones(s: GameState): FX[] {
  let fired = 0
  if (s.day - flagNum(s, 'w:lastMilestone', -99) < MILESTONE_SPACING_DAYS) return []
  for (const m of MILESTONES) {
    if (fired) break
    if (s.milestones[m.id] !== undefined) continue
    let ok = false
    try { ok = m.check(s) } catch { ok = false }
    if (!ok) continue
    s.milestones[m.id] = s.day
    s.flags['w:lastMilestone'] = s.day
    toast(s, 'milestone', `${m.icon} Milestone: ${m.title} — ${m.description}`)
    fired++
  }
  return fired ? [{ kind: 'confetti' }, { kind: 'sound', sound: 'levelup' }] : []
}
