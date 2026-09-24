// Title screen: animated logo over the town, Continue / New game / Load (3 slots, import/export/delete) / Settings.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Dice5, Download, FolderOpen, Play, Settings, Trash, Upload } from 'lucide-react'
import { openDialog } from '../../core/ui'
import { productImage, roomImage } from '../../core/assets'
import { deleteSave, exportSave, importSave, listSaves, loadGame, saveGame, SLOT_COUNT, type SaveMeta } from '../../core/save'
import { money } from '../../core/format'
import { formatDate } from '../../core/time'
import type { Difficulty } from '../../core/types'
import { createNewGame } from '../../sim/newGame'
import { Button } from '../kit'
import { playSfx } from '../audio'
import { enterGame, useTitleNav } from './nav'
import { randomCompany, randomFounder, timeAgo } from './names'
import { presetLook } from '../../three/looks'
import type { Look } from '../../three/types'
import { use3d } from './three3d'

// the 3D parts (three.js) load on demand; the painted still shows until they're ready
const TitleCity = lazy(() => import('./TitleCity'))
const LookEditor = lazy(() => import('./LookEditor'))

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------
function Bolt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 100" aria-hidden="true">
      <defs>
        <linearGradient id="m-bolt-g" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff3a0" />
          <stop offset=".45" stopColor="#ffc53d" />
          <stop offset="1" stopColor="#ff7a45" />
        </linearGradient>
      </defs>
      <path d="M40 2 L6 56 H30 L20 98 L58 38 H34 L46 2 Z" fill="url(#m-bolt-g)" stroke="#3a1d7a" strokeWidth="5" strokeLinejoin="round" />
      <path d="M38 10 L16 50 H24" fill="none" stroke="#fffbe0" strokeWidth="4" strokeLinecap="round" opacity=".8" />
    </svg>
  )
}

export function Logo({ small }: { small?: boolean }) {
  const word = 'HUSTLE'
  return (
    <div className={clsx('m-logo', small && 'small')} aria-label="Hustle Tycoon" role="img">
      <div className="m-logo-top">
        {word.split('').map((ch, i) => (
          <span key={i} className="m-logo-ch" style={{ animationDelay: `${i * 0.09}s` }}>{ch}</span>
        ))}
        <Bolt className="m-logo-bolt" />
      </div>
      <div className="m-logo-ribbon"><span>TYCOON</span></div>
    </div>
  )
}

/** Product bubbles drifting in the sky around the logo (left/top in %, size in px). */
const FLOATERS: [string, number, number, number][] = [
  ['galaxy-projector', 5, 9, 70], ['portable-blender', 16, 24, 58], ['cat-laser-toy', 4, 36, 62], ['led-face-mask', 24, 6, 54], ['moon-lamp', 21, 40, 74],
  ['mini-massage-gun', 73, 5, 56], ['sunset-lamp', 85, 15, 76], ['dog-lick-mat', 94, 32, 58], ['milk-frother', 87, 45, 64], ['ring-light', 2, 55, 52],
]

function Floaters() {
  const items = useMemo(
    () => FLOATERS.map(([id, left, top, size], i) => ({ id, left, top, size, dur: 6 + ((i * 7) % 5), delay: -(i * 1.7) })),
    [],
  )
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  return (
    <div className="m-floaters" aria-hidden="true">
      {items.map(f =>
        hidden[f.id] ? null : (
          <div key={f.id} className="m-floater" style={{ left: `${f.left}%`, top: `${f.top}%`, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }}>
            <img src={productImage(f.id)} alt="" draggable={false} onError={() => setHidden(h => ({ ...h, [f.id]: true }))} />
          </div>
        ),
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------
function useSaves() {
  const [saves, setSaves] = useState<(SaveMeta | null)[] | null>(null)
  const refresh = useCallback(async () => {
    try { setSaves(await listSaves()) } catch { setSaves(Array.from({ length: SLOT_COUNT }, () => null)) }
  }, [])
  return { saves, refresh }
}

const DIFF: { id: Difficulty; name: string; icon: string; cash: string; lines: string[] }[] = [
  { id: 'easy', name: 'Side Hustle', icon: '🌱', cash: '$4,000', lines: ['Chill market expectations', 'Mom’s couch is always open'] },
  { id: 'normal', name: 'Full Send', icon: '⚡', cash: '$2,000', lines: ['The intended hustle', 'Mom will take you back'] },
  { id: 'hard', name: 'No Safety Net', icon: '🔥', cash: '$1,000', lines: ['Picky market from day one', 'Go bust = game over'] },
]

function NewGamePanel({ saves, onBack, onStep }: { saves: (SaveMeta | null)[]; onBack: () => void; onStep?: (step: 'info' | 'look') => void }) {
  const can3d = use3d()
  const [step, setStepRaw] = useState<'info' | 'look'>('info')
  const setStep = (st: 'info' | 'look') => { setStepRaw(st); onStep?.(st) }
  useEffect(() => () => onStep?.('info'), [onStep])
  const [look, setLook] = useState<Look>(() => presetLook('founder'))
  const [company, setCompany] = useState(() => randomCompany())
  const [founder, setFounder] = useState(() => randomFounder())
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const firstEmpty = saves.findIndex(s => !s)
  const [slot, setSlot] = useState(firstEmpty >= 0 ? firstEmpty : 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const taken = saves[slot]
  const start = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const st = createNewGame({ company: company.trim() || 'Hustle Co.', founder: founder.trim() || 'You', difficulty, look })
      playSfx('launch')
      await enterGame(st, slot)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
      playSfx('error')
    }
  }
  const clockIn = <Button type="submit" variant="gold" size="lg" disabled={busy}>{taken ? 'Overwrite & clock in ⚡' : 'Clock in ⚡'}</Button>
  if (step === 'look' && can3d) {
    return (
      <form className="m-tpanel k-panel m-tpanel-look" onSubmit={e => { e.preventDefault(); void start() }}>
        <div className="m-tpanel-head">
          <h2>Your look</h2>
          <p className="k-muted">{(founder.trim() || 'You')} at {company.trim() || 'Hustle Co.'}. Dress for the hustle you want.</p>
        </div>
        <Suspense fallback={<div className="m-look-wait" />}><LookEditor look={look} onChange={setLook} /></Suspense>
        {err && <div className="m-warn bad">😵 {err}</div>}
        <div className="m-tpanel-foot">
          <Button variant="ghost" onClick={() => setStep('info')}>← Back</Button>
          {clockIn}
        </div>
      </form>
    )
  }
  return (
    <form className="m-tpanel k-panel" onSubmit={e => { e.preventDefault(); void start() }}>
      <div className="m-tpanel-head">
        <h2>Start a new hustle</h2>
        <p className="k-muted">Mom’s basement. One laptop. A McDoodle’s name tag. Let’s go.</p>
      </div>
      <div className="m-form-row">
        <label className="m-field">
          <span>Company name</span>
          <div className="m-input-wrap">
            <input value={company} maxLength={32} onChange={e => setCompany(e.target.value)} placeholder="Your store name" />
            <button type="button" className="m-dice" aria-label="Random company name" data-tip="Random name" onClick={() => setCompany(c => randomCompany(c))}><Dice5 size={18} /></button>
          </div>
        </label>
        <label className="m-field">
          <span>Founder</span>
          <div className="m-input-wrap">
            <input value={founder} maxLength={20} onChange={e => setFounder(e.target.value)} placeholder="Your name" />
            <button type="button" className="m-dice" aria-label="Random founder name" data-tip="Random name" onClick={() => setFounder(f => randomFounder(f))}><Dice5 size={18} /></button>
          </div>
        </label>
      </div>
      <div className="m-field"><span>Difficulty</span></div>
      <div className="m-diffs" role="radiogroup" aria-label="Difficulty">
        {DIFF.map(d => (
          <button key={d.id} type="button" role="radio" aria-checked={difficulty === d.id} className={clsx('m-diff', `d-${d.id}`, difficulty === d.id && 'on')} onClick={() => setDifficulty(d.id)}>
            <span className="m-diff-icon">{d.icon}</span>
            <span className="m-diff-name">{d.name}</span>
            <span className="m-diff-cash">{d.cash} start</span>
            {d.lines.map(l => <span key={l} className="m-diff-line">{l}</span>)}
          </button>
        ))}
      </div>
      <div className="m-field"><span>Save slot</span></div>
      <div className="m-slotpick" role="radiogroup" aria-label="Save slot">
        {saves.map((s, i) => (
          <button key={i} type="button" role="radio" aria-checked={slot === i} className={clsx('m-slotchip', slot === i && 'on', s && 'used')} onClick={() => setSlot(i)}>
            <b>Slot {i + 1}</b>
            <span>{s ? `${s.company} · ${formatDate(s.day)}` : 'Empty'}</span>
          </button>
        ))}
      </div>
      {taken && <div className="m-warn">⚠️ Slot {slot + 1} has “{taken.company}”. Starting here overwrites it.</div>}
      {err && <div className="m-warn bad">😵 {err}</div>}
      <div className="m-tpanel-foot">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        {can3d && <Button variant="secondary" size="lg" className="m-look-next" onClick={() => setStep('look')}>👕 Your look</Button>}
        {clockIn}
      </div>
    </form>
  )
}

function LoadPanel({ saves, refresh, onBack }: { saves: (SaveMeta | null)[]; refresh: () => Promise<void>; onBack: () => void }) {
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [status, setStatus] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const importSlot = useRef(0)
  const say = (tone: 'good' | 'bad', text: string) => { setStatus({ tone, text }); playSfx(tone === 'good' ? 'ping' : 'error') }

  const load = async (i: number) => {
    if (busy) return
    setBusy(true)
    try {
      const st = await loadGame(i)
      if (!st) throw new Error('That slot is empty')
      await enterGame(st, i)
    } catch (e) {
      say('bad', e instanceof Error ? e.message : 'Could not load that save')
      setBusy(false)
    }
  }
  const doExport = async (i: number) => {
    try {
      const st = await loadGame(i)
      if (!st) throw new Error('That slot is empty')
      exportSave(st)
      say('good', `Exported slot ${i + 1} as a .json file.`)
    } catch (e) {
      say('bad', e instanceof Error ? e.message : 'Export failed')
    }
  }
  const pickImport = (i: number) => {
    importSlot.current = i
    fileRef.current?.click()
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const i = importSlot.current
    try {
      const st = await importSave(f)
      await saveGame(i, st)
      await refresh()
      say('good', `Imported “${st.meta.company}” into slot ${i + 1}.`)
    } catch (e) {
      say('bad', e instanceof Error ? e.message : 'That file is not a Hustle Tycoon save')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const del = async (i: number) => {
    try {
      await deleteSave(i)
      await refresh()
      say('good', `Slot ${i + 1} deleted.`)
    } catch {
      say('bad', 'Could not delete that save')
    }
    setConfirmDel(null)
  }

  return (
    <div className="m-tpanel k-panel">
      <div className="m-tpanel-head">
        <h2>Load game</h2>
        <p className="k-muted">Three slots. Autosaves every few seconds while you play.</p>
      </div>
      <div className="m-saves">
        {saves.map((s, i) => (
          <div key={i} className={clsx('m-save', !s && 'empty')}>
            <div className="m-save-num">{i + 1}</div>
            {s ? (
              <>
                <div className="m-save-info">
                  <div className="m-save-title">{s.company} <span className={clsx('m-save-diff', `d-${s.difficulty}`)}>{DIFF.find(d => d.id === s.difficulty)?.name ?? s.difficulty}</span></div>
                  <div className="m-save-meta">{s.founder} · {formatDate(s.day)} · <b className={s.cash < 0 ? 'neg' : ''}>{money(s.cash, { cents: false, compact: true })}</b></div>
                  <div className="m-save-ago">Saved {timeAgo(s.savedAt)}</div>
                </div>
                {confirmDel === i ? (
                  <div className="m-save-actions confirm">
                    <span>Delete forever?</span>
                    <Button size="sm" variant="danger" onClick={() => void del(i)}>Delete</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>Keep</Button>
                  </div>
                ) : (
                  <div className="m-save-actions">
                    <Button size="sm" variant="primary" disabled={busy} onClick={() => void load(i)}><Play size={14} /> Load</Button>
                    <button type="button" className="m-icon-sq" aria-label={`Export slot ${i + 1}`} data-tip="Export .json" onClick={() => void doExport(i)}><Download size={16} /></button>
                    <button type="button" className="m-icon-sq" aria-label={`Import into slot ${i + 1} (overwrites)`} data-tip="Import (overwrites)" onClick={() => pickImport(i)}><Upload size={16} /></button>
                    <button type="button" className="m-icon-sq danger" aria-label={`Delete slot ${i + 1}`} data-tip="Delete" onClick={() => setConfirmDel(i)}><Trash size={16} /></button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="m-save-info"><div className="m-save-title k-muted">Empty slot</div><div className="m-save-ago">Start a new game here, or import a save file.</div></div>
                <div className="m-save-actions">
                  <Button size="sm" variant="secondary" onClick={() => pickImport(i)}><Upload size={14} /> Import</Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {status && <div className={clsx('m-warn', status.tone === 'bad' ? 'bad' : 'good')} role="status">{status.text}</div>}
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => void onFile(e.target.files?.[0])} />
      <div className="m-tpanel-foot">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function TitleScreen() {
  const panel = useTitleNav(s => s.panel)
  const setPanel = useTitleNav(s => s.set)
  const { saves, refresh } = useSaves()
  const [bgOk, setBgOk] = useState(true)
  const [busy, setBusy] = useState(false)
  const live = use3d()
  const [cityReady, setCityReady] = useState(false)
  const [lookStep, setLookStep] = useState(false)
  const onStep = useCallback((st: 'info' | 'look') => setLookStep(st === 'look'), [])
  useEffect(() => { void refresh() }, [panel, refresh])

  const latest = useMemo(() => {
    const list = (saves ?? []).filter((s): s is SaveMeta => !!s)
    return list.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null
  }, [saves])

  const cont = async () => {
    if (!latest || busy) return
    setBusy(true)
    try {
      const st = await loadGame(latest.slot)
      if (!st) throw new Error('missing')
      await enterGame(st, latest.slot)
    } catch {
      setBusy(false)
      setPanel('load')
    }
  }

  return (
    <div className={clsx('m-title', panel !== 'menu' && 'focus')}>
      {bgOk && !(live && cityReady) && <img className="m-title-bg" src={roomImage('title')} alt="" onError={() => setBgOk(false)} draggable={false} />}
      {live && <Suspense fallback={null}><TitleCity active={!lookStep} onReady={() => setCityReady(true)} /></Suspense>}
      <div className="m-title-sky" aria-hidden="true" />
      <Floaters />
      <div className="m-title-inner">
        <div className="m-title-head">
          <Logo small={panel !== 'menu'} />
          {panel === 'menu' && <p className="m-tagline">From the McDoodle’s fryer to a penthouse HQ, one product launch at a time.</p>}
        </div>

        {panel === 'menu' && (
          <nav className="m-menu" aria-label="Main menu">
            {latest && (
              <button type="button" className="m-menu-btn cont" disabled={busy} onClick={() => void cont()}>
                <span className="m-menu-ic">▶</span>
                <span className="m-menu-txt">
                  <b>Continue</b>
                  <small>{latest.company} · {formatDate(latest.day)} · {money(latest.cash, { cents: false, compact: true })}</small>
                </span>
              </button>
            )}
            <button type="button" className={clsx('m-menu-btn', !latest && 'cont')} onClick={() => setPanel('new')}>
              <span className="m-menu-ic">⚡</span>
              <span className="m-menu-txt"><b>New game</b><small>Start in Mom’s basement</small></span>
            </button>
            <button type="button" className="m-menu-btn" onClick={() => setPanel('load')}>
              <span className="m-menu-ic"><FolderOpen size={20} /></span>
              <span className="m-menu-txt"><b>Load</b><small>{saves ? `${saves.filter(Boolean).length}/${SLOT_COUNT} slots used` : 'Checking saves…'}</small></span>
            </button>
            <button type="button" className="m-menu-btn" onClick={() => openDialog('settings')}>
              <span className="m-menu-ic"><Settings size={20} /></span>
              <span className="m-menu-txt"><b>Settings</b><small>Sound, music & graphics</small></span>
            </button>
          </nav>
        )}
        {panel === 'new' && saves && <NewGamePanel saves={saves} onBack={() => setPanel('menu')} onStep={onStep} />}
        {panel === 'load' && saves && <LoadPanel saves={saves} refresh={refresh} onBack={() => setPanel('menu')} />}
      </div>
      <footer className="m-credits">
        <span>Hustle Tycoon · a cozy e-commerce tycoon</span>
        <span className="m-credits-dot">•</span>
        <span>All brands are parodies</span>
        <span className="m-credits-dot">•</span>
        <span>Not financial advice, just fries</span>
      </footer>
    </div>
  )
}
