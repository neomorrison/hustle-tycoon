// UI-only state (not saved): screen, speed, open dialog, pause locks.
import { create } from 'zustand'
import { useEffect } from 'react'

export type Speed = 0 | 1 | 2 | 4
/** Dialog ids — see src/ui/dialogs/registry.ts */
export type DialogId =
  | 'newLaunch' | 'sliders' | 'review' | 'postMortem' | 'research' | 'staff' | 'features'
  | 'office' | 'playbook' | 'finance' | 'dayJob' | 'milestones' | 'settings' | 'launchDetail'
export interface DialogState { id: DialogId; props?: Record<string, unknown> }

interface UIStore {
  screen: 'title' | 'game'
  slot: number
  speed: Speed
  lastSpeed: Exclude<Speed, 0>
  pauseLocks: string[]
  dialogs: DialogState[]
  muted: boolean
  musicOn: boolean
  volume: number
  /** fraction of the current day elapsed (smooth progress bars) */
  dayFrac: number
  set: (p: Partial<UIStore>) => void
}
export const useUI = create<UIStore>()(set => ({
  screen: 'title',
  slot: 0,
  speed: 1,
  lastSpeed: 1,
  pauseLocks: [],
  dialogs: [],
  muted: false,
  musicOn: true,
  volume: 0.6,
  dayFrac: 0,
  set: p => set(p),
}))
export const ui = () => useUI.getState()

export function setSpeed(speed: Speed) {
  ui().set(speed === 0 ? { speed: 0 } : { speed, lastSpeed: speed })
}
export function togglePause() {
  const st = ui()
  setSpeed(st.speed === 0 ? st.lastSpeed : 0)
}
/** Open a dialog on top of the stack (dialogs pause the game while open). */
export function openDialog(id: DialogId, props?: Record<string, unknown>) {
  const st = ui()
  st.set({ dialogs: [...st.dialogs.filter(d => d.id !== id), { id, props }] })
}
export function closeDialog(id?: DialogId) {
  const st = ui()
  st.set({ dialogs: id ? st.dialogs.filter(d => d.id !== id) : st.dialogs.slice(0, -1) })
}
/** Pause the clock while mounted. */
export function usePauseWhileMounted(key: string, active = true) {
  useEffect(() => {
    if (!active) return
    const st = ui()
    st.set({ pauseLocks: [...st.pauseLocks, key] })
    return () => {
      const cur = ui()
      const i = cur.pauseLocks.indexOf(key)
      if (i >= 0) cur.set({ pauseLocks: [...cur.pauseLocks.slice(0, i), ...cur.pauseLocks.slice(i + 1)] })
    }
  }, [key, active])
}
