// OWNER: sim-core (with sim-meta init hooks). Creates a fresh GameState.
import type { Difficulty, GameState, PlatformId } from '../core/types'
import { emptyWeek } from '../core/money'

export const SAVE_VERSION = 1
export interface NewGameOptions { company: string; founder: string; difficulty: Difficulty; seed?: number }

const PLATFORMS: PlatformId[] = ['fadbook', 'tiktak', 'reels', 'pinterestt', 'poogle', 'tiktak_shop']

export function createNewGame(o: NewGameOptions): GameState {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31)
  return {
    version: SAVE_VERSION, seed, rng: seed, seq: 0,
    meta: { company: o.company || 'Hustle Co.', founder: o.founder || 'You', difficulty: o.difficulty, createdAt: Date.now() },
    day: 0, cash: 2000, rp: 0, fans: 0, brand: 10,
    dayJob: { employed: true, monthly: 1600, quitDay: null, timesRejoined: 0 },
    office: 0,
    founder: { id: 'founder', name: o.founder || 'You', portrait: 'player', role: 'founder', stats: { copy: 20, creative: 20, research: 15, speed: 20 }, level: 1, xp: 0, salary: 0, hiredDay: 0 },
    staff: [], candidates: [],
    unlocked: { niches: ['pet', 'home', 'kitchen', 'gadgets'], angles: ['pain_point', 'convenience', 'gift'], platforms: ['fadbook'], sizes: ['test'], features: [], research: [] },
    activeFeatures: [],
    current: null, live: [], history: [],
    playbook: { combos: {}, focus: {}, launchedProducts: {} },
    market: { bar: 100, saturation: {}, trends: [], platforms: Object.fromEntries(PLATFORMS.map(p => [p, { available: p === 'fadbook' || p === 'tiktak', cpmMult: 1, reach: p === 'tiktak' ? 0.8 : 1 }])) as GameState['market']['platforms'], cpmInflation: 1 },
    decisions: [], modals: [], toasts: [],
    finance: { weeks: [], thisWeek: emptyWeek(0, 2000) },
    stats: { lifetimeRevenue: 0, lifetimeProfit: 0, launches: 0, winners: 0, bestScore: 0, peakWeekRevenue: 0, peakCash: 2000 },
    milestones: {}, flags: {}, brokeDays: 0, gameOver: null,
  }
}
