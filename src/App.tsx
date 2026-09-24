// App shell: session resume → title screen or game screen, plus the dialog stack. OWNER: ui-main.
import './ui/main/main.css'
import './ui/main/title.css'
import { useEffect } from 'react'
import { useGame } from './core/store'
import { useUI } from './core/ui'
import { useSessionPersistence } from './core/session'
import DialogHost from './ui/dialogs/DialogHost'
import GameScreen from './ui/main/GameScreen'
import TitleScreen, { Logo } from './ui/main/TitleScreen'

function Splash() {
  return (
    <div className="m-splash" aria-busy="true">
      <Logo small />
      <div className="m-splash-text">Warming up the fryer…</div>
    </div>
  )
}

export default function App() {
  const resuming = useSessionPersistence()
  const screen = useUI(s => s.screen)
  const loaded = useGame(s => s.state !== null)
  const inGame = screen === 'game' && loaded
  useEffect(() => {
    document.body.classList.toggle('in-game', inGame)
  }, [inGame])
  if (resuming) return <Splash />
  return (
    <>
      {inGame ? <GameScreen /> : <TitleScreen />}
      <DialogHost />
    </>
  )
}
