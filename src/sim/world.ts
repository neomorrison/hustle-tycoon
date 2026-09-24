// OWNER: sim-meta. Calendar events, trends, platforms, random events, modals, coach, milestones. PUBLIC API.
import type { FX, GameState, NicheId, AngleId, PlatformId } from '../core/types'

export function worldDailyTick(_s: GameState): FX[] { return [] }
export function resolveModal(_s: GameState, _modalId: string, _optionId: string): void {}
/** Demand multiplier from active trends for a launch config (1 = none). */
export function trendMult(_s: GameState, _niche: NicheId, _angle: AngleId, _platform: PlatformId): number { return 1 }
/** Seasonal demand multiplier for a niche/product at a day (Q4 gifts, summer outdoor, January slump...). */
export function seasonDemand(_s: GameState, _productId: string, _day: number): number { return 1 }
/** Seasonal CPM multiplier (Q4 up, BFCM spike, January down) × platform drift × inflation. */
export function cpmMultiplier(_s: GameState, _platform: PlatformId, _day: number): number { return 1 }
export function checkMilestones(_s: GameState): FX[] { return [] }
export interface MilestoneDef { id: string; title: string; description: string; icon: string }
export function milestoneDefs(): MilestoneDef[] { return [] }
