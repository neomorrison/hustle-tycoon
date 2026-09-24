// Office scene selectors shared by the 2D art scene and the 3D office (primitive results → stable selectors).
import { useEffect, useRef, useState } from 'react'
import { onFX } from '../../core/store'
import type { GameState, Person } from '../../core/types'
import { launchTeam } from '../../sim/launch'

export type Mood = 'neutral' | 'happy' | 'tired' | 'stressed'

export const ROLE_LABEL: Record<Person['role'], string> = {
  founder: 'Founder',
  copywriter: 'Copywriter',
  video_creator: 'Video Creator',
  media_buyer: 'Media Buyer',
  researcher: 'Researcher',
  generalist: 'Generalist',
}
export const ROLE_EMOJI: Record<Person['role'], string> = {
  founder: '⚡', copywriter: '✍️', video_creator: '🎬', media_buyer: '🎯', researcher: '🔎', generalist: '🧰',
}

/** Won something lately (a winner/solid launch this month, or a winner that ended in the last 3 weeks). */
export function recentWin(s: GameState): boolean {
  const live = s.live.some(l => l.review && (l.review.verdict === 'winner' || l.review.verdict === 'solid') && s.day - (l.launchDay ?? -999) <= 28)
  const last = s.history[s.history.length - 1]
  return live || (!!last && last.verdict === 'winner' && s.day - last.endDay <= 21)
}

/** Derived founder mood (primitive → stable selector). */
export function founderMood(s: GameState): Mood {
  if (s.cash < 0) return 'stressed'
  if (recentWin(s)) return 'happy'
  if (s.dayJob.employed && s.day % 28 >= 21) return 'tired'
  return 'neutral'
}

/** The team's mood: broke = stressed, fresh win = happy. */
export function staffMood(s: GameState): Mood {
  if (s.cash < 0) return 'stressed'
  return recentWin(s) ? 'happy' : 'neutral'
}

export const isWorking = (s: GameState) => {
  const c = s.current
  if (!c) return false
  return (c.status === 'dev' && !c.awaitingSliders) || (c.status === 'qc' && !!c.polishing)
}

/** 'none' | 'dev' (being built) | 'await' (focus call) | 'call' (built, waiting on Polish / Launch). */
export type Phase = 'none' | 'dev' | 'await' | 'call'
export const launchPhase = (s: GameState): Phase => {
  const c = s.current
  if (!c) return 'none'
  if (c.awaitingSliders) return 'await'
  return isWorking(s) ? 'dev' : 'call'
}

/** Who is actually on the current launch (sizes cap the team: a Test fits you + 1). Joined ids → stable selector. */
export const teamKey = (s: GameState) => (s.current ? launchTeam(s, s.current.size).map(p => p.id).join(',') : '')

/** true for ~9 s after confetti / a winner fanfare / a level up. */
export function useCheer(onCheer?: () => void): boolean {
  const [cheer, setCheer] = useState(false)
  const cb = useRef(onCheer)
  cb.current = onCheer
  useEffect(() => {
    let t = 0
    const off = onFX(list => {
      if (list.some(f => f.kind === 'confetti' || (f.kind === 'sound' && (f.sound === 'winner' || f.sound === 'levelup')))) {
        setCheer(true)
        cb.current?.()
        window.clearTimeout(t)
        t = window.setTimeout(() => setCheer(false), 9000)
      }
    })
    return () => { off(); window.clearTimeout(t) }
  }, [])
  return cheer
}
