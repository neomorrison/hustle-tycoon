import type { GameState } from './types'
export function uid(s: GameState, prefix: string): string {
  s.seq = (s.seq || 0) + 1
  return `${prefix}_${s.seq.toString(36)}`
}
