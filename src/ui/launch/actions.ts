// Launch UI actions shared by the live cards and the Launch detail dialog. OWNER: ui-launch.
import { act } from '../../core/store'
import type { GameState, Launch } from '../../core/types'
import { resolveDecision } from '../../sim/sales'

/** Resolve a matching pending scale call if there is one (so the tray card goes away), else run the action directly. */
export function quickAction(launchId: string, kind: 'scale' | 'refresh' | 'kill', optionId: string, direct: (s: GameState) => void) {
  act(s => {
    const d = s.decisions.find(x => x.launchId === launchId && x.kind === kind)
    if (d) resolveDecision(s, d.id, optionId)
    else direct(s)
  })
}

/** One manual budget increase per sales week: the ad algorithm needs a week to settle (sim sets lastScaleWeek). */
export const scaledThisWeek = (l: Launch) => !!l.sales && Number(l.sales.flags.lastScaleWeek ?? -99) === l.sales.weeks.length
