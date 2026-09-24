import type { GameState, WeekFinance } from './types'
import { weekIndex } from './time'

export const emptyWeek = (week: number, cash: number): WeekFinance => ({ week, revenue: 0, adSpend: 0, cogs: 0, fees: 0, expenses: 0, income: 0, profit: 0, cash })

export type MoneyCat = 'revenue' | 'adSpend' | 'cogs' | 'fees' | 'expenses' | 'income'

/** Money out (cash can go negative — overdraft; bankruptcy is checked by the economy module). */
export function spend(s: GameState, amount: number, cat: Exclude<MoneyCat, 'revenue' | 'income'> = 'expenses') {
  if (!(amount > 0)) return
  s.cash -= amount
  s.finance.thisWeek[cat] += amount
  s.finance.thisWeek.profit -= amount
}
/** Money in. */
export function earn(s: GameState, amount: number, cat: 'revenue' | 'income' = 'revenue') {
  if (!(amount > 0)) return
  s.cash += amount
  s.finance.thisWeek[cat] += amount
  s.finance.thisWeek.profit += amount
  if (cat === 'revenue') s.stats.lifetimeRevenue += amount
  if (s.cash > s.stats.peakCash) s.stats.peakCash = s.cash
}
/** Close the finance week (called at week start by the orchestrator). */
export function rollWeek(s: GameState) {
  const w = s.finance.thisWeek
  w.cash = s.cash
  s.finance.weeks.push(w)
  if (s.finance.weeks.length > 520) s.finance.weeks.splice(0, s.finance.weeks.length - 520)
  s.finance.thisWeek = emptyWeek(weekIndex(s.day), s.cash)
}
export const canAfford = (s: GameState, amount: number) => s.cash >= amount
