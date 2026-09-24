// OWNER: sim-core (with sim-meta init hooks). Creates a fresh GameState.
import type { Difficulty, GameState, PlatformId } from '../core/types'
import type { Look } from '../three/types'
import { emptyWeek } from '../core/money'
import { coach } from '../core/notify'
import { START_NICHES } from '../data/catalog'
import { START_ANGLES } from '../data/angles'
import { PLATFORM_IDS } from '../data/platforms'
import { COACH } from '../data/coach'
import { refreshCandidates } from './staff'

export const SAVE_VERSION = 1
export interface NewGameOptions { company: string; founder: string; difficulty: Difficulty; seed?: number; /** founder's 3D look (Look step) */ look?: Look }

export const DIFFICULTY: Record<Difficulty, { cash: number; bar: number; label: string; blurb: string }> = {
  easy: { cash: 4000, bar: 40, label: 'Easy', blurb: '$4,000 saved up and a forgiving market. Mom\'s couch is always there.' },
  normal: { cash: 2000, bar: 50, label: 'Normal', blurb: '$2,000 from fry shifts. The market expects a real effort.' },
  hard: { cash: 1000, bar: 57, label: 'Hard', blurb: '$1,000, picky customers, and no moving back to Mom\'s.' },
}

/** Platforms that exist from day 1 (Reels and TikTak Shop arrive through news events). */
const AVAILABLE_AT_START: PlatformId[] = ['fadbook', 'tiktak', 'pinterestt', 'poogle']

export function createNewGame(o: NewGameOptions): GameState {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31)
  const diff = DIFFICULTY[o.difficulty] ? o.difficulty : 'normal'
  const d = DIFFICULTY[diff]
  const founder = (o.founder || '').trim() || 'You'
  const s: GameState = {
    version: SAVE_VERSION, seed, rng: seed, seq: 0,
    meta: { company: (o.company || '').trim() || 'Hustle Co.', founder, difficulty: diff, createdAt: Date.now() },
    day: 0, cash: d.cash, rp: 0, fans: 0, brand: 10,
    dayJob: { employed: true, monthly: 1600, quitDay: null, timesRejoined: 0 },
    office: 0,
    founder: { id: 'founder', name: founder, portrait: 'player', role: 'founder', stats: { copy: 20, creative: 20, research: 15, speed: 20 }, level: 1, xp: 0, salary: 0, hiredDay: 0, ...(o.look ? { look: o.look } : {}) },
    staff: [], candidates: [],
    unlocked: { niches: [...START_NICHES], angles: [...START_ANGLES], platforms: ['fadbook'], sizes: ['test'], features: [], research: [] },
    activeFeatures: [],
    current: null, live: [], history: [], archive: [],
    playbook: { combos: {}, focus: {}, launchedProducts: {} },
    market: {
      bar: d.bar,
      saturation: {},
      trends: [],
      platforms: Object.fromEntries(PLATFORM_IDS.map(p => [p, { available: AVAILABLE_AT_START.includes(p), cpmMult: 1, reach: p === 'tiktak' ? 0.8 : 1 }])) as GameState['market']['platforms'],
      cpmInflation: 1,
    },
    decisions: [], modals: [], toasts: [],
    finance: { weeks: [], thisWeek: emptyWeek(0, d.cash) },
    stats: { lifetimeRevenue: 0, lifetimeProfit: 0, launches: 0, winners: 0, bestScore: 0, peakWeekRevenue: 0, peakCash: d.cash },
    milestones: {}, flags: {}, brokeDays: 0, gameOver: null,
  }
  // sim-meta hooks: candidate pool for the Staff dialog, first coach tip
  refreshCandidates(s)
  coach(s, 'welcome', COACH.welcome)
  return s
}
