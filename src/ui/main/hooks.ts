// Game-screen behaviours: auto-opened dialogs (sliders / review / post-mortem) and keyboard shortcuts.
import { useEffect, useRef } from 'react'
import { useGame, useGS } from '../../core/store'
import { openDialog, setSpeed, togglePause, ui, useUI, type Speed } from '../../core/ui'
import { playSfx } from '../audio'

const AUTO = new Set(['sliders', 'review', 'postMortem'])

/**
 * GDT flow: the Sliders dialog opens whenever the current launch waits for a focus call; the Review opens when a
 * launch goes live (flags.pendingReview) and the Post-mortem when a run ends (flags.pendingPostMortem).
 * The dialogs themselves clear those flags on close (ui-launch); we only open each flagged id once per session.
 */
export function useAutoDialogs() {
  const awaiting = useGS(s => (s.current?.awaitingSliders ? `${s.current.id}:${s.current.stage}` : ''))
  const review = useGS(s => (s.flags.pendingReview ? String(s.flags.pendingReview) : ''))
  const post = useGS(s => (s.flags.pendingPostMortem ? String(s.flags.pendingPostMortem) : ''))
  const modals = useGS(s => s.modals.length)
  const gameOver = useGS(s => !!s.gameOver)
  const open = useUI(u => u.dialogs.map(d => d.id).join(','))
  const done = useRef<{ review?: string; post?: string }>({})

  useEffect(() => {
    if (gameOver) return
    const ids = open ? open.split(',') : []
    if (ids.some(id => AUTO.has(id))) return
    if (review && done.current.review !== review) {
      done.current.review = review
      openDialog('review', { launchId: review })
      return
    }
    if (post && done.current.post !== post && modals === 0) {
      done.current.post = post
      openDialog('postMortem', { launchId: post })
      return
    }
    if (awaiting) openDialog('sliders', { launchId: awaiting.split(':')[0] })
  }, [awaiting, review, post, open, modals, gameOver])
}

const SPEED_KEYS: Record<string, Speed> = { '1': 1, '2': 2, '3': 4 }

/** Space = pause/resume, 1/2/3 = speed, N = new launch. Ignored while typing or when a dialog/modal is up. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const u = ui()
      if (u.dialogs.length || u.pauseLocks.length) return
      const gs = useGame.getState().state
      if (!gs || gs.gameOver || gs.modals.length) return
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        togglePause()
        playSfx('tick')
      } else if (SPEED_KEYS[e.key]) {
        setSpeed(SPEED_KEYS[e.key])
        playSfx('tick')
      } else if ((e.key === 'n' || e.key === 'N') && !gs.current) {
        openDialog('newLaunch')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
