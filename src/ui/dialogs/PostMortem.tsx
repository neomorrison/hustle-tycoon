// Post-mortem after a run ends (faded or killed): totals, combo reveals with ratings, notes, per-stage focus tips
// and a "Saved to Playbook" stamp. Clears s.flags.pendingPostMortem on close. Props: { launchId }. OWNER: ui-launch.
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { BookOpen, Check, Rocket } from 'lucide-react'
import type { DialogProps } from './types'
import { Button, DialogFrame } from '../kit'
import { act, useGame } from '../../core/store'
import { openDialog } from '../../core/ui'
import type { ComboRating, Launch, LaunchRecord, PostMortem } from '../../core/types'
import { ANGLES } from '../../data/angles'
import { PLATFORMS } from '../../data/platforms'
import { SIZES } from '../../data/sizes'
import { STAGES } from '../../data/areas'
import { COMBO_META } from '../../data/combos'
import { VERDICTS } from '../../data/quotes'
import { launchFocusAccuracy } from '../../sim/evaluate'
import { findLaunch, findRecord } from '../../sim/sales'
import { canStartLaunch } from '../../sim/launch'
import { coachDialog } from '../../sim/world'
import { playSfx } from '../audio'
import { MiniBars, ProductThumb, reduceMotion, splitLead, usd, usdSigned, useCountUp } from '../launch/common'

const COMBO_KIND: Record<string, string> = { pa: 'Product × Angle', ap: 'Angle × Platform', np: 'Buyers × Platform', pp: 'Buyers × Platform' }

export default function PostMortemDialog({ props, close }: DialogProps) {
  const flagId = useGame(st => (st.state?.flags.pendingPostMortem ? String(st.state.flags.pendingPostMortem) : ''))
  const launchId = String(props?.launchId ?? '') || flagId
  const l = useGame(st => (st.state && launchId ? findLaunch(st.state, launchId) ?? null : null))
  const rec = useGame(st => (st.state && launchId ? findRecord(st.state, launchId) ?? null : null))
  const canLaunch = useGame(st => (st.state ? canStartLaunch(st.state).ok : false))
  useEffect(() => { act(g => coachDialog(g, 'postMortem')) }, [])

  const finish = (next?: 'playbook' | 'newLaunch') => {
    act(s => { if (s.flags.pendingPostMortem && String(s.flags.pendingPostMortem) === launchId) delete s.flags.pendingPostMortem })
    close()
    if (next) openDialog(next)
  }
  const pm = l?.postMortem ?? rec?.postMortem
  if (!pm) {
    return (
      <DialogFrame title="Post-mortem" icon="🧾" onClose={() => finish()} footer={<Button onClick={() => finish()}>Close</Button>}>
        <p className="k-muted">This post-mortem is no longer on file.</p>
      </DialogFrame>
    )
  }
  return <Body pm={pm} l={l} rec={rec} canLaunch={canLaunch} finish={finish} />
}

function Body({ pm, l, rec, canLaunch, finish }: { pm: PostMortem; l: Launch | null; rec: LaunchRecord | null; canLaunch: boolean; finish: (next?: 'playbook' | 'newLaunch') => void }) {
  const [revealed, setRevealed] = useState(reduceMotion() ? 3 : 0)
  const name = l?.name ?? rec?.name ?? 'Launch'
  const productId = l?.productId ?? rec?.productId ?? ''
  const angle = ANGLES[(l?.angle ?? rec?.angle) ?? 'pain_point']
  const plat = PLATFORMS[(l?.platform ?? rec?.platform) ?? 'fadbook']
  const size = SIZES[(l?.size ?? rec?.size) ?? 'test']
  const verdict = l?.review?.verdict ?? rec?.verdict ?? 'flop'
  const killed = l ? l.status === 'killed' : rec?.endReason === 'killed'
  const profit = useCountUp(pm.totals.profit, 1200, 0)
  const acc = useMemo(() => (l ? launchFocusAccuracy(l) : null), [l])

  useEffect(() => { playSfx(pm.totals.profit > 0 ? 'chaching' : 'ping') }, [pm.totals.profit])
  useEffect(() => {
    if (revealed >= pm.combos.length) return
    const t = window.setTimeout(() => { setRevealed(r => r + 1); playSfx('pop') }, revealed === 0 ? 700 : 520)
    return () => window.clearTimeout(t)
  }, [revealed, pm.combos.length])

  const bars = useMemo(() => {
    if (l?.sales) return l.sales.weeks.map(w => ({ value: w.revenue, profit: w.profit, label: `Week ${w.week + 1}: ${usd(w.revenue)} · ${usdSigned(w.profit)}` }))
    return (rec?.weeklyRevenue ?? []).map((v, i) => ({ value: v, profit: 0, label: `Week ${i + 1}: ${usd(v)}` }))
  }, [l, rec])

  const [headIcon, headText] = splitLead(pm.headline)
  const v = VERDICTS[verdict]

  return (
    <DialogFrame
      title="Post-mortem"
      subtitle={<>{name} · {angle.icon} {angle.name} on {plat.icon} {plat.name} · {size.icon} {size.name} · {killed ? `killed in week ${pm.totals.weeks}` : `ran ${pm.totals.weeks} weeks`}</>}
      icon={productId ? <ProductThumb productId={productId} size={52} /> : '🧾'}
      width={860}
      footer={
        <>
          <span className="l-pm-saved"><BookOpen size={15} /> Saved to Playbook</span>
          <Button variant="ghost" onClick={() => finish('playbook')}>Open Playbook</Button>
          {canLaunch && <Button variant="secondary" onClick={() => finish('newLaunch')}><Rocket size={15} /> Next launch</Button>}
          <Button onClick={() => finish()} autoFocus><Check size={16} /> Got it</Button>
        </>
      }
    >
      <div className="l-pm">
        <div className={clsx('l-pm-head', pm.totals.profit >= 0 ? 'up' : 'down')}>
          <span className="l-pm-head-ic">{headIcon || v.emoji}</span>
          <p>{headText}</p>
        </div>

        <div className="l-pm-totals">
          <div className="l-pm-profit">
            <small>Total profit</small>
            <b className={pm.totals.profit >= 0 ? 'pos' : 'neg'}>{usdSigned(Math.round(profit))}</b>
            <span className={clsx('l-verdict-pill', verdict)}>{v.emoji} Reviewed {v.label}</span>
          </div>
          <div className="l-pm-nums">
            <div><small>Revenue</small><b>{usd(pm.totals.revenue)}</b></div>
            <div><small>Spent</small><b>{usd(pm.totals.spend)}</b></div>
            <div><small>Units</small><b>{pm.totals.units.toLocaleString('en-US')}</b></div>
            <div><small>Weeks</small><b>{pm.totals.weeks}</b></div>
          </div>
          {bars.length > 0 && <MiniBars data={bars} max={Math.max(8, Math.min(24, bars.length))} height={54} className="l-pm-bars" />}
        </div>

        <h4 className="l-pm-h">🔓 Combos revealed</h4>
        <div className="l-pm-combos">
          {pm.combos.map((c, i) => <ComboReveal key={c.key} kind={COMBO_KIND[c.key.split(':')[0]] ?? 'Combo'} label={c.label} rating={c.rating} shown={i < revealed} />)}
        </div>

        {pm.notes.length > 0 && (
          <>
            <h4 className="l-pm-h">📝 What happened</h4>
            <ul className="l-pm-notes">
              {pm.notes.map((n, i) => {
                const [ic, text] = splitLead(n)
                return <li key={i}><span>{ic || '•'}</span><p>{text}</p></li>
              })}
            </ul>
          </>
        )}

        {pm.focusTips.length > 0 && (
          <>
            <h4 className="l-pm-h">🎛️ Focus tips</h4>
            {acc && (
              <div className="l-pm-acc">
                {STAGES.map((st, i) => (
                  <div key={st.index} className={clsx('l-pm-acc-item', acc[i] >= 0.9 ? 'great' : acc[i] >= 0.75 ? 'good' : acc[i] >= 0.6 ? 'meh' : 'bad')} data-tip="How close your sliders were to what this angle wants">
                    <span>{st.icon} {st.name}</span>
                    <div className="l-pm-acc-track"><i style={{ width: `${Math.round(acc[i] * 100)}%` }} /></div>
                    <b>{Math.round(acc[i] * 100)}%</b>
                  </div>
                ))}
              </div>
            )}
            <ul className="l-pm-notes tips">
              {pm.focusTips.map((n, i) => {
                const [ic, text] = splitLead(n)
                return <li key={i}><span>{ic || '🎛️'}</span><p>{text}</p></li>
              })}
            </ul>
          </>
        )}
      </div>
    </DialogFrame>
  )
}

function ComboReveal({ kind, label, rating, shown }: { kind: string; label: string; rating: ComboRating; shown: boolean }) {
  const meta = COMBO_META[rating]
  return (
    <div className={clsx('l-flip small', shown && 'shown')}>
      <div className="l-flip-inner">
        <div className="l-flip-face back"><span className="l-flip-q">?</span><b>{kind}</b></div>
        <div className={clsx('l-flip-face front combo', rating)}>
          <small>{kind}</small>
          <p>{label}</p>
          <div className="l-combo-rating"><b>{meta.icon}</b><span>{meta.label}</span></div>
        </div>
      </div>
    </div>
  )
}
