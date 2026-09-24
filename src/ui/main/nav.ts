// Screen navigation helpers shared by the title screen, game-over screen and settings.
import { create } from 'zustand'
import { useGame } from '../../core/store'
import { useUI } from '../../core/ui'
import { saveNow } from '../../core/session'
import type { GameState } from '../../core/types'

export type TitlePanel = 'menu' | 'new' | 'load'
export const useTitleNav = create<{ panel: TitlePanel; set: (panel: TitlePanel) => void }>()(set => ({
  panel: 'menu',
  set: panel => set({ panel }),
}))

/** Enter the game screen with a state in a slot (new game, load, import). */
export async function enterGame(state: GameState, slot: number, persist = true) {
  useGame.getState().load(state)
  useUI.getState().set({ screen: 'game', slot, dialogs: [], speed: 1, lastSpeed: 1, dayFrac: 0 })
  if (persist) await saveNow(true)
}

/** Save (when in a game) and go back to the title screen. */
export async function quitToTitle(panel: TitlePanel = 'menu', save = true) {
  if (save) await saveNow(true)
  useTitleNav.getState().set(panel)
  useUI.getState().set({ screen: 'title', dialogs: [] })
}
