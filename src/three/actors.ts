// People: character clones, looks, animation cross-fades, declarative tasks (walk-then-act), anchor reservation,
// moods (morphs + idle variants), emotes, held props, contact shadows and pick proxies.
import * as THREE from 'three'
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { ActorSpec, ActorTask, AnimName, Emote, Look, Mood } from './types'
import type { GLTF } from './loader'
import type { Anchor, Room } from './room'
import type { P2 } from './navgrid'
import { CROWD, doorwayBusy, standingBlockers, steer, type Neighbour } from './crowd'
import { installGlow } from './picking'
import { accNodes, hairNode, lookColors, OPTIONAL_NODES, resolveLook, topNode } from './looks'
import {
  angleDiff, approachAnchor, clamp, damp, easeInOut, exitAnchor, exitStandAnchor, hash01, normAnchor, Reservations,
  taskAnchor, taskKey,
} from './math'

const WALK_SPEED = 1.35
const FADE = 0.25

/** clip fallbacks when character.glb lacks a clip */
const CLIP_FALLBACK: Partial<Record<string, string>> = {
  idle_tired: 'idle', sit_type: 'sit_idle', sit_think: 'sit_idle', eat_sit: 'sit_idle', cook: 'idle', register: 'cook',
  phone: 'idle', talk: 'idle', film: 'phone', carry: 'idle', stretch: 'idle', cheer: 'wave', wave: 'idle', stressed: 'idle',
}
const ONE_SHOT = new Set(['cheer', 'wave', 'stretch'])

export interface ActorEnv {
  room(): Room | null
  reservations: Reservations
  speed(): number
  character(): GLTF | null
  props(): GLTF | null
  /** shared contact-shadow resources */
  shadowGeo: THREE.BufferGeometry
  shadowMat: THREE.Material
  proxyGeo: THREE.BufferGeometry
  proxyMat: THREE.Material
  /** everyone standing or walking in the room this frame (see Actor.neighbour), for local avoidance */
  crowd(): readonly Neighbour[]
  /** spots people are queueing at for a taken seat (actor id → floor point), so queuers spread out */
  waitSpots: Map<string, P2>
}

type Posture = 'stand' | 'sit' | 'lie'

type Step =
  | { t: 'appear'; pos: THREE.Vector3; yaw: number }
  | { t: 'standup'; to: THREE.Vector3; yaw: number }
  | { t: 'walk'; to: P2; path?: P2[]; i?: number; soft?: boolean; blockT?: number; ghost?: number; waiting?: boolean; aheadT?: number; replans?: number }
  | { t: 'glide'; pos: THREE.Vector3; yaw: number; anim: string; posture: Posture; dur: number; turnFirst: boolean; from?: THREE.Vector3; fromYaw?: number; el?: number; turned?: boolean }
  | { t: 'act'; anim: string }
  | { t: 'linger'; anim: string; dur: number; el?: number }
  | { t: 'wait'; anchor: string; el?: number }
  | { t: 'wander' }
  | { t: 'fadeout' }

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const clipCache = new WeakMap<GLTF, THREE.AnimationClip[]>()
/**
 * The character's clips as the runtime plays them: morph-target tracks are dropped (faces are driven by mood/blink
 * code on the baked mesh, whose primitives no longer exist as separate nodes).
 */
function runtimeClips(gltf: GLTF): THREE.AnimationClip[] {
  let c = clipCache.get(gltf)
  if (!c) {
    c = gltf.animations.map(a => new THREE.AnimationClip(a.name, a.duration, a.tracks.filter(t => !t.name.endsWith('.morphTargetInfluences'))))
    clipCache.set(gltf, c)
  }
  return c
}

const UPPER = /^(spine|chest|neck|head|shoulder_[lr]|upperarm_[lr]|forearm_[lr]|hand_[lr])\./
const additiveCache = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>()
/** upper-body-only additive version of a clip (relative to its first frame), for emotes while seated */
function upperAdditive(clip: THREE.AnimationClip): THREE.AnimationClip {
  let c = additiveCache.get(clip)
  if (!c) {
    const tracks = clip.tracks.filter(t => UPPER.test(t.name) && !t.name.endsWith('.position') && !t.name.endsWith('.scale')).map(t => t.clone())
    c = THREE.AnimationUtils.makeClipAdditive(new THREE.AnimationClip(`${clip.name}__upper_add`, clip.duration, tracks), 0)
    additiveCache.set(clip, c)
  }
  return c
}

function strHash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

export class Actor {
  readonly id: string
  spec: ActorSpec
  look: Look
  readonly obj = new THREE.Group()
  private model: THREE.Object3D
  private mixer: THREE.AnimationMixer | null = null
  private clips = new Map<string, THREE.AnimationClip>()
  private actions = new Map<string, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private currentName = ''
  private overlay: { action: THREE.AnimationAction; name: string; until: number; additive: boolean } | null = null
  materials: THREE.MeshStandardMaterial[] = []
  private matByName = new Map<string, THREE.MeshStandardMaterial>()
  private bakedMat: THREE.MeshStandardMaterial | null = null
  private baked: THREE.SkinnedMesh | null = null
  private baseTransparent = new Map<THREE.Material, { t: boolean; o: number; dw: boolean }>()
  private morphMeshes: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null
  private socketR: THREE.Object3D | null = null
  private held: { name: string; obj: THREE.Object3D } | null = null
  private placeholder = false
  readonly shadow: THREE.Mesh
  readonly proxy: THREE.Mesh
  // behaviour
  task: ActorTask | null = null
  key = ''
  private steps: Step[] = []
  posture: Posture = 'stand'
  private seatExit: { pos: THREE.Vector3; yaw: number } | null = null
  yaw = 0
  private moveSpeed = 0
  /** last walking direction (unit, floor plane) for the crowd */
  private dirX = 0
  private dirZ = 0
  hidden = true
  private opacity = 0
  private fadeTarget = 0
  moodName: Mood = 'neutral'
  private morph = { smile: 0, frown: 0, sleepy: 0, worried: 0 }
  private blinkT = 2
  private blinkV = 0
  private emoteQ: Emote | null = null
  private stressT = 8
  private rand: () => number
  private wanderAnchor: string | null = null
  private time = 0
  /** snapped into the room yet (first task applied without walking) */
  placed = false

  constructor(id: string, spec: ActorSpec, private env: ActorEnv) {
    this.id = id
    this.spec = spec
    this.look = resolveLook(spec.look)
    this.rand = rng(strHash(id))
    this.obj.name = `actor_${id}`
    this.shadow = new THREE.Mesh(env.shadowGeo, env.shadowMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.012
    this.shadow.renderOrder = 1
    this.shadow.name = 'contact_shadow'
    this.proxy = new THREE.Mesh(env.proxyGeo, env.proxyMat)
    this.proxy.name = 'pick_proxy'
    this.proxy.position.y = 0.86
    this.obj.add(this.shadow, this.proxy)
    this.model = this.buildModel()
    this.obj.add(this.model)
    this.applyLook()
    this.obj.visible = false
  }

  // -------------------------------------------------------------------------
  // model
  // -------------------------------------------------------------------------
  private buildModel(): THREE.Object3D {
    const gltf = this.env.character()
    if (!gltf) { this.placeholder = true; return this.buildPlaceholder() }
    const m = skeletonClone(gltf.scene)
    m.name = 'character'
    // The skinned parts are re-baked per actor into ONE skinned mesh with vertex colours (see bake()): one draw call
    // (+1 shadow) and one bone texture per person instead of ~12. Unskinned parts (if any) keep cloned materials.
    const skinned: THREE.SkinnedMesh[] = []
    const byName = new Map<string, THREE.MeshStandardMaterial>()
    m.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) { skinned.push(mesh as THREE.SkinnedMesh); return }
      mesh.castShadow = true
      const swap = (mat: THREE.Material) => {
        const key = mat.name || mat.uuid
        let c = byName.get(key)
        if (!c) { c = mat.clone() as THREE.MeshStandardMaterial; byName.set(key, c) }
        return c
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
    })
    for (const s of skinned) { s.removeFromParent(); s.skeleton?.dispose() }
    this.matByName = byName
    this.bakedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0 })
    this.bakedMat.name = 'm_actor'
    installGlow(this.bakedMat)
    this.materials = [this.bakedMat, ...byName.values()]
    this.head = m.getObjectByName('head') ?? null
    this.socketR = m.getObjectByName('socket_r') ?? m.getObjectByName('hand_r') ?? null
    this.mixer = new THREE.AnimationMixer(m)
    for (const c of runtimeClips(gltf)) this.clips.set(c.name, c)
    return m
  }

  private buildPlaceholder(): THREE.Object3D {
    const g = new THREE.Group()
    g.name = 'placeholder'
    const mk = (name: string, color: string) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
      m.name = name
      this.matByName.set(name, m)
      this.materials.push(m)
      return m
    }
    const skin = mk('m_skin', '#e0b08a'), top = mk('m_top', '#888'), bottom = mk('m_bottom', '#345'), hair = mk('m_hair', '#3b2a20'), shoes = mk('m_shoes', '#eee')
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, name: string, x = 0) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y, 0)
      mesh.castShadow = true
      mesh.name = name
      g.add(mesh)
      return mesh
    }
    const legs = new THREE.Group(); legs.name = 'legs'; g.add(legs)
    for (const x of [-0.09, 0.09]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 4, 8), bottom); leg.position.set(x, 0.42, 0); leg.castShadow = true; legs.add(leg)
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), shoes); shoe.position.set(x, 0.04, 0.03); shoe.castShadow = true; legs.add(shoe)
    }
    const torso = new THREE.Group(); torso.name = 'upper'; g.add(torso)
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.4, 4, 12), top); body.position.y = 1.08; body.scale.z = 0.7; body.castShadow = true; torso.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), skin); head.position.y = 1.52; head.castShadow = true; head.name = 'head'; torso.add(head)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), hair); cap.position.y = 1.55; cap.rotation.x = -0.25; torso.add(cap)
    for (const x of [-0.06, 0.06]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mk('m_eye' + x, '#222')); e.position.set(x, 1.54, 0.15); torso.add(e) }
    void add
    this.head = head
    return g
  }

  applyLook() {
    const look = this.look
    const colors = lookColors(look)
    if (!this.placeholder) {
      const show = new Set<string>([hairNode(look), topNode(look), ...accNodes(look)].filter((n): n is string => !!n))
      for (const n of OPTIONAL_NODES) {
        const o = this.model.getObjectByName(n)
        if (o) o.visible = show.has(n)
      }
      this.bake(show, colors)
    }
    for (const [name, hex] of Object.entries(colors)) this.matByName.get(name)?.color.set(hex)
    const h = clamp(look.height ?? 1, 0.9, 1.1), b = clamp(look.build ?? 1, 0.85, 1.2)
    const bw = 1 + (b - 1) * 0.75
    this.model.scale.set(h * bw, h, h * (1 + (b - 1) * 0.5))
  }

  /**
   * Merge the source character's skinned primitives that this look shows (body + hair + top add-on + accessories)
   * into one SkinnedMesh bound to this actor's cloned bones, colouring vertices from the look's material colours.
   */
  private bake(show: Set<string>, colors: Record<string, string>) {
    const gltf = this.env.character()
    if (!gltf) return
    if (this.baked) { this.baked.removeFromParent(); this.baked.geometry.dispose(); this.baked.skeleton.dispose(); this.baked = null }
    const src = gltf.scene
    const owner = (o: THREE.Object3D): string | null => {
      for (let p: THREE.Object3D | null = o; p && p !== src; p = p.parent) if (p.name === 'body' || show.has(p.name) || OPTIONAL_NODES.includes(p.name)) return p.name
      return null
    }
    const parts: THREE.SkinnedMesh[] = []
    let body: THREE.SkinnedMesh | null = null
    src.traverse(o => {
      const s = o as THREE.SkinnedMesh
      if (!s.isSkinnedMesh) return
      const n = owner(s)
      if (n === 'body') { if (!body || s.morphTargetDictionary) body = body && body.morphTargetDictionary ? body : s }
      if (n === 'body' || (n && show.has(n))) parts.push(s)
    })
    const bodyMesh = body as THREE.SkinnedMesh | null
    if (!bodyMesh || !parts.length) return
    const nMorph = bodyMesh.geometry.morphAttributes.position?.length ?? 0
    const morphNames = (bodyMesh.geometry.morphAttributes.position ?? []).map((a, i) => a.name || Object.keys(bodyMesh.morphTargetDictionary ?? {}).find(k => bodyMesh.morphTargetDictionary![k] === i) || `m${i}`)
    const invBody = new THREE.Matrix4().copy(bodyMesh.bindMatrix).invert()
    const col = new THREE.Color()
    const geos: THREE.BufferGeometry[] = []
    for (const p of parts) {
      const g0 = p.geometry
      const g = new THREE.BufferGeometry()
      const count = g0.attributes.position.count
      g.setAttribute('position', g0.attributes.position.clone())
      g.setAttribute('normal', g0.attributes.normal ? g0.attributes.normal.clone() : new THREE.BufferAttribute(new Float32Array(count * 3), 3))
      const si = g0.attributes.skinIndex, sw = g0.attributes.skinWeight
      const idx = new Uint16Array(count * 4), wts = new Float32Array(count * 4)
      for (let i = 0; i < count; i++) for (let k = 0; k < 4; k++) {
        idx[i * 4 + k] = si ? si.getComponent(i, k) : 0
        wts[i * 4 + k] = sw ? sw.getComponent(i, k) : k === 0 ? 1 : 0
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4))
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4))
      const mat = (Array.isArray(p.material) ? p.material[0] : p.material) as THREE.MeshStandardMaterial
      const hex = colors[mat.name]
      if (hex) col.set(hex); else col.copy(mat.color ?? col.set('#888888'))
      const c = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3))
      if (g0.index) g.setIndex(g0.index.clone())
      else g.setIndex(Array.from({ length: count }, (_, i) => i))
      // morph targets: body parts keep theirs, everything else gets zero deltas so the merge lines up
      const mp = g0.morphAttributes.position, mn = g0.morphAttributes.normal
      if (nMorph) {
        g.morphAttributes.position = Array.from({ length: nMorph }, (_, i) => (mp?.[i] ? mp[i].clone() : new THREE.BufferAttribute(new Float32Array(count * 3), 3)))
        g.morphAttributes.normal = Array.from({ length: nMorph }, (_, i) => (mn?.[i] ? mn[i].clone() : new THREE.BufferAttribute(new Float32Array(count * 3), 3)))
        g.morphTargetsRelative = true
      }
      if (!p.bindMatrix.equals(bodyMesh.bindMatrix)) g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(invBody, p.bindMatrix))
      geos.push(g)
    }
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (geos.length > 1) for (const g of geos) g.dispose()
    if (!merged) return
    merged.morphTargetsRelative = true
    if (nMorph) morphNames.forEach((n, i) => { const p = merged.morphAttributes.position?.[i]; if (p) p.name = n; const q = merged.morphAttributes.normal?.[i]; if (q) q.name = n })
    merged.computeBoundingSphere()
    const mesh = new THREE.SkinnedMesh(merged, this.bakedMat!)
    mesh.name = 'actor_mesh'
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    // same placement as the source body, bound to this actor's bones
    src.updateMatrixWorld(true)
    const srcInv = new THREE.Matrix4().copy(src.matrixWorld).invert()
    new THREE.Matrix4().multiplyMatrices(srcInv, bodyMesh.matrixWorld).decompose(mesh.position, mesh.quaternion, mesh.scale)
    this.model.add(mesh)
    const bones = bodyMesh.skeleton.bones.map(b => (this.model.getObjectByName(b.name) as THREE.Bone) ?? b)
    const skeleton = new THREE.Skeleton(bones, bodyMesh.skeleton.boneInverses.map(m => m.clone()))
    mesh.bind(skeleton, bodyMesh.bindMatrix.clone())
    this.baked = mesh
    this.morphMeshes = nMorph ? [mesh] : []
  }

  setSpec(spec: ActorSpec) {
    const before = JSON.stringify(resolveLook(this.spec.look))
    this.spec = spec
    this.look = resolveLook(spec.look)
    if (JSON.stringify(this.look) !== before) this.applyLook()
  }

  // -------------------------------------------------------------------------
  // animation
  // -------------------------------------------------------------------------
  private clipFor(name: string): THREE.AnimationClip | null {
    let n: string | undefined = name
    for (let i = 0; i < 4 && n; i++) {
      const c = this.clips.get(n)
      if (c) return c
      n = CLIP_FALLBACK[n]
    }
    return this.clips.get('idle') ?? null
  }

  private action(name: string): THREE.AnimationAction | null {
    if (!this.mixer) return null
    let a = this.actions.get(name)
    if (!a) {
      const clip = this.clipFor(name)
      if (!clip) return null
      a = this.mixer.clipAction(clip)
      this.actions.set(name, a)
    }
    return a
  }

  /** cross-fade the base (looping) animation */
  private play(name: string, fade = FADE) {
    if (this.currentName === name && this.current) return
    this.currentName = name
    if (this.placeholder) return
    const next = this.action(name)
    if (!next) return
    if (next === this.current) return
    next.reset()
    next.setLoop(ONE_SHOT.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    next.clampWhenFinished = true
    next.enabled = true
    next.setEffectiveTimeScale(1)
    next.setEffectiveWeight(1)
    next.play()
    if (this.overlay) { /* overlay stays on top; base swaps underneath */ }
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false)
    else if (this.current) this.current.stop()
    this.current = next
  }

  /**
   * Emote on top of the current state. Standing: cross-fade to the full clip and back. Seated: an additive
   * upper-body version of the clip, so people cheer / talk / wave from their chairs without standing up.
   * Lying down: skipped.
   */
  private playOverlay(name: string, dur?: number) {
    if (this.placeholder || !this.mixer) { this.overlay = null; return }
    if (this.posture === 'lie') return
    if (this.overlay) this.endOverlay()
    const seated = this.posture === 'sit'
    const clip = this.clipFor(name)
    if (!clip) return
    const a = seated ? this.mixer.clipAction(upperAdditive(clip)) : this.action(name)
    if (!a || a === this.current) return
    const once = ONE_SHOT.has(name) || !this.clips.has(name)
    a.reset()
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    a.clampWhenFinished = true
    a.enabled = true
    a.setEffectiveWeight(1)
    a.play()
    if (seated) a.fadeIn(0.25)
    else if (this.current) this.current.crossFadeTo(a, 0.22, false)
    const d = dur ?? (once ? clip.duration : 2.6)
    this.overlay = { action: a, name, until: this.time + d, additive: seated }
  }

  private endOverlay() {
    const o = this.overlay
    if (!o) return
    this.overlay = null
    const base = this.current
    if (o.additive) { o.action.fadeOut(0.3); return }
    if (base) {
      base.reset(); base.enabled = true; base.setEffectiveWeight(1); base.play()
      o.action.crossFadeTo(base, 0.3, false)
    } else o.action.fadeOut(0.3)
  }

  private moodIdle(): string {
    return this.moodName === 'tired' ? 'idle_tired' : 'idle'
  }

  // -------------------------------------------------------------------------
  // public behaviour
  // -------------------------------------------------------------------------
  setTask(t: ActorTask, snap: boolean) {
    const k = taskKey(t)
    if (k === this.key && this.task && !snap) return
    this.task = t
    this.key = k
    this.plan(snap)
  }

  setMood(m: Mood) {
    this.moodName = m
    const s = this.steps[0]
    if (s && s.t === 'act' && (s.anim === 'idle' || s.anim === 'idle_tired')) { s.anim = this.moodIdle(); this.play(s.anim) }
  }

  emote(e: Emote) {
    const s = this.steps[0]
    if (!this.hidden && s && (s.t === 'act' || s.t === 'linger' || s.t === 'wait')) this.playOverlay(e)
    else this.emoteQ = e
  }

  hold(prop: string | null) {
    if (this.held && this.held.name === prop) return
    if (this.held) { this.held.obj.removeFromParent(); disposeClone(this.held.obj); this.held = null }
    if (!prop) return
    const src = this.env.props()?.scene.getObjectByName(prop.replace(/-/g, '_'))
    const socket = this.socketR
    if (!src || !socket) return
    const obj = src.clone(true)
    obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.setScalar(1)
    obj.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true })
    // compensate for the actor's height/build scale so the prop keeps its size
    obj.scale.set(1 / this.model.scale.x, 1 / this.model.scale.y, 1 / this.model.scale.z)
    socket.add(obj)
    this.held = { name: prop, obj }
  }

  /**
   * This person as a crowd neighbour for other walkers: null while hidden, fading, seated or lying (seats are
   * reserved and never in a walking path). Walking = on a walk step and actually moving.
   */
  neighbour(): Neighbour | null {
    if (this.hidden || this.opacity < 0.5 || this.posture !== 'stand') return null
    const s = this.steps[0]
    if (s && s.t === 'glide' && s.posture !== 'stand') return null
    const moving = !!s && s.t === 'walk' && !s.waiting && this.moveSpeed > 0.05
    return { id: this.id, x: this.obj.position.x, z: this.obj.position.z, dirX: moving ? this.dirX : 0, dirZ: moving ? this.dirZ : 0, moving }
  }

  /** world-space head position (for bubbles) */
  headPos(out: THREE.Vector3): THREE.Vector3 {
    if (this.head) { this.head.getWorldPosition(out); out.y += 0.1 } else out.copy(this.obj.position).setY(this.obj.position.y + 1.6)
    return out
  }

  // -------------------------------------------------------------------------
  // planning
  // -------------------------------------------------------------------------
  private anchor(name: string): Anchor | undefined { return this.env.room()?.anchor(name) }

  private releaseReservation() { this.env.reservations.release(this.id); this.env.waitSpots.delete(this.id); this.wanderAnchor = null }

  private plan(snap: boolean) {
    const room = this.env.room()
    const t = this.task
    this.steps = []
    this.releaseReservation()
    if (!t || !room) return
    const res = this.env.reservations
    const has = (n: string) => room.has(n)
    const target = taskAnchor(t)
    let A: Anchor | undefined
    if (target) {
      A = this.anchor(target)
      if (A && !res.reserve(A.name, this.id)) {
        // someone else holds it: wait nearby
        const wp = this.waitPoint(A, room)
        if (snap || this.hidden) this.snapTo(wp, A.yaw, 'stand')
        this.showIfHidden(snap)
        this.prefixStandup()
        this.steps.push({ t: 'walk', to: { x: wp.x, z: wp.z } }, { t: 'wait', anchor: A.name })
        return
      }
    }

    if (t.kind === 'hidden') {
      if (snap || this.hidden) { this.setHidden(true); return }
      this.steps.push({ t: 'fadeout' })
      return
    }
    if (t.kind === 'leave') {
      const ex = exitAnchor(t.at, has)
      if (snap || this.hidden || !ex) { this.setHidden(true); return }
      const exA = room.anchor(ex)!
      const st = exitStandAnchor(ex, has)
      this.prefixStandup()
      const stA = st ? room.anchor(st) : undefined
      if (stA) this.steps.push({ t: 'walk', to: { x: stA.pos.x, z: stA.pos.z }, soft: true })
      this.steps.push({ t: 'glide', pos: exA.pos.clone(), yaw: exA.yaw, anim: 'walk', posture: 'stand', dur: 0, turnFirst: false }, { t: 'fadeout' })
      return
    }

    // visible tasks: final placement
    let final: { pos: THREE.Vector3; yaw: number; anim: string; posture: Posture; approach?: THREE.Vector3 } | null = null
    const mi = this.moodIdle()
    switch (t.kind) {
      case 'idle':
        if (A) final = { pos: A.pos.clone(), yaw: A.yaw, anim: t.anim ?? mi, posture: 'stand' }
        else final = { pos: this.obj.position.clone(), yaw: this.yaw, anim: t.anim ?? mi, posture: 'stand' }
        break
      case 'use':
        if (A) final = { pos: A.pos.clone(), yaw: A.yaw, anim: t.anim, posture: 'stand' }
        else final = { pos: this.obj.position.clone(), yaw: this.yaw, anim: t.anim, posture: 'stand' }
        break
      case 'sit': case 'lie': {
        if (!A) { final = { pos: this.spawnPos(room), yaw: this.yaw, anim: mi, posture: 'stand' }; break }
        const ap = approachAnchor(A.name, has)
        const approach = ap ? room.anchor(ap)!.pos.clone() : this.nearFree(A.pos, room)
        final = { pos: A.pos.clone(), yaw: A.yaw, anim: t.kind === 'lie' ? 'sleep' : (t.anim ?? 'sit_idle'), posture: t.kind === 'lie' ? 'lie' : 'sit', approach }
        break
      }
      case 'goto': {
        const p = room.nav.nearestFree({ x: t.point.x, z: t.point.z }) ?? { x: t.point.x, z: t.point.z }
        final = { pos: new THREE.Vector3(p.x, 0, p.z), yaw: this.yaw, anim: mi, posture: 'stand' }
        break
      }
      case 'wander': {
        if (snap || this.hidden) {
          const a = this.pickWander(room)
          const pos = a ? a.pos.clone() : this.spawnPos(room)
          if (snap || !this.hidden) { this.snapTo(pos, a?.yaw ?? 0, 'stand'); this.showIfHidden(snap) }
          else {
            this.arrive(room)
            // walk in from the door to the wander spot before lingering (not in the doorway)
            if (a) this.steps.push({ t: 'walk', to: { x: a.pos.x, z: a.pos.z }, soft: true }, { t: 'glide', pos: a.pos.clone(), yaw: a.yaw, anim: mi, posture: 'stand', dur: 0, turnFirst: false })
          }
          if (a) { this.steps.push({ t: 'linger', anim: mi, dur: 3 + this.rand() * 5 }) }
        } else this.prefixStandup()
        this.steps.push({ t: 'wander' })
        if (snap && this.steps[0]) this.play((this.steps[0] as { anim?: string }).anim ?? mi, 0)
        return
      }
    }
    if (!final) return

    if (snap) {
      this.snapTo(final.pos, final.yaw, final.posture)
      this.showIfHidden(true)
      this.steps.push({ t: 'act', anim: final.anim })
      this.play(final.anim, 0)
      if (final.posture !== 'stand') this.seatExit = { pos: final.approach ?? final.pos.clone(), yaw: final.yaw }
      return
    }
    if (this.hidden) this.arrive(room)
    else this.prefixStandup()
    if (final.posture === 'stand') {
      if (t.kind === 'idle' && !A) { this.steps.push({ t: 'act', anim: final.anim }); return }
      this.steps.push({ t: 'walk', to: { x: final.pos.x, z: final.pos.z }, soft: true })
      this.steps.push({ t: 'glide', pos: final.pos, yaw: t.kind === 'goto' ? NaN : final.yaw, anim: final.anim, posture: 'stand', dur: 0, turnFirst: false })
      this.steps.push({ t: 'act', anim: final.anim })
    } else {
      const ap = final.approach!
      this.steps.push({ t: 'walk', to: { x: ap.x, z: ap.z }, soft: true })
      this.steps.push({ t: 'glide', pos: final.pos, yaw: final.yaw, anim: final.anim, posture: final.posture, dur: 0, turnFirst: true })
      this.steps.push({ t: 'act', anim: final.anim })
    }
  }

  private prefixStandup() {
    if (this.posture !== 'stand' && this.seatExit) this.steps.push({ t: 'standup', to: this.seatExit.pos.clone(), yaw: this.yaw })
    else if (this.posture !== 'stand') this.steps.push({ t: 'standup', to: this.obj.position.clone().setY(0), yaw: this.yaw })
  }

  private waitPoint(A: Anchor, room: Room): THREE.Vector3 {
    const dir = new THREE.Vector3(Math.sin(A.yaw), 0, Math.cos(A.yaw))
    const p = A.pos.clone().addScaledVector(dir, -1.1)
    const q = room.nav.nearestFree({ x: p.x, z: p.z }) ?? { x: p.x, z: p.z }
    // several people waiting for the same seat queue side by side instead of standing inside each other
    const others = this.env.crowd().filter(o => o.id !== this.id)
    const spots = [...this.env.waitSpots].filter(([id]) => id !== this.id).map(([, p]) => p)
    const gap = CROWD.radius * 2 + 0.1
    const taken = (x: number, z: number) => others.some(o => Math.hypot(o.x - x, o.z - z) < gap) || spots.some(o => Math.hypot(o.x - x, o.z - z) < gap)
    const claim = (x: number, z: number) => { this.env.waitSpots.set(this.id, { x, z }); return new THREE.Vector3(x, 0, z) }
    if (!taken(q.x, q.z)) return claim(q.x, q.z)
    for (let ring = 1; ring <= 3; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + ring * 0.4
        const x = q.x + Math.cos(a) * 0.65 * ring, z = q.z + Math.sin(a) * 0.65 * ring
        if (room.nav.isFree({ x, z }) && !taken(x, z)) return claim(x, z)
      }
    }
    return claim(q.x, q.z)
  }

  private nearFree(p: THREE.Vector3, room: Room): THREE.Vector3 {
    const q = room.nav.nearestFree({ x: p.x, z: p.z }) ?? { x: p.x, z: p.z }
    return new THREE.Vector3(q.x, 0, q.z)
  }

  private spawnPos(room: Room): THREE.Vector3 {
    const a = room.anchor('spawn')
    if (a) return a.pos.clone()
    const c = room.nav.nearestFree({ x: 0, z: 0 }) ?? { x: 0, z: 0 }
    return new THREE.Vector3(c.x, 0, c.z)
  }

  /** hidden → visible without snapping: fade in at the room's door, then walk */
  private arrive(room: Room) {
    const ex = exitAnchor(undefined, n => room.has(n))
    const a = ex ? room.anchor(ex) : room.anchor('spawn')
    const pos = a ? a.pos.clone() : this.spawnPos(room)
    const yaw = a ? a.yaw + Math.PI : 0
    this.steps.push({ t: 'appear', pos, yaw })
  }

  private snapTo(pos: THREE.Vector3, yaw: number, posture: Posture) {
    this.obj.position.copy(pos)
    this.yaw = yaw
    this.obj.rotation.y = yaw
    this.posture = posture
    this.moveSpeed = 0
    this.seatExit = null
  }

  private showIfHidden(instant: boolean) {
    if (!this.hidden) return
    this.hidden = false
    this.obj.visible = true
    this.fadeTarget = 1
    if (instant) this.setOpacity(1)
    this.placed = true
  }

  private setHidden(instant: boolean) {
    this.releaseReservation()
    this.fadeTarget = 0
    this.hidden = true
    if (instant) { this.setOpacity(0); this.obj.visible = false }
    this.steps = []
    this.posture = 'stand'
    this.seatExit = null
  }

  private pickWander(room: Room): Anchor | null {
    const res = this.env.reservations
    const idle = room.anchorsWithPrefix('idle_').filter(a => a.name !== this.wanderAnchor && (!res.holder(a.name) || res.holder(a.name) === this.id))
    if (!idle.length) return null
    const a = idle[Math.floor(this.rand() * idle.length) % idle.length]
    if (!res.reserve(a.name, this.id)) return null
    this.wanderAnchor = a.name
    return a
  }

  // -------------------------------------------------------------------------
  // per-frame
  // -------------------------------------------------------------------------
  update(dtRaw: number) {
    const speed = this.env.speed()
    const dt = dtRaw * speed
    this.time += dt
    this.updateFade(dtRaw)
    if (dt > 0) this.runSteps(dt, speed)
    // overlays (emotes)
    if (this.overlay && this.time >= this.overlay.until) this.endOverlay()
    const s0 = this.steps[0]
    if (this.emoteQ && s0 && (s0.t === 'act' || s0.t === 'linger' || s0.t === 'wait')) { const e = this.emoteQ; this.emoteQ = null; this.playOverlay(e) }
    // stressed mood: hands-on-head now and then while standing idle
    if (this.moodName === 'stressed' && s0?.t === 'act' && this.posture === 'stand' && !this.overlay) {
      this.stressT -= dt
      if (this.stressT <= 0) { this.stressT = 7 + this.rand() * 6; this.playOverlay('stressed', 2.4) }
    }
    // walk clip speed matches ground speed
    if (this.current && this.currentName === 'walk') {
      const len = this.current.getClip().duration || 1
      this.current.timeScale = Math.max(0.35, this.moveSpeed / WALK_SPEED) * len
    }
    this.mixer?.update(dt)
    this.placeholderPose(dt)
    this.updateMorphs(dt)
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw))
    this.obj.rotation.y = this.yaw
    // contact shadow + pick proxy follow posture
    const lying = this.posture === 'lie' && (this.steps[0]?.t === 'act' || this.steps[0]?.t === 'standup')
    this.shadow.visible = !lying && this.opacity > 0.05
    const sh = this.shadow.scale.x + ((this.posture === 'sit' ? 0.62 : 0.55) - this.shadow.scale.x) * damp(8, dtRaw)
    this.shadow.scale.set(sh, sh, sh)
    this.shadow.position.y = 0.012 - this.obj.position.y
    if (this.posture === 'lie') { this.proxy.rotation.set(Math.PI / 2, 0, 0); this.proxy.position.set(0, 0.25, 0) }
    else if (this.posture === 'sit') { this.proxy.rotation.set(0, 0, 0); this.proxy.position.set(0, 0.7, 0); this.proxy.scale.set(1, 0.8, 1) }
    else { this.proxy.rotation.set(0, 0, 0); this.proxy.position.set(0, 0.86, 0); this.proxy.scale.set(1, 1, 1) }
  }

  private placeholderPose(dt: number) {
    if (!this.placeholder) return
    const legs = this.model.getObjectByName('legs'), upper = this.model.getObjectByName('upper')
    if (!legs || !upper) return
    const walking = this.currentName === 'walk'
    const sit = this.posture === 'sit' && this.steps[0]?.t !== 'standup'
    const lie = this.posture === 'lie' && this.steps[0]?.t !== 'standup'
    const bob = walking ? Math.abs(Math.sin(this.time * 7)) * 0.04 : Math.sin(this.time * 2) * 0.006
    upper.position.y += ((sit ? -0.36 : 0) + bob - upper.position.y) * damp(12, dt)
    legs.scale.y += ((sit ? 0.55 : 1) - legs.scale.y) * damp(12, dt)
    this.model.rotation.x += ((lie ? -Math.PI / 2 : 0) - this.model.rotation.x) * damp(8, dt)
    this.model.position.y = lie ? 0.12 : 0
  }

  private updateFade(dt: number) {
    if (Math.abs(this.opacity - this.fadeTarget) < 1e-3) return
    const o = this.opacity + Math.sign(this.fadeTarget - this.opacity) * dt / 0.45
    this.setOpacity(clamp(o, 0, 1))
    if (this.opacity === 0 && this.fadeTarget === 0) this.obj.visible = false
  }

  private setOpacity(o: number) {
    this.opacity = o
    const fading = o < 0.999
    for (const m of this.materials) {
      let b = this.baseTransparent.get(m)
      if (!b) { b = { t: m.transparent, o: m.opacity, dw: m.depthWrite }; this.baseTransparent.set(m, b) }
      if (m.transparent !== (fading || b.t)) { m.transparent = fading || b.t; m.needsUpdate = true }
      m.opacity = b.o * o
    }
    ;(this.shadow.material as THREE.Material).opacity = 1
    this.shadow.scale.multiplyScalar(1)
    this.obj.visible = o > 0.001 || this.fadeTarget > 0
  }

  private updateMorphs(dt: number) {
    const lying = this.posture === 'lie' && this.steps[0]?.t === 'act'
    const tgt = { smile: 0, frown: 0, sleepy: 0, worried: 0 }
    if (this.moodName === 'happy') tgt.smile = 0.85
    else if (this.moodName === 'tired') { tgt.sleepy = 0.45; tgt.frown = 0.15 }
    else if (this.moodName === 'stressed') { tgt.worried = 0.9; tgt.frown = 0.35 }
    if (this.overlay?.name === 'cheer' || this.overlay?.name === 'wave') { tgt.smile = 1; tgt.worried = 0; tgt.frown = 0 }
    if (lying) tgt.sleepy = 1
    const k = damp(6, dt)
    for (const key of Object.keys(tgt) as (keyof typeof tgt)[]) this.morph[key] += (tgt[key] - this.morph[key]) * k
    // blink
    this.blinkT -= dt
    if (this.blinkT <= 0) { this.blinkV = 1; this.blinkT = 2.2 + this.rand() * 3.8 }
    this.blinkV = Math.max(0, this.blinkV - dt / 0.14)
    const blink = this.blinkV > 0 ? Math.sin(this.blinkV * Math.PI) : 0
    for (const m of this.morphMeshes) {
      const d = m.morphTargetDictionary!, inf = m.morphTargetInfluences!
      if (d.smile !== undefined) inf[d.smile] = this.morph.smile
      if (d.frown !== undefined) inf[d.frown] = this.morph.frown
      if (d.worried !== undefined) inf[d.worried] = this.morph.worried
      if (d.sleepy !== undefined) inf[d.sleepy] = Math.max(this.morph.sleepy, blink)
    }
  }

  private runSteps(dt: number, speed: number) {
    const room = this.env.room()
    if (!room) return
    let guard = 0
    while (this.steps.length && guard++ < 8) {
      const s = this.steps[0]
      const done = this.step(s, dt, room, speed)
      if (!done) break
      this.steps.shift()
      if (s.t === 'fadeout') break
    }
  }

  /** returns true when the step finished */
  private step(s: Step, dt: number, room: Room, speed: number): boolean {
    const pos = this.obj.position
    switch (s.t) {
      case 'appear': {
        this.snapTo(s.pos, s.yaw, 'stand')
        this.hidden = false
        this.obj.visible = true
        this.fadeTarget = 1
        this.placed = true
        this.play(this.moodIdle(), 0)
        return true
      }
      case 'standup': {
        const g: Step = { t: 'glide', pos: s.to.clone().setY(0), yaw: NaN, anim: this.moodIdle(), posture: 'stand', dur: 0.7, turnFirst: false }
        this.steps[0] = g
        this.posture = 'stand'
        this.seatExit = null
        return false
      }
      case 'walk': {
        if (!s.path) {
          // plan around people standing still (a copy of the walk grid with them blocked), else the plain grid
          const blockers = standingBlockers({ id: this.id, x: pos.x, z: pos.z }, s.to, this.env.crowd())
          const p = (blockers.length ? room.nav.withBlockers(blockers, CROWD.radius + 0.1).findPath({ x: pos.x, z: pos.z }, s.to) : null)
            ?? room.nav.findPath({ x: pos.x, z: pos.z }, s.to)
          s.path = p ?? [{ x: pos.x, z: pos.z }, s.to]
          s.i = 1
          if (s.path.length < 2 || Math.hypot(s.path[s.path.length - 1].x - pos.x, s.path[s.path.length - 1].z - pos.z) < 0.05) return true
          this.play('walk')
        }
        const path = s.path
        const vmax = (this.spec.walkSpeed ?? WALK_SPEED) * (this.moodName === 'tired' ? 0.8 : 1)
        const end = path[path.length - 1]
        let remaining = 0
        {
          let px = pos.x, pz = pos.z
          for (let i = s.i!; i < path.length; i++) { remaining += Math.hypot(path[i].x - px, path[i].z - pz); px = path[i].x; pz = path[i].z }
        }
        // local avoidance: slow / wait / side-step around people, hold before a busy doorway (crowd.ts)
        const next = path[Math.min(s.i!, path.length - 1)]
        const hx = next.x - pos.x, hz = next.z - pos.z, hl = Math.hypot(hx, hz)
        if (hl > 1e-4) { this.dirX = hx / hl; this.dirZ = hz / hl }
        let scale = 1, sideX = 0, sideZ = 0
        if ((s.ghost ?? 0) > 0) s.ghost! -= dt
        else {
          const others = this.env.crowd()
          if (others.length > 1) {
            const me = { id: this.id, x: pos.x, z: pos.z }
            const rest = [me, ...path.slice(s.i!)]
            if (room.doorPoints.some(d => doorwayBusy(me, rest, d, others))) scale = 0
            else {
              const st = steer({ ...me, dirX: this.dirX, dirZ: this.dirZ }, others, remaining)
              scale = st.speed; sideX = st.sideX; sideZ = st.sideZ
              // someone stopped in the way after we planned: plan again around them (a few times per walk at most)
              s.aheadT = st.standingAhead ? (s.aheadT ?? 0) + dt : 0
              if (s.aheadT > 0.35 && (s.replans ?? 0) < 3 && remaining > 0.8) { s.replans = (s.replans ?? 0) + 1; s.aheadT = 0; s.path = undefined; return false }
            }
          }
          // nobody waits forever: after a few seconds stuck, walk through for a moment (Sims-style)
          if (scale < 0.1) { s.blockT = (s.blockT ?? 0) + dt; if (s.blockT > 3.2) { s.ghost = 1.6; s.blockT = 0 } }
          else s.blockT = Math.max(0, (s.blockT ?? 0) - dt)
        }
        const endV = s.soft ? 0.55 : 0
        const brake = Math.sqrt(endV * endV + 2 * 2.4 * remaining)
        const want = Math.min(vmax, brake) * scale
        this.moveSpeed += (want - this.moveSpeed) * damp(want > this.moveSpeed ? 5 : 12, dt)
        const holding = scale < 0.05
        if (holding !== !!s.waiting) { s.waiting = holding; this.play(holding ? this.moodIdle() : 'walk', 0.2) }
        let travel = holding ? this.moveSpeed * dt : Math.max(0.05, this.moveSpeed) * dt
        pos.y += (0 - pos.y) * damp(10, dt) // walking happens on the floor
        while (travel > 0 && s.i! < path.length) {
          const tp = path[s.i!]
          const dx = tp.x - pos.x, dz = tp.z - pos.z
          const d = Math.hypot(dx, dz)
          if (d <= travel) { pos.x = tp.x; pos.z = tp.z; travel -= d; s.i!++ }
          else { pos.x += (dx / d) * travel; pos.z += (dz / d) * travel; travel = 0 }
        }
        // side-step (only onto free floor, and not in the last few centimetres before the goal)
        if ((sideX || sideZ) && remaining > CROWD.radius) {
          const nx = pos.x + sideX * dt, nz = pos.z + sideZ * dt
          if (room.nav.isFree({ x: nx, z: nz })) { pos.x = nx; pos.z = nz }
        }
        // face along the path (look slightly ahead)
        const tp = path[Math.min(s.i!, path.length - 1)]
        const dx = tp.x - pos.x, dz = tp.z - pos.z
        if (Math.hypot(dx, dz) > 0.02) this.yaw += angleDiff(this.yaw, Math.atan2(dx, dz)) * damp(9, dt)
        if (s.i! >= path.length) { pos.x = end.x; pos.z = end.z; return true }
        return false
      }
      case 'glide': {
        if (!s.from) {
          s.from = pos.clone()
          s.fromYaw = this.yaw
          s.el = 0
          const dist = s.from.distanceTo(s.pos)
          if (!Number.isFinite(s.yaw)) s.yaw = dist > 0.05 ? Math.atan2(s.pos.x - pos.x, s.pos.z - pos.z) : this.yaw
          const travelYaw = dist > 0.05 ? Math.atan2(s.pos.x - pos.x, s.pos.z - pos.z) : s.yaw
          s.turnFirst = s.turnFirst && Math.abs(angleDiff(travelYaw, s.yaw)) > 1.6
          if (!s.dur) s.dur = clamp(dist / 1.0 + (s.posture === 'stand' ? 0.1 : 0.35), s.posture === 'stand' ? 0.12 : 0.55, 1.3)
          s.turned = !s.turnFirst
          if (s.posture !== 'stand') { this.posture = s.posture; this.seatExit = { pos: s.from.clone().setY(0), yaw: s.yaw } }
          if (s.turned) this.play(s.anim, s.posture === 'stand' ? FADE : Math.min(0.6, s.dur))
          else this.play(this.moodIdle(), 0.2)
          if (s.posture === 'stand' && s.anim !== 'walk' && dist > 0.05) this.play('walk')
        }
        if (!s.turned) {
          const d = angleDiff(this.yaw, s.yaw)
          const stepA = Math.sign(d) * Math.min(Math.abs(d), dt * 6.5)
          this.yaw += stepA
          this.moveSpeed = 0
          if (Math.abs(angleDiff(this.yaw, s.yaw)) < 0.05) { s.turned = true; s.fromYaw = this.yaw; this.play(s.anim, Math.min(0.6, s.dur)) }
          return false
        }
        s.el! += dt
        const k = clamp(s.el! / s.dur, 0, 1)
        const e = easeInOut(k)
        pos.lerpVectors(s.from, s.pos, e)
        this.yaw = s.fromYaw! + angleDiff(s.fromYaw!, s.yaw) * e
        this.moveSpeed = s.posture === 'stand' ? s.from.distanceTo(s.pos) / s.dur : 0
        if (s.posture === 'stand' && this.currentName === 'walk' && k > 0.55 && s.anim !== 'walk') this.play(s.anim, FADE)
        if (k >= 1) { pos.copy(s.pos); this.yaw = s.yaw; this.moveSpeed = 0; return true }
        return false
      }
      case 'act': {
        this.moveSpeed = 0
        if (this.currentName !== s.anim && !this.overlay) this.play(s.anim)
        return false
      }
      case 'linger': {
        if (s.el === undefined) {
          s.el = 0
          this.moveSpeed = 0
          if (ONE_SHOT.has(s.anim)) { this.play(this.moodIdle()); this.playOverlay(s.anim) } else this.play(s.anim)
        }
        s.el += dt
        return s.el >= s.dur
      }
      case 'wait': {
        this.moveSpeed = 0
        if (this.currentName !== this.moodIdle() && !this.overlay) this.play(this.moodIdle())
        s.el = (s.el ?? 0) + dt
        if (s.el > 0.5) {
          s.el = 0
          if (!this.env.reservations.holder(s.anchor)) { this.plan(false); return false }
        }
        return false
      }
      case 'wander': {
        const a = this.pickWander(room)
        const mi = this.moodIdle()
        if (!a) {
          // no idle anchors: stroll to a random free point
          const b = room.bounds
          const p = room.nav.nearestFree({ x: b.minX + (b.maxX - b.minX) * this.rand(), z: b.minZ + (b.maxZ - b.minZ) * this.rand() })
          if (p) this.steps.splice(1, 0, { t: 'walk', to: p }, { t: 'linger', anim: mi, dur: 4 + this.rand() * 5 })
        } else {
          const r = this.rand()
          const anim = r < 0.22 ? 'phone' : r < 0.32 ? 'stretch' : mi
          this.steps.splice(1, 0,
            { t: 'walk', to: { x: a.pos.x, z: a.pos.z }, soft: true },
            { t: 'glide', pos: a.pos.clone(), yaw: a.yaw, anim: mi, posture: 'stand', dur: 0, turnFirst: false },
            { t: 'linger', anim, dur: anim === 'phone' ? 6 + this.rand() * 5 : 4 + this.rand() * 5 })
        }
        this.steps.splice(this.steps.length, 0, { t: 'wander' })
        void speed
        return true
      }
      case 'fadeout': {
        this.releaseReservation()
        this.fadeTarget = 0
        this.hidden = true
        this.moveSpeed = 0
        this.steps = []
        return true
      }
    }
  }

  /** room swapped: re-apply the task in the new room without walking */
  resnap() {
    this.steps = []
    this.overlay = null
    this.posture = 'stand'
    this.seatExit = null
    if (this.task) this.plan(true)
  }

  dispose() {
    this.releaseReservation()
    this.hold(null)
    this.obj.removeFromParent()
    this.mixer?.stopAllAction()
    if (this.mixer) this.mixer.uncacheRoot(this.model)
    for (const m of this.materials) m.dispose()
    if (this.placeholder) this.model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose() })
    // the baked mesh owns its geometry and skeleton; unskinned clones share geometry with the source
    if (this.baked) { this.baked.geometry.dispose(); this.baked.skeleton.dispose(); this.baked = null }
  }

  /** debug: current step kind and anim */
  debug() { return { task: this.key, step: this.steps[0]?.t ?? null, anim: this.currentName, posture: this.posture, hidden: this.hidden, x: +this.obj.position.x.toFixed(2), z: +this.obj.position.z.toFixed(2), y: +this.obj.position.y.toFixed(2), yaw: +this.yaw.toFixed(2) } }
}

function disposeClone(o: THREE.Object3D) {
  // prop clones share geometry/materials with props.glb: nothing to free
  void o
}

/** deterministic sort of actor ids (stable wander seeds, reservation priority) */
export function actorOrder(ids: string[]): string[] { return [...ids].sort() }
export { hash01, normAnchor }
