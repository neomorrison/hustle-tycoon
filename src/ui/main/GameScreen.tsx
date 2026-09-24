// The game screen: HUD, office stage, action dock, launch tray, toasts, FX, event modals, game over.
import { useGameLoop } from '../../core/engine'
import ProjectCard from '../launch/ProjectCard'
import LiveProducts from '../launch/LiveProducts'
import DecisionTray from '../launch/DecisionTray'
import EventModalHost from '../launch/EventModalHost'
import Hud from './Hud'
import OfficeScene from './OfficeScene'
import ActionDock from './ActionDock'
import ToastFeed from './ToastFeed'
import FxLayer from './fx'
import GameOver from './GameOver'
import IntroCard from './IntroCard'
import SafeBoundary from './SafeBoundary'
import { useAutoDialogs, useShortcuts } from './hooks'
import { act } from '../../core/store'
import { resolveModal } from '../../sim/world'

/** If the event popup ever crashes, closing the error card settles the event (free option) so the clock can run again. */
function dismissTopModal() {
  act(s => {
    const m = s.modals[0]
    if (!m) return
    const opts = Array.isArray(m.options) ? m.options : []
    const opt = opts.find(o => !o.cost) ?? opts[0]
    try { if (opt) { resolveModal(s, m.id, opt.id); return } } catch (e) { console.warn('[ui] event resolve failed', e) }
    s.modals = s.modals.filter(x => x.id !== m.id)
  })
}

export default function GameScreen() {
  useGameLoop()
  useAutoDialogs()
  useShortcuts()
  return (
    <div className="m-game">
      <Hud />
      <main className="m-main">
        <div className="m-stage-wrap">
          <SafeBoundary name="Office" inline><OfficeScene /></SafeBoundary>
        </div>
        <ActionDock />
        <aside className="m-decisions" aria-label="Scale calls">
          <SafeBoundary name="Decisions" inline><DecisionTray /></SafeBoundary>
        </aside>
        <ToastFeed />
        <section className="m-tray" aria-label="Launches">
          <div className="m-slot m-slot-project" data-bubble-target>
            <SafeBoundary name="Project card" inline><ProjectCard /></SafeBoundary>
          </div>
          <div className="m-slot m-slot-live">
            <SafeBoundary name="Live products" inline><LiveProducts /></SafeBoundary>
          </div>
        </section>
      </main>
      <FxLayer />
      <SafeBoundary name="The event popup" onClose={dismissTopModal}><EventModalHost /></SafeBoundary>
      <IntroCard />
      <GameOver />
    </div>
  )
}
