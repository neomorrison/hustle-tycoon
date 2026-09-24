// Game store: ALL game-state changes go through act() (immer draft).
// Zustand v5: selectors must return stable references (a slice or primitive) —
// never build arrays/objects inside a selector; derive with useMemo or use useGSShallow.
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { produce } from 'immer'
import type { FX, GameState } from './types'

interface GameStore {
  state: GameState | null
  act: (recipe: (s: GameState) => void) => void
  load: (s: GameState | null) => void
}
export const useGame = create<GameStore>()((set, get) => ({
  state: null,
  act: recipe => {
    const cur = get().state
    if (!cur) return
    set({ state: produce(cur, recipe) })
  },
  load: s => set({ state: s }),
}))
export const getGS = (): GameState => {
  const s = useGame.getState().state
  if (!s) throw new Error('No game loaded')
  return s
}
export const act = (recipe: (s: GameState) => void) => useGame.getState().act(recipe)
export function useGS<T>(selector: (s: GameState) => T): T {
  return useGame(st => selector(st.state as GameState))
}
export function useGSShallow<T extends object>(selector: (s: GameState) => T): T {
  return useGame(useShallow((st: GameStore) => selector(st.state as GameState)))
}

// ---- transient FX bus (bubbles, cash pops, sounds) — not saved ----
type FXListener = (fx: FX[]) => void
const fxListeners = new Set<FXListener>()
export function onFX(fn: FXListener) {
  fxListeners.add(fn)
  return () => fxListeners.delete(fn)
}
export function emitFX(fx: FX[]) {
  if (fx.length) for (const fn of fxListeners) fn(fx)
}
