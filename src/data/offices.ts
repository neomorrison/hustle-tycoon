// OWNER: sim-meta. Office tiers (GDT-style office upgrades). Room art: roomImage(tier).
// Rent is monthly. Moving in costs a one-off deposit + fit-out (tuned: DESIGN's 2× rent was pocket change next to a
// Standard winner, so offices never gated anything — GDT-style big move-in prices make each tier a real milestone).
// Downgrades are allowed (Mom's basement is free).

export interface OfficeDef {
  tier: number
  name: string
  emoji: string
  /** monthly rent */
  rent: number
  /** staff desks (founder not counted) */
  slots: number
  /** one-off cost to move in (deposit + fit-out) */
  moveCost: number
  /** one-liner shown on the tier card */
  flavor: string
  /** what this tier opens up (bullet list for the Office dialog) */
  unlocks: string[]
}

/** * move-in prices per tier (≈ what a typical hit at that stage earns: a Test winner, a couple, a Standard winner, …) */
export const OFFICE_MOVE_IN = [0, 2500, 15_000, 75_000, 250_000, 600_000] as const

const mk = (tier: number, name: string, emoji: string, rent: number, slots: number, flavor: string, unlocks: string[]): OfficeDef =>
  ({ tier, name, emoji, rent, slots, moveCost: OFFICE_MOVE_IN[tier] ?? rent * 2, flavor, unlocks })

export const OFFICES: readonly OfficeDef[] = [
  mk(0, "Mom's Basement", '🏚️', 0, 0,
    'Free rent, questionable Wi-Fi. Mom brings pizza rolls at 11 pm and asks when you\'ll get a real job.',
    ['Test launches', 'Just you, a laptop and a dream']),
  mk(1, 'Shared Apartment', '🛋️', 950, 1,
    'Three roommates, one bathroom, infinite ambition. Your "office" is the kitchen table.',
    ['1 staff desk', 'Ecom Expo booth ($500)', 'Your first hire: Test launches at full team']),
  mk(2, 'Studio', '🎨', 1650, 2,
    "Exposed brick, a ring light and a neon sign that says HUSTLE. You're basically a brand now.",
    ['2 staff desks', 'Standard launch research', 'Recruiter network & Mentorship research']),
  mk(3, 'Creator Loft', '🏙️', 2600, 3,
    "Content-house energy. Someone is always filming a hook and someone else is always in frame.",
    ['3 staff desks', 'Big launch research', 'Premium Expo booth ($5,000)']),
  mk(4, 'House + Garage HQ', '🏡', 4200, 5,
    'The garage is a warehouse now. The car lives outside. The neighbours have questions.',
    ['5 staff desks', '3PL warehouse research', 'Space for real inventory']),
  mk(5, 'Penthouse HQ', '🌆', 11500, 7,
    "Floor-to-ceiling windows. From up here the McDoodle's sign is a tiny yellow dot.",
    ['7 staff desks', 'Mega launch research', 'Expo keynote slot ($40,000)']),
]

export const MAX_OFFICE = OFFICES.length - 1
export const officeDef = (tier: number): OfficeDef => OFFICES[Math.max(0, Math.min(MAX_OFFICE, Math.floor(tier)))]
export const officeRent = (tier: number) => officeDef(tier).rent
export const officeSlots = (tier: number) => officeDef(tier).slots
export const officeMoveCost = (tier: number) => officeDef(tier).moveCost
export const officeName = (tier: number) => officeDef(tier).name
