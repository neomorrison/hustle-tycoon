// New Launch wizard (one screen, card pickers): niche → product → angle → platform → size → price → store apps,
// with a sticky summary (name, Playbook knowledge, unit economics, costs) and Start. OWNER: ui-launch.
// Knowledge chips come ONLY from s.playbook (plus the paid 📊 Data dashboard hint) — never from the hidden truth tables.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Dices, FlaskConical, Lock, Rocket } from 'lucide-react'
import type { DialogProps } from './types'
import { Button, DialogFrame, Toggle } from '../kit'
import { act, getGS, useGame } from '../../core/store'
import { openDialog } from '../../core/ui'
import type { AngleId, ComboRating, FeatureId, GameState, LaunchConfig, NicheId, PlatformId, PriceTier, Product, SizeId } from '../../core/types'
import { competitionLabel, findProduct, NICHE_IDS, NICHES, PRICE_TIER_IDS, PRICE_TIERS, priceFor, productsByNiche, productTraits, trendLabel } from '../../data/catalog'
import { ANGLE_IDS, ANGLES } from '../../data/angles'
import { PLATFORM_IDS, PLATFORMS } from '../../data/platforms'
import { SIZE_IDS, SIZES } from '../../data/sizes'
import { FEATURES } from '../../data/features'
import { productAngleRating } from '../../data/combos'
import { canStartLaunch, devDaysFor, launchCostBreakdown, launchTeam, startLaunch, suggestLaunchName, upfrontCost, validateLaunchConfig } from '../../sim/launch'
import { previewEconomics } from '../../sim/evaluate'
import { knownCombosFor, timesLaunched } from '../../sim/playbook'
import { comboHintsEnabled, toggleFeature } from '../../sim/research'
import { coachDialog, seasonDemand, trendsFor } from '../../sim/world'
import { playSfx } from '../audio'
import { ComboChip, officeLabel, ProductThumb, RATING_WORD, researchHint, usd, usdC, usdK, x2 } from '../launch/common'
import { randomBrandName } from '../launch/nameGen'

export default function NewLaunchDialog({ props, close }: DialogProps) {
  const s = useGame(st => st.state)
  useEffect(() => { act(g => coachDialog(g, 'newLaunch')) }, [])
  if (!s) return null
  return <Wizard s={s} props={props} close={close} />
}

interface Picks { niche: NicheId; productId: string | null; angle: AngleId; platform: PlatformId; size: SizeId; tier: PriceTier; feats: FeatureId[] }

function initialPicks(s: GameState, props?: Record<string, unknown>): Picks {
  const last = s.live.at(-1) ?? s.history.at(-1)
  const want = (typeof props?.productId === 'string' && findProduct(props.productId)) || null
  const prodOk = want && s.unlocked.niches.includes(want.niche) ? want : null
  const angle = (props?.angle as AngleId) ?? last?.angle
  const platform = (props?.platform as PlatformId) ?? last?.platform
  const size = (props?.size as SizeId) ?? last?.size
  const tier = (props?.priceTier as PriceTier) ?? (last && 'priceTier' in last ? last.priceTier : undefined)
  const sizeOk = (z?: SizeId) => !!z && s.unlocked.sizes.includes(z) && s.office >= SIZES[z].minOffice && s.cash >= upfrontCost(s, z)
  return {
    niche: prodOk?.niche ?? NICHE_IDS.find(n => s.unlocked.niches.includes(n)) ?? 'pet',
    productId: prodOk?.id ?? null,
    angle: angle && s.unlocked.angles.includes(angle) ? angle : s.unlocked.angles[0] ?? 'pain_point',
    platform: platform && s.unlocked.platforms.includes(platform) ? platform : s.unlocked.platforms[0] ?? 'fadbook',
    size: sizeOk(size) ? (size as SizeId) : 'test',
    tier: tier ?? 'standard',
    feats: s.activeFeatures.filter(f => s.unlocked.features.includes(f)),
  }
}

function Wizard({ s, props, close }: { s: GameState; props?: Record<string, unknown>; close: () => void }) {
  const [p, setP] = useState<Picks>(() => initialPicks(getGS(), props))
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const set = (patch: Partial<Picks>) => setP(cur => ({ ...cur, ...patch }))
  const product = p.productId ? findProduct(p.productId) ?? null : null

  useEffect(() => {
    if (!touched && p.productId) setName(suggestLaunchName(getGS(), p.productId))
  }, [p.productId, touched])

  const cfg: LaunchConfig | null = product ? { name: name.trim(), productId: product.id, angle: p.angle, platform: p.platform, size: p.size, priceTier: p.tier, features: p.feats } : null
  const can = canStartLaunch(s)
  const check = cfg ? validateLaunchConfig(s, cfg) : can.ok ? { ok: false, reason: 'Pick a product to launch 👈' } : can
  const cost = launchCostBreakdown(s, { size: p.size })

  const start = () => {
    if (!cfg || !check.ok) { playSfx('error'); return }
    const out = { id: null as string | null }
    act(g => {
      if (!validateLaunchConfig(g, cfg).ok) return
      for (const f of g.unlocked.features) {
        const on = cfg.features.includes(f)
        if (on !== g.activeFeatures.includes(f)) toggleFeature(g, f, on)
      }
      out.id = startLaunch(g, cfg)
    })
    if (out.id) { playSfx('whoosh'); close() } else playSfx('error')
  }

  return (
    <DialogFrame
      title="New launch"
      subtitle={s.dayJob.employed ? "Pick a product, a pitch and a place to sell it. (Built on McDoodle's breaks, so it takes a while.)" : 'Pick a product, a pitch and a place to sell it.'}
      icon="🚀"
      width={1200}
      onClose={close}
    >
      <div className="l-nl">
        <div className="l-nl-picks">
          <ProductSection s={s} p={p} set={set} />
          <AngleSection s={s} p={p} product={product} set={set} />
          <PlatformSection s={s} p={p} product={product} set={set} />
          <div className="l-nl-duo">
            <SizeSection s={s} p={p} set={set} />
            <TierSection s={s} p={p} product={product} set={set} />
          </div>
          <FeatureSection s={s} p={p} set={set} />
        </div>
        <Summary s={s} p={p} product={product} name={name} setName={v => { setName(v); setTouched(true) }}
          reroll={() => { if (product) { setName(randomBrandName(product, name)); setTouched(true); playSfx('pop') } }}
          check={check} cost={cost} onStart={start} />
      </div>
    </DialogFrame>
  )
}

type SecProps = { s: GameState; p: Picks; set: (patch: Partial<Picks>) => void }

function Section({ n, title, hint, children, className }: { n: number; title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('l-nl-sec', className)}>
      <h3><span className="l-step">{n}</span>{title}{hint && <small>{hint}</small>}</h3>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 1 · Product
// ---------------------------------------------------------------------------
function ProductSection({ s, p, set }: SecProps) {
  const locked = !s.unlocked.niches.includes(p.niche)
  const products = useMemo(() => productsByNiche(p.niche), [p.niche])
  const hint = locked ? researchHint(s, 'niche', p.niche) : null
  const nicheTrend = trendsFor(s, { niche: p.niche })[0]
  return (
    <Section n={1} title="Product" hint={NICHES[p.niche].blurb}>
      <div className="l-niches" role="tablist" aria-label="Niche">
        {NICHE_IDS.map(n => {
          const lk = !s.unlocked.niches.includes(n)
          const tr = trendsFor(s, { niche: n }).length > 0
          return (
            <button key={n} type="button" role="tab" aria-selected={p.niche === n} className={clsx('l-niche', p.niche === n && 'on', lk && 'locked')}
              onClick={() => set({ niche: n })} data-tip={lk ? researchHint(s, 'niche', n).text : `${NICHES[n].name}: ${productsByNiche(n).length} products`} data-tip-pos="bottom">
              <span>{NICHES[n].icon}</span>{NICHES[n].name}{lk && <Lock size={11} />}{tr && !lk && <em className="l-hot">📈</em>}
            </button>
          )
        })}
      </div>
      {locked && hint && (
        <div className="l-lockbar">
          <Lock size={15} /> <span><b>{NICHES[p.niche].name} is locked.</b> {hint.text}</span>
          <Button size="sm" variant={hint.ready ? 'primary' : 'secondary'} onClick={() => openDialog('research')}><FlaskConical size={14} /> Lab</Button>
        </div>
      )}
      {nicheTrend && !locked && <div className="l-trendbar">📈 <b>{nicheTrend.label}</b> — {NICHES[p.niche].name} demand ×{nicheTrend.mult.toFixed(2)} for now</div>}
      <div className={clsx('l-prods', locked && 'locked')}>
        {products.map(pr => <ProductCard key={pr.id} s={s} pr={pr} p={p} locked={locked} onPick={() => { set({ productId: pr.id }); playSfx('pop') }} />)}
      </div>
    </Section>
  )
}

function ProductCard({ s, pr, p, locked, onPick }: { s: GameState; pr: Product; p: Picks; locked: boolean; onPick: () => void }) {
  const sel = p.productId === pr.id
  const comp = competitionLabel(pr)
  const trend = trendLabel(pr)
  const times = timesLaunched(s, pr.id)
  const season = seasonDemand(s, pr.id, s.day)
  const known = s.playbook.combos[`pa:${pr.id}:${p.angle}`] as ComboRating | undefined
  return (
    <button type="button" className={clsx('l-prod', sel && 'sel', locked && 'locked')} disabled={locked} onClick={onPick} aria-pressed={sel}>
      <div className="l-prod-img">
        <ProductThumb productId={pr.id} size={92} rounded={10} />
        {known && <span className="l-prod-known"><ComboChip rating={known} tip={`Playbook: ${RATING_WORD[known]} with ${ANGLES[p.angle].name}`} /></span>}
        {times > 0 && <span className="l-prod-times" data-tip={`Launched ${times}× before: its audience is partly tapped out`}>🔁 ×{times}</span>}
      </div>
      <div className="l-prod-name">{pr.name}</div>
      <div className="l-prod-price">
        <b>{usdC(priceFor(pr, p.tier))}</b>
        {pr.amazonPrice != null && <span className="l-amazin" data-tip="What the same-ish thing sells for on Amazin. Price way above it and shoppers comparison-shop.">Amazin {usdC(pr.amazonPrice)}</span>}
      </div>
      <div className="l-prod-tags">
        <span className={clsx('l-mini', comp.tone)} data-tip={`Competition: ${comp.label}. Crowded markets convert worse.`}>⚔️ {comp.label}</span>
        <span className="l-mini" data-tip={`Demand trend: ${trend.label}`}>{trend.arrow} {trend.label}</span>
        {season >= 1.15 && <span className="l-mini good" data-tip="In season right now: demand is up">🔥 Season</span>}
        {season <= 0.85 && <span className="l-mini cold" data-tip="Off season right now: demand is down">❄️ Off</span>}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// 2 · Angle
// ---------------------------------------------------------------------------
function AngleSection({ s, p, product, set }: SecProps & { product: Product | null }) {
  const known = (a: AngleId) => (product ? s.playbook.combos[`pa:${product.id}:${a}`] as ComboRating | undefined : undefined)
  const trendAngles = new Set(ANGLE_IDS.filter(a => trendsFor(s, { angle: a }).length > 0))
  return (
    <Section n={2} title="Angle" hint="the reason to buy: your ads' whole pitch">
      <div className="l-opts">
        {ANGLE_IDS.map(a => {
          const def = ANGLES[a]
          const lk = !s.unlocked.angles.includes(a)
          const k = known(a)
          return (
            <button key={a} type="button" className={clsx('l-opt', p.angle === a && 'sel', lk && 'locked')} style={{ ['--ac' as string]: def.color }}
              aria-pressed={p.angle === a} aria-disabled={lk}
              onClick={() => { if (lk) { playSfx('error'); return } set({ angle: a }); playSfx('pop') }}
              data-tip={lk ? '' : `${def.example}\nWants: ${def.wants}`}>
              <span className="l-opt-ic">{def.icon}</span>
              <span className="l-opt-main">
                <b>{def.name}{trendAngles.has(a) && !lk && <em className="l-hot"> 📈</em>}</b>
                <small>{lk ? researchHint(s, 'angle', a).text : def.blurb}</small>
              </span>
              {!lk && product && <ComboChip rating={k} tip={k ? `Playbook: ${product.name} × ${def.name} = ${RATING_WORD[k]}` : 'Unknown: launch it to find out'} />}
              {lk && <Lock size={14} className="l-opt-lock" />}
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// 3 · Platform
// ---------------------------------------------------------------------------
function PlatformSection({ s, p, product, set }: SecProps & { product: Product | null }) {
  return (
    <Section n={3} title="Platform" hint="where the ads run and who sees them">
      <div className="l-opts">
        {PLATFORM_IDS.map(pl => {
          const def = PLATFORMS[pl]
          const available = s.market.platforms[pl]?.available !== false
          const lk = !s.unlocked.platforms.includes(pl)
          const lockText = !available ? '📰 Not launched yet. Watch the news.' : researchHint(s, 'platform', pl).text
          const ap = s.playbook.combos[`ap:${p.angle}:${pl}`] as ComboRating | undefined
          const np = product ? knownCombosFor(s, product.id, p.angle, pl) : null
          const trending = trendsFor(s, { platform: pl }).length > 0
          return (
            <button key={pl} type="button" className={clsx('l-opt', p.platform === pl && 'sel', lk && 'locked')} style={{ ['--ac' as string]: def.color }}
              aria-pressed={p.platform === pl} aria-disabled={lk}
              onClick={() => { if (lk) { playSfx('error'); return } set({ platform: pl }); playSfx('pop') }}
              data-tip={lk ? '' : `${def.audience}\nCPM ≈ $${def.cpm} per 1,000 views · avg CTR ${(def.baseCtr * 100).toFixed(1)}%`}>
              <span className="l-opt-ic">{def.icon}</span>
              <span className="l-opt-main">
                <b>{def.name}{trending && !lk && <em className="l-hot"> 📈</em>}</b>
                <small>{lk ? lockText : def.blurb}</small>
              </span>
              {!lk && (
                <span className="l-opt-chips">
                  <ComboChip rating={ap} label="pitch" tip={ap ? `Playbook: ${ANGLES[p.angle].name} ads on ${def.name} = ${RATING_WORD[ap]}` : `${ANGLES[p.angle].name} ads on ${def.name}: unknown`} />
                  {product && <ComboChip rating={np?.nichePlatform} typical={np?.nicheTypical} label="buyers"
                    tip={np?.nichePlatform ? `Playbook: ${np.nicheTypical ? `${NICHES[product.niche].name} buyers (typical)` : product.name + ' buyers'} on ${def.name} = ${RATING_WORD[np.nichePlatform]}` : `${product.name} buyers on ${def.name}: unknown`} />}
                </span>
              )}
              {lk && <Lock size={14} className="l-opt-lock" />}
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// 4 · Size, 5 · Price tier
// ---------------------------------------------------------------------------
function SizeSection({ s, p, set }: SecProps) {
  return (
    <Section n={4} title="Size" className="l-nl-size">
      <div className="l-opts compact">
        {SIZE_IDS.map(z => {
          const def = SIZES[z]
          const researched = s.unlocked.sizes.includes(z)
          const officeOk = s.office >= def.minOffice
          const lk = !researched || !officeOk
          const why = !researched ? researchHint(s, 'size', z).text : !officeOk ? `🏠 Needs office: ${officeLabel(def.minOffice)}` : ''
          const up = upfrontCost(s, z)
          const days = lk ? def.devDays : devDaysFor(s, z)
          const team = lk ? def.maxTeam : launchTeam(s, z).length
          return (
            <button key={z} type="button" className={clsx('l-opt size', p.size === z && 'sel', lk && 'locked')} aria-pressed={p.size === z} aria-disabled={lk}
              onClick={() => { if (lk) { playSfx('error'); return } set({ size: z }); playSfx('pop') }} data-tip={lk ? '' : def.blurb}>
              <span className="l-opt-ic">{def.icon}</span>
              <span className="l-opt-main">
                <b>{def.name}</b>
                <small>{lk ? why : `${usd(up)} + ${usd(def.weeklyBudget)}/wk ads`}</small>
                {!lk && <small className="l-opt-meta">⏱ {days}d · 👥 {team}/{def.maxTeam}</small>}
              </span>
              {lk && <Lock size={14} className="l-opt-lock" />}
            </button>
          )
        })}
      </div>
    </Section>
  )
}

function TierSection({ s, p, product, set }: SecProps & { product: Product | null }) {
  return (
    <Section n={5} title="Price" className="l-nl-tier">
      <div className="l-opts compact">
        {PRICE_TIER_IDS.map(t => {
          const def = PRICE_TIERS[t]
          const econ = product ? previewEconomics(s, product.id, t, p.size, p.feats) : null
          return (
            <button key={t} type="button" className={clsx('l-opt tier', p.tier === t && 'sel')} aria-pressed={p.tier === t}
              onClick={() => { set({ tier: t }); playSfx('pop') }} data-tip={def.blurb}>
              <span className="l-opt-ic">{def.icon}</span>
              <span className="l-opt-main">
                <b>{def.name}{econ && <span className="l-tier-price"> {usdC(econ.price)}</span>}</b>
                <small>{econ ? `Margin ${usdC(econ.marginPerOrder)} · break-even ROAS ${x2(econ.breakEvenRoas)}` : def.blurb}</small>
              </span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// 6 · Store apps
// ---------------------------------------------------------------------------
function FeatureSection({ s, p, set }: SecProps) {
  const owned = s.unlocked.features
  const monthly = p.feats.reduce((a, f) => a + (FEATURES[f]?.monthly ?? 0), 0)
  return (
    <Section n={6} title="Store apps" hint={owned.length ? `ON apps help every launch and bill ${usd(monthly)}/mo` : undefined}>
      {owned.length === 0 ? (
        <div className="l-empty-note">🧩 No store apps yet. Research a <b>Reviews app</b> or <b>Trust badges</b> in the 🧪 Lab: cheap conversion boosts.</div>
      ) : (
        <div className="l-feats">
          {owned.map(f => {
            const def = FEATURES[f]
            if (!def) return null
            const on = p.feats.includes(f)
            return (
              <div key={f} className={clsx('l-feat', on && 'on')} data-tip={def.blurb}>
                <span className="l-feat-ic">{def.emoji}</span>
                <span className="l-feat-main"><b>{def.name}</b><small>{def.effect} · {usd(def.monthly)}/mo</small></span>
                <Toggle checked={on} onChange={v => set({ feats: v ? [...p.feats, f] : p.feats.filter(x => x !== f) })} />
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Summary (sticky)
// ---------------------------------------------------------------------------
function Summary({ s, p, product, name, setName, reroll, check, cost, onStart }: {
  s: GameState; p: Picks; product: Product | null; name: string; setName: (v: string) => void; reroll: () => void
  check: { ok: boolean; reason?: string }; cost: ReturnType<typeof launchCostBreakdown>; onStart: () => void
}) {
  const angle = ANGLES[p.angle]
  const plat = PLATFORMS[p.platform]
  const known = product ? knownCombosFor(s, product.id, p.angle, p.platform) : null
  const econ = product ? previewEconomics(s, product.id, p.tier, p.size, p.feats) : null
  const times = product ? timesLaunched(s, product.id) : 0
  const trends = trendsFor(s, { niche: product?.niche ?? p.niche, angle: p.angle, platform: p.platform })
  const cashAfter = s.cash - cost.upfront
  const season = product ? seasonDemand(s, product.id, s.day) : 1

  // 📊 Data dashboard (paid research): a coarse product × angle hint for niches you have sold in before
  const dashHint = useMemo(() => {
    if (!product || known?.productAngle || !comboHintsEnabled(s)) return null
    const soldHere = Object.entries(s.playbook.launchedProducts).some(([id, n]) => n > 0 && findProduct(id)?.niche === product.niche)
    if (!soldHere) return null
    const r = productAngleRating(product, p.angle)
    return r === 'great' || r === 'good' ? '👍 looks promising' : r === 'bad' ? '👎 looks risky' : '🤷 hard to call'
  }, [s, product, known?.productAngle, p.angle])

  const warnings: { tone: 'good' | 'warn' | 'bad'; text: ReactNode }[] = []
  for (const t of trends) warnings.push({ tone: 'good', text: <>📈 <b>{t.label}</b>: demand ×{t.mult.toFixed(2)}</> })
  if (product && season >= 1.15) warnings.push({ tone: 'good', text: <>🔥 In season: demand is up right now</> })
  if (product && season <= 0.85) warnings.push({ tone: 'warn', text: <>❄️ Off season: demand is down right now</> })
  if (times > 0) warnings.push({ tone: 'warn', text: <>🔁 Launched {times}× before: its audience is partly tapped out</> })
  if (econ && econ.breakEvenRoas >= 2.6) warnings.push({ tone: 'bad', text: <>🧮 Thin margin: ads must return {x2(econ.breakEvenRoas)}× just to break even</> })
  if (s.dayJob.employed) warnings.push({ tone: 'warn', text: <>🍔 McDoodle's shifts: dev takes 1.5× longer, you work at half speed</> })
  if (check.ok && cashAfter < cost.weeklyAds * 2) warnings.push({ tone: 'bad', text: <>💸 Tight: {usd(cashAfter)} left after upfront, ads cost {usd(cost.weeklyAds)}/wk once live</> })

  return (
    <aside className="l-nl-sum">
      <div className="l-sum-scroll">
        <div className="l-sum-hero">
          {product ? <ProductThumb productId={product.id} size={92} rounded={16} className="l-sum-img" key={product.id} /> : <div className="l-sum-img empty">👈<small>Pick a product</small></div>}
          <div className="l-sum-id">
            <label className="l-name-field">
              <span>Launch name</span>
              <div className="l-name-row">
                <input value={name} maxLength={40} placeholder={product ? 'Name your launch' : 'Pick a product first'} disabled={!product}
                  onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onStart() }} />
                <button type="button" className="l-dice" onClick={reroll} disabled={!product} aria-label="Random brand name" data-tip="Random brand name"><Dices size={18} /></button>
              </div>
            </label>
            <div className="l-sum-product">{product ? product.name : 'No product yet'}</div>
            {product && <div className="l-sum-traits">{productTraits(product).slice(0, 4).map(t => <span key={t}>{t}</span>)}</div>}
          </div>
        </div>

        <div className="l-sum-picks">
          <span style={{ ['--ac' as string]: angle.color }}>{angle.icon} {angle.name}</span>
          <span style={{ ['--ac' as string]: plat.color }}>{plat.icon} {plat.short}</span>
          <span>{SIZES[p.size].icon} {SIZES[p.size].name.replace(' Launch', '')}</span>
          <span>{PRICE_TIERS[p.tier].icon} {PRICE_TIERS[p.tier].name}</span>
        </div>

        <div className="l-sum-box">
          <div className="l-sum-box-title">📒 Playbook knowledge <span className="l-legend" data-tip={'✓✓ great · ✓ good · ~ so-so · ✗ bad · ? not discovered yet\nPost-mortems reveal the combos you launch.'}>?</span></div>
          <KnowRow label="Product × Angle" rating={known?.productAngle} note={dashHint ? `📊 Dashboard: ${dashHint}` : undefined} />
          <KnowRow label="Angle × Platform" rating={s.playbook.combos[`ap:${p.angle}:${p.platform}`] as ComboRating | undefined} />
          <KnowRow label="Buyers × Platform" rating={known?.nichePlatform} typical={known?.nicheTypical} note={known?.nicheTypical ? `typical for ${NICHES[product?.niche ?? p.niche].name}` : undefined} />
        </div>

        {econ && (
          <div className="l-sum-grid">
            <Stat label="Price" value={usdC(econ.price)} tip="What customers pay" />
            <Stat label="Unit cost" value={usdC(econ.landed)} tip="Landed cost per unit: product + shipping + 25% duty" />
            <Stat label="Margin" value={usdC(econ.marginPerOrder)} tone={econ.marginPerOrder < 8 ? 'bad' : 'good'} tip="What's left per order after product, shipping and payment fees, before ads" />
            <Stat label="BE ROAS" value={x2(econ.breakEvenRoas)} tone={econ.breakEvenRoas <= 1.7 ? 'good' : econ.breakEvenRoas <= 2.3 ? 'warn' : 'bad'} tip="Break-even ROAS: every $1 of ads must bring back this much revenue just to break even. Lower is easier." />
          </div>
        )}
        <div className="l-sum-grid">
          <Stat label="Upfront" value={usdK(cost.upfront)} tip={`${usd(cost.upfront)}: samples, store setup and first stock`} />
          <Stat label="Ads / wk" value={usdK(cost.weeklyAds)} tip={`${usd(cost.weeklyAds)} weekly ad budget once the launch is live`} />
          <Stat label="Dev" value={`${cost.devDays}d`} tip={`${cost.devDays} working days (about ${cost.devWeeks} in-game week${cost.devWeeks === 1 ? '' : 's'})`} />
          <Stat label="Team" value={`👥 ${cost.team}`} tip="Founder + your strongest free staff, up to the size's team limit" />
        </div>

        {warnings.length > 0 && (
          <ul className="l-sum-warn">{warnings.map((w, i) => <li key={i} className={w.tone}>{w.text}</li>)}</ul>
        )}
      </div>

      <div className="l-sum-go">
        <Button variant="gold" size="lg" className="l-start" disabled={!check.ok} onClick={onStart}><Rocket size={18} /> Start development</Button>
        <div className={clsx('l-sum-reason', check.ok ? 'ok' : 'no')}>{check.ok ? `Cash after upfront: ${usd(cashAfter)}` : check.reason}</div>
      </div>
    </aside>
  )
}

function KnowRow({ label, rating, typical, note }: { label: string; rating?: ComboRating; typical?: boolean; note?: string }) {
  return (
    <div className="l-know">
      <span className="l-know-label">{label}</span>
      {note && <em>{note}</em>}
      <ComboChip rating={rating} typical={typical} label={rating ? RATING_WORD[rating] : 'Unknown'} />
    </div>
  )
}

function Stat({ label, value, tone, tip }: { label: string; value: ReactNode; tone?: 'good' | 'warn' | 'bad'; tip?: string }) {
  return (
    <div className={clsx('l-stat', tone)} data-tip={tip ?? ''}>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  )
}
