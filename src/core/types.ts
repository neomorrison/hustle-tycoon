// ============================================================================
// Hustle Tycoon — GAME STATE CONTRACT (see DESIGN.md)
// Add OPTIONAL fields if you must extend; never rename/remove existing ones.
// Time unit: in-game DAY since start. Calendar: 7-day weeks, 4 weeks/month,
// 12 months/year (336 days/yr). Day 0 = Year 1, March, Week 1.
// ============================================================================

export type NicheId =
  | 'pet' | 'beauty' | 'home' | 'kitchen' | 'fitness' | 'wellness'
  | 'car' | 'gadgets' | 'baby' | 'kids' | 'fashion' | 'outdoor'
export type AngleId =
  | 'pain_point' | 'convenience' | 'gift' | 'aesthetic' | 'social_proof'
  | 'budget' | 'wholesome' | 'before_after' | 'luxury'
export type PlatformId = 'fadbook' | 'tiktak' | 'reels' | 'pinterestt' | 'poogle' | 'tiktak_shop'
export type SizeId = 'test' | 'standard' | 'big' | 'mega'
export type PriceTier = 'budget' | 'standard' | 'premium'
/** 3 dev stages × 3 focus areas (GDT-style sliders) */
export type AreaId =
  | 'research' | 'quality' | 'pricing'      // stage 0: Sourcing
  | 'copy' | 'visuals' | 'offer'            // stage 1: Store
  | 'hooks' | 'targeting' | 'influencers'   // stage 2: Marketing
export type StatId = 'copy' | 'creative' | 'research' | 'speed'
export type FeatureId =
  | 'reviews' | 'trust_badges' | 'bundles' | 'upsell' | 'email_flows' | 'speed_booster'
  | 'chargeback_shield' | 'ugc_library' | 'ai_copywriter' | 'lookalikes' | 'automation'
  | 'influencer_network' | 'sourcing_agent' | 'warehouse_3pl' | 'private_label'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type Verdict = 'flop' | 'breakeven' | 'solid' | 'winner'
export type ComboRating = 'great' | 'good' | 'ok' | 'bad'

/** Catalog product (src/data/catalog.json; hidden stats never shown raw) */
export interface Product {
  id: string
  name: string
  niche: NicheId
  archetype: string
  cogs: number
  shipCost: number
  perceivedValue: number
  amazonPrice: number | null
  baseDemand: number
  wow: number
  problemSolving: number
  impulse: number
  giftable: number
  repeatRate: number
  audience: { gender: 'female' | 'male' | 'all'; ageMin: number; ageMax: number }
  platformFit: { fadbook: number; tiktak: number }
  /** angles from the original catalog vocabulary (mapped to AngleId by data/combos) */
  bestAngles: string[]
  seasonality: number[]
  trendKind: 'evergreen' | 'rising' | 'fad' | 'declining'
  competitors: number
  defectRate: number
  claimRisk: number
  rating: number
  brandable: number
}

export interface Stats { copy: number; creative: number; research: number; speed: number }

export interface Person {
  id: string
  name: string
  /** people/pNN portrait id */
  portrait: string
  role: 'founder' | 'copywriter' | 'video_creator' | 'media_buyer' | 'researcher' | 'generalist'
  /** 1..100 each */
  stats: Stats
  level: number
  xp: number
  /** monthly salary (0 for founder) */
  salary: number
  hiredDay: number
  /** in training: unavailable until this day */
  trainingUntil?: number
  trainingStat?: StatId
}

export interface Points {
  /** 🔵 conversion points (page, copy, offer, trust) */
  conv: number
  /** 🟠 traffic points (hooks, creatives, targeting) */
  traffic: number
  /** 💜 AOV/offer points */
  aov: number
  /** 🟣 research points earned for the company */
  research: number
  /** 🔴 complaints/defects (like GDT bugs) */
  bugs: number
}

export interface Review {
  ctr: number
  cvr: number
  aov: number
  cpm: number
  cpa: number
  roas: number
  breakEvenRoas: number
  marginPerOrder: number
  price: number
  /** each 1..10 */
  scores: { ctr: number; cvr: number; aov: number; roas: number }
  overall: number
  verdict: Verdict
  /** one coach one-liner per metric */
  quotes: { ctr: string; cvr: string; aov: string; roas: string }
  /** factors used — for the post-mortem */
  factors: {
    productAngle: ComboRating
    anglePlatform: ComboRating
    nichePlatform: ComboRating
    focusAccuracy: [number, number, number]
    trendBonus: number
    bugPenalty: number
    convRatio: number
    trafficRatio: number
  }
}

export interface SalesWeek {
  week: number
  day: number
  spend: number
  revenue: number
  units: number
  cogs: number
  fees: number
  profit: number
  roas: number
  /** 0..1 creative fatigue at this week */
  fatigue: number
}

export interface SalesRun {
  weeks: SalesWeek[]
  /** budget multiplier from scale calls (1 = launch size default) */
  budgetMult: number
  /** 0..1 creative fatigue (reset by refresh) */
  fatigue: number
  creativeGen: number
  /** week index when the run began at day `startDay` */
  startDay: number
  totalRevenue: number
  totalProfit: number
  totalSpend: number
  units: number
  peakRevenue: number
  /** price change from events (competitor undercut) */
  priceMult: number
  /** margin boost from going bulk / private label */
  marginBoost: number
  flags: Record<string, boolean | number>
}

export type LaunchStatus = 'dev' | 'qc' | 'ready' | 'live' | 'ended' | 'killed'

export interface Launch {
  id: string
  name: string
  productId: string
  niche: NicheId
  angle: AngleId
  platform: PlatformId
  size: SizeId
  priceTier: PriceTier
  features: FeatureId[]
  status: LaunchStatus
  startDay: number
  /** dev progress: current stage 0..2 and progress within it (0..1) */
  stage: number
  stageProgress: number
  /** total dev days planned (after speed modifiers) */
  devDays: number
  daysElapsed: number
  /** sliders per stage: weights for the stage's 3 areas (any non-negative; normalized when used) */
  sliders: [number, number, number][]
  points: Points
  /** points per area (for the post-mortem) */
  areaPoints: Partial<Record<AreaId, number>>
  qcDays: number
  /** dev is paused waiting for the player to set this stage's sliders */
  awaitingSliders: boolean
  launchDay?: number
  review?: Review
  sales?: SalesRun
  postMortem?: PostMortem
  /** (sim-core) status 'qc': true while Polish is running (bugs being removed each day) */
  polishing?: boolean
  /** (sim-core) max Polish days (25% of devDays) */
  maxQcDays?: number
  /** (sim-core) 🔴 removed by Polish so far */
  bugsFixed?: number
  /** (sim-core) upfront cost paid at start (for post-mortem totals) */
  upfront?: number
  /** (sim-core) 🧪 Quality points banked against future 🔴 complaints */
  bugShield?: number
}

/** What the New Launch dialog submits */
export interface LaunchConfig {
  name: string
  productId: string
  angle: AngleId
  platform: PlatformId
  size: SizeId
  priceTier: PriceTier
  features: FeatureId[]
}

export interface PostMortem {
  headline: string
  notes: string[]
  combos: { key: string; rating: ComboRating; label: string }[]
  focusTips: string[]
  totals: { revenue: number; spend: number; profit: number; units: number; weeks: number }
}

export interface LaunchRecord {
  id: string
  name: string
  productId: string
  angle: AngleId
  platform: PlatformId
  size: SizeId
  launchDay: number
  endDay: number
  overall: number
  verdict: Verdict
  revenue: number
  profit: number
  /** (sim-core, optional extras for history views) */
  niche?: NicheId
  priceTier?: PriceTier
  review?: Review
  postMortem?: PostMortem
  /** weekly revenue per week of the run (sparkline) */
  weeklyRevenue?: number[]
  endReason?: 'faded' | 'killed'
}

export interface Playbook {
  /** discovered combo ratings: keys 'pa:<productId>:<angle>', 'ap:<angle>:<platform>', 'np:<niche>:<platform>'
   *  (+ 'pp:<productId>:<platform>' for fadbook/tiktak, whose fit is per product — use evaluate/combos helpers) */
  combos: Record<string, ComboRating>
  /** best known focus distribution per angle (from good launches) */
  focus: Partial<Record<AngleId, { sliders: [number, number, number][]; accuracy: number }>>
  /** products already launched (count) */
  launchedProducts: Record<string, number>
}

export interface Trend {
  id: string
  kind: 'niche' | 'angle' | 'platform'
  target: string
  mult: number
  startDay: number
  endDay: number
  label: string
}

export interface PlatformState {
  available: boolean
  /** CPM multiplier drift (algorithm changes, maturity) */
  cpmMult: number
  /** audience reach factor (growth of young platforms) */
  reach: number
}

export interface DecisionOption { id: string; label: string; cost?: number; tone?: 'primary' | 'critical' | 'default'; hint?: string }
/** Non-blocking "scale call" cards on live products (auto-expire) */
export interface Decision {
  id: string
  launchId: string
  kind: 'scale' | 'refresh' | 'kill' | 'go_bulk' | 'price_match' | 'influencer' | 'restock' | 'custom'
  title: string
  body: string
  options: DecisionOption[]
  createdDay: number
  expiresDay: number
}
/** Blocking event popups (pause the game) */
export interface EventModal {
  id: string
  kind: string
  title: string
  body: string
  emoji?: string
  image?: string
  options: DecisionOption[]
  data?: Record<string, unknown>
}
export interface Toast {
  id: string
  day: number
  kind: 'info' | 'good' | 'bad' | 'money' | 'coach' | 'research' | 'milestone'
  text: string
  amount?: number
}
export interface WeekFinance { week: number; revenue: number; adSpend: number; cogs: number; fees: number; expenses: number; income: number; profit: number; cash: number }

export interface GameState {
  version: number
  seed: number
  rng: number
  seq: number
  meta: { company: string; founder: string; difficulty: Difficulty; createdAt: number }
  day: number
  cash: number
  /** unspent research points */
  rp: number
  /** customers / fans (email list) — grows with sales, drives organic revenue */
  fans: number
  /** 0..100 brand reputation — good launches raise it, complaints lower it */
  brand: number
  dayJob: { employed: boolean; monthly: number; quitDay: number | null; timesRejoined: number }
  office: number
  founder: Person
  staff: Person[]
  candidates: Person[]
  unlocked: {
    niches: NicheId[]
    angles: AngleId[]
    platforms: PlatformId[]
    sizes: SizeId[]
    features: FeatureId[]
    research: string[]
  }
  /** researched features the player has switched on (monthly fees) */
  activeFeatures: FeatureId[]
  current: Launch | null
  live: Launch[]
  history: LaunchRecord[]
  /** (sim-core) recently ended launches as full objects (newest last, capped) — post-mortem/detail source; see sim `findLaunch` */
  archive?: Launch[]
  playbook: Playbook
  market: {
    /** GDT-style expectation bar: points the market expects for a standard launch (rises as you improve) */
    bar: number
    saturation: Record<string, number>
    trends: Trend[]
    platforms: Record<PlatformId, PlatformState>
    /** yearly CPM inflation multiplier */
    cpmInflation: number
  }
  decisions: Decision[]
  modals: EventModal[]
  toasts: Toast[]
  finance: { weeks: WeekFinance[]; thisWeek: WeekFinance }
  stats: { lifetimeRevenue: number; lifetimeProfit: number; launches: number; winners: number; bestScore: number; peakWeekRevenue: number; peakCash: number }
  milestones: Record<string, number>
  /** tutorial/coach flags and misc */
  flags: Record<string, boolean | number | string>
  /** days with cash below the overdraft floor (bankruptcy check) */
  brokeDays: number
  gameOver?: { day: number; reason: string } | null
}

/** Transient visual effects emitted by a tick (never saved) */
export interface FX {
  kind: 'bubble' | 'cash' | 'confetti' | 'sound'
  /** bubble: which worker (person id) and point type */
  personId?: string
  point?: keyof Points
  amount?: number
  sound?: 'chaching' | 'ping' | 'levelup' | 'error' | 'launch' | 'winner' | 'flop' | 'click'
}
