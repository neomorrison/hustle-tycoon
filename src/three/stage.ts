// The Stage: renderer + loop + room/actors/props/camera/lighting/picking behind the public API of docs/3D.md §6.
import * as THREE from 'three'
import type { ActorSpec, ActorTask, Emote, GearItem, Mood, RoomId, ScreenPoint, ScreenRect, StageOptions } from './types'
import { AssetLoader, disposeObject, type GLTF } from './loader'
import { Room } from './room'
import { CameraRig } from './camera'
import { Lighting } from './lighting'
import { updateCutaway } from './cutaway'
import { Glow, Picker, type Hit } from './picking'
import { Actor, type ActorEnv } from './actors'
import { Props } from './props'
import type { Neighbour } from './crowd'
import { clamp, easeOut, Reservations } from './math'

let glCache: boolean | null = null
/** true when a WebGL2 (or WebGL1) context can be created; false in Node/tests */
export function webglAvailable(): boolean {
  if (glCache !== null) return glCache
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return (glCache = false)
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    glCache = !!gl
    ;(gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { glCache = false }
  return glCache
}

/** Radial gradient texture for the actors' soft contact shadow (no DOM needed). */
function contactShadowTexture(): THREE.DataTexture {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1
    const r = Math.min(1, Math.hypot(dx, dy))
    const a = Math.pow(1 - r, 1.6) * (r < 1 ? 1 : 0)
    const i = (y * n + x) * 4
    data[i] = data[i + 1] = data[i + 2] = 0
    data[i + 3] = Math.round(a * 255)
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

interface PointerState { id: number; x: number; y: number; x0: number; y0: number; button: number; t0: number }

export class Stage {
  private opts: StageOptions
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer | null = null
  readonly scene = new THREE.Scene()
  private world = new THREE.Group()
  private rig = new CameraRig()
  private lighting: Lighting | null = null
  private loader = new AssetLoader()
  private room: Room | null = null
  private roomId: string | null = null
  private roomToken = 0
  private character: GLTF | null = null
  private characterTried = false
  private propsGltf: GLTF | null = null
  private characterP: Promise<void>
  private actors = new Map<string, Actor>()
  private pendingTasks = new Map<string, ActorTask>()
  private pendingActors = new Map<string, { spec: ActorSpec; task: ActorTask | null; mood: Mood | null; hold: string | null }>()
  private reservations = new Reservations()
  private props = new Props()
  private picker = new Picker()
  private glow = new Glow()
  private speed = 1
  private active = true
  private visible = true
  private raf = 0
  private last = 0
  private disposed = false
  private errored = false
  private readyFired = false
  private frameCbs = new Set<() => void>()
  private ro: ResizeObserver | null = null
  private cssW = 1
  private cssH = 1
  private hour = 12
  private staffDesks = Infinity
  private highlightKey: string | null = null
  private hoverKey: string | null = null
  private pointer = new THREE.Vector2()
  private pointerIn = false
  private pointerDirty = false
  private lastPick = 0
  private pointers = new Map<number, PointerState>()
  private pinch: { d: number; mx: number; my: number } | null = null
  private dragMoved = false
  private lastMoveT = 0
  private intro = 1
  private fade = { v: 1, target: 1 }
  private shadowGeo = new THREE.PlaneGeometry(1, 1)
  private shadowTex = contactShadowTexture()
  private shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  private proxyGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.72, 8)
  private proxyMat = new THREE.MeshBasicMaterial({ visible: false })
  private env: ActorEnv
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = []
  private savedStyle: { touchAction: string; opacity: string; transition: string } | null = null
  private tmpV = new THREE.Vector3()
  private frameCount = 0
  private crowd: Neighbour[] = []

  constructor(opts: StageOptions) {
    this.opts = opts
    this.canvas = opts.canvas
    const quality = opts.quality ?? 'high'
    this.env = {
      room: () => this.room,
      reservations: this.reservations,
      speed: () => this.speed,
      character: () => this.character,
      props: () => this.propsGltf,
      shadowGeo: this.shadowGeo, shadowMat: this.shadowMat, proxyGeo: this.proxyGeo, proxyMat: this.proxyMat,
      crowd: () => this.crowd,
      waitSpots: new Map(),
    }
    this.scene.add(this.world)
    this.world.add(this.props.group)
    this.glow.actorMaterials = id => this.actors.get(id)?.materials ?? []
    try {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: quality === 'high', alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
      r.setClearColor(0x000000, 0)
      r.outputColorSpace = THREE.SRGBColorSpace
      r.toneMapping = THREE.NeutralToneMapping
      r.toneMappingExposure = 1
      r.shadowMap.enabled = true
      r.shadowMap.type = THREE.PCFShadowMap
      r.setPixelRatio(quality === 'low' ? 1 : Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1))
      this.renderer = r
      this.lighting = new Lighting(this.scene, r, quality)
    } catch (e) {
      this.fail(e)
    }
    this.savedStyle = { touchAction: this.canvas.style.touchAction, opacity: this.canvas.style.opacity, transition: this.canvas.style.transition }
    this.canvas.style.touchAction = 'none'
    this.bindEvents()
    this.resize()
    // shared assets load immediately
    this.characterP = this.loader.loadShared(opts.url('3d/character.glb')).then(
      g => { this.character = g; g.scene.updateMatrixWorld(true) },
      err => { if (!opts.placeholderActors) this.fail(err) },
    ).finally(() => { this.characterTried = true; this.flushPendingActors() })
    this.loader.loadShared(opts.url('3d/props.glb')).then(
      g => { this.propsGltf = g; this.props.setRoom(this.room, g) },
      () => { /* props are optional decoration */ },
    )
    this.start()
  }

  // =========================================================================
  // lifecycle
  // =========================================================================
  private fail(err: unknown) {
    if (this.errored || this.disposed) return
    this.errored = true
    try { this.opts.onError?.(err) } catch { /* ignore */ }
  }

  private on(t: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions) {
    t.addEventListener(type, fn, o)
    this.listeners.push([t, type, fn, o])
  }

  private bindEvents() {
    const c = this.canvas
    this.on(c, 'webglcontextlost', (e: Event) => { e.preventDefault(); this.stop(); this.fail(new Error('WebGL context lost')) })
    this.on(c, 'pointerdown', e => this.onPointerDown(e as PointerEvent))
    this.on(c, 'pointermove', e => this.onPointerMove(e as PointerEvent))
    this.on(c, 'pointerup', e => this.onPointerUp(e as PointerEvent))
    this.on(c, 'pointercancel', e => this.onPointerUp(e as PointerEvent, true))
    this.on(c, 'pointerleave', () => { if (!this.pointers.size) { this.pointerIn = false; this.pointerDirty = true } })
    this.on(c, 'wheel', e => this.onWheel(e as WheelEvent), { passive: false })
    this.on(c, 'contextmenu', e => e.preventDefault())
    if (typeof document !== 'undefined') {
      this.on(document, 'visibilitychange', () => { this.visible = document.visibilityState !== 'hidden'; this.visible ? this.start() : this.stop() })
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize())
      this.ro.observe(c)
    }
  }

  private start() {
    if (this.raf || this.disposed || !this.active || !this.visible || !this.renderer || this.errored) return
    this.last = performance.now()
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000))
      this.last = t
      this.frame(dt)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  resize() {
    const r = this.renderer
    const w = Math.max(1, this.canvas.clientWidth || this.canvas.width), h = Math.max(1, this.canvas.clientHeight || this.canvas.height)
    this.cssW = w; this.cssH = h
    if (!r) return
    r.setSize(w, h, false)
    this.rig.setAspect(w / h)
  }

  dispose() {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    for (const [t, type, fn, o] of this.listeners) t.removeEventListener(type, fn, o)
    this.listeners = []
    this.ro?.disconnect()
    for (const a of this.actors.values()) a.dispose()
    this.actors.clear()
    this.props.dispose()
    this.glow.clear()
    this.room?.dispose()
    this.room = null
    this.lighting?.dispose()
    this.loader.dispose()
    this.shadowGeo.dispose(); this.shadowTex.dispose(); this.shadowMat.dispose(); this.proxyGeo.dispose(); this.proxyMat.dispose()
    this.frameCbs.clear()
    if (this.savedStyle) {
      this.canvas.style.touchAction = this.savedStyle.touchAction
      this.canvas.style.opacity = this.savedStyle.opacity
      this.canvas.style.transition = this.savedStyle.transition
    }
    if (this.renderer) {
      this.renderer.renderLists.dispose()
      this.renderer.state.reset()
      this.renderer.dispose()
      this.renderer = null
    }
  }

  // =========================================================================
  // rooms
  // =========================================================================
  async setRoom(id: RoomId, opts?: { staffDesks?: number }): Promise<void> {
    if (this.disposed) return
    if (opts?.staffDesks !== undefined) this.staffDesks = opts.staffDesks
    if (id === this.roomId && this.room) { this.setStaffDesks(this.staffDesks); return }
    const token = ++this.roomToken
    this.roomId = id
    const hadRoom = !!this.room
    if (hadRoom) this.fade.target = 0
    let gltf: GLTF
    try {
      gltf = await this.loader.load(this.opts.url(`3d/${id}.glb`))
    } catch (e) {
      if (token === this.roomToken) this.fail(e)
      return
    }
    if (this.disposed || token !== this.roomToken) { disposeObject(gltf.scene); return }
    // let the fade-out finish
    if (hadRoom) await this.waitFor(() => this.fade.v <= 0.02 || !this.raf, 400)
    if (this.disposed || token !== this.roomToken) { disposeObject(gltf.scene); return }
    let room: Room
    try { room = new Room(id, gltf) } catch (e) { disposeObject(gltf.scene); this.fail(e); return }
    this.swapRoom(room)
    await this.characterP
    if (this.disposed || token !== this.roomToken) return
    // compile shaders before showing, so the first frames do not hitch
    try { if (this.renderer) await this.renderer.compileAsync(this.scene, this.rig.camera) } catch { /* optional */ }
    if (this.disposed || token !== this.roomToken) return
    this.intro = 0
    this.fade.target = 1
    if (!hadRoom) this.fade.v = 0
    // one rendered frame before onReady
    await this.waitFor(() => this.frameCount > 0, 250, true)
    if (!this.readyFired && !this.disposed && token === this.roomToken) {
      this.readyFired = true
      try { this.opts.onReady?.() } catch { /* ignore */ }
    }
  }

  private waitFor(cond: () => boolean, maxMs: number, afterFrame = false): Promise<void> {
    const f0 = this.frameCount
    return new Promise(res => {
      const t0 = performance.now()
      const tick = () => {
        if (this.disposed || (cond() && (!afterFrame || this.frameCount > f0)) || performance.now() - t0 > maxMs) res()
        else setTimeout(tick, 16)
      }
      tick()
    })
  }

  private swapRoom(room: Room) {
    this.glow.clear()
    this.setHover(null)
    if (this.room) this.room.dispose()
    this.room = room
    this.world.add(room.scene)
    room.setStaffDesks(this.staffDesks)
    this.rig.mode = this.rig.mode === 'orbit' ? 'orbit' : 'room'
    this.applyRig(room)
    this.lighting?.setRoom(room)
    this.lighting?.setHour(this.hour, true)
    const dir = this.rig.horizontalDir(new THREE.Vector2())
    updateCutaway(room, dir, 0, true)
    this.reservations.clear()
    this.env.waitSpots.clear()
    for (const a of this.actors.values()) a.resnap()
    for (const [id, t] of this.pendingTasks) { this.actors.get(id)?.setTask(t, true); this.pendingTasks.delete(id) }
    this.props.setRoom(room, this.propsGltf)
    this.glow.set([this.highlightKey], room)
  }

  setStaffDesks(n: number) {
    this.staffDesks = Math.max(0, Math.floor(n))
    this.room?.setStaffDesks(this.staffDesks)
  }

  setTimeOfDay(hour: number) {
    if (!Number.isFinite(hour)) return
    // big jumps (sleeping through the night) blend quickly; small steps follow smoothly
    this.hour = hour
    this.lighting?.setHour(hour)
  }

  setSpeed(mult: number) { this.speed = clamp(Number.isFinite(mult) ? mult : 1, 0, 8) }

  setActive(on: boolean) {
    this.active = on
    if (on) this.start(); else this.stop()
  }

  setCameraMode(mode: 'room' | 'orbit') {
    if (this.rig.mode === mode) return
    this.rig.mode = mode
    if (this.room) this.applyRig(this.room)
  }

  /** camera framing for a room: fit box, title orbit (a_cam) or the studio's one-person turntable */
  private applyRig(room: Room) {
    const spawn = room.anchor('spawn')
    this.rig.setRoom(room.fitBox, room.camera, {
      studio: room.studio ? { center: spawn ? spawn.pos.clone().setY(0) : new THREE.Vector3() } : null,
      points: room.framePoints,
    })
    this.world.rotation.y = this.rig.turntable
  }

  rotate(stepDeg: number) { this.rig.rotate(stepDeg) }
  zoom(delta: number) { this.rig.zoomBy(delta) }
  resetView() { this.rig.reset() }

  highlight(key: string | null) {
    this.highlightKey = key
    this.glow.set([this.highlightKey, this.hoverKey], this.room)
  }

  // =========================================================================
  // actors
  // =========================================================================
  setActor(id: string, spec: ActorSpec) {
    const a = this.actors.get(id)
    if (a) { a.setSpec(spec); return }
    // people are built once character.glb has settled (loaded, or failed → placeholders in the lab)
    if (!this.characterTried) {
      const p = this.pendingActors.get(id)
      this.pendingActors.set(id, { spec, task: p?.task ?? null, mood: p?.mood ?? null, hold: p?.hold ?? null })
      return
    }
    const actor = new Actor(id, spec, this.env)
    this.actors.set(id, actor)
    this.world.add(actor.obj)
  }

  /** character.glb settled: build the actors that were declared meanwhile */
  private flushPendingActors() {
    if (this.disposed) return
    const pending = [...this.pendingActors]
    this.pendingActors.clear()
    for (const [id, p] of pending) {
      this.setActor(id, p.spec)
      if (p.mood) this.mood(id, p.mood)
      if (p.hold) this.hold(id, p.hold)
      if (p.task) this.task(id, p.task)
    }
  }

  removeActor(id: string) {
    this.pendingActors.delete(id)
    const a = this.actors.get(id)
    if (!a) return
    a.dispose()
    this.actors.delete(id)
    this.pendingTasks.delete(id)
    if (this.hoverKey === `actor:${id}`) this.setHover(null)
  }

  task(id: string, t: ActorTask) {
    const p = this.pendingActors.get(id)
    if (p) { p.task = t; return }
    const a = this.actors.get(id)
    if (!a) return
    if (!this.room) { this.pendingTasks.set(id, t); a.task = t; return }
    // the first task of a new actor places it directly (no walk from the spawn point)
    a.setTask(t, !a.placed && a.hidden && !a.key)
  }

  mood(id: string, m: Mood) {
    const p = this.pendingActors.get(id)
    if (p) { p.mood = m; return }
    this.actors.get(id)?.setMood(m)
  }
  emote(id: string, e: Emote) { this.actors.get(id)?.emote(e) }
  hold(id: string, prop: string | null) {
    const p = this.pendingActors.get(id)
    if (p) { p.hold = prop; return }
    this.actors.get(id)?.hold(prop)
  }

  // =========================================================================
  // props
  // =========================================================================
  setGear(items: GearItem[]) { this.props.setGear(items, this.room, this.propsGltf) }
  setBoxes(units: number) { this.props.setBoxes(Math.max(0, units || 0), this.room, this.propsGltf) }

  // =========================================================================
  // projection
  // =========================================================================
  private project(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const p = this.tmpV.copy(v).project(this.rig.camera)
    return { x: (p.x * 0.5 + 0.5) * this.cssW, y: (-p.y * 0.5 + 0.5) * this.cssH, behind: p.z > 1 || p.z < -1 }
  }

  screenRect(key: string): ScreenRect | null {
    if (!this.room) return null
    let box: THREE.Box3 | undefined
    if (key.startsWith('actor:')) {
      const a = this.actors.get(key.slice(6))
      if (!a || a.hidden) return null
      box = new THREE.Box3().setFromObject(a.proxy)
    } else box = this.room.interactiveBoxes.get(key)
    if (!box || box.isEmpty()) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const v = new THREE.Vector3()
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = this.project(v.set(x, y, z).applyMatrix4(this.world.matrixWorld))
      if (p.behind) return null
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  screenPoint(actorId: string, where: 'head' | 'feet' | 'above' = 'head'): ScreenPoint | null {
    const a = this.actors.get(actorId)
    if (!a || a.hidden || !this.room) return null
    const v = new THREE.Vector3()
    if (where === 'feet') a.obj.getWorldPosition(v)
    else { a.headPos(v); if (where === 'above') v.y += 0.42 }
    const p = this.project(v)
    return p.behind ? null : { x: p.x, y: p.y }
  }

  onFrame(cb: () => void): () => void {
    this.frameCbs.add(cb)
    return () => { this.frameCbs.delete(cb) }
  }

  stats() {
    const r = this.renderer
    return {
      calls: r?.info.render.calls ?? 0,
      triangles: r?.info.render.triangles ?? 0,
      geometries: r?.info.memory.geometries ?? 0,
      textures: r?.info.memory.textures ?? 0,
      programs: r?.info.programs?.length ?? 0,
      room: this.roomId,
      roomMeshes: this.room ? { in: this.room.stats.meshesIn, out: this.room.stats.meshesOut, tris: Math.round(this.room.stats.triangles) } : null,
      actors: this.actors.size,
      props: this.props.stats,
      speed: this.speed,
      hour: this.hour,
      yaw: +this.rig.yaw.toFixed(1),
      zoom: +this.rig.zoom.toFixed(3),
      cut: this.room?.walls.filter(w => w.cut).map(w => w.side) ?? [],
      character: this.character ? 'glb' : this.characterTried ? 'placeholder' : 'loading',
    }
  }

  /** QA/debug: actor states */
  debugActors() { return [...this.actors.values()].map(a => ({ id: a.id, ...a.debug() })) }
  /** QA/debug: anchors of the current room */
  debugAnchors() { return this.room ? [...this.room.anchors.values()].map(a => ({ name: a.name, x: +a.pos.x.toFixed(2), y: +a.pos.y.toFixed(2), z: +a.pos.z.toFixed(2), yaw: +a.yaw.toFixed(2) })) : [] }
  /** QA/debug: renderer + internals (not part of the game API) */
  get internals() { return { renderer: this.renderer, scene: this.scene, camera: this.rig.camera, rig: this.rig, room: this.room } }

  // =========================================================================
  // input
  // =========================================================================
  private toNdc(e: { clientX: number; clientY: number }, out: THREE.Vector2) {
    const r = this.canvas.getBoundingClientRect()
    out.set(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1)
    return out
  }

  private onPointerDown(e: PointerEvent) {
    try { this.canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    this.pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, button: e.button, t0: performance.now() })
    this.dragMoved = false
    this.lastMoveT = performance.now()
    if (this.pointers.size === 1) this.rig.dragStart()
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }
  }

  private onPointerMove(e: PointerEvent) {
    this.toNdc(e, this.pointer)
    this.pointerIn = true
    this.pointerDirty = true
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX; p.y = e.clientY
    const now = performance.now()
    const dt = (now - this.lastMoveT) / 1000
    this.lastMoveT = now
    if (Math.hypot(p.x - p.x0, p.y - p.y0) >= 6) this.dragMoved = true
    if (!this.dragMoved) return
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      if (this.pinch.d > 0 && d > 0) this.rig.zoomFactor(this.pinch.d / d)
      this.rig.dragPan(mx - this.pinch.mx, my - this.pinch.my, this.cssH)
      this.pinch = { d, mx, my }
    } else if (p.button === 2 || p.button === 1 || e.shiftKey) {
      this.rig.dragPan(dx, dy, this.cssH)
    } else {
      this.rig.dragRotate(dx, dt)
    }
  }

  private onPointerUp(e: PointerEvent, cancel = false) {
    const p = this.pointers.get(e.pointerId)
    this.pointers.delete(e.pointerId)
    try { this.canvas.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    if (this.pointers.size < 2) this.pinch = null
    if (this.pointers.size === 0) this.rig.dragEnd()
    if (!p || cancel) return
    const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0)
    if (moved < 6 && !this.dragMoved && p.button === 0 && this.pointers.size === 0) {
      const hit = this.doPick(this.toNdc(e, new THREE.Vector2()))
      if (hit) {
        const local = this.world.worldToLocal(hit.point.clone())
        try { this.opts.onPick?.({ key: hit.key, kind: hit.kind, point: { x: local.x, y: local.y, z: local.z } }) } catch { /* ignore */ }
      }
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    this.rig.zoomFactor(Math.exp(d * 0.0012))
  }

  private doPick(ndc: THREE.Vector2): Hit | null {
    const list = [...this.actors.values()].filter(a => !a.hidden).map(a => ({ id: a.id, proxy: a.proxy as THREE.Object3D }))
    return this.picker.pick(ndc, this.rig.camera, this.room, list)
  }

  private setHover(key: string | null) {
    if (key === this.hoverKey) return
    this.hoverKey = key
    this.glow.set([this.highlightKey, this.hoverKey], this.room)
    this.canvas.style.cursor = key && key !== 'floor' ? 'pointer' : ''
    try { this.opts.onHover?.(key) } catch { /* ignore */ }
  }

  // =========================================================================
  // frame
  // =========================================================================
  private frame(dt: number) {
    const r = this.renderer
    if (!r || this.disposed) return
    this.rig.update(dt)
    this.world.rotation.y = this.rig.turntable
    const room = this.room
    if (room) {
      updateCutaway(room, this.rig.horizontalDir(new THREE.Vector2()), dt)
      this.lighting?.update(dt)
      r.toneMappingExposure = this.lighting?.exposure ?? 1
      // crowd snapshot (positions from the previous frame) for local avoidance between walkers
      this.crowd.length = 0
      for (const a of this.actors.values()) { const n = a.neighbour(); if (n) this.crowd.push(n) }
      for (const a of this.actors.values()) a.update(dt)
      this.props.update(dt * Math.max(0.5, this.speed || 1))
    }
    // hover picking (throttled; never while dragging)
    const now = performance.now()
    if (this.pointerDirty && now - this.lastPick > 60 && !this.dragMoved) {
      this.lastPick = now
      this.pointerDirty = false
      const hit = this.pointerIn ? this.doPick(this.pointer) : null
      this.setHover(hit && hit.kind !== 'floor' ? hit.key : null)
    }
    this.glow.update(dt)
    // room swap fade + drop-in
    this.fade.v += (this.fade.target - this.fade.v) * Math.min(1, dt * (this.fade.target > this.fade.v ? 7 : 12))
    if (Math.abs(this.fade.v - this.fade.target) < 0.01) this.fade.v = this.fade.target
    this.canvas.style.opacity = this.fade.v >= 0.999 ? '' : this.fade.v.toFixed(3)
    if (this.intro < 1) {
      this.intro = Math.min(1, this.intro + dt / 0.55)
      const e = easeOut(this.intro)
      this.world.position.y = (1 - e) * -0.35
      this.world.scale.setScalar(0.975 + 0.025 * e)
    }
    r.render(this.scene, this.rig.camera)
    this.frameCount++
    for (const cb of this.frameCbs) { try { cb() } catch { /* a failing overlay must not stop the loop */ } }
  }
}
