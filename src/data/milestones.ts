// OWNER: sim-meta. Milestones (DESIGN §8). Checked daily by sim/world.checkMilestones; each fires once (toast + confetti).
import type { AngleId, GameState, PlatformId } from '../core/types'
import { isBfcm, yearOf } from '../core/time'

export interface MilestoneData {
  id: string
  title: string
  description: string
  icon: string
  check: (s: GameState) => boolean
}

const ALL_ANGLES: AngleId[] = ['pain_point', 'convenience', 'gift', 'aesthetic', 'social_proof', 'budget', 'wholesome', 'before_after', 'luxury']
const ALL_PLATFORMS: PlatformId[] = ['fadbook', 'tiktak', 'reels', 'pinterestt', 'poogle', 'tiktak_shop']
const num = (v: unknown) => (typeof v === 'number' ? v : 0)

export const MILESTONES: readonly MilestoneData[] = [
  { id: 'first_launch', icon: '🚀', title: 'Hello, World of Commerce', description: 'Put your first product live.',
    check: s => s.stats.launches >= 1 || s.live.length > 0 || s.history.length > 0 },
  { id: 'first_sale', icon: '💵', title: 'Cha-Ching!', description: 'Made your first dollar online.',
    check: s => s.stats.lifetimeRevenue > 0 },
  { id: 'first_research', icon: '🧪', title: 'Lab Rat', description: 'Researched something new.',
    check: s => s.unlocked.research.length >= 1 },
  { id: 'first_winner', icon: '🏆', title: 'Winner Winner', description: 'Scored your first 🏆 winner review.',
    check: s => s.stats.winners >= 1 },
  { id: 'cut_losses', icon: '✂️', title: 'Cut Your Losses', description: 'Killed a losing launch before it killed you.',
    check: s => s.history.some(h => h.endReason === 'killed' && h.profit < 0) },
  { id: 'profit_10k', icon: '💰', title: 'Five Figures', description: 'Earned $10,000 in lifetime profit.',
    check: s => s.stats.lifetimeProfit >= 10_000 },
  { id: 'first_move', icon: '🏠', title: 'Out of the Basement', description: "Moved out of Mom's basement.",
    check: s => s.office >= 1 },
  { id: 'first_hire', icon: '👥', title: "It's a Team Now", description: 'Hired your first employee.',
    check: s => s.staff.length >= 1 },
  { id: 'quit_job', icon: '🍔', title: 'Hairnet Retired', description: "Quit McDoodle's to go full-time.",
    check: s => !s.dayJob.employed && s.dayJob.quitDay !== null },
  { id: 'viral', icon: '📱', title: 'Gone Viral', description: 'A launch blew up on the feed.',
    check: s => num(s.flags['w:viralCount']) >= 1 },
  { id: 'trend_rider', icon: '🏄', title: 'Trend Surfer', description: 'Launched right into a hot trend.',
    check: s => num(s.flags['w:trendRider']) >= 1 },
  { id: 'launches_10', icon: '🔟', title: 'Serial Launcher', description: 'Launched 10 products.',
    check: s => s.stats.launches >= 10 },
  { id: 'hat_trick', icon: '🔥', title: 'Hat Trick', description: 'Three winners in a row.',
    check: s => s.history.length >= 3 && s.history.slice(-3).every(h => h.verdict === 'winner') },
  { id: 'expo', icon: '🎪', title: 'Expo Exhibitor', description: 'Ran a booth at the Ecom Expo.',
    check: s => num(s.flags['w:expoCount']) >= 1 },
  { id: 'fans_10k', icon: '❤️', title: 'Cult Following', description: 'Reached 10,000 fans.',
    check: s => s.fans >= 10_000 },
  { id: 'week_100k', icon: '📈', title: 'Six-Figure Week', description: 'Did $100,000 revenue in a single week.',
    check: s => s.stats.peakWeekRevenue >= 100_000 },
  { id: 'bfcm_50k', icon: '🛍️', title: 'Black Friday Baller', description: 'Did $50,000+ revenue during BFCM week.',
    check: s => s.finance.weeks.some(w => w.revenue >= 50_000 && isBfcm(w.week * 7)) },
  { id: 'near_perfect', icon: '💯', title: 'Near-Perfect', description: 'Got a 9.5+ overall review score.',
    check: s => s.stats.bestScore >= 9.5 },
  { id: 'all_angles', icon: '🎯', title: 'Angle Collector', description: 'Unlocked every marketing angle.',
    check: s => ALL_ANGLES.every(a => s.unlocked.angles.includes(a)) },
  { id: 'all_platforms', icon: '📡', title: 'Omnichannel', description: 'Unlocked every ad platform.',
    check: s => ALL_PLATFORMS.every(p => s.unlocked.platforms.includes(p)) },
  { id: 'brand_75', icon: '⭐', title: 'Household Name', description: 'Reached 75 brand reputation.',
    check: s => s.brand >= 75 },
  { id: 'mega_launch', icon: '🦄', title: 'Going Mega', description: 'Launched a Mega-size product.',
    check: s => s.live.some(l => l.size === 'mega') || s.history.some(h => h.size === 'mega') },
  { id: 'full_house', icon: '🪑', title: 'Full House', description: 'Filled all 7 desks at the Penthouse.',
    check: s => s.staff.length >= 7 },
  { id: 'revenue_1m', icon: '💎', title: 'Million-Dollar Brand', description: '$1,000,000 in lifetime revenue.',
    check: s => s.stats.lifetimeRevenue >= 1_000_000 },
  { id: 'penthouse', icon: '🌆', title: 'Penthouse Energy', description: 'Moved into the Penthouse HQ.',
    check: s => s.office >= 5 },
  { id: 'millionaire', icon: '🤑', title: 'Seven Figures in the Bank', description: 'Held $1,000,000 cash.',
    check: s => s.cash >= 1_000_000 },
  { id: 'ten_years', icon: '🎂', title: 'Decade of Hustle', description: 'Ten years in business.',
    check: s => yearOf(s.day) >= 11 },
]
