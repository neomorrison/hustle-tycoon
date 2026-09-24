// Sims-style Look editor for the founder: live 3D preview on the studio pedestal (drag to turn) + compact controls.
// Used by the New game "Look" step and Settings → Edit look. Without WebGL it shows the founder portrait instead.
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Dice5, RotateCcw, RotateCw } from 'lucide-react'
import { useStage } from '../../three/react'
import { ACCESSORIES, HAIR_STYLES, LOOK_PRESETS, presetLook, resolveLook, type Accessory, type HairStyle, type Look, type TopStyle } from '../../three'
import { founderPortrait } from '../../core/assets'
import { Range } from '../kit'
import { exposeStage, stageUrl, useQuality } from './three3d'
import './office3d.css'

const SKIN = ['#f6d8c4', '#f0cdb4', '#e3b08d', '#d9a07a', '#c98e65', '#b57a55', '#a86f4c', '#7d4e34', '#6b4230', '#4a2e22']
const HAIR = ['#1f1a17', '#3f2a20', '#6f4b33', '#b8532e', '#e3c27a', '#eadcb5', '#dcd8d2', '#e7a6c9', '#6f8fbf', '#4f9a93']
const TOPS = ['#a7a3a0', '#efe4cf', '#f3f2ef', '#2b2d33', '#3e4f75', '#6f8fbf', '#4f9a93', '#8fae8a', '#e2b24c', '#e88c73', '#d99a9a', '#a693c9', '#d8352a']
const BOTTOMS = ['#3e4f75', '#2b2d33', '#3c4048', '#4f5a6b', '#6f8fbf', '#a7a3a0', '#b9a58a', '#6f4b33', '#8fae8a']
const SHOES = ['#f3f2ef', '#2b2d33', '#6f4b33', '#b07e55', '#e88c73', '#6f8fbf', '#e2b24c']
const ACCENTS = ['#d8352a', '#f5c342', '#2b2d33', '#f3f2ef', '#3e4f75', '#6f8fbf', '#4f9a93', '#c3b3e0', '#e88c73', '#d99a9a']

const PRESETS = ['founder', 'p01', 'p02', 'p03', 'p05', 'p07', 'p09', 'p10', 'p11', 'p13', 'p15', 'p17']
const HAIR_LABEL: Record<HairStyle, string> = {
  short: 'Short', messy: 'Messy', long: 'Long', bun: 'Bun', braids: 'Braids', afro: 'Afro', buzz: 'Buzz', curly: 'Curly', ponytail: 'Ponytail', bob: 'Bob', bald: 'Bald',
}
const TOP_STYLES: [TopStyle, string][] = [['tee', 'Tee'], ['hoodie', 'Hoodie'], ['polo', 'Polo'], ['blazer', 'Blazer'], ['sweater', 'Sweater'], ['uniform', '🍔 Uniform']]
const ACC_LABEL: Record<Accessory, string> = {
  glasses: '👓 Glasses', cap: '🧢 Cap', cap_back: '🧢 Backwards', beanie: '🧶 Beanie', flatcap: 'Flat cap', hijab: '🧕 Hijab',
  headphones: '🎧 Headphones', visor: 'Visor', scarf: '🧣 Scarf', beard: '🧔 Beard', apron: 'Apron',
}
const HATS: Accessory[] = ['cap', 'cap_back', 'beanie', 'flatcap', 'hijab', 'visor']
const COLOURED: Accessory[] = ['cap', 'cap_back', 'beanie', 'flatcap', 'hijab', 'headphones', 'visor', 'scarf', 'apron']

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length) % xs.length]

export function randomLook(): Look {
  const acc: Accessory[] = []
  if (Math.random() < 0.28) acc.push(pick(['cap', 'cap_back', 'beanie', 'flatcap'] as Accessory[]))
  if (Math.random() < 0.25) acc.push('glasses')
  if (Math.random() < 0.14) acc.push('headphones')
  if (Math.random() < 0.14) acc.push('beard')
  if (Math.random() < 0.08) acc.push('scarf')
  return resolveLook({
    skin: pick(SKIN), hair: pick(HAIR), hairStyle: pick(HAIR_STYLES.filter(h => h !== 'bald')), top: pick(TOPS),
    topStyle: pick(['tee', 'hoodie', 'polo', 'blazer', 'sweater'] as TopStyle[]), bottom: pick(BOTTOMS), shoes: pick(SHOES),
    acc, accColor: pick(ACCENTS), height: 0.94 + Math.random() * 0.12, build: 0.92 + Math.random() * 0.16,
  })
}

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="m-look-opts" role="radiogroup" aria-label={label}>
      {colors.map(c => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={`${label} ${c}`} className={clsx('m-sw', value === c && 'on')} style={{ ['--c' as string]: c }} onClick={() => onPick(c)} />
      ))}
    </div>
  )
}

function Preview({ look, active, wave }: { look: Look; active: boolean; wave: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const quality = useQuality()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const stage = useStage(ref, { url: stageUrl, quality, enabled: !failed, onReady: () => setReady(true), onError: () => setFailed(true) })
  const lookRef = useRef(look)
  lookRef.current = look
  useEffect(() => {
    if (!stage) return
    exposeStage('__lookStage', stage)
    stage.setTimeOfDay(13)
    void stage.setRoom('studio')
    stage.setActor('preview', { look: lookRef.current, name: 'You' })
    stage.task('preview', { kind: 'idle', at: 'spawn' })
    const t = window.setTimeout(() => stage.emote('preview', 'wave'), 900)
    return () => { window.clearTimeout(t); exposeStage('__lookStage', null) }
  }, [stage])
  useEffect(() => { stage?.setActor('preview', { look, name: 'You' }) }, [stage, look])
  useEffect(() => { if (wave) stage?.emote('preview', wave % 2 ? 'cheer' : 'wave') }, [stage, wave])
  useEffect(() => { stage?.setActive(active) }, [stage, active])
  return (
    <div className={clsx('m-look-preview', ready && !failed && 'on')}>
      <div className="m-look-fallback" aria-hidden="true"><img src={founderPortrait('happy')} alt="" draggable={false} /></div>
      {!failed && <canvas ref={ref} aria-label="Your founder, turn with a drag" role="img" />}
      {ready && !failed && (
        <>
          <div className="m-look-turn">
            <button type="button" aria-label="Turn left" onClick={() => stage?.rotate(-45)}><RotateCcw size={15} /></button>
            <button type="button" aria-label="Turn right" onClick={() => stage?.rotate(45)}><RotateCw size={15} /></button>
          </div>
          <div className="m-look-hint">Drag to spin</div>
        </>
      )}
    </div>
  )
}

/** The editor. `look` is controlled; every change calls onChange with a resolved look. */
export default function LookEditor({ look, onChange, active = true }: { look: Look; onChange: (l: Look) => void; active?: boolean }) {
  const [wave, setWave] = useState(0)
  const set = (p: Partial<Look>) => onChange(resolveLook({ ...look, ...p }))
  const acc = look.acc ?? []
  const toggle = (a: Accessory) => {
    const on = acc.includes(a)
    let next = on ? acc.filter(x => x !== a) : [...acc, a]
    if (!on && HATS.includes(a)) next = next.filter(x => x === a || !HATS.includes(x))
    set({ acc: next })
  }
  const presetId = PRESETS.find(id => JSON.stringify(presetLook(id)) === JSON.stringify(look))
  const accent = acc.some(a => COLOURED.includes(a))
  return (
    <div className="m-look">
      <Preview look={look} active={active} wave={wave} />
      <div className="m-look-ctl">
        <div className="m-look-row">
          <b>Presets</b>
          <div className="m-look-opts">
            {PRESETS.map(id => {
              const l = LOOK_PRESETS[id]
              return (
                <button key={id} type="button" aria-label={`Preset ${id}`} className={clsx('m-preset', presetId === id && 'on')}
                  style={{ ['--skin' as string]: l.skin, ['--hair' as string]: l.hair, ['--top' as string]: l.top }}
                  onClick={() => { onChange(presetLook(id)); setWave(w => w + 2) }} />
              )
            })}
            <button type="button" className="m-chip" onClick={() => { onChange(randomLook()); setWave(w => (w % 2 ? w + 2 : w + 1)) }}><Dice5 size={13} style={{ verticalAlign: '-2px' }} /> Surprise me</button>
          </div>
        </div>
        <div className="m-look-row"><b>Skin</b><Swatches label="Skin" colors={SKIN} value={look.skin} onPick={c => set({ skin: c })} /></div>
        <div className="m-look-row">
          <b>Hair</b>
          <div className="m-look-opts">
            {HAIR_STYLES.map(h => <button key={h} type="button" className={clsx('m-chip', look.hairStyle === h && 'on')} onClick={() => set({ hairStyle: h })}>{HAIR_LABEL[h]}</button>)}
          </div>
        </div>
        <div className="m-look-row"><b>Hair colour</b><Swatches label="Hair colour" colors={HAIR} value={look.hair} onPick={c => set({ hair: c })} /></div>
        <div className="m-look-row">
          <b>Top</b>
          <div className="m-look-opts">
            {TOP_STYLES.map(([t, l]) => <button key={t} type="button" className={clsx('m-chip', (look.topStyle ?? 'tee') === t && 'on')} onClick={() => set({ topStyle: t })}>{l}</button>)}
          </div>
        </div>
        <div className="m-look-row"><b>Top colour</b><Swatches label="Top colour" colors={TOPS} value={look.top} onPick={c => set({ top: c })} /></div>
        <div className="m-look-row"><b>Bottoms</b><Swatches label="Bottoms colour" colors={BOTTOMS} value={look.bottom} onPick={c => set({ bottom: c })} /></div>
        <div className="m-look-row"><b>Shoes</b><Swatches label="Shoes colour" colors={SHOES} value={look.shoes} onPick={c => set({ shoes: c })} /></div>
        <div className="m-look-row">
          <b>Extras</b>
          <div className="m-look-opts">
            {ACCESSORIES.map(a => <button key={a} type="button" aria-pressed={acc.includes(a)} className={clsx('m-chip', acc.includes(a) && 'on')} onClick={() => toggle(a)}>{ACC_LABEL[a]}</button>)}
          </div>
        </div>
        {accent && <div className="m-look-row"><b>Extras colour</b><Swatches label="Extras colour" colors={ACCENTS} value={look.accColor ?? look.top} onPick={c => set({ accColor: c })} /></div>}
        <div className="m-look-sliders">
          <label>Height<Range value={look.height ?? 1} min={0.9} max={1.1} step={0.01} onChange={v => set({ height: v })} label="Height" /></label>
          <label>Build<Range value={look.build ?? 1} min={0.85} max={1.2} step={0.01} onChange={v => set({ build: v })} label="Build" /></label>
        </div>
      </div>
    </div>
  )
}
