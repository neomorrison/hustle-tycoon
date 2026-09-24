// OWNER: sim-meta. Research tree & store features. PUBLIC API.
import type { FeatureId, GameState } from '../core/types'

export interface ResearchNode {
  id: string
  name: string
  description: string
  category: 'angle' | 'niche' | 'platform' | 'size' | 'feature' | 'supply' | 'boost'
  cost: number
  cash: number
  requires: string[]
  /** e.g. { angle: 'aesthetic' } | { feature: 'reviews' } | { niche: 'beauty' } | { platform: 'tiktak' } | { size: 'standard' } */
  unlocks: Record<string, string>
  minOffice?: number
  icon: string
}
export function researchNodes(): ResearchNode[] { return [] }
export function canResearch(_s: GameState, _id: string): { ok: boolean; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function research(_s: GameState, _id: string): boolean { return false }
export function toggleFeature(_s: GameState, _id: FeatureId, _on: boolean): void {}
export function featureMonthlyCost(_s: GameState): number { return 0 }
