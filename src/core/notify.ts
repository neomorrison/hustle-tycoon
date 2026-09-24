import type { GameState, Toast } from './types'
import { uid } from './ids'

const CAP = 60
export function toast(s: GameState, kind: Toast['kind'], text: string, amount?: number) {
  s.toasts.push({ id: uid(s, 't'), day: s.day, kind, text, amount })
  if (s.toasts.length > CAP) s.toasts.splice(0, s.toasts.length - CAP)
}
/** Coach Kev one-time tip (id dedupes). Respects flags.coachOff. */
export function coach(s: GameState, id: string, text: string, force = false) {
  if (!force && (s.flags.coachOff || s.flags[`coach:${id}`])) return
  s.flags[`coach:${id}`] = s.day
  toast(s, 'coach', text)
}
