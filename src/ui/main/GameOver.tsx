// Game-over screen (s.gameOver): bankrupt → move back to Mom's, load a save, or start over.
import { useEffect, useState } from 'react'
import { act, useGS } from '../../core/store'
import { founderPortrait, roomImage } from '../../core/assets'
import { money } from '../../core/format'
import { formatDate } from '../../core/time'
import { moveBackToMoms } from '../../sim/economy'
import { Button } from '../kit'
import { playSfx } from '../audio'
import { quitToTitle } from './nav'

const REASONS: Record<string, string> = {
  bankrupt: 'The bank froze your accounts after three weeks deep in overdraft. The fryer is calling.',
}

export default function GameOver() {
  const over = useGS(s => s.gameOver)
  const difficulty = useGS(s => s.meta.difficulty)
  const stats = useGS(s => s.stats)
  const company = useGS(s => s.meta.company)
  const action = useGS(s => (s.flags.gameOverAction === 'restart' ? 'restart' : 'load'))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setBusy(false)
    if (over) playSfx('flop')
  }, [over])
  if (!over) return null
  const canMom = difficulty !== 'hard'
  return (
    <div className="m-over" role="alertdialog" aria-modal="true" aria-labelledby="m-over-title">
      <div className="m-over-bg" style={{ backgroundImage: `url(${roomImage('mcdoodles')})` }} aria-hidden="true" />
      <div className="m-over-card k-panel">
        <div className="m-over-face"><img src={founderPortrait('stressed')} alt="" /></div>
        <div className="m-over-kicker">GAME OVER</div>
        <h1 id="m-over-title" className="m-over-title">{company} went bust 💸</h1>
        <p className="m-over-reason">{REASONS[over.reason] ?? (over.reason || REASONS.bankrupt)}</p>
        <div className="m-over-stats">
          <div><span>Made it to</span><b>{formatDate(over.day)}</b></div>
          <div><span>Launches</span><b>{stats.launches}</b></div>
          <div><span>Winners</span><b>{stats.winners}</b></div>
          <div><span>Lifetime revenue</span><b>{money(stats.lifetimeRevenue, { cents: false, compact: true })}</b></div>
          <div><span>Best score</span><b>{stats.bestScore ? stats.bestScore.toFixed(1) : '—'}</b></div>
        </div>
        <div className="m-over-actions">
          <Button variant={action === 'load' ? 'gold' : 'secondary'} size={action === 'load' ? 'lg' : undefined} disabled={busy} onClick={() => { setBusy(true); void quitToTitle('load') }}>📂 Load a save</Button>
          <Button variant={action === 'restart' ? 'gold' : 'secondary'} size={action === 'restart' ? 'lg' : undefined} disabled={busy} onClick={() => { setBusy(true); void quitToTitle('new') }}>🔄 Start over</Button>
          {canMom && (
            <Button variant="secondary" disabled={busy} onClick={() => { setBusy(true); act(moveBackToMoms); playSfx('levelup') }}>
              🏚️ Actually… call Mom
            </Button>
          )}
        </div>
        {canMom && <p className="m-over-note">Mom’s offer still stands: keep your research & Playbook, $500 in your pocket, back on McDoodle’s shifts. No staff, no office.</p>}
        {!canMom && <p className="m-over-note">Hard mode: Mom changed the locks. No bail-outs.</p>}
      </div>
    </div>
  )
}
