// The live 3D office: a three.js diorama of the current office tier with the founder and staff at their desks.
// DOM overlays (name tags = bubble anchors, the idea bubble, hover labels) follow the 3D people every frame.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Vector3 } from 'three'
import { Focus, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { useStage } from '../../three/react'
import type { Pick3D, Stage } from '../../three'
import { useGame, useGS } from '../../core/store'
import { openDialog, useUI } from '../../core/ui'
import { isBfcm } from '../../core/time'
import type { Person } from '../../core/types'
import { officeDef } from '../../data/offices'
import { SIZES } from '../../data/sizes'
import { playSfx } from '../audio'
import { Director, type Cast, type Mode } from './director'
import { founderMood, launchPhase, ROLE_EMOJI, ROLE_LABEL, staffMood, teamKey, useCheer, type Mood } from './sceneState'
import { exposeStage, founderLook, mark3dFailed, stageUrl, staffLook, useQuality } from './three3d'
import './office3d.css'

const SPEED_ANIM: Record<number, number> = { 0: 0, 1: 1, 2: 1.5, 4: 2.2 }

/** Stage time of day for the game calendar: a pleasant afternoon drifting gently through each month, evening
 *  lamps for crunch time and Black Friday week, and the penthouse's night skyline. Never strobes (eased). */
function targetHour(): number {
  const s = useGame.getState().state
  if (!s) return 14.5
  const d = s.day + useUI.getState().dayFrac
  if (s.office >= 5) return 21 + 0.5 * Math.sin((d / 56) * Math.PI * 2)
  let h = 14.5 + 1.1 * Math.sin((d / 28) * Math.PI * 2)
  const c = s.current
  const crunch = !!c && c.status === 'dev' && c.stage === 2 && c.stageProgress > 0.5
  if (crunch) h = 18.4
  if (isBfcm(s.day)) h = 19.6
  return h
}

/** Project a room-space point (from debugAnchors) to canvas CSS pixels. */
const tmp = new Vector3()
function projectRoomPoint(stage: Stage, p: { x: number; y: number; z: number }): { x: number; y: number } | null {
  try {
    const { camera, room } = stage.internals
    const world = room?.scene.parent
    if (!world) return null
    tmp.set(p.x, p.y, p.z).applyMatrix4(world.matrixWorld).project(camera)
    if (tmp.z > 1 || tmp.z < -1) return null
    const c = stage.canvas
    return { x: (tmp.x * 0.5 + 0.5) * c.clientWidth, y: (-tmp.y * 0.5 + 0.5) * c.clientHeight }
  } catch {
    return null
  }
}

function place(el: HTMLElement | null | undefined, p: { x: number; y: number } | null) {
  if (!el) return
  if (!p) {
    if (el.style.display !== 'none') el.style.display = 'none'
    return
  }
  if (el.style.display === 'none') el.style.display = ''
  el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -100%)`
}

const HOVER_LABEL: Record<string, string> = {
  door: '🚪 Office & moving',
  fridge: '🥤 Snack run',
  bed: '😴 Power nap',
  couch: '🛋️ Chill for a sec',
}

interface Tag { id: string; name: string; emoji: string; tip: string; founder: boolean; role: Person['role']; mode: Mode; mood: Mood }

const PersonTag = memo(function PersonTag({ tag, hot, bind }: { tag: Tag; hot: boolean; bind: (id: string, el: HTMLButtonElement | null) => void }) {
  return (
    <button
      type="button"
      ref={el => bind(tag.id, el)}
      className={clsx('m-p3', tag.founder && 'founder', `r-${tag.role}`, `mode-${tag.mode}`, `mood-${tag.mood}`, hot && 'hot')}
      data-person={tag.id}
      data-tip={tag.tip}
      aria-label={tag.tip}
      style={{ display: 'none' }}
      onClick={() => openDialog('staff')}
    >
      <span className="m-p3-emoji" aria-hidden="true">{tag.emoji}</span>
      <span className="m-p3-name">{tag.name}</span>
    </button>
  )
})

export default function Office3D({ shown, onReady, onFail }: { shown: boolean; onReady: () => void; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const quality = useQuality()
  const [hover, setHover] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)

  // ---- game state (primitive / stable selectors) ----
  const tier = useGS(s => s.office)
  const founder = useGS(s => s.founder)
  const staff = useGS(s => s.staff)
  const phase = useGS(launchPhase)
  const team = useGS(teamKey)
  const training = useGS(s => s.staff.filter(p => (p.trainingUntil ?? 0) > s.day).map(p => p.id).join(','))
  const employed = useGS(s => s.dayJob.employed)
  const tired = useGS(s => s.dayJob.employed && s.day % 28 >= 21)
  const fMood = useGS(founderMood)
  const sMood = useGS(staffMood)
  const size = useGS(s => s.current?.size)
  const speed = useUI(u => u.speed)
  const over = useGS(s => !!s.gameOver)
  const office = officeDef(tier)
  const desks = Math.min(staff.length, office.slots)

  const directorRef = useRef<Director | null>(null)
  const founderId = useRef(founder.id)
  founderId.current = founder.id
  const cheer = useCheer(() => directorRef.current?.cheer())

  const onPick = useCallback((p: Pick3D) => {
    const gs = useGame.getState().state
    if (!gs) return
    const d = directorRef.current
    if (p.kind === 'actor') { openDialog('staff'); return }
    switch (p.key) {
      case 'computer':
        if (!gs.current) openDialog('newLaunch')
        else if (gs.current.awaitingSliders) openDialog('sliders', { launchId: gs.current.id })
        return
      case 'door': openDialog('office'); return
      case 'fridge': if (d?.founderGoes('coffee')) playSfx('pop'); return
      case 'bed': if (d?.founderGoes('nap')) playSfx('pop'); return
      case 'couch': if (d?.founderGoes('couch')) playSfx('pop'); return
      case 'floor': if (p.point) d?.founderGoes('walk', { x: p.point.x, z: p.point.z }); return
    }
  }, [])

  const stage = useStage(canvasRef, {
    url: stageUrl,
    quality,
    onHover: setHover,
    onPick,
    onReady,
    onError: () => { mark3dFailed(); onFail() },
  })

  // phones: vertical swipes over the office still scroll the page (horizontal drags turn the room)
  useEffect(() => {
    if (!stage) return
    exposeStage('__stage', stage)
    try { if (window.matchMedia?.('(pointer: coarse)').matches) stage.canvas.style.touchAction = 'pan-y' } catch { /* ignore */ }
    return () => exposeStage('__stage', null)
  }, [stage])

  const director = useMemo(() => (stage ? new Director(stage) : null), [stage])
  useEffect(() => {
    directorRef.current = director
    if (import.meta.env.DEV && director) (window as unknown as { __director?: Director }).__director = director
    return () => { director?.dispose(); if (directorRef.current === director) directorRef.current = null }
  }, [director])

  // ---- room ----
  const desksRef = useRef(desks)
  desksRef.current = desks
  useEffect(() => {
    if (!stage || !director) return
    let alive = true
    void stage.setRoom(`tier${Math.max(0, Math.min(5, tier))}` as 'tier0', { staffDesks: desksRef.current }).then(() => { if (alive) director.onRoom() })
    return () => { alive = false }
  }, [stage, director, tier])
  useEffect(() => { stage?.setStaffDesks(desks) }, [stage, desks])
  useEffect(() => { stage?.setSpeed(SPEED_ANIM[speed] ?? 1) }, [stage, speed])
  // the game-over card covers everything: no need to keep drawing underneath
  useEffect(() => { stage?.setActive(!over) }, [stage, over])

  // ---- cast ----
  const cast = useMemo((): Cast[] => {
    const onTeam = new Set(team.split(','))
    const away = new Set(training ? training.split(',') : [])
    const mood = (m: Mood): Mood => (m === 'stressed' ? 'stressed' : cheer ? 'happy' : m)
    const fLook = founderLook(founder)
    const hat = (fLook.acc ?? []).some(a => a === 'cap' || a === 'cap_back' || a === 'beanie' || a === 'flatcap' || a === 'hijab' || a === 'visor')
    // late in the month the fry shifts pile up: the McDoodle's visor comes home with you
    const look = employed && tired && !hat ? { ...fLook, acc: [...(fLook.acc ?? []), 'visor' as const], accColor: '#f5c342' } : fLook
    const fMode: Mode = phase === 'dev' ? 'work' : phase === 'none' ? 'life' : 'think'
    const list: Cast[] = [{ id: founder.id, name: founder.name, look, seat: 'computer_sit', mode: fMode, mood: mood(fMood), films: true }]
    const seen = new Map<string, number>()
    staff.forEach((p, i) => {
      const dup = seen.get(p.portrait) ?? 0
      seen.set(p.portrait, dup + 1)
      let mode: Mode
      if (away.has(p.id)) mode = 'away'
      else if (phase === 'none') mode = 'life'
      else if (!onTeam.has(p.id)) mode = 'bench'
      else mode = phase === 'dev' ? 'work' : 'wait'
      list.push({ id: p.id, name: p.name, look: staffLook(p, dup), seat: i < office.slots ? `staff_${i + 1}_sit` : null, mode, mood: mood(sMood), films: p.role === 'video_creator' })
    })
    return list
  }, [founder, staff, team, training, phase, employed, tired, fMood, sMood, cheer, office.slots])

  useEffect(() => { director?.sync(cast) }, [director, cast])

  // ---- name tags / bubble anchors ----
  const tags = useMemo((): Tag[] => {
    const cap = size ? SIZES[size] : undefined
    const benchTip = cap ? `On the bench: a ${cap.name} fits ${cap.maxTeam} people (you + ${cap.maxTeam - 1}). Bigger launches put more of the team to work.` : ''
    return cast.map(c => {
      const p = c.id === founder.id ? founder : staff.find(x => x.id === c.id)!
      const isF = c.id === founder.id
      const first = p.name.split(' ')[0]
      const tip = isF
        ? `${p.name} · Founder${employed ? '\nStill flipping burgers at McDoodle’s' : ''}`
        : `${p.name} · ${ROLE_LABEL[p.role]} · Lv ${p.level}${c.mode === 'away' ? '\nAway at training' : c.mode === 'bench' && benchTip ? `\n${benchTip}` : ''}`
      const emoji = isF ? (employed ? '🍔' : '⚡') : c.mode === 'bench' ? '💤' : ROLE_EMOJI[p.role]
      return { id: c.id, name: first, emoji, tip, founder: isF, role: p.role, mode: c.mode, mood: c.mood }
    })
  }, [cast, founder, staff, employed, size])

  const tagEls = useRef(new Map<string, HTMLButtonElement>())
  const bindTag = useCallback((id: string, el: HTMLButtonElement | null) => { if (el) tagEls.current.set(id, el); else tagEls.current.delete(id) }, [])
  const markEls = useRef(new Map<string, HTMLSpanElement>())
  const ideaRef = useRef<HTMLButtonElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const kbRefs = useRef(new Map<string, HTMLButtonElement>())
  const hoverRef = useRef<string | null>(null)
  hoverRef.current = focusKey ?? (hover && !hover.startsWith('actor:') ? hover : null)
  const trainees = useMemo(() => cast.filter(c => c.mode === 'away' && c.seat), [cast])

  // ---- per frame: overlays + director + time of day ----
  useEffect(() => {
    if (!stage || !director) return
    let last = performance.now()
    let hour = targetHour()
    let todAcc = 1
    stage.setTimeOfDay(hour)
    return stage.onFrame(() => {
      const now = performance.now()
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      // people
      for (const [id, el] of tagEls.current) place(el, stage.screenPoint(id, 'above'))
      for (const [seat, el] of markEls.current) {
        const a = director.anchor(seat)
        place(el, a ? projectRoomPoint(stage, { x: a.x, y: 1.25, z: a.z }) : null)
      }
      // idea bubble over the desk
      const idea = ideaRef.current
      if (idea) {
        const r = stage.screenRect('computer')
        let y = r ? r.y - 2 : 0
        // keep clear of the founder's name tag when they're at the desk
        const f = r ? stage.screenPoint(founderId.current, 'above') : null
        if (r && f && Math.abs(f.x - (r.x + r.w / 2)) < 110 && f.y - 24 < y) y = f.y - 24
        place(idea, r ? { x: r.x + r.w / 2, y } : null)
      }
      // hover / focus label
      const key = hoverRef.current
      const lab = labelRef.current
      if (lab) {
        const r = key ? stage.screenRect(key) : null
        place(lab, r ? { x: r.x + r.w / 2, y: r.y - 4 } : null)
      }
      for (const [k, el] of kbRefs.current) {
        const r = stage.screenRect(k)
        if (!r) { el.style.display = 'none'; continue }
        el.style.display = ''
        el.style.transform = `translate3d(${r.x.toFixed(0)}px, ${r.y.toFixed(0)}px, 0)`
        el.style.width = `${Math.max(24, r.w).toFixed(0)}px`
        el.style.height = `${Math.max(24, r.h).toFixed(0)}px`
      }
      // little lives, at the game's pace
      const sp = SPEED_ANIM[useUI.getState().speed] ?? 1
      director.tick(dt * sp)
      // time of day: eased toward the calendar's target, a few times a second
      todAcc += dt
      if (todAcc > 0.2) {
        const target = targetHour()
        const step = 0.35 * todAcc
        hour += Math.max(-step, Math.min(step, target - hour))
        todAcc = 0
        stage.setTimeOfDay(hour)
      }
    })
  }, [stage, director])

  // ---- keyboard: Q / E turn the room, + / − zoom ----
  useEffect(() => {
    if (!stage) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (useUI.getState().dialogs.length) return
      if (e.key === 'q' || e.key === 'Q') stage.rotate(-45)
      else if (e.key === 'e' || e.key === 'E') stage.rotate(45)
      else if (e.key === '+' || e.key === '=') stage.zoom(1)
      else if (e.key === '-' || e.key === '_') stage.zoom(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage])

  const hasCurrent = phase !== 'none'
  const awaiting = phase === 'await'
  const canStart = !hasCurrent || awaiting
  const openComputer = () => {
    const gs = useGame.getState().state
    if (!gs) return
    if (!gs.current) openDialog('newLaunch')
    else if (gs.current.awaitingSliders) openDialog('sliders', { launchId: gs.current.id })
  }
  const labelKey = focusKey ?? (hover && !hover.startsWith('actor:') ? hover : null)
  const hotActor = hover?.startsWith('actor:') ? hover.slice(6) : null
  // the idea bubble already names the desk while it has something to offer
  // snack / nap / chill only while the founder is free (Sims-style: click it and they go)
  const labelText = labelKey === 'computer' ? (canStart ? undefined : '⌨️ Busy building') : labelKey === 'door' || (labelKey && !hasCurrent) ? HOVER_LABEL[labelKey] : undefined
  const kbKeys: [string, string, () => void][] = [
    ...(canStart ? [['computer', awaiting ? 'Set this stage’s focus' : 'Start a new launch', openComputer] as [string, string, () => void]] : []),
    ['door', 'Office & moving', () => openDialog('office')],
  ]

  return (
    <div className={clsx('m-3d', shown && 'on')}>
      <canvas ref={canvasRef} className="m-3d-canvas" aria-label={`${office.name}, live view`} role="img" />
      <div className="m-3d-layer">
        {trainees.map(c => (
          <span key={c.id} className="m-3d-mark" style={{ display: 'none' }} ref={el => { if (el) markEls.current.set(c.seat!, el); else markEls.current.delete(c.seat!) }} data-tip={`${c.name.split(' ')[0]} is away at training`}><span className="m-3d-mark-in">📚</span></span>
        ))}
        {tags.map(t => <PersonTag key={t.id} tag={t} hot={hotActor === t.id} bind={bindTag} />)}
        {canStart && (
          <button type="button" ref={ideaRef} className={clsx('m-3d-idea', labelKey === 'computer' && 'hot')} style={{ display: 'none' }} onClick={openComputer} onMouseEnter={() => stage?.highlight('computer')} onMouseLeave={() => stage?.highlight(null)} aria-label={awaiting ? 'Set this stage’s focus' : 'Start a new launch'}>
            <span className="m-3d-idea-in">{awaiting ? '🎛️ Set focus' : '💡 New launch?'}</span>
          </button>
        )}
        <div ref={labelRef} className={clsx('m-3d-label', !labelText && 'empty')} style={{ display: 'none' }} aria-hidden="true"><span>{labelText}</span></div>
        {kbKeys.map(([k, label, fn]) => (
          <button
            key={k}
            type="button"
            className="m-3d-kb"
            style={{ display: 'none' }}
            ref={el => { if (el) kbRefs.current.set(k, el); else kbRefs.current.delete(k) }}
            aria-label={label}
            onFocus={() => { setFocusKey(k); stage?.highlight(k) }}
            onBlur={() => { setFocusKey(null); stage?.highlight(null) }}
            onClick={fn}
          />
        ))}
      </div>
      <div className="m-3d-cam" role="group" aria-label="Camera">
        <button type="button" data-tip="Turn left (Q)" aria-label="Turn left" onClick={() => stage?.rotate(-45)}><RotateCcw size={16} strokeWidth={2.4} /></button>
        <button type="button" data-tip="Turn right (E)" aria-label="Turn right" onClick={() => stage?.rotate(45)}><RotateCw size={16} strokeWidth={2.4} /></button>
        <button type="button" data-tip="Zoom in (+)" aria-label="Zoom in" onClick={() => stage?.zoom(1)}><ZoomIn size={16} strokeWidth={2.4} /></button>
        <button type="button" data-tip="Zoom out (−)" aria-label="Zoom out" onClick={() => stage?.zoom(-1)}><ZoomOut size={16} strokeWidth={2.4} /></button>
        <button type="button" data-tip="Reset view" aria-label="Reset view" onClick={() => stage?.resetView()}><Focus size={16} strokeWidth={2.4} /></button>
      </div>
    </div>
  )
}
