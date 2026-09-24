// Current launch in development (GDT project card): product, stage segments, live point counters, Polish / Launch.
// OWNER: ui-launch. Rendered by the main game layout inside the [data-bubble-target] slot.
import { useEffect, useMemo, useRef } from 'react'
import clsx from 'clsx'
import { Rocket, SlidersHorizontal, Sparkles, Square, Trash2, Wrench } from 'lucide-react'
import { act, emitFX, onFX } from '../../core/store'
import { openDialog, useUI } from '../../core/ui'
import type { FX, Launch, Points } from '../../core/types'
import { clamp } from '../../core/rng'
import { ANGLES } from '../../data/angles'
import { PLATFORMS } from '../../data/platforms'
import { SIZES } from '../../data/sizes'
import { STAGES, AREAS } from '../../data/areas'
import { canStartLaunch, cancelLaunch, DEV, launchNow, launchTeam, pointsVsBar, stageEnds, startQC, stopQC } from '../../sim/launch'
import { sliderPercents } from '../../sim/evaluate'
import { Button } from '../kit'
import { playSfx } from '../audio'
import { ConfirmButton, POINT_UI, ProductThumb, useCountUp, useG, reduceMotion } from './common'

const POINT_ORDER: (keyof Points)[] = ['conv', 'traffic', 'aov', 'research', 'bugs']

export default function ProjectCard() {
  const cur = useG(s => s.current, null)
  const hasLive = useG(s => s.live.length > 0, false)
  if (!cur) return hasLive ? <IdleCard /> : null
  return <ActiveCard l={cur} />
}

// ---------------------------------------------------------------------------
function IdleCard() {
  const reason = useG(s => canStartLaunch(s).reason ?? '', '')
  const employed = useG(s => s.dayJob.employed, false)
  return (
    <div className="l-card l-project l-idle">
      <div className="l-idle-emoji" aria-hidden="true">{employed ? '🍔' : '☕'}</div>
      <div className="l-idle-text">
        <b>The team is idle</b>
        <span>{reason || 'Live products sell on their own. Start the next launch while they cook.'}</span>
      </div>
      <Button size="sm" disabled={!!reason} onClick={() => openDialog('newLaunch')}><Rocket size={15} /> New launch</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
function ActiveCard({ l }: { l: Launch }) {
  const angle = ANGLES[l.angle]
  const plat = PLATFORMS[l.platform]
  const size = SIZES[l.size]
  const vsBar = useG(s => (s.current ? pointsVsBar(s, s.current).total : 0), 0)
  const teamSize = useG(s => (s.current ? launchTeam(s, s.current.size).length : 1), 1)
  const employed = useG(s => s.dayJob.employed, false)
  const pillRefs = useRef<Partial<Record<keyof Points, HTMLDivElement | null>>>({})

  // counters bump as bubbles land on the card (~1.5 s after they pop at the worker)
  useEffect(() => {
    const timers = new Set<number>()
    const off = onFX((list: FX[]) => {
      const pts = new Set<keyof Points>()
      for (const f of list) if (f.kind === 'bubble' && f.point) pts.add(f.point)
      let i = 0
      for (const p of pts) {
        const t = window.setTimeout(() => {
          timers.delete(t)
          const el = pillRefs.current[p]
          if (el && !reduceMotion()) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)', filter: 'brightness(1.15)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.6,.5,1)' })
        }, 1450 + i * 120)
        timers.add(t)
        i++
      }
    })
    return () => { off(); timers.forEach(t => window.clearTimeout(t)) }
  }, [])

  const status = l.status
  const awaiting = l.awaitingSliders
  const polishing = status === 'qc' && !!l.polishing
  const running = (status === 'dev' && !awaiting) || polishing
  const maxQc = l.maxQcDays ?? Math.max(2, Math.ceil(l.devDays * DEV.polishShare))
  const daysLeft = status === 'dev' ? Math.max(0, l.devDays - l.daysElapsed) : polishing ? Math.max(0, maxQc - l.qcDays) : 0
  const focus = sliderPercents(l.sliders[l.stage] ?? [1, 1, 1])

  const doLaunch = () => {
    let fx: FX[] = []
    act(s => { fx = launchNow(s) })
    emitFX(fx)
  }

  const statusBadge = awaiting
    ? { cls: 'wait', text: '🎛️ Needs your focus' }
    : status === 'dev'
      ? { cls: 'dev', text: `${STAGES[l.stage].icon} Stage ${l.stage + 1}/3 · ${STAGES[l.stage].name}` }
      : polishing
        ? { cls: 'polish', text: '🧽 Polishing' }
        : status === 'ready'
          ? { cls: 'ready', text: '✨ Ready to launch' }
          : { cls: 'built', text: '📦 Built!' }

  return (
    <div className={clsx('l-card l-project', running && 'running', (status === 'ready' || status === 'qc') && 'done')}>
      <div className="l-project-head">
        <ProductThumb productId={l.productId} size={54} className={clsx('l-project-thumb', running && 'bob')} />
        <div className="l-project-title">
          <div className="l-project-name" title={l.name}>{l.name}</div>
          <div className="l-project-sub">
            <span data-tip={angle.blurb}>{angle.icon} {angle.name}</span>
            <span data-tip={plat.blurb}>{plat.icon} {plat.short}</span>
            <span data-tip={`${size.name}: ${size.blurb}`}>{size.icon} {size.name.replace(' Launch', '')}</span>
          </div>
        </div>
        <div className="l-project-side">
          <span className={clsx('l-status', statusBadge.cls)}>{statusBadge.text}</span>
          <span className="l-project-info">
            {running && <span className="l-days" data-tip="Working days left (1× speed ≈ half a second per day)">⏱ {daysLeft}d</span>}
            <span data-tip={employed ? "You're on McDoodle's shifts: founder output ×0.5" : 'People working on this launch'}>👥 {teamSize}{employed ? ' 🍔' : ''}</span>
          </span>
        </div>
      </div>

      <StageBar l={l} running={running} maxQc={maxQc} focusTip={status === 'dev' && !awaiting ? `This stage's focus: ${STAGES[l.stage].areas.map((a, i) => `${AREAS[a].icon} ${AREAS[a].name} ${focus[i]}%`).join(' · ')}` : ''} />

      <div className="l-points" aria-label="Points so far">
        {POINT_ORDER.map(p => (
          <PointPill key={p} point={p} value={l.points[p]} innerRef={el => { pillRefs.current[p] = el }} />
        ))}
      </div>

      <div className="l-project-foot">
        <MarketMeter ratio={vsBar} building={status === 'dev'} />
        <div className="l-project-actions">
          {awaiting && (
            <Button size="sm" onClick={() => openDialog('sliders', { launchId: l.id })}><SlidersHorizontal size={15} /> Set focus</Button>
          )}
          {status === 'dev' && (
            <ConfirmButton
              className="k-btn ghost sm l-scrap"
              confirm={<><Trash2 size={14} /> Scrap it?</>}
              tip={l.stage === 0 ? 'Scrap this launch (supplier refunds half the upfront during Sourcing)' : 'Scrap this launch (no refund after Sourcing)'}
              onConfirm={() => { act(s => cancelLaunch(s)); playSfx('whoosh') }}
            >
              <Trash2 size={14} /> Scrap
            </ConfirmButton>
          )}
          {status === 'qc' && !polishing && (
            <>
              <Button size="sm" variant="secondary" onClick={() => { act(s => startQC(s)); playSfx('pop') }} disabled={l.points.bugs < 0.5}
                data-tip={l.points.bugs < 0.5 ? 'No complaints to fix' : `Spend up to ${maxQc} days squashing ${Math.round(l.points.bugs)} 🔴 complaints (no new points)`}>
                <Wrench size={15} /> Polish
              </Button>
              <Button size="sm" variant="gold" className="l-launch-btn" onClick={doLaunch}><Rocket size={15} /> Launch now</Button>
            </>
          )}
          {polishing && (
            <>
              <Button size="sm" variant="secondary" onClick={() => act(s => stopQC(s))}><Square size={13} /> Stop</Button>
              <Button size="sm" variant="gold" className="l-launch-btn" onClick={doLaunch}><Rocket size={15} /> Launch now</Button>
            </>
          )}
          {status === 'ready' && (
            <Button variant="gold" className="l-launch-btn big" onClick={doLaunch}><Sparkles size={16} /> Launch it! <Rocket size={16} /></Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function StageBar({ l, running, maxQc, focusTip }: { l: Launch; running: boolean; maxQc: number; focusTip: string }) {
  const dayFrac = useUI(u => (running && u.speed > 0 ? u.dayFrac : 0))
  const ends = useMemo(() => stageEnds(l.devDays), [l.devDays])
  const inDev = l.status === 'dev'
  const segs = STAGES.map((st, i) => {
    const start = i === 0 ? 0 : ends[i - 1]
    const len = Math.max(1, ends[i] - start)
    let frac: number
    if (!inDev) frac = 1
    else if (i < l.stage) frac = 1
    else if (i > l.stage) frac = 0
    else frac = clamp((l.daysElapsed + (l.awaitingSliders ? 0 : dayFrac) - start) / len, 0, 1)
    return { st, frac, grow: len, active: inDev && i === l.stage }
  })
  const polishFrac = l.status === 'qc' && l.polishing ? clamp((l.qcDays + dayFrac) / Math.max(1, maxQc), 0, 1) : l.status === 'ready' ? 1 : 0
  return (
    <div className="l-stages">
      {segs.map(({ st, frac, grow, active }) => (
        <div key={st.index} className={clsx('l-stage', active && 'active', frac >= 1 && 'done')} style={{ flexGrow: grow }} data-tip={active ? focusTip : ''}>
          <div className="l-stage-track"><i style={{ width: `${frac * 100}%` }} /></div>
          <span className="l-stage-label">{frac >= 1 ? '✓' : st.icon} {st.name}</span>
        </div>
      ))}
      {!inDev && (
        <div className={clsx('l-stage polish', l.polishing && 'active', polishFrac >= 1 && 'done')} style={{ flexGrow: Math.max(4, maxQc) }}>
          <div className="l-stage-track"><i style={{ width: `${polishFrac * 100}%` }} /></div>
          <span className="l-stage-label">🧽 Polish</span>
        </div>
      )}
    </div>
  )
}

function PointPill({ point, value, innerRef }: { point: keyof Points; value: number; innerRef: (el: HTMLDivElement | null) => void }) {
  const meta = POINT_UI[point]
  const shown = useCountUp(Math.round(Math.max(0, value)), 700)
  const Icon = meta.Icon
  return (
    <div ref={innerRef} className={clsx('l-pill', `p-${point}`)} style={{ ['--c' as string]: meta.color }} data-tip={`${meta.emoji} ${meta.label} points`}>
      <span className="l-pill-ic"><Icon size={13} strokeWidth={2.6} /></span>
      <b>{Math.round(shown)}</b>
    </div>
  )
}

function MarketMeter({ ratio, building }: { ratio: number; building: boolean }) {
  const r = Math.max(0, ratio)
  const tone = r >= 1.3 ? 'gold' : r >= 1 ? 'good' : building ? 'build' : r >= 0.75 ? 'warn' : 'bad'
  const label = r >= 1.3 ? 'Crushing it' : r >= 1 ? 'Above the bar' : building ? 'of the target' : r >= 0.75 ? 'Almost there' : 'Below the bar'
  return (
    <div className={clsx('l-meter', tone)} data-tip={'🔵🟠💜 points built vs what the market expects from a launch this size.\nThe bar rises as the industry (and you) get better.'}>
      <div className="l-meter-top"><span>📊 Market bar</span><b>{Math.round(r * 100)}% · {label}</b></div>
      <div className="l-meter-track"><i style={{ width: `${Math.min(100, (r / 1.5) * 100)}%` }} /><em style={{ left: `${(1 / 1.5) * 100}%` }} /></div>
    </div>
  )
}
