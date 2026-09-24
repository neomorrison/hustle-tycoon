// OWNER: sim-core. Launch development (GDT "make a game"). PUBLIC API — keep signatures.
import type { FX, GameState, LaunchConfig } from '../core/types'

export interface LaunchEstimate { upfront: number; weeklyAds: number; devDays: number; team: number }
export function canStartLaunch(_s: GameState): { ok: boolean; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function estimateLaunch(_s: GameState, _cfg: LaunchConfig): LaunchEstimate { return { upfront: 0, weeklyAds: 0, devDays: 30, team: 1 } }
/** Charges the upfront cost, creates s.current with awaitingSliders = true (stage 0). Returns id or null. */
export function startLaunch(_s: GameState, _cfg: LaunchConfig): string | null { return null }
/** Set sliders for the current stage (0..2) and resume development. */
export function setStageSliders(_s: GameState, _weights: [number, number, number]): void {}
/** Daily dev progress: points (bubbles), stage transitions, completion. */
export function devTick(_s: GameState): FX[] { return [] }
/** After dev completes: spend extra days fixing complaints (GDT bug-fixing). */
export function startQC(_s: GameState): void {}
/** Evaluate + go live now (from 'qc' or 'ready'). Sets flags.pendingReview = launchId. */
export function launchNow(_s: GameState): FX[] { return [] }
export function cancelLaunch(_s: GameState): void {}
