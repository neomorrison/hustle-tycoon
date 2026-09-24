// OWNER: sim-core. Launch development (GDT "make a game"). PUBLIC API — keep signatures.
import type { AreaId, FeatureId, FX, GameState, Launch, LaunchConfig, Person, Points, SizeId } from '../core/types'
import { clamp, randRange } from '../core/rng'
import { uid } from '../core/ids'
import { earn, spend } from '../core/money'
import { coach, toast } from '../core/notify'
import { findProduct, productById } from '../data/catalog'
import { SIZES } from '../data/sizes'
import { ANGLES } from '../data/angles'
import { PLATFORMS } from '../data/platforms'
import { AREAS, STAGES, stageAreas, stageName, type PointKey } from '../data/areas'
import { normalize3 } from '../data/combos'
import { VERDICTS } from '../data/quotes'
import { COACH } from '../data/coach'
import { activeTeam } from './staff'
import { areaBoost } from './research'
import { evaluate, expectedPoints } from './evaluate'
import { newSalesRun } from './sales'
import { suggestedSliders } from './playbook'

// ---------------------------------------------------------------------------
// Tuning (DESIGN §3)
// ---------------------------------------------------------------------------
export const DEV = {
  /** raw focus points per worker-day (before stats) */
  rawPerDay: 2.0,
  /** founder output while still working at McDoodle's */
  founderEmployedOutput: 0.5,
  /** dev time multiplier while employed */
  dayJobDevMult: 1.5,
  /** bugs per worker-day = bugBase × (0.6 + defectRate × 6) */
  bugBase: 0.35,
  /** Polish: bugs removed per worker-day */
  polishPerDay: 1.5,
  /** max Polish days as a share of devDays */
  polishShare: 0.25,
  /** RP per worker-day on top of Research/Targeting points */
  rpPerWorkerDay: 0.3,
  /** RP bonus when a launch goes live / is a winner */
  rpPerLaunch: 10, rpWinner: 25,
  /** * market bar after each launch tracks the team's per-size output (points / sizeMult): it closes `barK` of the gap
   *  when you out-build it and up to `barKDown` when you under-deliver *and* reviews suffer (smaller team, back at
   *  McDoodle's, understaffed size) — a great review on fewer points never lowers the bar.
   *  DESIGN's max(bar·0.98 + 0.06·pts, bar) only ever rose and settled at 3× the team's output (every review a flop),
   *  then never came back down after a Mom's-basement reset. Upgrades (quit, hire, office) now pay off for ~2 launches
   *  before the market catches up — GDT's "beat your last hit". */
  barK: 0.45, barKDown: 0.5, barC: 1.0,
  /** a single launch can't lift the bar by more than this factor of the current bar */
  barMaxJump: 2,
  /** * GDT reviewer expectations: every review point above barHypeFrom lifts the bar by this share on top of the points tracker.
   *  Features, brand and great combos don't show up in points — hype is how the market prices them in, so a maxed-out
   *  team settles around the winner line instead of 9.5s forever. */
  barHype: 0.12, barHypeFrom: 8.7,
  /** * hype weight per launch size: a Test hit barely moves the industry; big launches set the expectations */
  barHypeBySize: { test: 0.35, standard: 0.8, big: 1, mega: 1.2 } as Record<SizeId, number>,
  /** * reviews under 7 let expectations relax a little per point (never below the difficulty floor) — no death spirals */
  barRelax: 0.04, barRelaxBelow: 7,
  /** saturation added per launch of the same product */
  saturationPerLaunch: 0.3,
}

export interface LaunchEstimate { upfront: number; weeklyAds: number; devDays: number; team: number }

// ---------------------------------------------------------------------------
// Helpers (exported for UI / bots)
// ---------------------------------------------------------------------------
/** Output multiplier of a worker (founder is at 50% while employed at McDoodle's). */
export const workerOutput = (s: GameState, p: Person) => (p.role === 'founder' && s.dayJob.employed ? DEV.founderEmployedOutput : 1)
/** statFactor = 0.5 + stat / 40 for the stat that powers the area. */
export const statFactor = (p: Person, area: AreaId) => 0.5 + p.stats[AREAS[area].stat] / 40

/** Features that apply to a launch: those picked at start plus anything active now. */
export function launchFeatures(s: GameState, l: Pick<Launch, 'features'>): FeatureId[] {
  const out = new Set<FeatureId>(l.features)
  for (const f of s.activeFeatures) out.add(f)
  return [...out].filter(f => s.unlocked.features.includes(f))
}

/** Feature + research boosts for an area. */
export function areaMultiplier(s: GameState, features: readonly FeatureId[], area: AreaId): number {
  let m = areaBoost(s, area)
  if (area === 'copy' && features.includes('ai_copywriter')) m *= 1.15
  if ((area === 'hooks' || area === 'visuals') && features.includes('ugc_library')) m *= 1.15
  if (area === 'influencers' && features.includes('influencer_network')) m *= 1.3
  return m
}

/** Who works on a launch of this size: founder + the strongest available staff, up to the size's team limit. */
export function launchTeam(s: GameState, size: SizeId): Person[] {
  const [founder, ...rest] = activeTeam(s)
  const power = (p: Person) => p.stats.copy + p.stats.creative + p.stats.research + p.stats.speed * 0.5
  return [founder, ...rest.sort((a, b) => power(b) - power(a))].slice(0, Math.max(1, SIZES[size]?.maxTeam ?? 2))
}

export function devDaysFor(s: GameState, size: SizeId): number {
  const team = launchTeam(s, size)
  const avgSpeed = team.reduce((a, p) => a + p.stats.speed, 0) / Math.max(1, team.length)
  return Math.max(8, Math.round(SIZES[size].devDays * (s.dayJob.employed ? DEV.dayJobDevMult : 1) * (1.2 - avgSpeed / 250)))
}

/** Upfront cost of a size (sourcing agent −5%). */
export function upfrontCost(s: GameState, size: SizeId): number {
  const agent = s.unlocked.features.includes('sourcing_agent') && s.activeFeatures.includes('sourcing_agent')
  return Math.round(SIZES[size].upfront * (agent ? 0.95 : 1))
}

/** Cost summary for the New Launch dialog. */
export function launchCostBreakdown(s: GameState, cfg: Pick<LaunchConfig, 'size'>): { upfront: number; weeklyAds: number; firstMonth: number; devDays: number; devWeeks: number; team: number } {
  const e = estimateLaunch(s, cfg as LaunchConfig)
  return { ...e, firstMonth: e.upfront + e.weeklyAds * 4, devWeeks: Math.ceil(e.devDays / 7) }
}

/** Day index (from dev start) at which each stage ends: [end0, end1, end2]. */
export function stageEnds(devDays: number): [number, number, number] {
  const a = Math.max(1, Math.round(devDays * STAGES[0].share))
  const b = Math.max(a + 1, Math.round(devDays * (STAGES[0].share + STAGES[1].share)))
  return [a, b, Math.max(b + 1, devDays)]
}

/** Overall dev progress 0..1 (including Polish once dev is done). */
export function devProgress(l: Launch): number {
  if (l.status !== 'dev') return 1
  return clamp(l.daysElapsed / Math.max(1, l.devDays), 0, 1)
}

/** Expected raw team output per day for a launch size (for UI "team power" and bot planning). */
export function teamPowerPerDay(s: GameState, size: SizeId = 'mega'): number {
  return launchTeam(s, size).reduce((a, p) => a + DEV.rawPerDay * workerOutput(s, p) * (0.5 + (p.stats.copy + p.stats.creative + p.stats.research) / 120), 0)
}

/** Current points vs what the market expects for this launch's size (0..∞, 1 = on par). */
export function pointsVsBar(s: GameState, l: Launch): { conv: number; traffic: number; aov: number; total: number } {
  const e = expectedPoints(s, l.size)
  return {
    conv: l.points.conv / e.conv,
    traffic: l.points.traffic / e.traffic,
    aov: l.points.aov / e.aov,
    total: (l.points.conv + l.points.traffic + l.points.aov) / (e.conv + e.traffic + e.aov),
  }
}

export { stageName }

export interface StagePreview { conv: number; traffic: number; aov: number; research: number; fix: number; fans: number; days: number }
/**
 * Expected output of a whole stage for given slider weights (no randomness) — for the Sliders dialog's live preview.
 * `fix` = 🔴 complaints the Quality focus will prevent.
 */
export function stagePreview(s: GameState, l: Pick<Launch, 'size' | 'devDays' | 'features'>, stage: number, weights: readonly number[]): StagePreview {
  const st = clamp(Math.floor(stage), 0, 2)
  const ends = stageEnds(l.devDays)
  const days = ends[st] - (st === 0 ? 0 : ends[st - 1])
  const w = normalize3(weights)
  const feats = launchFeatures(s, l)
  const out: StagePreview = { conv: 0, traffic: 0, aov: 0, research: 0, fix: 0, fans: 0, days }
  for (const person of launchTeam(s, l.size)) {
    const raw = DEV.rawPerDay * workerOutput(s, person) * days
    stageAreas(st).forEach((area, i) => {
      const pts = raw * w[i] * statFactor(person, area) * areaMultiplier(s, feats, area)
      const y = AREAS[area].yield
      out.conv += pts * (y.conv ?? 0)
      out.traffic += pts * (y.traffic ?? 0)
      out.aov += pts * (y.aov ?? 0)
      out.research += pts * (y.research ?? 0)
      out.fix += pts * (y.fix ?? 0)
      out.fans += pts * (y.fans ?? 0)
    })
    out.research += DEV.rpPerWorkerDay * workerOutput(s, person) * days
  }
  return out
}

/** Lowest the market bar can go: the difficulty's starting bar, +5% per year. */
export function barFloor(s: GameState): number {
  const base = s.meta.difficulty === 'easy' ? 40 : s.meta.difficulty === 'hard' ? 57 : 50
  return base * Math.pow(1.05, Math.floor(s.day / 336))
}

/**
 * Market bar after a launch with these points and this review score (GDT reviewer expectations).
 * Tracks the team's per-size output (fast up, slower down) and prices in hype from big reviews.
 */
export function nextMarketBar(s: GameState, size: SizeId, points: Pick<Points, 'conv' | 'traffic' | 'aov'>, overall: number): number {
  const bar = s.market.bar
  const perSize = Math.min(bar * DEV.barMaxJump, (points.conv + points.traffic + points.aov) / SIZES[size].mult)
  const target = DEV.barC * perSize
  // the market only lowers its expectations when you're actually struggling (no easing off after a 9+ review)
  const struggling = clamp((DEV.barHypeFrom - overall) / 2, 0, 1)
  const tracked = target >= bar ? bar + DEV.barK * (target - bar) : bar - DEV.barKDown * struggling * (bar - target)
  const hype = 1 + DEV.barHype * (DEV.barHypeBySize[size] ?? 1) * Math.max(0, overall - DEV.barHypeFrom) - DEV.barRelax * Math.max(0, DEV.barRelaxBelow - overall)
  return Math.round(Math.max(barFloor(s), tracked * hype) * 10) / 10
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
export function canStartLaunch(s: GameState): { ok: boolean; reason?: string } {
  if (s.gameOver) return { ok: false, reason: 'Game over' }
  if (s.current) return { ok: false, reason: `Finish "${s.current.name}" first — one launch in development at a time` }
  if (s.cash < upfrontCost(s, 'test')) return { ok: false, reason: `Need at least $${upfrontCost(s, 'test')} for a test launch` }
  return { ok: true }
}

/** Validates a config against unlocks, office and cash. */
export function validateLaunchConfig(s: GameState, cfg: LaunchConfig): { ok: boolean; reason?: string } {
  const can = canStartLaunch(s)
  if (!can.ok && s.current) return can
  const p = findProduct(cfg.productId)
  if (!p) return { ok: false, reason: 'Pick a product' }
  if (!s.unlocked.niches.includes(p.niche)) return { ok: false, reason: 'That niche is still locked (🧪 Research)' }
  if (!ANGLES[cfg.angle] || !s.unlocked.angles.includes(cfg.angle)) return { ok: false, reason: 'That angle is still locked (🧪 Research)' }
  if (!PLATFORMS[cfg.platform] || !s.unlocked.platforms.includes(cfg.platform)) return { ok: false, reason: 'That platform is still locked (🧪 Research)' }
  const size = SIZES[cfg.size]
  if (!size || !s.unlocked.sizes.includes(cfg.size)) return { ok: false, reason: 'That launch size is still locked (🧪 Research)' }
  if (s.office < size.minOffice) return { ok: false, reason: `${size.name} launches need a bigger office` }
  const up = upfrontCost(s, cfg.size)
  if (s.cash < up) return { ok: false, reason: `Need $${up.toLocaleString('en-US')} upfront (you have $${Math.floor(s.cash).toLocaleString('en-US')})` }
  return { ok: true }
}

export function estimateLaunch(s: GameState, cfg: LaunchConfig): LaunchEstimate {
  const size = SIZES[cfg.size] ?? SIZES.test
  return { upfront: upfrontCost(s, size.id), weeklyAds: size.weeklyBudget, devDays: devDaysFor(s, size.id), team: launchTeam(s, size.id).length }
}

const NAME_PREFIX: Record<string, string[]> = {
  pet: ['Paw', 'Fur', 'Woof', 'Purr', 'Snout'], home: ['Nest', 'Cozy', 'Glow', 'Tidy', 'Hearth'],
  kitchen: ['Chef', 'Zest', 'Snack', 'Whisk', 'Crumb'], gadgets: ['Zap', 'Pixel', 'Nova', 'Byte', 'Gizmo'],
  beauty: ['Glow', 'Luxe', 'Dew', 'Bloom', 'Velvet'], fitness: ['Flex', 'Pulse', 'Grit', 'Rep', 'Core'],
  wellness: ['Zen', 'Calm', 'Aura', 'Rest', 'Soothe'], car: ['Turbo', 'Road', 'Drive', 'Pit', 'Cruise'],
  baby: ['Tiny', 'Coo', 'Snug', 'Bub', 'Lulla'], kids: ['Wiggle', 'Doodle', 'Giggle', 'Spark', 'Pip'],
  fashion: ['Chic', 'Mode', 'Luxe', 'Muse', 'Edge'], outdoor: ['Trail', 'Sunny', 'Ember', 'Fire', 'Camp'],
}
const NAME_SUFFIX = ['Pal', 'Pro', 'Go', 'ify', 'Max', 'Buddy', 'Lab', 'io']
const ROMAN = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const hashStr = (x: string) => { let h = 7; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0; return Math.abs(h) }

/** Default launch name: a parody mini-brand + the product's noun, e.g. "PawPal Roller" (repeats get II, III…). */
export function suggestLaunchName(s: GameState, productId: string): string {
  const p = findProduct(productId)
  if (!p) return 'New Launch'
  const words = p.name.replace(/\(.*?\)/g, ' ').split(/\s+/).filter(w => w && !/^(the|a|for|with|and|of|set|kit|pack|\d.*)$/i.test(w))
  const last = words[words.length - 1] ?? 'Thing'
  const noun = last.length <= 4 && words.length > 1 ? `${words[words.length - 2]} ${last}` : last
  const h = hashStr(p.id)
  const pre = NAME_PREFIX[p.niche] ?? ['Hustle']
  const brand = `${pre[h % pre.length]}${NAME_SUFFIX[(h >> 3) % NAME_SUFFIX.length]}`
  const n = (s.playbook.launchedProducts[p.id] ?? 0) + 1
  return `${brand} ${noun}${n > 1 ? ` ${ROMAN[n] ?? `#${n}`}` : ''}`
}

/** Charges the upfront cost, creates s.current with awaitingSliders = true (stage 0). Returns id or null. */
export function startLaunch(s: GameState, cfg: LaunchConfig): string | null {
  const v = validateLaunchConfig(s, cfg)
  if (!v.ok) {
    toast(s, 'bad', `🚫 ${v.reason}`)
    return null
  }
  const p = productById(cfg.productId)
  const upfront = upfrontCost(s, cfg.size)
  spend(s, upfront, 'expenses')
  s.stats.lifetimeProfit -= upfront
  const features = launchFeatures(s, { features: cfg.features ?? [] })
  const l: Launch = {
    id: uid(s, 'L'),
    name: (cfg.name || '').trim().slice(0, 40) || suggestLaunchName(s, p.id),
    productId: p.id,
    niche: p.niche,
    angle: cfg.angle,
    platform: cfg.platform,
    size: cfg.size,
    priceTier: cfg.priceTier ?? 'standard',
    features,
    status: 'dev',
    startDay: s.day,
    stage: 0,
    stageProgress: 0,
    devDays: devDaysFor(s, cfg.size),
    daysElapsed: 0,
    sliders: [suggestedSliders(s, cfg.angle, 0), suggestedSliders(s, cfg.angle, 1), suggestedSliders(s, cfg.angle, 2)],
    points: { conv: 0, traffic: 0, aov: 0, research: 0, bugs: 0 },
    areaPoints: {},
    qcDays: 0,
    awaitingSliders: true,
    upfront,
    bugsFixed: 0,
    bugShield: 0,
  }
  s.current = l
  toast(s, 'info', `🚀 ${l.name} is in development: ${SIZES[l.size].icon} ${SIZES[l.size].name}, ${ANGLES[l.angle].icon} ${ANGLES[l.angle].name} on ${PLATFORMS[l.platform].icon} ${PLATFORMS[l.platform].name}.`, -upfront)
  if (s.dayJob.employed) coach(s, 'dayjob_slow', COACH.dayjob_slow)
  return l.id
}

/** Set sliders for the current stage (0..2) and resume development. */
export function setStageSliders(s: GameState, weights: [number, number, number]): void {
  const l = s.current
  if (!l || l.status !== 'dev') return
  const w = weights.map(x => Math.max(0, Number(x) || 0)) as [number, number, number]
  l.sliders[l.stage] = w[0] + w[1] + w[2] > 0 ? w : [1, 1, 1]
  l.awaitingSliders = false
}

// ---------------------------------------------------------------------------
// Daily development
// ---------------------------------------------------------------------------
// Bubble aggregation (transient, never saved): per worker × point type, emit whole-number bubbles.
const bubbleAcc = new Map<string, number>()
let bubbleLaunch = ''
function accBubble(launchId: string, personId: string, pt: PointKey, amt: number) {
  if (bubbleLaunch !== launchId) { bubbleAcc.clear(); bubbleLaunch = launchId }
  const k = `${personId}|${pt}`
  bubbleAcc.set(k, (bubbleAcc.get(k) ?? 0) + amt)
}
function flushBubbles(fx: FX[], team: Person[], sign = 1) {
  for (const p of team) {
    const ready: [PointKey, number][] = []
    for (const pt of ['conv', 'traffic', 'aov', 'research', 'bugs'] as PointKey[]) {
      const v = bubbleAcc.get(`${p.id}|${pt}`) ?? 0
      if (v >= 1) ready.push([pt, v])
    }
    ready.sort((a, b) => b[1] - a[1])
    for (const [pt, v] of ready.slice(0, 2)) {
      const n = Math.floor(v)
      bubbleAcc.set(`${p.id}|${pt}`, v - n)
      fx.push({ kind: 'bubble', personId: p.id, point: pt, amount: pt === 'bugs' ? n * sign : n })
    }
  }
}

function addPoints(l: Launch, pt: PointKey, amt: number) {
  l.points[pt as keyof Points] += amt
}

/** Daily dev progress: points (bubbles), stage transitions, completion. */
export function devTick(s: GameState): FX[] {
  const l = s.current
  const fx: FX[] = []
  if (!l || l.awaitingSliders) return fx
  const team = launchTeam(s, l.size)

  if (l.status === 'dev') {
    const p = productById(l.productId)
    const feats = launchFeatures(s, l)
    const stage = clamp(l.stage, 0, 2)
    const weights = normalize3(l.sliders[stage] ?? [1, 1, 1])
    const areas = stageAreas(stage)
    const agent = feats.includes('sourcing_agent')
    for (const w of team) {
      const out = workerOutput(s, w)
      const raw = DEV.rawPerDay * randRange(s, 0.9, 1.1) * out
      areas.forEach((area, i) => {
        const pts = raw * weights[i] * statFactor(w, area) * areaMultiplier(s, feats, area)
        if (pts <= 0) return
        l.areaPoints[area] = (l.areaPoints[area] ?? 0) + pts
        const y = AREAS[area].yield
        if (y.conv) { addPoints(l, 'conv', pts * y.conv); accBubble(l.id, w.id, 'conv', pts * y.conv) }
        if (y.traffic) { addPoints(l, 'traffic', pts * y.traffic); accBubble(l.id, w.id, 'traffic', pts * y.traffic) }
        if (y.aov) { addPoints(l, 'aov', pts * y.aov); accBubble(l.id, w.id, 'aov', pts * y.aov) }
        if (y.research) { addPoints(l, 'research', pts * y.research); s.rp += pts * y.research; accBubble(l.id, w.id, 'research', pts * y.research) }
        if (y.fix) l.bugShield = (l.bugShield ?? 0) + pts * y.fix
      })
      // company RP trickle
      const rp = DEV.rpPerWorkerDay * out
      l.points.research += rp
      s.rp += rp
      accBubble(l.id, w.id, 'research', rp)
      // complaints (quality focus builds a shield that absorbs them)
      let bugs = DEV.bugBase * (0.6 + p.defectRate * 6) * out * (agent ? 0.75 : 1)
      const absorbed = Math.min(bugs, l.bugShield ?? 0)
      l.bugShield = (l.bugShield ?? 0) - absorbed
      bugs -= absorbed
      if (bugs > 0) { l.points.bugs += bugs; accBubble(l.id, w.id, 'bugs', bugs) }
    }
    // leftover shield chips away at existing complaints too
    if ((l.bugShield ?? 0) > 0 && l.points.bugs > 0) {
      const fix = Math.min(l.points.bugs, l.bugShield ?? 0)
      l.points.bugs -= fix
      l.bugShield = (l.bugShield ?? 0) - fix
    }
    flushBubbles(fx, team)

    l.daysElapsed += 1
    const ends = stageEnds(l.devDays)
    const start = stage === 0 ? 0 : ends[stage - 1]
    l.stageProgress = clamp((l.daysElapsed - start) / Math.max(1, ends[stage] - start), 0, 1)
    if (l.daysElapsed >= ends[stage]) {
      if (stage < 2) {
        l.stage = stage + 1
        l.stageProgress = 0
        l.awaitingSliders = true
        // keep whatever the player last chose for this stage, else their playbook recipe
        if (!l.sliders[l.stage]) l.sliders[l.stage] = suggestedSliders(s, l.angle, l.stage)
        // the Sliders dialog opens on its own for the next stage — a ping is enough (no feed toast)
        fx.push({ kind: 'sound', sound: 'ping' })
      } else {
        l.status = 'qc'
        l.stageProgress = 1
        l.polishing = false
        l.qcDays = 0
        l.maxQcDays = Math.max(2, Math.ceil(l.devDays * DEV.polishShare))
        fx.push({ kind: 'sound', sound: 'ping' })
        toast(s, 'good', `📦 ${l.name} is built! Polish out the 🔴 complaints or launch it now.`)
        coach(s, 'polish_or_launch', `Dev done! Polishing spends up to ${l.maxQcDays} more days squashing 🔴 complaints (they tank conversion). Low on 🔴? Just launch.`)
      }
    }
  } else if (l.status === 'qc' && l.polishing) {
    const max = l.maxQcDays ?? Math.ceil(l.devDays * DEV.polishShare)
    for (const w of team) {
      const fix = Math.min(l.points.bugs, DEV.polishPerDay * workerOutput(s, w) * (0.75 + w.stats.copy / 80))
      if (fix <= 0) continue
      l.points.bugs -= fix
      l.bugsFixed = (l.bugsFixed ?? 0) + fix
      accBubble(l.id, w.id, 'bugs', fix)
    }
    flushBubbles(fx, team, -1)
    l.qcDays += 1
    l.stageProgress = clamp(l.qcDays / Math.max(1, max), 0, 1)
    if (l.points.bugs < 0.5 || l.qcDays >= max) {
      l.points.bugs = Math.max(0, l.points.bugs)
      l.polishing = false
      l.status = 'ready'
      fx.push({ kind: 'sound', sound: 'ping' })
      toast(s, 'good', `✨ ${l.name} is polished (${Math.round(l.bugsFixed ?? 0)} 🔴 fixed). Ready to launch!`)
    }
  }
  return fx
}

/** After dev completes: spend extra days fixing complaints (GDT bug-fixing). */
export function startQC(s: GameState): void {
  const l = s.current
  if (!l || l.status !== 'qc' || l.polishing) return
  if (l.points.bugs < 0.5) {
    l.status = 'ready'
    toast(s, 'info', `✨ ${l.name} has no complaints to fix. Ready to launch!`)
    return
  }
  l.polishing = true
  l.maxQcDays = l.maxQcDays ?? Math.max(2, Math.ceil(l.devDays * DEV.polishShare))
}
/** Stop polishing early (keeps the launch ready to go). */
export function stopQC(s: GameState): void {
  const l = s.current
  if (!l || l.status !== 'qc' || !l.polishing) return
  l.polishing = false
  l.status = 'ready'
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------
/** Evaluate + go live now (from 'qc' or 'ready'). Sets flags.pendingReview = launchId. */
export function launchNow(s: GameState): FX[] {
  const l = s.current
  if (!l || (l.status !== 'qc' && l.status !== 'ready')) return []
  const fx: FX[] = [{ kind: 'sound', sound: 'launch' }]
  l.polishing = false
  l.awaitingSliders = false
  l.features = launchFeatures(s, l)
  l.points.bugs = Math.max(0, l.points.bugs)
  const rv = evaluate(s, l)
  l.review = rv
  l.status = 'live'
  l.launchDay = s.day
  l.stageProgress = 1
  l.sales = newSalesRun(s, l)
  s.current = null
  s.live.push(l)

  // stats & knowledge side effects
  const pid = l.productId
  s.stats.launches += 1
  if (rv.verdict === 'winner') s.stats.winners += 1
  s.stats.bestScore = Math.max(s.stats.bestScore, rv.overall)
  s.playbook.launchedProducts[pid] = (s.playbook.launchedProducts[pid] ?? 0) + 1
  s.market.saturation[pid] = Math.min(1.5, (s.market.saturation[pid] ?? 0) + DEV.saturationPerLaunch)

  // brand, fans, RP
  const brandDelta = { winner: 3, solid: 1.5, breakeven: 0.5, flop: -2 }[rv.verdict]
  s.brand = clamp(s.brand + brandDelta, 0, 100)
  const hype = Math.round((l.areaPoints.influencers ?? 0) * (AREAS.influencers.yield.fans ?? 0) * (1 + s.brand / 100))
  if (hype > 0) s.fans += hype
  const rp = DEV.rpPerLaunch + (rv.verdict === 'winner' ? DEV.rpWinner : 0)
  s.rp += rp

  // GDT market bar: expectations rise when you out-build them (and ease off when your team shrinks)
  s.market.bar = nextMarketBar(s, l.size, l.points, rv.overall)

  s.flags.pendingReview = l.id
  s.flags.lastLaunchDay = s.day
  const v = VERDICTS[rv.verdict]
  toast(s, rv.verdict === 'flop' ? 'bad' : rv.verdict === 'breakeven' ? 'info' : 'good', `${v.emoji} ${l.name} launched — ${rv.overall.toFixed(1)}/10 (${v.label}). +${rp} 🟣 RP${hype > 0 ? `, +${hype} fans` : ''}.`)
  // first_review / first_winner / first_loser tips come from world.coachTriggers, spaced so the Review dialog's own tip
  // and these don't bump each other off the feed (Kev gets 2 bubbles at most)
  return fx
}

/** Scrap the launch in development. Refunds half the upfront if still in the Sourcing stage. */
export function cancelLaunch(s: GameState): void {
  const l = s.current
  if (!l || l.status === 'live') return
  const refund = l.stage === 0 && l.status === 'dev' ? Math.round((l.upfront ?? 0) * 0.5) : 0
  if (refund > 0) {
    earn(s, refund, 'income')
    s.stats.lifetimeProfit += refund
  }
  s.current = null
  toast(s, 'info', `🗑️ Scrapped ${l.name}.${refund ? ` Supplier refunded $${refund.toLocaleString('en-US')}.` : ''}`, refund || undefined)
}
