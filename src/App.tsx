// PLACEHOLDER — ui-main replaces this with the title screen + game screen.
import { useState } from 'react'
import { useGame } from './core/store'
import { useUI } from './core/ui'
import { createNewGame } from './sim/newGame'
import { useGameLoop } from './core/engine'
import { useGS } from './core/store'
import { formatDate } from './core/time'
import { money } from './core/format'
import DialogHost from './ui/dialogs/DialogHost'
import { Button, Panel } from './ui/kit'
import { openDialog } from './core/ui'

function Game() {
  useGameLoop()
  const day = useGS(s => s.day)
  const cash = useGS(s => s.cash)
  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <Panel title={`${formatDate(day)} — ${money(cash)}`}><Button onClick={() => openDialog('newLaunch')}>New launch</Button></Panel>
      <DialogHost />
    </div>
  )
}
export default function App() {
  const screen = useUI(s => s.screen)
  const loaded = useGame(s => s.state !== null)
  const [name] = useState('Hustle Co.')
  if (screen === 'game' && loaded) return <Game />
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <Button size="lg" onClick={() => { useGame.getState().load(createNewGame({ company: name, founder: 'You', difficulty: 'normal' })); useUI.getState().set({ screen: 'game' }) }}>New game</Button>
    </div>
  )
}
