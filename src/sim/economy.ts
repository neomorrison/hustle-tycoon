// OWNER: sim-core. Cash flow: monthly bills, day job, office moves, bankruptcy. PUBLIC API.
import type { GameState } from '../core/types'
import { uid } from '../core/ids'
import { earn, spend } from '../core/money'
import { coach, toast } from '../core/notify'
import { DAYS_PER_YEAR, monthName, monthOf } from '../core/time'
import { MAX_OFFICE, officeDef, officeMoveCost, officeRent, officeSlots } from '../data/offices'
import { COACH } from '../data/coach'
import { featureMonthlyCost } from './research'
import { barFloor } from './launch'

// ---------------------------------------------------------------------------
// Tuning (DESIGN §6)
// ---------------------------------------------------------------------------
export const ECONOMY = {
  dayJobPay: 1600,
  rejoinPay: 1400,
  overdraftFloor: -3000,
  bankruptDays: 21,
  momCash: 500,
  /** * market bar multiplier on the move back to Mom's (was 0.7: a solo founder faced a bar ~2× his output and flopped for years) */
  momBarReset: 0.5,
  /** market bar rises 5% a year (industry competition) */
  yearlyBarGrowth: 1.05,
  /** product saturation fades each month */
  saturationDecayPerMonth: 0.04,
  /** * monthly bills toast turns into a runway warning below this many months of bills in the bank */
  billsWarnMonths: 2,
}

export function monthlyBurn(s: GameState): { rent: number; salaries: number; features: number; dayJob: number; total: number } {
  const rent = officeRent(s.office)
  const salaries = s.staff.reduce((a, p) => a + p.salary, 0)
  const features = featureMonthlyCost(s)
  const dayJob = s.dayJob.employed ? s.dayJob.monthly : 0
  /** net monthly outflow (negative = the day job more than covers the bills) */
  return { rent, salaries, features, dayJob, total: rent + salaries + features - dayJob }
}

/** Month start: bills, paycheck, yearly market pressure, saturation fade. */
export function monthlyTick(s: GameState): void {
  const b = monthlyBurn(s)
  const bills = b.rent + b.salaries + b.features
  if (b.rent > 0) spend(s, b.rent, 'expenses')
  if (b.salaries > 0) spend(s, b.salaries, 'expenses')
  if (b.features > 0) spend(s, b.features, 'expenses')
  if (b.dayJob > 0) earn(s, b.dayJob, 'income')
  const parts: string[] = []
  if (b.rent) parts.push(`rent $${b.rent.toLocaleString('en-US')}`)
  if (b.salaries) parts.push(`salaries $${b.salaries.toLocaleString('en-US')}`)
  if (b.features) parts.push(`apps $${b.features.toLocaleString('en-US')}`)
  const month = monthName(monthOf(s.day), true)
  // * the same bill every 14 real seconds is noise: toast the first months, any change, and when cash runs thin
  const last = typeof s.flags['econ:lastBills'] === 'number' ? (s.flags['econ:lastBills'] as number) : -1
  const net = b.dayJob - bills
  const changed = Math.abs(net - last) >= Math.max(250, 0.12 * Math.abs(last))
  const thin = bills > 0 && s.cash < bills * ECONOMY.billsWarnMonths
  s.flags['econ:lastBills'] = net
  if ((bills > 0 || b.dayJob > 0) && (s.day <= 2 * 28 || changed || thin)) {
    const pay = b.dayJob > 0 ? `🍔 McDoodle's paycheck +$${b.dayJob.toLocaleString('en-US')}` : ''
    const out = bills > 0 ? `🧾 ${month} bills −$${Math.round(bills).toLocaleString('en-US')} (${parts.join(', ')})` : ''
    const warn = thin ? ` — only ~${Math.max(0, s.cash / bills).toFixed(1)} months of runway` : ''
    toast(s, thin ? 'bad' : b.dayJob >= bills ? 'money' : 'info', ([out, pay].filter(Boolean).join(' · ') || `${month} begins.`) + warn, net)
  }
  // saturation fades so old products can come back eventually
  for (const k of Object.keys(s.market.saturation)) {
    const v = s.market.saturation[k] - ECONOMY.saturationDecayPerMonth
    if (v <= 0.001) delete s.market.saturation[k]
    else s.market.saturation[k] = Math.round(v * 1000) / 1000
  }
  // new year: competitors get better too
  if (s.day > 0 && s.day % DAYS_PER_YEAR === 0) {
    s.market.bar = Math.round(s.market.bar * ECONOMY.yearlyBarGrowth * 10) / 10
    coach(s, 'bar_rising', COACH.bar_rising)
  }
}

// ---------------------------------------------------------------------------
// Day job
// ---------------------------------------------------------------------------
export function canQuitDayJob(s: GameState): { ok: boolean; reason?: string } {
  if (!s.dayJob.employed) return { ok: false, reason: "You already quit McDoodle's" }
  return { ok: true }
}
export function quitDayJob(s: GameState): void {
  if (!s.dayJob.employed) return
  s.dayJob.employed = false
  s.dayJob.quitDay = s.day
  s.flags.quitDayJob = s.day
  const first = s.dayJob.timesRejoined === 0
  toast(s, 'milestone', first
    ? "🍟 You hung up the hairnet! Goodbye McDoodle's — full-time founder mode: double output, faster launches."
    : "🍟 Hairnet off again. Full-time founder, take two.")
  coach(s, 'quit', "No more fry shifts. You now build at full speed — but there's no paycheck. Keep something live that pays the bills.", true)
}
/** Rejoin McDoodle's for a steady (smaller) paycheck. Returns false if already employed. */
export function rejoinDayJob(s: GameState): boolean {
  if (s.dayJob.employed) return false
  s.dayJob.employed = true
  s.dayJob.monthly = ECONOMY.rejoinPay
  s.dayJob.timesRejoined += 1
  const lines = [
    "🍔 Back at McDoodle's. The manager said \"welcome back\" in a tone you'll never forget.",
    "🍔 McDoodle's took you back at $1,400/mo. Your old name tag still says TRAINEE.",
    "🍔 You're back on fries. A teenager is now your shift lead.",
  ]
  toast(s, 'info', lines[Math.min(lines.length - 1, s.dayJob.timesRejoined - 1)])
  return true
}

// ---------------------------------------------------------------------------
// Office
// ---------------------------------------------------------------------------
export function canMoveOffice(s: GameState, tier: number): { ok: boolean; reason?: string; cost: number } {
  const t = Math.floor(tier)
  const cost = t >= 0 && t <= MAX_OFFICE ? officeMoveCost(t) : 0
  if (!(t >= 0 && t <= MAX_OFFICE)) return { ok: false, reason: 'No such office', cost }
  if (t === s.office) return { ok: false, reason: "You're already here", cost }
  if (s.staff.length > officeSlots(t)) return { ok: false, reason: `Only ${officeSlots(t)} desk${officeSlots(t) === 1 ? '' : 's'} there — let someone go first`, cost }
  if (s.cash < cost) return { ok: false, reason: `Moving in costs $${cost.toLocaleString('en-US')} (deposit + fit-out)`, cost }
  return { ok: true, cost }
}
export function moveOffice(s: GameState, tier: number): { ok: boolean; reason?: string } {
  const chk = canMoveOffice(s, tier)
  if (!chk.ok) return { ok: false, reason: chk.reason }
  const t = Math.floor(tier)
  const up = t > s.office
  spend(s, chk.cost, 'expenses')
  s.office = t
  s.flags.lastMoveDay = s.day
  const o = officeDef(t)
  toast(s, up ? 'milestone' : 'info', up
    ? `${o.emoji} Moved into the ${o.name}! ${o.slots} desk${o.slots === 1 ? '' : 's'}, $${o.rent.toLocaleString('en-US')}/mo rent.`
    : `${o.emoji} Downsized to the ${o.name}. Rent is now $${o.rent.toLocaleString('en-US')}/mo.`, -chk.cost)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Bankruptcy
// ---------------------------------------------------------------------------
/** Daily: bankruptcy / bail-out checks. */
export function economyDailyTick(s: GameState): void {
  if (s.gameOver) return
  if (s.cash < 0) coach(s, 'overdraft', COACH.overdraft)
  if (s.cash < ECONOMY.overdraftFloor) {
    s.brokeDays += 1
    if (s.brokeDays === 1) toast(s, 'bad', `🚨 Cash is below −$3,000! You have ${ECONOMY.bankruptDays} days to get back above it.`)
    if (s.brokeDays === 7) coach(s, 'bankrupt_danger', COACH.bankrupt_danger)
    if (s.brokeDays === 14) toast(s, 'bad', '🚨 7 days until the bank pulls the plug. Kill losers, cut apps, rejoin McDoodle\'s!')
    if (s.brokeDays >= ECONOMY.bankruptDays && !s.modals.some(m => m.kind === 'bankrupt')) pushBankruptModal(s)
  } else if (s.brokeDays > 0) {
    if (s.brokeDays >= 3) toast(s, 'good', '😮‍💨 Back above the overdraft limit. That was close.')
    s.brokeDays = 0
  }
}

function pushBankruptModal(s: GameState) {
  const mom = s.meta.difficulty !== 'hard'
  s.flags.bankruptDay = s.day
  s.modals.push({
    id: uid(s, 'm'),
    kind: 'bankrupt',
    title: 'Bankrupt',
    emoji: '💸',
    body: `The bank froze ${s.meta.company}'s accounts after ${ECONOMY.bankruptDays} days deep in overdraft. ` +
      (mom ? "Mom says your old room is exactly how you left it. She kept the research notes and your Playbook, but the staff and the office are gone." : 'On Hard, there is no couch to crash on.'),
    options: [
      ...(mom ? [{ id: 'mom', label: "Move back to Mom's", tone: 'primary' as const, hint: `Keep research & Playbook · $${ECONOMY.momCash} · rejoin McDoodle's` }] : []),
      { id: 'load', label: 'Load a save', hint: 'Back to the title screen' },
      { id: 'restart', label: 'Start over', tone: 'critical', hint: 'New company, fresh start' },
    ],
    data: { company: s.meta.company, day: s.day },
  })
}

/** Resolve the 'bankrupt' modal (called by world.resolveModal). 'load' / 'restart' mark the game over for the UI. */
export function resolveBankrupt(s: GameState, optionId: string): void {
  s.modals = s.modals.filter(m => m.kind !== 'bankrupt')
  if (optionId === 'mom' && s.meta.difficulty !== 'hard') {
    moveBackToMoms(s)
    return
  }
  s.gameOver = { day: s.day, reason: 'bankrupt' }
  s.flags.gameOverAction = optionId === 'restart' ? 'restart' : 'load'
}

/** The humbling reset: keep research & playbook, lose staff/office/live launches, $500, back on fries. */
export function moveBackToMoms(s: GameState): void {
  const lost = s.live.length + (s.current ? 1 : 0)
  for (const l of s.live) {
    s.history.push({
      id: l.id, name: l.name, productId: l.productId, angle: l.angle, platform: l.platform, size: l.size,
      launchDay: l.launchDay ?? l.startDay, endDay: s.day, overall: l.review?.overall ?? 0, verdict: l.review?.verdict ?? 'flop',
      revenue: l.sales?.totalRevenue ?? 0, profit: l.sales?.totalProfit ?? 0, niche: l.niche, priceTier: l.priceTier,
      review: l.review, weeklyRevenue: (l.sales?.weeks ?? []).map(w => Math.round(w.revenue)), endReason: 'killed',
    })
  }
  s.live = []
  s.current = null
  s.decisions = []
  s.staff = []
  s.candidates = []
  s.office = 0
  s.activeFeatures = []
  s.cash = ECONOMY.momCash
  s.brokeDays = 0
  s.brand = Math.max(0, s.brand - 10)
  // a fresh start in a small room: the market forgets — expectations fall back toward what a solo founder can build
  s.market.bar = Math.round(Math.max(barFloor(s), s.market.bar * ECONOMY.momBarReset) * 10) / 10
  s.dayJob.employed = true
  s.dayJob.monthly = ECONOMY.rejoinPay
  s.dayJob.timesRejoined += 1
  s.gameOver = null
  s.flags.movedBackToMoms = (typeof s.flags.movedBackToMoms === 'number' ? s.flags.movedBackToMoms : 0) + 1
  delete s.flags.pendingPostMortem
  delete s.flags.pendingReview
  s.flags.postMortemQueue = ''
  s.finance.thisWeek.cash = s.cash
  toast(s, 'info', `🏚️ Back in Mom's basement with $${ECONOMY.momCash}, a McDoodle's name tag and every lesson you learned.${lost ? ` ${lost} launch${lost > 1 ? 'es' : ''} shut down.` : ''} Apps switched off — flip them back on in 🧩 Features when you can afford them.`)
  coach(s, 'moms_again', "Rock bottom has great Wi-Fi. Your Playbook survived — use it. One good test launch and you're back.", true)
}
