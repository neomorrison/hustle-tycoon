// First-run welcome from Coach Kev (once per save). Pauses the clock while visible.
import { useState } from 'react'
import { act, useGS } from '../../core/store'
import { openDialog, usePauseWhileMounted } from '../../core/ui'
import { COACH_PORTRAIT, portrait } from '../../core/assets'
import { Button } from '../kit'

const STEPS = [
  { icon: '🚀', title: 'Launch', text: 'Pick a product, an angle and a platform. Match them well.' },
  { icon: '🎛️', title: 'Focus', text: 'Set sliders for Sourcing, Store and Marketing while your team pops points.' },
  { icon: '📊', title: 'Review', text: 'Get scored on CTR, CVR, AOV and ROAS. Scale winners, kill losers.' },
  { icon: '📒', title: 'Learn', text: 'Post-mortems fill your Playbook. Research, hire, move up.' },
]

function Card({ onDone }: { onDone: () => void }) {
  usePauseWhileMounted('intro')
  const founder = useGS(s => s.meta.founder)
  const [broken, setBroken] = useState(false)
  return (
    <div className="k-backdrop m-intro-back">
      <div className="k-panel m-intro" role="dialog" aria-modal="true" aria-labelledby="m-intro-title">
        <div className="m-intro-head">
          <div className="m-intro-kev">{broken ? <span>🧢</span> : <img src={portrait(COACH_PORTRAIT)} alt="Coach Kev" onError={() => setBroken(true)} />}</div>
          <div className="m-intro-bubble">
            <div className="m-coach-name">Coach Kev</div>
            <h2 id="m-intro-title">Yo {founder}, welcome to the hustle.</h2>
            <p>You flip burgers at McDoodle’s by day. By night, Mom’s basement is your launch pad. Every product you launch is a little game: nail the combo, nail the focus, and watch the cash roll in.</p>
          </div>
        </div>
        <ol className="m-intro-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} style={{ animationDelay: `${0.15 + i * 0.09}s` }}>
              <span className="m-intro-ic">{s.icon}</span>
              <b>{s.title}</b>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
        <div className="m-intro-foot">
          <span className="k-muted m-intro-keys">Tip: Space pauses, 1 / 2 / 3 set the speed.</span>
          <Button variant="gold" size="lg" onClick={() => { onDone(); openDialog('newLaunch') }}>⚡ Let’s hustle</Button>
        </div>
      </div>
    </div>
  )
}

export default function IntroCard() {
  const show = useGS(s => !s.flags.introSeen && s.stats.launches === 0 && !s.current && s.day < 28)
  if (!show) return null
  return <Card onDone={() => act(s => { s.flags.introSeen = true })} />
}
