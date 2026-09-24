// Launch review — the big moment: drumroll, four score cards flip in sequence (CTR, CVR, AOV, ROAS), then the
// overall score and the verdict banner (🏆 confetti + fanfare / 💀 sad trombone + a coach tip).
// Clears s.flags.pendingReview on close. Props: { launchId, instant? }. OWNER: ui-launch.
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { FastForward, Rocket } from 'lucide-react'
import type { DialogProps } from './types'
import { Button, DialogFrame } from '../kit'
import { act, useGame } from '../../core/store'
import type { Launch, Review, Verdict } from '../../core/types'
import { COACH_PORTRAIT, portrait } from '../../core/assets'
import { ANGLES } from '../../data/angles'
import { PLATFORMS } from '../../data/platforms'
import { SIZES } from '../../data/sizes'
import { VERDICTS } from '../../data/quotes'
import { DEV } from '../../sim/launch'
import { findLaunch } from '../../sim/sales'
import { coachDialog } from '../../sim/world'
import { playSfx } from '../audio'
import { fireConfetti } from '../main/fx'
import { pickBy, ProductThumb, reduceMotion, usdC, useCountUp } from '../launch/common'

type MetricKey = keyof Review['scores']
interface MetricDef { key: MetricKey; name: string; long: string; icon: string; value: (r: Review) => string; sub: (r: Review) => string }
const METRICS: MetricDef[] = [
  { key: 'ctr', name: 'CTR', long: 'Click-through rate', icon: '👆', value: r => `${(r.ctr * 100).toFixed(2)}%`, sub: r => `CPM ${usdC(r.cpm)}` },
  { key: 'cvr', name: 'CVR', long: 'Conversion rate', icon: '🛒', value: r => `${(r.cvr * 100).toFixed(2)}%`, sub: r => `CPA ${usdC(r.cpa)}` },
  { key: 'aov', name: 'AOV', long: 'Avg order value', icon: '🧺', value: r => usdC(r.aov), sub: r => `Price ${usdC(r.price)}` },
  { key: 'roas', name: 'ROAS', long: 'Return on ad spend', icon: '💰', value: r => `${r.roas.toFixed(2)}×`, sub: r => `Break-even ${r.breakEvenRoas.toFixed(2)}×` },
]
const BANNER: Record<Verdict, string> = { winner: 'WINNING PRODUCT', solid: 'SOLID LAUNCH', breakeven: 'BREAK-EVEN', flop: 'FLOP' }
const WEAK_TIPS: Record<MetricKey, string> = {
  ctr: 'Nobody stopped scrolling. Next time: more 🎬 Hooks, and an angle that actually fits the platform.',
  cvr: 'Clicks but no buys. The page needs more ✍️ Copy and 🧪 Quality, fewer 🔴 complaints, or a better product × angle match.',
  aov: 'Baskets are tiny. 🏷️ Pricing and 🎁 Offer focus (or Bundles / Upsell apps) grow the order value.',
  roas: "The margin can't feed the ads. Pricier products, better-fitting platforms or a sharper angle fix ROAS.",
}
const scoreTone = (x: number) => (x >= 8.5 ? 'great' : x >= 6 ? 'good' : x >= 4 ? 'meh' : 'bad')

const DRUM_MS = 1500
const FLIP_MS = 900

export default function ReviewDialog({ props, close }: DialogProps) {
  const id = String(props?.launchId ?? '')
  const flagId = useGame(st => (st.state?.flags.pendingReview ? String(st.state.flags.pendingReview) : ''))
  const launchId = id || flagId
  const l = useGame(st => (st.state && launchId ? findLaunch(st.state, launchId) ?? null : null))
  useEffect(() => { act(g => coachDialog(g, 'review')) }, [])
  const done = () => {
    act(s => { if (s.flags.pendingReview && String(s.flags.pendingReview) === launchId) delete s.flags.pendingReview })
    close()
  }
  if (!l?.review) {
    return (
      <DialogFrame title="Review" icon="📊" onClose={done} footer={<Button onClick={done}>Close</Button>}>
        <p className="k-muted">This launch's review is no longer available.</p>
      </DialogFrame>
    )
  }
  return <Reveal l={l} rv={l.review} instant={!!props?.instant} onDone={done} />
}

function Reveal({ l, rv, instant, onDone }: { l: Launch; rv: Review; instant: boolean; onDone: () => void }) {
  const [phase, setPhase] = useState(instant || reduceMotion() ? 5 : 0)

  // timeline: 0 drumroll → 1..4 cards → 5 overall
  useEffect(() => {
    if (phase >= 5) return
    const t = window.setTimeout(() => setPhase(p => p + 1), phase === 0 ? DRUM_MS : phase === 4 ? 1000 : FLIP_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  // drumroll: accelerating snare ticks
  useEffect(() => {
    if (phase !== 0) return
    const timers: number[] = []
    let at = 0
    let gap = 125
    while (at < DRUM_MS - 60) {
      timers.push(window.setTimeout(() => playSfx('click'), at))
      at += gap
      gap = Math.max(46, gap * 0.9)
    }
    return () => timers.forEach(t => window.clearTimeout(t))
  }, [phase])

  // card flips
  useEffect(() => {
    if (phase < 1 || phase > 4) return
    const m = METRICS[phase - 1]
    playSfx('pop')
    const sc = rv.scores[m.key]
    const t = window.setTimeout(() => playSfx(sc >= 8.5 ? 'coin' : sc < 4 ? 'error' : 'bubble'), 420)
    return () => window.clearTimeout(t)
  }, [phase, rv])

  // the verdict
  useEffect(() => {
    if (phase < 5 || instant) return
    const timers: number[] = []
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
    if (rv.verdict === 'winner') {
      later(650, () => { playSfx('winner'); fireConfetti(2.2) })
      later(1500, () => fireConfetti(1.2))
    } else if (rv.verdict === 'solid') later(650, () => { playSfx('levelup'); fireConfetti(0.6) })
    else if (rv.verdict === 'breakeven') later(650, () => playSfx('ping'))
    else later(650, () => playSfx('flop'))
    return () => timers.forEach(t => window.clearTimeout(t))
  }, [phase, rv.verdict, instant])

  const v = VERDICTS[rv.verdict]
  const overall = useCountUp(phase >= 5 ? rv.overall : 0, instant ? 0 : 1100, 0)
  const weakest = METRICS.reduce((a, m) => (rv.scores[m.key] < rv.scores[a.key] ? m : a), METRICS[0])
  const line = pickBy(l.id, v.lines)
  const rp = DEV.rpPerLaunch + (rv.verdict === 'winner' ? DEV.rpWinner : 0)
  const coachLine = rv.verdict === 'winner'
    ? `Scale it! Add budget while ROAS stays well above ${rv.breakEvenRoas.toFixed(2)}, and refresh the ads when they get tired.`
    : rv.verdict === 'solid'
      ? `Profitable. Feed it gently, and watch the ${weakest.name}: at ${rv.scores[weakest.key].toFixed(1)}/10 it's what's holding you back.`
      : `${weakest.name} scored ${rv.scores[weakest.key].toFixed(1)}/10. ${WEAK_TIPS[weakest.key]}${rv.verdict === 'flop' ? ' And if week one bleeds, kill it fast.' : ''}`

  return (
    <DialogFrame
      title={<>Launch review</>}
      subtitle={<>{l.name} · {ANGLES[l.angle].icon} {ANGLES[l.angle].name} on {PLATFORMS[l.platform].icon} {PLATFORMS[l.platform].name} · {SIZES[l.size].icon} {SIZES[l.size].name}</>}
      icon={<ProductThumb productId={l.productId} size={52} />}
      width={900}
      footer={
        phase < 5
          ? <Button variant="ghost" size="lg" onClick={() => setPhase(5)}><FastForward size={17} /> Skip</Button>
          : <Button variant={rv.verdict === 'winner' ? 'gold' : 'primary'} size="lg" onClick={onDone} autoFocus><Rocket size={17} /> {rv.verdict === 'flop' ? 'Ouch. Onward.' : "Let's sell!"}</Button>
      }
    >
      <div className={clsx('l-rv', `v-${rv.verdict}`, phase >= 5 && 'final')}>
        <div className="l-rv-stage">
          <div className="l-rv-cards">
            {METRICS.map((m, i) => <ScoreCard key={m.key} m={m} rv={rv} shown={phase > i} />)}
          </div>
          <div className={clsx('l-rv-drum', phase > 0 && 'gone')} aria-hidden={phase > 0}>
            <span className="l-rv-drum-ic">🥁</span>
            <span>The numbers are coming in<em>.</em><em>.</em><em>.</em></span>
          </div>
        </div>

        <div className={clsx('l-rv-final', phase >= 5 && 'in')} aria-live="polite">
          <div className={clsx('l-rv-overall', scoreTone(rv.overall))}>
            <small>Overall</small>
            <b>{overall.toFixed(1)}</b>
            <span>/10</span>
          </div>
          <div className={clsx('l-rv-banner', v.tone)}>
            <div className="l-rv-banner-title"><span>{v.emoji}</span>{BANNER[rv.verdict]}</div>
            <div className="l-rv-banner-line">{line}</div>
            <div className="l-rv-chips">
              <span data-tip="Research points for the Lab">+{rp} 🟣 RP</span>
              <span data-tip="What one order leaves you after product, shipping and fees">Margin {usdC(rv.marginPerOrder)}/order</span>
            </div>
          </div>
        </div>

        <div className={clsx('l-coach l-rv-coach', rv.verdict === 'flop' ? 'sad' : rv.verdict === 'winner' ? 'happy' : '', phase >= 5 && 'in')} aria-hidden={phase < 5}>
          <img src={portrait(COACH_PORTRAIT)} alt="" />
          <p><b>Coach Kev</b>{coachLine}</p>
        </div>
      </div>
    </DialogFrame>
  )
}

function ScoreCard({ m, rv, shown }: { m: MetricDef; rv: Review; shown: boolean }) {
  const score = rv.scores[m.key]
  const n = useCountUp(shown ? score : 0, 800, 0)
  const tone = scoreTone(score)
  return (
    <div className={clsx('l-flip', shown && 'shown')}>
      <div className="l-flip-inner">
        <div className="l-flip-face back" aria-hidden={shown}>
          <span className="l-flip-q">?</span>
          <b>{m.name}</b>
          <small>{m.long}</small>
        </div>
        <div className={clsx('l-flip-face front', tone)} aria-hidden={!shown}>
          <div className="l-sc-head"><span>{m.icon}</span><b>{m.name}</b><small>{m.long}</small></div>
          <div className="l-sc-value">{m.value(rv)}</div>
          <div className="l-sc-sub">{m.sub(rv)}</div>
          <div className="l-sc-score"><b>{n.toFixed(1)}</b><span>/10</span></div>
          <div className="l-sc-bar"><i style={{ width: `${(n / 10) * 100}%` }} /></div>
          <p className="l-sc-quote">{rv.quotes[m.key]}</p>
        </div>
      </div>
    </div>
  )
}
