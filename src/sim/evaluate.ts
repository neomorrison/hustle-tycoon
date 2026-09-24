// OWNER: sim-core. Launch scoring (review), combos, ideal focus, post-mortem. PUBLIC API.
import type { AngleId, ComboRating, GameState, Launch, PlatformId, PostMortem, Review } from '../core/types'

export function evaluate(_s: GameState, _l: Launch): Review { throw new Error('evaluate not implemented') }
/** Hidden combo ratings for a config (engine truth). */
export function comboRatings(_s: GameState, _productId: string, _angle: AngleId, _platform: PlatformId): { productAngle: ComboRating; anglePlatform: ComboRating; nichePlatform: ComboRating } {
  return { productAngle: 'ok', anglePlatform: 'ok', nichePlatform: 'ok' }
}
/** Ideal slider distribution per stage for an angle on a platform. */
export function idealFocus(_angle: AngleId, _platform: PlatformId): [number, number, number][] { return [[1, 1, 1], [1, 1, 1], [1, 1, 1]] }
export function buildPostMortem(_s: GameState, _l: Launch): PostMortem {
  return { headline: '', notes: [], combos: [], focusTips: [], totals: { revenue: 0, spend: 0, profit: 0, units: 0, weeks: 0 } }
}
