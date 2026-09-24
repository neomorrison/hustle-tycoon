// OWNER: sim-core. Cash flow: monthly bills, day job, office moves, bankruptcy. PUBLIC API.
import type { GameState } from '../core/types'

export function monthlyTick(_s: GameState): void {}
export function quitDayJob(_s: GameState): void {}
export function rejoinDayJob(_s: GameState): boolean { return false }
export function moveOffice(_s: GameState, _tier: number): { ok: boolean; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function monthlyBurn(_s: GameState): { rent: number; salaries: number; features: number; dayJob: number; total: number } {
  return { rent: 0, salaries: 0, features: 0, dayJob: 0, total: 0 }
}
/** Daily: bankruptcy / bail-out checks. */
export function economyDailyTick(_s: GameState): void {}
