// OWNER: sim-core. Player knowledge of combos & focus. PUBLIC API.
import type { AngleId, ComboRating, GameState, Launch, PlatformId } from '../core/types'
import { findProduct, productById } from '../data/catalog'
import { comboKeys, isPerProductPlatform, keyNP, nicheTypicalRating, normalize3, type Triple } from '../data/combos'
import { comboRatings, launchFocusAccuracy } from './evaluate'

/** Reveal a finished launch's combos and remember its focus if it beat the stored recipe for the angle. */
export function recordLaunchKnowledge(s: GameState, l: Launch): void {
  const p = productById(l.productId)
  const keys = comboKeys(p, l.angle, l.platform)
  const r = comboRatings(s, l.productId, l.angle, l.platform)
  const pb = s.playbook
  pb.combos[keys.pa] = r.productAngle
  pb.combos[keys.ap] = r.anglePlatform
  pb.combos[keys.np] = r.nichePlatform
  // fadbook/tiktak fit is per product: also learn the niche's typical fit for the matrix view
  if (isPerProductPlatform(l.platform)) pb.combos[keyNP(p.niche, l.platform)] = nicheTypicalRating(p.niche, l.platform)

  const acc = launchFocusAccuracy(l)
  const mean = (acc[0] + acc[1] + acc[2]) / 3
  const cur = pb.focus[l.angle]
  if (!cur || mean > cur.accuracy + 1e-6) {
    pb.focus[l.angle] = { sliders: l.sliders.slice(0, 3).map(w => normalize3(w)) as Triple[], accuracy: Math.round(mean * 1000) / 1000 }
  }
}

export function knownCombo(s: GameState, key: string): ComboRating | undefined { return s.playbook.combos[key] }
/** Alias of knownCombo (key-based). */
export const knownComboFor = knownCombo

/**
 * What the player knows about a config's three combos (undefined = "?").
 * Product×platform on fadbook/tiktak is per product; falls back to the niche's typical rating when known.
 */
export function knownCombosFor(s: GameState, productId: string, angle: AngleId, platform: PlatformId): {
  productAngle?: ComboRating; anglePlatform?: ComboRating; nichePlatform?: ComboRating; nicheTypical?: boolean
} {
  const p = findProduct(productId)
  if (!p) return {}
  const k = comboKeys(p, angle, platform)
  const exact = s.playbook.combos[k.np]
  const typical = exact ? undefined : s.playbook.combos[k.nicheNp]
  return {
    productAngle: s.playbook.combos[k.pa],
    anglePlatform: s.playbook.combos[k.ap],
    nichePlatform: exact ?? typical,
    nicheTypical: !exact && !!typical,
  }
}

/** Best stored focus recipe for an angle (normalized sliders per stage), or null if never launched well. */
export function knownFocus(s: GameState, angle: AngleId): { sliders: Triple[]; accuracy: number } | null {
  const f = s.playbook.focus[angle]
  return f ? { sliders: f.sliders.map(w => normalize3(w)), accuracy: f.accuracy } : null
}

/** Default slider weights for a stage: the playbook recipe for the angle if known, else an even split. */
export function suggestedSliders(s: GameState, angle: AngleId, stage: number): [number, number, number] {
  const f = s.playbook.focus[angle]?.sliders[stage]
  if (!f) return [1, 1, 1]
  const n = normalize3(f)
  return [Math.round(n[0] * 100) / 100, Math.round(n[1] * 100) / 100, Math.round(n[2] * 100) / 100]
}

/** Times a product has been launched (saturation hint for the UI). */
export const timesLaunched = (s: GameState, productId: string) => s.playbook.launchedProducts[productId] ?? 0

/** Count of discovered combos by rating (for Playbook header / milestones). */
export function playbookStats(s: GameState): Record<ComboRating, number> & { total: number } {
  const out = { great: 0, good: 0, ok: 0, bad: 0, total: 0 }
  for (const [k, v] of Object.entries(s.playbook.combos)) {
    if (k.startsWith('np:') || k.startsWith('pa:') || k.startsWith('ap:') || k.startsWith('pp:')) { out[v]++; out.total++ }
  }
  return out
}
