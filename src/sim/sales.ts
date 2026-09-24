// OWNER: sim-core. Sales runs, scale calls, kill/refresh/scale actions. PUBLIC API.
import type { FX, GameState } from '../core/types'

/** Weekly update for every live launch (called at week start). */
export function weeklySales(_s: GameState): FX[] { return [] }
export function resolveDecision(_s: GameState, _decisionId: string, _optionId: string): void {}
export function scaleLaunch(_s: GameState, _launchId: string, _mult: number): void {}
export function refreshCreatives(_s: GameState, _launchId: string): void {}
export function killLaunch(_s: GameState, _launchId: string): void {}
/** End a run: post-mortem, history, playbook, flags.pendingPostMortem = launchId. */
export function endLaunch(_s: GameState, _launchId: string, _reason: 'faded' | 'killed'): void {}
export function refreshCost(_s: GameState, _launchId: string): number { return 0 }
