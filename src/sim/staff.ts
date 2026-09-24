// OWNER: sim-meta. Staff, candidates, training, XP. PUBLIC API.
import type { FX, GameState, Person, SizeId, Stats, StatId, Verdict } from '../core/types'
import { clamp, pick, rand, randInt, randn, randRange, weightedPick } from '../core/rng'
import { uid } from '../core/ids'
import { spend } from '../core/money'
import { coach, toast } from '../core/notify'
import { isMonthStart, yearOf } from '../core/time'
import { officeSlots } from '../data/offices'
import { FIRST_NAMES, LAST_NAMES, STAFF_PORTRAITS, TAGLINES } from '../data/names'
import { COACH } from '../data/coach'
import { hasBoost } from './research'

export type StaffRole = Exclude<Person['role'], 'founder'>

export const ROLE_INFO: Record<Person['role'], { label: string; emoji: string; blurb: string; primary: StatId[] }> = {
  founder: { label: 'Founder', emoji: '👑', blurb: 'Does a bit of everything. Mostly worrying.', primary: [] },
  copywriter: { label: 'Copywriter', emoji: '✍️', blurb: 'Copy ↑↑ — product pages & offers that convert.', primary: ['copy'] },
  video_creator: { label: 'Video creator', emoji: '🎬', blurb: 'Creative ↑↑ — scroll-stopping hooks & visuals.', primary: ['creative'] },
  media_buyer: { label: 'Media buyer', emoji: '🎯', blurb: 'Research & Creative ↑ — targeting that finds buyers.', primary: ['research', 'creative'] },
  researcher: { label: 'Researcher', emoji: '🔎', blurb: 'Research ↑↑ — RP, sourcing and targeting smarts.', primary: ['research'] },
  generalist: { label: 'Generalist', emoji: '🧢', blurb: 'A little bit of everything, no weak spots.', primary: [] },
}
export const STAT_INFO: Record<StatId, { label: string; emoji: string; blurb: string }> = {
  copy: { label: 'Copy', emoji: '✍️', blurb: 'Copy, Offer, Quality & Pricing points' },
  creative: { label: 'Creative', emoji: '🎨', blurb: 'Hooks, Visuals & Influencer points' },
  research: { label: 'Research', emoji: '🔎', blurb: 'Research & Targeting points (+RP)' },
  speed: { label: 'Speed', emoji: '⚡', blurb: 'Faster launches for the whole team' },
}
export const STAT_IDS: StatId[] = ['copy', 'creative', 'research', 'speed']
export const TRAINING_DAYS = 14
/** * salary multiplier per level-up */
export const LEVEL_RAISE = 1.03

// ---- transient FX queue (level-ups, modal outcomes) — drained by world.worldDailyTick. Never saved.
const pendingFX: FX[] = []
export function queueFX(...fx: FX[]) { pendingFX.push(...fx) }
export function drainFX(): FX[] { return pendingFX.splice(0, pendingFX.length) }

const round50 = (x: number) => Math.max(50, Math.round(x / 50) * 50)
const statSum = (st: Stats) => st.copy + st.creative + st.research + st.speed
/** DESIGN §7: salary ≈ $25 × (sum of stats) per month — *tuned convex: juniors ~15% cheaper (the first hire is affordable
 *  on Test-launch money), stars ~10% pricier; within ±15% of $25 × stats across the usual 120–340 range. */
export const salaryFor = (st: Stats) => { const sum = statSum(st); return round50(16 * sum + 0.036 * sum * sum) }

export function staffSlots(s: GameState): number { return officeSlots(s.office) }
export const freeSlots = (s: GameState) => Math.max(0, staffSlots(s) - s.staff.length)
export const findPerson = (s: GameState, id: string): Person | undefined =>
  id === s.founder.id ? s.founder : s.staff.find(p => p.id === id)

// ------------------------------------------------------------------ candidates
/** Candidate quality baseline: grows with office tier and game year (+ recruiter boost). */
export function candidateQuality(s: GameState): number {
  return Math.min(72, 18 + 7 * s.office + 3.5 * (yearOf(s.day) - 1) + (hasBoost(s, 'recruiter') ? 8 : 0))
}

const ROLES: StaffRole[] = ['copywriter', 'video_creator', 'media_buyer', 'researcher', 'generalist']

function genStats(s: GameState, role: StaffRole, q: number): Stats {
  const base = () => q + randn(s) * 6
  const st: Stats = { copy: base(), creative: base(), research: base(), speed: base() }
  switch (role) {
    case 'copywriter': st.copy += randRange(s, 18, 26); st.research += randRange(s, 3, 9); break
    case 'video_creator': st.creative += randRange(s, 18, 26); st.speed += randRange(s, 3, 9); break
    case 'media_buyer': st.research += randRange(s, 12, 18); st.creative += randRange(s, 10, 16); break
    case 'researcher': st.research += randRange(s, 18, 26); st.copy += randRange(s, 3, 9); break
    case 'generalist': for (const k of STAT_IDS) st[k] += randRange(s, 6, 10); break
  }
  for (const k of STAT_IDS) st[k] = Math.round(clamp(st[k], 10, 90))
  return st
}

function pickName(s: GameState, look: 'f' | 'm' | 'n', senior: boolean, taken: Set<string>): string {
  let pool: readonly string[] = senior ? (look === 'm' ? FIRST_NAMES.mSenior : FIRST_NAMES.fSenior) : FIRST_NAMES[look]
  if (!senior && look !== 'n' && rand(s) < 0.15) pool = FIRST_NAMES.n
  let first = pick(s, pool)
  for (let i = 0; i < 8 && taken.has(first); i++) first = pick(s, pool)
  taken.add(first)
  return `${first} ${pick(s, LAST_NAMES)}`
}

/** Generate one candidate (not added to state). */
export function makeCandidate(s: GameState, usedPortraits: Set<string>, usedNames: Set<string>): Person {
  const star = rand(s) < 0.08
  const q = candidateQuality(s) + (star ? 12 : 0)
  const role = weightedPick(s, ROLES, r => (r === 'generalist' ? 0.7 : 1))
  const free = STAFF_PORTRAITS.filter(p => !usedPortraits.has(p.id))
  const face = pick(s, free.length ? free : STAFF_PORTRAITS)
  usedPortraits.add(face.id)
  const stats = genStats(s, role, q)
  return {
    id: uid(s, 'p'),
    name: pickName(s, face.look, !!face.senior, usedNames),
    portrait: face.id,
    role,
    stats,
    level: 1 + Math.floor(Math.max(0, q - 20) / 14),
    xp: 0,
    salary: salaryFor(stats),
    hiredDay: s.day,
  }
}

/** Replace the candidate pool (3–5 people). Called monthly and when you move office. */
export function refreshCandidates(s: GameState): void {
  const count = hasBoost(s, 'recruiter') || s.office >= 5 ? 5 : s.office >= 3 ? 4 : 3
  const usedPortraits = new Set(s.staff.map(p => p.portrait))
  const usedNames = new Set(s.staff.map(p => p.name.split(' ')[0]))
  const list: Person[] = []
  for (let i = 0; i < count; i++) list.push(makeCandidate(s, usedPortraits, usedNames))
  s.candidates = list
  s.flags['st:office'] = s.office
  s.flags['st:candDay'] = s.day
}

// ------------------------------------------------------------------ hire / fire
/** One-off signing bonus = half a month's salary. */
export const hiringFee = (p: Person) => round50(p.salary * 0.5)
export const severance = (p: Person) => round50(p.salary * 0.5)

export function canHire(s: GameState, candidateId: string): { ok: boolean; reason?: string } {
  const c = s.candidates.find(p => p.id === candidateId)
  if (!c) return { ok: false, reason: 'Candidate no longer available' }
  if (s.staff.length >= staffSlots(s)) {
    return { ok: false, reason: s.office === 0 ? "No desks in Mom's basement — move out first (🏠 Office)" : 'No free desks — upgrade your office (🏠 Office)' }
  }
  const fee = hiringFee(c)
  if (s.cash < fee) return { ok: false, reason: `Signing bonus is $${fee.toLocaleString('en-US')} — not enough cash` }
  return { ok: true }
}

export function hire(s: GameState, candidateId: string): { ok: boolean; reason?: string } {
  const check = canHire(s, candidateId)
  if (!check.ok) return check
  const idx = s.candidates.findIndex(p => p.id === candidateId)
  const [p] = s.candidates.splice(idx, 1)
  spend(s, hiringFee(p), 'expenses')
  p.hiredDay = s.day
  p.xp = 0
  delete p.trainingUntil
  delete p.trainingStat
  s.staff.push(p)
  toast(s, 'good', `👋 ${p.name} joined as ${ROLE_INFO[p.role].label}! ($${p.salary.toLocaleString('en-US')}/mo)`)
  coach(s, 'first_hire', COACH.first_hire)
  return { ok: true }
}

export function fire(s: GameState, personId: string): void {
  const idx = s.staff.findIndex(p => p.id === personId)
  if (idx < 0) return
  const [p] = s.staff.splice(idx, 1)
  const pay = severance(p)
  spend(s, pay, 'expenses')
  toast(s, 'info', `📦 ${p.name} packed up their desk plant and left. (Severance $${pay.toLocaleString('en-US')})`)
}

// ------------------------------------------------------------------ training
export function trainingCost(s: GameState, personId: string): number {
  const p = findPerson(s, personId)
  if (!p) return 0
  return Math.round(1500 * p.level * (hasBoost(s, 'mentorship') ? 0.75 : 1))
}
export const isTraining = (s: GameState, p: Person) => p.trainingUntil !== undefined && p.trainingUntil > s.day

export function canTrain(s: GameState, personId: string, stat: StatId): { ok: boolean; reason?: string } {
  const p = findPerson(s, personId)
  if (!p) return { ok: false, reason: 'Not on the team' }
  if (isTraining(s, p)) return { ok: false, reason: 'Already in training' }
  if (p.stats[stat] >= 100) return { ok: false, reason: `${STAT_INFO[stat].label} is maxed out` }
  if (p.id === s.founder.id && s.current && (s.current.status === 'dev' || s.current.status === 'qc') && s.staff.every(x => isTraining(s, x))) {
    return { ok: false, reason: "You can't leave mid-launch with nobody at the desk" }
  }
  const cost = trainingCost(s, personId)
  if (s.cash < cost) return { ok: false, reason: `Training costs $${cost.toLocaleString('en-US')} — not enough cash` }
  return { ok: true }
}

export function train(s: GameState, personId: string, stat: StatId): { ok: boolean; reason?: string } {
  const check = canTrain(s, personId, stat)
  if (!check.ok) return check
  const p = findPerson(s, personId) as Person
  spend(s, trainingCost(s, personId), 'expenses')
  p.trainingUntil = s.day + TRAINING_DAYS
  p.trainingStat = stat
  const who = p.id === s.founder.id ? 'You head' : `${p.name.split(' ')[0]} heads`
  toast(s, 'info', `🎓 ${who} off to ${STAT_INFO[stat].label} training for 2 weeks.`)
  coach(s, 'first_training', COACH.first_training)
  return { ok: true }
}

function finishTraining(s: GameState, p: Person) {
  const stat = p.trainingStat
  delete p.trainingUntil
  delete p.trainingStat
  if (!stat) return
  const gain = randInt(s, 6, 12) + (hasBoost(s, 'mentorship') ? 3 : 0)
  const before = p.stats[stat]
  p.stats[stat] = Math.min(100, before + gain)
  const who = p.id === s.founder.id ? "You're" : `${p.name.split(' ')[0]} is`
  toast(s, 'good', `🎓 ${who} back from training: ${STAT_INFO[stat].emoji} ${STAT_INFO[stat].label} +${p.stats[stat] - before}!`)
  queueFX({ kind: 'sound', sound: 'levelup' })
}

// ------------------------------------------------------------------ XP & levels
/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => 60 + 40 * level

// While a launch's XP is handed to the whole team, level-ups are collected into ONE toast (a winner used to fire 5–8
// "reached level N" toasts in the same instant — the feed shows 4). Transient, never saved.
let levelBatch: string[] | null = null

function levelUp(s: GameState, p: Person) {
  p.level += 1
  const primary = ROLE_INFO[p.role].primary
  const gains: string[] = []
  for (const k of STAT_IDS) {
    const g = primary.includes(k) ? randInt(s, 3, 5) : p.role === 'generalist' || p.role === 'founder' ? randInt(s, 2, 3) : randInt(s, 1, 2)
    const before = p.stats[k]
    p.stats[k] = Math.min(100, before + g)
    if (p.stats[k] > before && (primary.includes(k) || g >= 3)) gains.push(`${STAT_INFO[k].label} +${p.stats[k] - before}`)
  }
  // * +3% a level (was +6%): levels come every ~3 launches, and the market bar soaks up the extra output — +6% compounded
  //   into ~+15%/yr payroll growth that bankrupted mid-size studios by year 6
  if (p.role !== 'founder') p.salary = round50(p.salary * LEVEL_RAISE)
  const who = p.id === s.founder.id ? 'You' : p.name.split(' ')[0]
  if (levelBatch) {
    levelBatch.push(`${who} L${p.level}${gains.length ? ` (${gains[0]})` : ''}`)
    return
  }
  toast(s, 'good', `⬆️ ${who} reached level ${p.level}!${gains.length ? ` ${gains.slice(0, 3).join(', ')}` : ''}`)
  coach(s, 'first_levelup', COACH.first_levelup)
  queueFX({ kind: 'sound', sound: 'levelup' })
}

export function grantXp(s: GameState, personId: string, xp: number): void {
  const p = findPerson(s, personId)
  if (!p || !(xp > 0)) return
  p.xp += Math.round(xp * (hasBoost(s, 'mentorship') ? 1.25 : 1))
  for (let guard = 0; guard < 20 && p.xp >= xpToNext(p.level); guard++) {
    p.xp -= xpToNext(p.level)
    levelUp(s, p)
  }
}

const VERDICT_XP: Record<Verdict, number> = { flop: 20, breakeven: 35, solid: 55, winner: 85 }
const SIZE_XP: Record<SizeId, number> = { test: 1, standard: 1.4, big: 1.9, mega: 2.6 }
/** XP a launch gives each team member (flops still teach something). */
export const launchXp = (verdict: Verdict, size: SizeId) => Math.round(VERDICT_XP[verdict] * SIZE_XP[size])

/** Everyone currently able to work (founder + staff not in training). */
export function activeTeam(s: GameState): Person[] { return [s.founder, ...s.staff.filter(p => !p.trainingUntil || p.trainingUntil <= s.day)] }

/** Deterministic fun tagline for a person card. */
export function personTagline(p: Person): string {
  const pool = TAGLINES[p.role] ?? TAGLINES.generalist
  let h = 0
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) | 0
  return pool[Math.abs(h) % pool.length]
}

export function staffDailyTick(s: GameState): void {
  // Candidate pool: monthly refresh, first run, and right after moving office.
  if (s.flags['st:office'] === undefined || s.flags['st:office'] !== s.office || isMonthStart(s.day)) refreshCandidates(s)

  // Training completion
  for (const p of [s.founder, ...s.staff]) {
    if (p.trainingUntil !== undefined && p.trainingUntil <= s.day) finishTraining(s, p)
  }

  // XP once per launch when its review lands (team at launch time learns from it)
  for (const l of s.live) {
    if (!l.review || !l.sales || l.sales.flags.xpGranted) continue
    l.sales.flags.xpGranted = true
    const xp = launchXp(l.review.verdict, l.size)
    levelBatch = []
    try {
      for (const p of [s.founder, ...s.staff]) grantXp(s, p.id, xp)
    } finally {
      const ups = levelBatch ?? []
      levelBatch = null
      if (ups.length === 1) toast(s, 'good', `⬆️ Level up from ${l.name}: ${ups[0]}!`)
      else if (ups.length > 1) toast(s, 'good', `⬆️ ${l.name} leveled up the team: ${ups.slice(0, 4).join(', ')}${ups.length > 4 ? ` +${ups.length - 4} more` : ''}!`)
      if (ups.length) {
        coach(s, 'first_levelup', COACH.first_levelup)
        queueFX({ kind: 'sound', sound: 'levelup' })
      }
    }
  }
}
