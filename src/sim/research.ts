// OWNER: sim-meta. Research tree & store features. PUBLIC API.
import type { AngleId, AreaId, FeatureId, GameState, NicheId, PlatformId, SizeId } from '../core/types'
import { spend } from '../core/money'
import { coach, toast } from '../core/notify'
import { RESEARCH, RESEARCH_BY_ID, RESEARCH_CATEGORIES } from '../data/research'
import { FEATURES } from '../data/features'
import { officeName } from '../data/offices'
import { COACH } from '../data/coach'

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

export { RESEARCH_CATEGORIES }
export function researchNodes(): ResearchNode[] { return RESEARCH as ResearchNode[] }
export const researchNode = (id: string): ResearchNode | undefined => RESEARCH_BY_ID[id]
/** True once a research node (any category, incl. boosts like 'boost_hook_lab') is owned. */
export const hasResearch = (s: GameState, id: string) => s.unlocked.research.includes(id)
/** Boost shorthand: hasBoost(s, 'hook_lab') === hasResearch(s, 'boost_hook_lab') (also 'backup_supplier'). */
export const hasBoost = (s: GameState, boost: string) =>
  s.unlocked.research.some(id => RESEARCH_BY_ID[id]?.unlocks.boost === boost)
export const hasActiveFeature = (s: GameState, id: FeatureId) => s.activeFeatures.includes(id)

/** Platform research that only appears after a news event (world sets market.platforms[p].available). */
function platformGate(s: GameState, node: ResearchNode): string | null {
  const p = node.unlocks.platform as PlatformId | undefined
  if (!p) return null
  const st = s.market.platforms[p]
  if (st && !st.available) return p === 'reels' ? 'Instaglam Reels hasn\'t launched yet' : p === 'tiktak_shop' ? 'TikTak Shop isn\'t out yet' : 'Platform not available yet'
  return null
}

/** Why a node is locked (prerequisites / office / news), ignoring RP and cash. null = unlocked. */
export function researchLockReason(s: GameState, id: string): string | null {
  const node = RESEARCH_BY_ID[id]
  if (!node) return 'Unknown research'
  const missing = node.requires.filter(r => !s.unlocked.research.includes(r))
  if (missing.length) return `Needs ${missing.map(r => RESEARCH_BY_ID[r]?.name ?? r).join(' + ')}`
  if (node.minOffice && s.office < node.minOffice) return `Needs office: ${officeName(node.minOffice)}`
  return platformGate(s, node)
}

export function canResearch(s: GameState, id: string): { ok: boolean; reason?: string } {
  const node = RESEARCH_BY_ID[id]
  if (!node) return { ok: false, reason: 'Unknown research' }
  if (s.unlocked.research.includes(id)) return { ok: false, reason: 'Already researched' }
  const lock = researchLockReason(s, id)
  if (lock) return { ok: false, reason: lock }
  if (s.rp < node.cost) return { ok: false, reason: `Need ${Math.ceil(node.cost - s.rp)} more 🟣 RP` }
  if (node.cash > 0 && s.cash < node.cash) return { ok: false, reason: `Need $${Math.ceil(node.cash - s.cash).toLocaleString('en-US')} more cash` }
  return { ok: true }
}

/** UI state for a node in the tree. */
export type ResearchState = 'owned' | 'ready' | 'short' | 'locked'
export function researchState(s: GameState, id: string): ResearchState {
  if (s.unlocked.research.includes(id)) return 'owned'
  if (researchLockReason(s, id)) return 'locked'
  return canResearch(s, id).ok ? 'ready' : 'short'
}
/** Nodes researchable right now (for the 🧪 dock badge). */
export function affordableResearch(s: GameState): ResearchNode[] {
  return RESEARCH.filter(r => !s.unlocked.research.includes(r.id) && canResearch(s, r.id).ok) as ResearchNode[]
}

const pushOnce = <T>(arr: T[], v: T) => { if (!arr.includes(v)) arr.push(v) }

function applyUnlocks(s: GameState, node: ResearchNode) {
  const u = node.unlocks
  if (u.angle) pushOnce(s.unlocked.angles, u.angle as AngleId)
  if (u.niche) pushOnce(s.unlocked.niches, u.niche as NicheId)
  if (u.platform) pushOnce(s.unlocked.platforms, u.platform as PlatformId)
  if (u.size) pushOnce(s.unlocked.sizes, u.size as SizeId)
  if (u.feature) {
    const f = u.feature as FeatureId
    pushOnce(s.unlocked.features, f)
    // Arcade-friendly: freshly researched apps switch on automatically (toggle off in 🧩 Features).
    pushOnce(s.activeFeatures, f)
  }
  if (u.boost === 'copy_bootcamp') {
    for (const p of [s.founder, ...s.staff]) p.stats.copy = Math.min(100, p.stats.copy + 4)
  }
}

function unlockToast(node: ResearchNode): string {
  const u = node.unlocks
  if (u.feature) {
    const f = FEATURES[u.feature as FeatureId]
    return `${node.icon} ${f.name} installed and ON — ${f.effect} ($${f.monthly}/mo)`
  }
  if (u.angle) return `${node.icon} New angle unlocked: ${node.name.replace(/ angle$/, '')}`
  if (u.niche) return `${node.icon} New niche unlocked: ${node.name.replace(/ niche$/, '')}`
  if (u.platform) return `${node.icon} New platform unlocked: ${node.name.replace(/ ads$/, '')}`
  if (u.size) return `${node.icon} ${node.name} unlocked!`
  return `${node.icon} Researched: ${node.name}`
}

/** Spend RP (+cash) and unlock. Returns false (with no changes) if not allowed. */
export function research(s: GameState, id: string): boolean {
  if (!canResearch(s, id).ok) return false
  const node = RESEARCH_BY_ID[id] as ResearchNode
  s.rp -= node.cost
  if (node.cash > 0) spend(s, node.cash, 'expenses')
  s.unlocked.research.push(id)
  applyUnlocks(s, node)
  toast(s, 'research', unlockToast(node))
  coach(s, 'first_research', COACH.first_research)
  if (node.unlocks.feature) coach(s, 'first_feature', COACH.first_feature)
  if (node.unlocks.platform) coach(s, 'first_platform', COACH.first_platform)
  if (node.unlocks.size === 'standard') coach(s, 'standard_size', COACH.standard_size)
  s.flags.lastResearchDay = s.day
  return true
}

export function toggleFeature(s: GameState, id: FeatureId, on: boolean): void {
  if (!s.unlocked.features.includes(id)) return
  const i = s.activeFeatures.indexOf(id)
  if (on && i < 0) s.activeFeatures.push(id)
  else if (!on && i >= 0) s.activeFeatures.splice(i, 1)
}

/** Monthly app fees for the currently ACTIVE features. */
export function featureMonthlyCost(s: GameState): number {
  return s.activeFeatures.reduce((sum, id) => sum + (FEATURES[id]?.monthly ?? 0), 0)
}

/** Research-boost multiplier for a focus area's points (sim-core multiplies it into dev output). */
export function areaBoost(s: GameState, area: AreaId): number {
  if (area === 'hooks' && hasBoost(s, 'hook_lab')) return 1.1
  if (area === 'copy' && hasBoost(s, 'copy_bootcamp')) return 1.1
  return 1
}
/** Data dashboard: New Launch may show combo hints for niches you have launched in. */
export const comboHintsEnabled = (s: GameState) => hasBoost(s, 'data_dashboard')
