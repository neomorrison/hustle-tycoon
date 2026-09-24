// Frequent autosave + seamless resume after page reloads (refresh, crash, dev hot-reload).
import { useEffect, useState } from 'react'
import { useGame } from './store'
import { useUI, type Speed } from './ui'
import { loadGame, saveGame } from './save'

const KEY = 'ht.session'
const AUTOSAVE_MS = 8000
interface SessionInfo { slot: number; speed: Speed; lastSpeed: Exclude<Speed, 0> }

const read = (): SessionInfo | null => {
  try { const r = sessionStorage.getItem(KEY); return r ? JSON.parse(r) : null } catch { return null }
}
const write = (i: SessionInfo | null) => {
  try { if (i) sessionStorage.setItem(KEY, JSON.stringify(i)); else sessionStorage.removeItem(KEY) } catch { /* private mode */ }
}
let lastSaved: unknown = null
let saving = false
export async function saveNow(force = false) {
  const st = useGame.getState().state
  const ui = useUI.getState()
  if (!st || ui.screen !== 'game' || saving || (!force && st === lastSaved)) return
  saving = true
  try { await saveGame(ui.slot, st); lastSaved = st } catch (e) { console.warn('[session] save failed', e) } finally { saving = false }
}

/** Mount once in <App/>; returns true while restoring a previous session. */
export function useSessionPersistence(): boolean {
  const [resuming, setResuming] = useState(() => read() !== null && useGame.getState().state === null)
  useEffect(() => {
    if (!resuming) return
    const info = read()
    let cancelled = false
    ;(async () => {
      try {
        const st = info ? await loadGame(info.slot) : null
        if (cancelled) return
        if (st && info) {
          lastSaved = st
          useGame.getState().load(st)
          useUI.getState().set({ screen: 'game', slot: info.slot, speed: info.speed ?? 1, lastSpeed: info.lastSpeed ?? 1 })
        } else write(null)
      } catch { write(null) } finally { if (!cancelled) setResuming(false) }
    })()
    return () => { cancelled = true }
  }, [resuming])
  useEffect(() => {
    if (resuming) return
    const sync = () => {
      const u = useUI.getState()
      write(u.screen === 'game' && useGame.getState().state ? { slot: u.slot, speed: u.speed, lastSpeed: u.lastSpeed } : null)
    }
    sync()
    const a = useUI.subscribe((x, y) => { if (x.screen !== y.screen || x.slot !== y.slot || x.speed !== y.speed) sync() })
    const b = useGame.subscribe((x, y) => { if ((x.state === null) !== (y.state === null)) sync() })
    const id = window.setInterval(() => void saveNow(), AUTOSAVE_MS)
    const hide = () => { if (document.visibilityState === 'hidden') void saveNow() }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', () => void saveNow())
    return () => { a(); b(); window.clearInterval(id); document.removeEventListener('visibilitychange', hide) }
  }, [resuming])
  return resuming
}
