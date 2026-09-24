import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { installAudioUnlock, installButtonClicks } from './ui/audio'

installAudioUnlock()
installButtonClicks()

// DEV-only test hook for Playwright playtests (scripts/e2e). Stripped from production builds.
if (import.meta.env.DEV) {
  void Promise.all([import('./core/store'), import('./core/ui')]).then(([store, ui]) => {
    ;(window as unknown as { __ht: unknown }).__ht = {
      useGame: store.useGame,
      useUI: ui.useUI,
      act: store.act,
      emitFX: store.emitFX,
      openDialog: ui.openDialog,
      closeDialog: ui.closeDialog,
      setSpeed: ui.setSpeed,
    }
  })
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
