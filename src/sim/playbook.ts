// OWNER: sim-core. Player knowledge of combos & focus. PUBLIC API.
import type { ComboRating, GameState, Launch } from '../core/types'

export function recordLaunchKnowledge(_s: GameState, _l: Launch): void {}
export function knownCombo(s: GameState, key: string): ComboRating | undefined { return s.playbook.combos[key] }
