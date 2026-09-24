// UI-only state (not saved): screen, speed, open dialog, pause locks.
import { create } from 'zustand'
import { useEffect } from 'react'

export type Speed = 0 | 1 | 2 | 4
/** Graphics preference for the 3D office ('auto' picks per device). */
export type Graphics = 'auto' | 'high' | 'low'
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
  /** live 3D office + title (falls back to the 2D art silently when the device can't) */
  office3d: boolean
  graphics: Graphics
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
  ...loadGfx(),
  set: p => set(p),
}))
export const ui = () => useUI.getState()

// ---------------------------------------------------------------------------
// 3D / graphics prefs: a per-browser convenience in localStorage (never required)
// ---------------------------------------------------------------------------
const GFX_KEY = 'hustle-tycoon:gfx'
function loadGfx(): { office3d: boolean; graphics: Graphics } {
  const d = { office3d: true, graphics: 'auto' as Graphics }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(GFX_KEY) : null
    if (!raw) return d
    const j = JSON.parse(raw) as Partial<{ office3d: boolean; graphics: Graphics }>
    return {
      office3d: typeof j.office3d === 'boolean' ? j.office3d : d.office3d,
      graphics: j.graphics === 'high' || j.graphics === 'low' || j.graphics === 'auto' ? j.graphics : d.graphics,
    }
  } catch {
    return d
  }
}
function saveGfx() {
  try {
    const { office3d, graphics } = ui()
    localStorage.setItem(GFX_KEY, JSON.stringify({ office3d, graphics }))
  } catch { /* storage blocked: the choice lasts this session */ }
}
export function setOffice3d(on: boolean) {
  ui().set({ office3d: on })
  saveGfx()
}
export function setGraphics(g: Graphics) {
  ui().set({ graphics: g })
  saveGfx()
}

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
