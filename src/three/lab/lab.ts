// Dev lab for the 3D stage (served by `npx vite` at /src/three/lab/index.html; not part of the production build).
// URL params: room, actors, tasks (per actor, ';'-separated: sit:computer_sit:sit_type | lie:bed_lie | use:stove_stand:cook |
// idle[:anchor] | goto:x:z | wander | leave | hidden), looks (comma presets), tod, yaw, zoom, speed, desks, gear (comma ids),
// boxes, q (low|high), mood, highlight, snap=1 (hide the panel), orbit=1.
import { Stage, LOOK_PRESETS } from '../index'
import type { ActorTask, Emote, Mood, RoomId } from '../types'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const params = new URLSearchParams(location.search)
const num = (k: string, d: number) => { const v = params.get(k); return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d }

const ROOMS = ['testroom', 'testroom_b', '_sample', 'tier0', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'mcdoodles', 'title_city', 'studio']
const GEAR = ['phone-cracked', 'phone-pro', 'ring-light', 'softbox-kit', 'mirrorless-camera', 'laptop-old', 'laptop-pro', 'workstation', 'lav-mic']
const PRESET_ORDER = ['player', 'p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18']
const BACKDROP: Record<string, string> = { tier5: 'dark', title_city: 'dark' }

const logLines: string[] = []
function log(s: string) {
  logLines.unshift(`${new Date().toLocaleTimeString()} ${s}`)
  logLines.length = Math.min(logLines.length, 40)
  $('log').textContent = logLines.join('\n')
}

const lab = {
  ready: false,
  errors: [] as string[],
  frames: 0,
  hover: null as string | null,
  picks: [] as unknown[],
}
;(window as unknown as { __lab: typeof lab }).__lab = lab
window.addEventListener('error', e => lab.errors.push(String(e.message)))
window.addEventListener('unhandledrejection', e => lab.errors.push(String((e as PromiseRejectionEvent).reason)))

if (params.get('snap') === '1') document.body.classList.add('snap')

const canvas = $<HTMLCanvasElement>('c')
let roomId = params.get('room') ?? 'testroom'

// dev fallbacks: test rooms/props exported by blender/test/testroom.py into blender/.out
let testProps = false
function url(p: string) {
  const m = /^3d\/(testroom\w*|_\w+)\.glb$/.exec(p)
  if (m) return `/blender/.out/${m[1]}.glb`
  if (p === '3d/props.glb' && testProps) return '/blender/.out/testprops.glb'
  return `/assets/${p}`
}
async function exists(u: string) {
  try {
    const r = await fetch(u, { method: 'HEAD' })
    return r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')
  } catch { return false }
}

let stage: Stage
function makeStage() {
  stage = new Stage({
    canvas,
    url,
    quality: (params.get('q') as 'low' | 'high') ?? 'high',
    placeholderActors: true,
    onHover: k => { lab.hover = k; log(`hover ${k}`) },
    onPick: p => {
      lab.picks.push(p)
      log(`pick ${p.kind} ${p.key}${p.point ? ` (${p.point.x.toFixed(2)}, ${p.point.z.toFixed(2)})` : ''}`)
      if (p.kind === 'floor' && p.point) for (const id of actorIds()) { stage.task(id, { kind: 'goto', point: { x: p.point.x, z: p.point.z } }); break }
    },
    onReady: () => { lab.ready = true; log('ready') },
    onError: e => { lab.errors.push(String(e)); $('err').textContent = `onError: ${String((e as Error)?.message ?? e)}`; log(`error ${String(e)}`) },
  })
  ;(window as unknown as { __stage: Stage }).__stage = stage
  stage.onFrame(() => { lab.frames++; drawOverlays() })
}

// ---------------------------------------------------------------------------
// actors & tasks
// ---------------------------------------------------------------------------
let nActors = num('actors', 1)
function actorIds() { return Array.from({ length: nActors }, (_, i) => `a${i}`) }

function parseTask(s: string | undefined): ActorTask {
  if (!s) return { kind: 'wander' }
  const [k, a, b] = s.split(':')
  switch (k) {
    case 'sit': return { kind: 'sit', at: a, anim: (b as 'sit_idle' | 'sit_type' | 'sit_think' | 'eat_sit' | undefined) }
    case 'lie': return { kind: 'lie', at: a || 'bed_lie' }
    case 'use': return { kind: 'use', at: a, anim: (b || 'idle') as never }
    case 'idle': return a ? { kind: 'idle', at: a, anim: b as never } : { kind: 'idle' }
    case 'goto': return { kind: 'goto', point: { x: Number(a) || 0, z: Number(b) || 0 } }
    case 'leave': return a ? { kind: 'leave', at: a } : { kind: 'leave' }
    case 'hidden': return { kind: 'hidden' }
    default: return { kind: 'wander' }
  }
}

const looks = (params.get('looks') ?? '').split(',').filter(Boolean)
function syncActors() {
  const ids = actorIds()
  const tasks = (params.get('tasks') ?? '').split(';')
  ids.forEach((id, i) => {
    const preset = looks[i] ?? PRESET_ORDER[i % PRESET_ORDER.length]
    stage.setActor(id, { look: LOOK_PRESETS[preset] ?? LOOK_PRESETS.player, name: preset })
    stage.task(id, parseTask(tasks[i] ?? tasks[tasks.length - 1]))
  })
  for (let i = ids.length; i < 16; i++) stage.removeActor(`a${i}`)
  const m = params.get('mood') as Mood | null
  if (m) for (const id of ids) stage.mood(id, m)
}

// ---------------------------------------------------------------------------
// DOM overlays (name bubbles) through screenPoint, like the game will do
// ---------------------------------------------------------------------------
const bubbles = new Map<string, HTMLDivElement>()
function drawOverlays() {
  const view = $('view')
  for (const id of actorIds()) {
    let el = bubbles.get(id)
    if (!el) { el = document.createElement('div'); el.className = 'bubble'; el.textContent = id; view.appendChild(el); bubbles.set(id, el) }
    const p = stage.screenPoint(id, 'above')
    el.style.display = p ? '' : 'none'
    if (p) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px` }
  }
  for (const [id, el] of bubbles) if (!actorIds().includes(id)) { el.remove(); bubbles.delete(id) }
  const tag = $('tag')
  const k = lab.hover && !lab.hover.startsWith('actor:') ? lab.hover : null
  const r = k ? stage.screenRect(k) : null
  tag.style.display = r ? 'block' : 'none'
  if (r && k) { tag.textContent = k; tag.style.left = `${r.x + r.w / 2}px`; tag.style.top = `${r.y - 4}px` }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function setupUI() {
  const roomSel = $<HTMLSelectElement>('room')
  for (const r of ROOMS) roomSel.add(new Option(r, r, r === roomId, r === roomId))
  roomSel.onchange = () => { roomId = roomSel.value; loadRoom() }
  const q = $<HTMLSelectElement>('quality')
  q.value = params.get('q') ?? 'high'
  q.onchange = () => { params.set('q', q.value); location.search = params.toString() }

  const nIn = $<HTMLInputElement>('actors')
  nIn.value = String(nActors)
  nIn.onchange = () => { nActors = Math.max(0, Math.min(12, Number(nIn.value) || 0)); syncActors() }
  const taskSel = $<HTMLSelectElement>('task')
  for (const t of ['wander', 'idle', 'idle:door_stand', 'sit:computer_sit:sit_type', 'sit:bed_sit', 'sit:couch_sit', 'sit:eat_sit:eat_sit', 'lie:bed_lie', 'use:stove_stand:cook', 'use:fridge_stand:idle', 'use:film_stand:film', 'use:counter_stand:register', 'use:fryer_stand:cook', 'leave', 'hidden']) taskSel.add(new Option(t, t))
  taskSel.onchange = () => { for (const id of actorIds()) stage.task(id, parseTask(taskSel.value)) }
  $('routine').onclick = () => void routine()
  $('scatter').onclick = () => {
    const seats = stage.debugAnchors().map(a => a.name).filter(n => /_sit/.test(n))
    actorIds().forEach((id, i) => stage.task(id, seats[i] ? { kind: 'sit', at: seats[i], anim: /computer|staff/.test(seats[i]) ? 'sit_type' : 'sit_idle' } : { kind: 'wander' }))
  }
  const mood = $<HTMLSelectElement>('mood')
  mood.onchange = () => { for (const id of actorIds()) stage.mood(id, mood.value as Mood) }
  document.querySelectorAll<HTMLButtonElement>('[data-emote]').forEach(b => { b.onclick = () => { for (const id of actorIds()) stage.emote(id, b.dataset.emote as Emote) } })
  let holding = false
  $('hold').onclick = () => { holding = !holding; for (const id of actorIds()) stage.hold(id, holding ? 'phone' : null) }

  const tod = $<HTMLInputElement>('tod')
  tod.value = String(num('tod', 12))
  const applyTod = () => { stage.setTimeOfDay(Number(tod.value)); $('todv').textContent = Number(tod.value).toFixed(1) }
  tod.oninput = applyTod
  applyTod()
  const speed = $<HTMLSelectElement>('speed')
  speed.value = String(num('speed', 1))
  speed.onchange = () => stage.setSpeed(Number(speed.value))
  stage.setSpeed(Number(speed.value))
  const desks = $<HTMLInputElement>('desks')
  desks.value = String(num('desks', 7))
  desks.onchange = () => stage.setStaffDesks(Number(desks.value))
  const boxes = $<HTMLInputElement>('boxes')
  boxes.value = String(num('boxes', 0))
  const applyBoxes = () => { stage.setBoxes(Number(boxes.value)); $('boxv').textContent = boxes.value }
  boxes.oninput = applyBoxes
  applyBoxes()
  const gearBox = $('gear')
  const want = new Set((params.get('gear') ?? '').split(',').filter(Boolean))
  for (const g of GEAR) {
    const l = document.createElement('label')
    l.innerHTML = `<input type="checkbox" ${want.has(g) ? 'checked' : ''} data-gear="${g}"> ${g}`
    gearBox.appendChild(l)
  }
  const applyGear = () => stage.setGear([...gearBox.querySelectorAll<HTMLInputElement>('input:checked')].map(i => ({ id: i.dataset.gear! })))
  gearBox.onchange = applyGear
  applyGear()
  $('rl').onclick = () => stage.rotate(-90)
  $('rr').onclick = () => stage.rotate(90)
  $('zi').onclick = () => stage.zoom(1)
  $('zo').onclick = () => stage.zoom(-1)
  $('reset').onclick = () => stage.resetView()
  let orbit = params.get('orbit') === '1'
  $('orbit').onclick = () => { orbit = !orbit; stage.setCameraMode(orbit ? 'orbit' : 'room') }
  if (orbit) stage.setCameraMode('orbit')
  setInterval(() => { $('stats').textContent = JSON.stringify({ ...stage.stats(), actors: stage.debugActors() }, null, 1) }, 300)
}

async function routine() {
  const id = actorIds()[0]
  if (!id) return
  const has = new Set(stage.debugAnchors().map(a => a.name))
  const seq: [ActorTask, number][] = [
    [{ kind: 'idle', at: has.has('door_stand') ? 'door_stand' : 'spawn' }, 3500],
    [{ kind: 'lie', at: 'bed_lie' }, 6000],
    [{ kind: 'sit', at: 'computer_sit', anim: 'sit_type' }, 6000],
    [{ kind: 'use', at: 'fridge_stand', anim: 'idle' }, 5000],
  ]
  for (const [t, ms] of seq) { stage.task(id, t); log(`routine → ${t.kind} ${'at' in t ? t.at : ''}`); await new Promise(r => setTimeout(r, ms)) }
}

async function loadRoom() {
  lab.ready = false
  $('view').classList.toggle('dark', BACKDROP[roomId] === 'dark')
  $('err').textContent = ''
  const t0 = performance.now()
  await stage.setRoom(roomId as RoomId, { staffDesks: num('desks', 7) })
  log(`room ${roomId} in ${Math.round(performance.now() - t0)} ms`)
  lab.ready = true
  const yaw = params.get('yaw'), zoom = params.get('zoom')
  const rig = stage.internals.rig
  if (yaw !== null) { rig.yaw = rig.tYaw = Number(yaw) }
  if (zoom !== null) { rig.zoom = rig.tZoom = Number(zoom) }
  const hl = params.get('highlight')
  if (hl) stage.highlight(hl)
}

void (async () => {
  testProps = params.get('props') === 'test' || !(await exists('/assets/3d/props.glb'))
  makeStage()
  setupUI()
  syncActors()
  await loadRoom()
})()
