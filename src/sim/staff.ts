// OWNER: sim-meta. Staff, candidates, training, XP. PUBLIC API.
import type { GameState, Person, StatId } from '../core/types'

export function staffSlots(_s: GameState): number { return 0 }
export function refreshCandidates(_s: GameState): void {}
export function hire(_s: GameState, _candidateId: string): { ok: boolean; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function fire(_s: GameState, _personId: string): void {}
export function train(_s: GameState, _personId: string, _stat: StatId): { ok: boolean; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function trainingCost(_s: GameState, _personId: string): number { return 0 }
export function grantXp(_s: GameState, _personId: string, _xp: number): void {}
/** Everyone currently able to work (founder + staff not in training). */
export function activeTeam(s: GameState): Person[] { return [s.founder, ...s.staff.filter(p => !p.trainingUntil || p.trainingUntil <= s.day)] }
export function staffDailyTick(_s: GameState): void {}
