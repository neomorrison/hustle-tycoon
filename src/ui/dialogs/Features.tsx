// Store features ("apps"): researched apps as toggle cards with monthly fee & effect. OWNER: ui-management.
import { useMemo } from 'react'
import clsx from 'clsx'
import type { DialogProps } from './types'
import type { FeatureId } from '../../core/types'
import { Badge, Button, DialogFrame, Toggle } from '../kit'
import { act } from '../../core/store'
import { openDialog } from '../../core/ui'
import { featureMonthlyCost, toggleFeature } from '../../sim/research'
import { monthlyBurn } from '../../sim/economy'
import { FEATURES, FEATURE_GROUP_LABELS, FEATURE_IDS, type FeatureGroup } from '../../data/features'
import { RESEARCH_BY_ID } from '../../data/research'
import { playSfx } from '../audio'
import { Empty, Kpi, Note, useCoachOnOpen, useFlash, useGameState, usd, monthlyLaunchProfit } from '../manage/common'

const GROUP_ORDER: FeatureGroup[] = ['conversion', 'aov', 'retention', 'creative', 'ads', 'supply']
const GROUP_ICON: Record<FeatureGroup, string> = { conversion: '🛒', aov: '🧺', retention: '💌', creative: '🎨', ads: '📣', supply: '🚢' }

export default function FeaturesDialog({ close }: DialogProps) {
  const s = useGameState()
  useCoachOnOpen('features')
  const [bump, setBump] = useFlash<FeatureId>(450)

  const owned = useMemo(() => (s ? FEATURE_IDS.filter(id => s.unlocked.features.includes(id)) : []), [s])
  const locked = useMemo(() => (s ? FEATURE_IDS.filter(id => !s.unlocked.features.includes(id)) : []), [s])
  if (!s) return null

  const monthly = featureMonthlyCost(s)
  const burn = monthlyBurn(s)
  const bills = burn.rent + burn.salaries + burn.features
  const active = s.activeFeatures.filter(f => s.unlocked.features.includes(f))
  const launchProfit = monthlyLaunchProfit(s)

  const flip = (id: FeatureId, on: boolean) => {
    act(d => toggleFeature(d, id, on))
    setBump(id)
    playSfx(on ? 'coin' : 'tick')
  }
  const setAll = (on: boolean) => {
    act(d => { for (const id of d.unlocked.features) toggleFeature(d, id, on) })
    playSfx(on ? 'coin' : 'whoosh')
  }

  return (
    <DialogFrame
      title="Store features"
      icon="🧩"
      width={940}
      subtitle="Apps you've researched. Switched on, they boost every launch you're building or running, and charge their fee every month."
      onClose={close}
      footer={
        <>
          <span className="g-foot-tip">Rule of thumb: an app is worth it when it earns more than its fee. Cheap CVR apps (Reviews, Trust badges) pay off first.</span>
          <Button variant="secondary" onClick={close}>Close</Button>
        </>
      }
    >
      <div className="g-wrap">
        <div className="g-kpis">
          <Kpi icon="🧩" label="Apps switched on" value={`${active.length} / ${owned.length}`} sub={owned.length ? `${locked.length} more in the Lab` : 'None researched yet'} />
          <Kpi icon="🧾" label="Monthly app bill" value={usd(monthly)} tone={monthly > 0 && launchProfit < monthly ? 'warn' : undefined} sub={bills > 0 ? `${monthly > 0 && monthly / bills < 0.01 ? '<1' : Math.round((monthly / bills) * 100)}% of your ${usd(bills)} monthly bills` : 'No bills yet'} />
          <Kpi icon="📈" label="Launch profit, last 4 weeks" value={usd(launchProfit)} tone={launchProfit > monthly * 3 ? 'good' : launchProfit < monthly ? 'bad' : undefined} sub={monthly > 0 ? (launchProfit > 0 ? (launchProfit / monthly >= 20 ? 'Covers the app bill easily (20×+)' : `Covers the app bill ${(launchProfit / monthly).toFixed(1)}×`) : 'Not covering the apps yet') : 'Revenue minus ads, stock and fees'} />
        </div>

        {owned.length === 0 ? (
          <Empty
            icon="🧩"
            title="No apps installed yet"
            action={<Button onClick={() => openDialog('research', { category: 'feature' })}>🧪 Open the Lab</Button>}
          >
            Research store apps in the Lab: <b>Reviews</b> and <b>Trust badges</b> cost only 25 RP each and lift conversion right away.
          </Empty>
        ) : (
          <>
            <div className="g-row" style={{ justifyContent: 'space-between' }}>
              <div className="g-feat-bill">
                <Badge tone="good">✓ {active.length} on</Badge>
                <Badge>{owned.length - active.length} off</Badge>
              </div>
              <div className="g-row">
                <Button size="sm" variant="secondary" disabled={active.length === owned.length} onClick={() => setAll(true)}>Switch all on</Button>
                <Button size="sm" variant="ghost" disabled={active.length === 0} onClick={() => setAll(false)}>All off (save {usd(monthly)}/mo)</Button>
              </div>
            </div>
            {s.cash < 0 && active.length > 0 && <Note tone="bad" icon="🚨">You're in overdraft. Switching off apps you don't need is the fastest way to cut the monthly bill.</Note>}

            {GROUP_ORDER.map(g => {
              const ids = owned.filter(id => FEATURES[id].group === g)
              if (!ids.length) return null
              return (
                <section key={g} className="g-feat-group">
                  <h3 className="g-h3">{GROUP_ICON[g]} {FEATURE_GROUP_LABELS[g]}</h3>
                  <div className="g-feats">
                    {ids.map(id => {
                      const f = FEATURES[id]
                      const on = s.activeFeatures.includes(id)
                      return (
                        <article key={id} className={clsx('g-card g-feat', on ? 'on' : 'off', bump === id && 'bump')}>
                          <div className="g-feat-top">
                            <div className="g-feat-emoji" aria-hidden="true">{f.emoji}</div>
                            <div className="g-grow">
                              <div className="g-feat-name">{f.name}</div>
                              <div className="g-feat-fee">{usd(f.monthly)}/mo</div>
                            </div>
                          </div>
                          <div><Badge tone={on ? 'good' : 'purple'}>{f.effect}</Badge></div>
                          <div className="g-feat-blurb">{f.blurb}</div>
                          <div className="g-feat-bottom">
                            <span className="k-muted" style={{ font: '500 12.5px var(--k-font-data)' }}>{on ? 'Active on all launches' : 'Off: no fee, no boost'}</span>
                            <Toggle checked={on} onChange={v => flip(id, v)} label={<span className="k-muted" style={{ fontSize: 13 }}>{on ? 'On' : 'Off'}</span>} />
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </>
        )}

        {locked.length > 0 && (
          <section className="g-feat-group">
            <h3 className="g-h3">🔒 Still in the Lab <small>{locked.length} app{locked.length === 1 ? '' : 's'}</small></h3>
            <div className="g-teaser">
              {locked.map(id => {
                const f = FEATURES[id]
                const node = RESEARCH_BY_ID[f.researchId]
                return (
                  <button key={id} type="button" className="g-teaser-chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => openDialog('research', { focus: f.researchId })} data-tip={`${f.effect} · ${usd(f.monthly)}/mo\nClick to find it in the Lab`}>
                    <span className="e">{f.emoji}</span><b>{f.name}</b>{node && <span>🟣 {node.cost}{node.cash ? ` + ${usd(node.cash)}` : ''}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </DialogFrame>
  )
}
