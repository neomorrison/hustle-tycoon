// OWNER: sim-core. Launch sizes (= Game Dev Tycoon game sizes). DESIGN §2.
import type { SizeId } from '../core/types'

export interface SizeDef {
  id: SizeId
  name: string
  icon: string
  blurb: string
  /** upfront cost (samples, store, stock) */
  upfront: number
  /** default weekly ad budget */
  weeklyBudget: number
  /** base development days */
  devDays: number
  /** expected-points multiplier (market expectation scales with size). DESIGN had ×3/×9/×25. Tuned so the team an
   *  office can seat is on par when that size becomes viable: 3 people (Studio) ≈ Standard, 6 (House HQ) ≈ Big,
   *  8 (Penthouse) ≈ Mega — relative to the 2-person Test launches that anchor the market bar. */
  mult: number
  /** minimum office tier (*Standard: DESIGN had office 1, but a 2-person team there builds at 0.6× the bar — a trap;
   *  the Studio's 3 people are on par) */
  minOffice: number
  /** max people working on it (founder included) — GDT-style team limit per project size */
  maxTeam: number
}

export const SIZES: Record<SizeId, SizeDef> = {
  test: {
    id: 'test', name: 'Test Launch', icon: '🧪', blurb: 'One product, a tiny budget, a lot of hope.',
    upfront: 300, weeklyBudget: 700, devDays: 28, mult: 1, minOffice: 0, maxTeam: 2,
  },
  standard: {
    id: 'standard', name: 'Standard', icon: '📦', blurb: 'Real stock, real ad budget. Now it\'s a business.',
    upfront: 2500, weeklyBudget: 3500, devDays: 42, mult: 2.5, minOffice: 2, maxTeam: 4,
  },
  big: {
    id: 'big', name: 'Big Launch', icon: '🚚', blurb: 'Pallets of inventory and a media buyer\'s dream budget.',
    upfront: 15000, weeklyBudget: 17500, devDays: 70, mult: 6.5, minOffice: 3, maxTeam: 6,
  },
  mega: {
    id: 'mega', name: 'Mega Launch', icon: '🚀', blurb: 'Brand-level blitz. Go big or go back to McDoodle\'s.',
    upfront: 80000, weeklyBudget: 80000, devDays: 100, mult: 13, minOffice: 5, maxTeam: 8,
  },
}

export const SIZE_IDS: SizeId[] = ['test', 'standard', 'big', 'mega']
export const sizeRank = (s: SizeId) => SIZE_IDS.indexOf(s)
