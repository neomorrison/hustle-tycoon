// Orchestrator — one call = one in-game day. Mutates an immer draft; returns transient FX.
import type { FX, GameState } from '../core/types'
import { isMonthStart, isWeekStart } from '../core/time'
import { rollWeek } from '../core/money'
import { devTick } from './launch'
import { weeklySales } from './sales'
import { economyDailyTick, monthlyTick } from './economy'
import { staffDailyTick } from './staff'
import { checkMilestones, worldDailyTick } from './world'

export function tickDay(s: GameState): FX[] {
  const fx: FX[] = []
  s.day += 1
  if (isWeekStart(s.day)) {
    rollWeek(s)
    fx.push(...weeklySales(s))
  }
  if (isMonthStart(s.day)) monthlyTick(s)
  fx.push(...worldDailyTick(s))
  staffDailyTick(s)
  fx.push(...devTick(s))
  economyDailyTick(s)
  fx.push(...checkMilestones(s))
  // expire decisions
  s.decisions = s.decisions.filter(d => d.expiresDay > s.day)
  return fx
}
