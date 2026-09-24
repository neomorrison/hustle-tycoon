// GDT-style focus sliders for the current dev stage: 3 big sliders, normalized % preview, expected stage output,
// the Playbook recipe for the angle (if known) and Confirm → setStageSliders. OWNER: ui-launch.
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { BookOpen, Play, Scale, Trash2 } from 'lucide-react'
import type { DialogProps } from './types'
import { Button, DialogFrame, Range } from '../kit'
import { act, getGS, useGame } from '../../core/store'
import type { Launch } from '../../core/types'
import { ANGLES } from '../../data/angles'
import { PLATFORMS } from '../../data/platforms'
import { AREAS, STAGES } from '../../data/areas'
import { normalize3 } from '../../data/combos'
import { cancelLaunch, setStageSliders, stagePreview } from '../../sim/launch'
import { knownFocus } from '../../sim/playbook'
import { coachDialog } from '../../sim/world'
import { playSfx } from '../audio'
import { ConfirmButton, POINT_UI, ProductThumb, usd } from '../launch/common'

type W = [number, number, number]
const AREA_COLORS: Record<string, string> = {
  research: '#8b5cf6', quality: '#14b8a6', pricing: '#c026d3',
  copy: '#3b82f6', visuals: '#ff7a45', offer: '#e64980',
  hooks: '#f59f00', targeting: '#7c4dff', influencers: '#ff4d8d',
}

export default function SlidersDialog({ close }: DialogProps) {
  const l = useGame(st => st.state?.current ?? null)
  useEffect(() => { act(g => coachDialog(g, 'sliders')) }, [])
  // nothing to set (scrapped, or already confirmed elsewhere): get out of the way
  const stale = !l || l.status !== 'dev' || !l.awaitingSliders
  useEffect(() => { if (stale) close() }, [stale, close])
  if (stale || !l) return null
  return <Stage key={`${l.id}:${l.stage}`} l={l} close={close} />
}

function Stage({ l, close }: { l: Launch; close: () => void }) {
  const stage = STAGES[l.stage]
  const angle = ANGLES[l.angle]
  const plat = PLATFORMS[l.platform]
  const [w, setW] = useState<W>(() => {
    const n = normalize3(l.sliders[l.stage] ?? [1, 1, 1])
    const top = Math.max(...n)
    return n.map(x => Math.round((x / top) * 0.8 * 100) / 100) as W
  })
  const recipe = useMemo(() => { try { return knownFocus(getGS(), l.angle) } catch { return null } }, [l.angle])
  const recipeW = recipe?.sliders[l.stage] as W | undefined
  const norm = normalize3(w)
  const pcts = norm.map(x => Math.round(x * 100))
  const preview = useMemo(() => { try { return stagePreview(getGS(), l, l.stage, w) } catch { return null } }, [l, w])
  const matchesRecipe = !!recipeW && recipeW.every((x, i) => Math.abs(x - norm[i]) < 0.02)

  const setOne = (i: number, v: number) => setW(cur => cur.map((x, k) => (k === i ? v : x)) as W)
  const apply = (target: readonly number[]) => {
    const n = normalize3(target)
    const top = Math.max(...n)
    setW(n.map(x => Math.round((x / top) * 0.9 * 100) / 100) as W)
    playSfx('pop')
  }
  const confirm = () => {
    act(s => setStageSliders(s, norm.map(x => Math.round(x * 1000) / 1000) as W))
    playSfx('whoosh')
    close()
  }
  const allZero = w[0] + w[1] + w[2] <= 0
  // the focus call pops up right after Start: give a way out if the player picked the wrong product (half refund in Sourcing)
  const canScrap = l.stage === 0 && l.daysElapsed === 0
  const refund = Math.round((l.upfront ?? 0) * 0.5)
  const scrap = () => { act(s => cancelLaunch(s)); playSfx('whoosh'); close() }

  return (
    <DialogFrame
      title={<><span className="l-sl-stage-no">Stage {l.stage + 1}/3</span> {stage.icon} {stage.name}</>}
      subtitle={stage.blurb}
      width={720}
      footer={
        <>
          {canScrap && (
            <ConfirmButton className="k-btn ghost sm l-sl-scrap" onConfirm={scrap} tip="Changed your mind? Scrap this launch before work starts"
              confirm={<><Trash2 size={14} /> {refund ? `Scrap? ${usd(refund)} back` : 'Scrap it?'}</>}>
              <Trash2 size={14} /> Scrap
            </ConfirmButton>
          )}
          <span className="l-sl-foot-note">{preview ? `${preview.days} days of work at this focus` : ''}</span>
          <Button variant="gold" size="lg" onClick={confirm} disabled={allZero} autoFocus><Play size={17} /> {l.stage === 2 ? 'Final stretch!' : "Let's go"}</Button>
        </>
      }
    >
      <div className="l-sl">
        <div className="l-sl-steps" aria-label="Stages">
          {STAGES.map(st => (
            <div key={st.index} className={clsx('l-sl-step', st.index < l.stage && 'done', st.index === l.stage && 'now')}>
              <i>{st.index < l.stage ? '✓' : st.icon}</i><span>{st.name}</span>
            </div>
          ))}
        </div>

        <div className="l-sl-launch">
          <ProductThumb productId={l.productId} size={44} />
          <div>
            <b>{l.name}</b>
            <small>{angle.icon} {angle.name} · {plat.icon} {plat.name}</small>
          </div>
        </div>

        <div className="l-sl-sliders">
          {stage.areas.map((a, i) => {
            const def = AREAS[a]
            const color = AREA_COLORS[a] ?? 'var(--k-purple)'
            return (
              <div key={a} className="l-sl-row" style={{ ['--ac' as string]: color }}>
                <div className="l-sl-ic" aria-hidden="true">{def.icon}</div>
                <div className="l-sl-main">
                  <div className="l-sl-name"><b>{def.name}</b><small>{def.hint}</small></div>
                  <Range value={w[i]} onChange={v => setOne(i, v)} color={color} label={`${def.name} focus`} />
                </div>
                <div className="l-sl-pct"><b>{pcts[i]}</b>%</div>
              </div>
            )
          })}
        </div>

        <div className="l-sl-mix" aria-label="Focus split">
          {stage.areas.map((a, i) => (
            <i key={a} style={{ width: `${norm[i] * 100}%`, background: AREA_COLORS[a] }} data-tip={`${AREAS[a].icon} ${AREAS[a].name} ${pcts[i]}%`}>
              {pcts[i] >= 12 && <span>{AREAS[a].icon} {pcts[i]}%</span>}
            </i>
          ))}
        </div>

        {preview && (
          <div className="l-sl-preview">
            <span className="l-sl-preview-title">This stage should earn</span>
            <div className="l-sl-yield">
              {(['conv', 'traffic', 'aov', 'research'] as const).map(k => preview[k] >= 0.5 && (
                <span key={k} className="l-yield" style={{ ['--c' as string]: POINT_UI[k].color }} data-tip={`${POINT_UI[k].emoji} ${POINT_UI[k].label} points`}>
                  {(() => { const I = POINT_UI[k].Icon; return <I size={13} strokeWidth={2.6} /> })()} +{Math.round(preview[k])}
                </span>
              ))}
              {preview.fix >= 0.5 && <span className="l-yield shield" data-tip="Quality work cancels future 🔴 complaints">🛡️ blocks ~{Math.round(preview.fix)} 🔴</span>}
              {preview.fans >= 0.5 && <span className="l-yield fans" data-tip="Seeded creators bring launch-day fans">🤳 ~{Math.round(preview.fans)} fans</span>}
            </div>
          </div>
        )}

        <div className="l-sl-notes">
          <div className="l-sl-note">
            <span className="l-sl-note-ic">{angle.icon}</span>
            <p><b>{angle.name}</b> wants: {angle.wants}</p>
          </div>
          {recipeW ? (
            <div className="l-sl-note recipe">
              <span className="l-sl-note-ic"><BookOpen size={18} /></span>
              <p>
                <b>Playbook recipe</b> from your best {angle.name} launch ({Math.round((recipe?.accuracy ?? 0) * 100)}% on target):{' '}
                {stage.areas.map((a, i) => <em key={a}>{AREAS[a].icon} {Math.round(recipeW[i] * 100)}%</em>)}
              </p>
              <Button size="sm" variant={matchesRecipe ? 'ghost' : 'secondary'} disabled={matchesRecipe} onClick={() => apply(recipeW)}>{matchesRecipe ? 'Applied ✓' : 'Use it'}</Button>
            </div>
          ) : (
            <div className="l-sl-note muted">
              <span className="l-sl-note-ic"><BookOpen size={18} /></span>
              <p>No {angle.name} recipe in your Playbook yet. Finish a run and the post-mortem tells you which sliders to move.</p>
            </div>
          )}
          <div className="l-sl-presets">
            <Button size="sm" variant="ghost" onClick={() => apply([1, 1, 1])}><Scale size={14} /> Even split</Button>
          </div>
        </div>
      </div>
    </DialogFrame>
  )
}
