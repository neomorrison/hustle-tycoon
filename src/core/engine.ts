// Real-time loop: 1x = 0.5 real seconds per in-game day. Dialogs/modals/pause-locks pause time.
import { useEffect } from 'react'
import { emitFX, useGame } from './store'
import { useUI } from './ui'
import { tickDay } from '../sim'
import type { FX } from './types'

export const MS_PER_DAY = 500
const MAX_TICKS_PER_FRAME = 4

export function useGameLoop() {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    const frame = (now: number) => {
      const dt = Math.min(250, now - last)
      last = now
      const u = useUI.getState()
      const gs = useGame.getState().state
      const blocked = !gs || gs.gameOver || u.speed === 0 || u.pauseLocks.length > 0 || u.dialogs.length > 0 || gs.modals.length > 0 || !!gs.current?.awaitingSliders
      if (!blocked) {
        acc += dt * u.speed
        let n = 0
        const fx: FX[] = []
        while (acc >= MS_PER_DAY && n < MAX_TICKS_PER_FRAME) {
          acc -= MS_PER_DAY
          n++
          try {
            useGame.getState().act(s => { fx.push(...tickDay(s)) })
          } catch (e) {
            console.error('[sim] tick failed', e)
            acc = 0
            break
          }
        }
        if (n === MAX_TICKS_PER_FRAME) acc = 0
        if (fx.length) emitFX(fx)
        u.set({ dayFrac: acc / MS_PER_DAY })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
}
