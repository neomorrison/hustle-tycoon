// Parody name generators for the new-game form.
const COMPANIES = [
  'Gadget Goblin Co.', 'Drip Drop Supply', 'Basement Brands', 'Fry Guy Ventures', 'Hype Harbor', 'Cart Wheel Co.',
  'Scroll Stoppers', 'Box Fresh Goods', 'Nifty Thrifty', 'Glow Up Goods', 'Paws & Profits', 'Trend Hunters Inc.',
  'Side Quest Supply', 'Moonshot Mart', 'Grease to Greatness', 'Late Night Launches', 'Pizza Roll Capital',
  'Thumbstop Trading', 'Upsell Island', 'The Hustle Hut', 'Cozy Carts Co.', 'Fries Before Guys LLC',
]
const FOUNDERS = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Taylor', 'Jamie', 'Morgan', 'Quinn', 'Avery', 'Rowan', 'Kai', 'Nico', 'Jess', 'Dev', 'Mo']

const pickFrom = <T,>(arr: readonly T[], not?: T) => {
  const pool = arr.filter(x => x !== not)
  return pool[Math.floor(Math.random() * pool.length)]
}
export const randomCompany = (not?: string) => pickFrom(COMPANIES, not)
export const randomFounder = (not?: string) => pickFrom(FOUNDERS, not)

export function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
