// Blocking event popups (s.modals[0]): news, ad bans, CNY, Expo, bankruptcy… The engine is paused while one is up.
// Options resolve through sim/world.resolveModal. OWNER: ui-launch.
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { act } from '../../core/store'
import type { DecisionOption, EventModal } from '../../core/types'
import { asset } from '../../core/assets'
import { resolveModal } from '../../sim/world'
import { playSfx } from '../audio'
import { useG, usd } from './common'

const KIND_LABEL: Record<string, { label: string; tone: string }> = {
  news: { label: 'Breaking news', tone: 'info' },
  ad_ban: { label: 'Uh-oh', tone: 'bad' },
  cny: { label: 'Heads up', tone: 'warn' },
  expo: { label: 'Event', tone: 'purple' },
  bankrupt: { label: 'Game over?', tone: 'bad' },
  gameover: { label: 'Game over?', tone: 'bad' },
  game_over: { label: 'Game over?', tone: 'bad' },
}

export default function EventModalHost() {
  const modal = useG(s => s.modals[0] ?? null, null)
  const count = useG(s => s.modals.length, 0)
  const over = useG(s => !!s.gameOver, false)
  if (!modal || over) return null
  return <ModalCard key={modal.id} m={modal} count={count} />
}

function imageSrc(img?: string) {
  if (!img) return null
  return /^(https?:|data:|\/)/.test(img) ? img : asset(img)
}

function ModalCard({ m, count }: { m: EventModal; count: number }) {
  const cash = useG(s => s.cash, 0)
  const [imgBroken, setImgBroken] = useState(false)
  const kind = KIND_LABEL[m.kind] ?? { label: 'Event', tone: 'info' }
  const img = imgBroken ? null : imageSrc(m.image)

  useEffect(() => { playSfx(kind.tone === 'bad' ? 'error' : 'pop') }, [kind.tone])

  const anyFree = m.options.some(o => !o.cost || o.cost <= cash)
  const choose = (o: DecisionOption) => {
    act(s => resolveModal(s, m.id, o.id))
    playSfx(o.cost ? 'coin' : 'click')
  }
  const paragraphs = m.body.split(/\n+/).filter(Boolean)

  return (
    <div className="k-backdrop l-modal-back" role="presentation">
      <div className={clsx('k-panel l-modal', `t-${kind.tone}`)} role="alertdialog" aria-modal="true" aria-labelledby={`l-modal-${m.id}`}>
        <div className="l-modal-art" aria-hidden="true">
          {img ? <img src={img} alt="" onError={() => setImgBroken(true)} /> : <span className="l-modal-emoji">{m.emoji ?? '📣'}</span>}
        </div>
        <div className="l-modal-kicker">
          <span>{kind.label}</span>
          {count > 1 && <em>1 of {count}</em>}
        </div>
        <h2 id={`l-modal-${m.id}`} className="l-modal-title">{m.title}</h2>
        <div className="l-modal-body">{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
        <div className={clsx('l-modal-opts', m.options.length > 2 && 'many')}>
          {m.options.map((o, i) => {
            const short = !!o.cost && o.cost > cash && anyFree
            return (
              <button
                key={o.id}
                type="button"
                autoFocus={o.tone === 'primary' || (i === 0 && !m.options.some(x => x.tone === 'primary'))}
                className={clsx('l-modal-opt', o.tone ?? 'default')}
                disabled={short}
                onClick={() => choose(o)}
              >
                <span className="l-modal-opt-label">{o.label}</span>
                {(o.hint || o.cost) && (
                  <small>{short ? `Need ${usd(o.cost ?? 0)}` : [o.cost && !o.label.includes('$') ? usd(o.cost) : '', o.hint].filter(Boolean).join(' · ')}</small>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
