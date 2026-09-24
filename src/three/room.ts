// Room GLB preparation: classify nodes per the contract (docs/3D.md §5), collect anchors/lights/special materials,
// merge static meshes by material to keep draw calls low, set shadow flags, wall pivots, obstacle footprints, navgrid.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GLTF } from './loader'
import { disposeObject, materialsOf } from './loader'
import { NavGrid, type Bounds2, type P2 } from './navgrid'
import { gearNode, type WallSide } from './math'

export interface Anchor {
  name: string
  pos: THREE.Vector3
  quat: THREE.Quaternion
  /** facing angle about +Y: forward = (sin yaw, 0, cos yaw) */
  yaw: number
  extras: Record<string, unknown>
}

export interface WallInfo {
  side: WallSide
  body: THREE.Object3D
  pivot: THREE.Group
  decor: THREE.Object3D | null
  height: number
  cut: boolean
  level: number
}

export interface LightAnchor {
  name: string
  pos: THREE.Vector3
  type: string
  color: THREE.Color
  intensity: number
  distance: number
}

export interface Obstacle { name: string; poly: P2[]; staffdesk: number }

export type PickKind = 'object' | 'floor' | 'block'
export interface Pickable { mesh: THREE.Mesh; kind: PickKind; key?: string }

const truthy = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true'

export class Room {
  readonly id: string
  readonly scene: THREE.Group
  readonly root: THREE.Object3D
  width = 0
  depth = 0
  wallH = 2.7
  bounds: Bounds2 = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 }
  /** box used for camera framing (floor footprint, slab to wall height) */
  fitBox = new THREE.Box3()
  walls: WallInfo[] = []
  interactives = new Map<string, THREE.Object3D[]>()
  interactiveBoxes = new Map<string, THREE.Box3>()
  staffDesks = new Map<number, THREE.Object3D>()
  obstacles: Obstacle[] = []
  wallRects: Bounds2[] = []
  anchors = new Map<string, Anchor>()
  lights: LightAnchor[] = []
  special = { sky: [] as THREE.MeshStandardMaterial[], glass: [] as THREE.MeshStandardMaterial[], lampshade: [] as THREE.MeshStandardMaterial[], screen: [] as THREE.MeshStandardMaterial[], neon: [] as THREE.MeshStandardMaterial[] }
  pickables: Pickable[] = []
  nav!: NavGrid
  staffShown = Infinity
  camera: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null
  /** gear ids the room already shows as furniture (extras {gear:"ring_light"} on any node): setGear skips them */
  bakedGear = new Set<string>()
  /** character preview pedestal (root extras {studio:true}): the camera frames one person, drag turns the world */
  studio = false
  /** open dioramas (no walls): bounding-box corners of every top-level piece, for the orbit framing */
  framePoints: THREE.Vector3[] = []
  /** outside sectors (tier5's city): sunk out of view on the camera's side by the cutaway, see cutaway.ts */
  outsideSectors: { obj: THREE.Object3D; dirX: number; dirZ: number; cut: boolean; level: number }[] = []
  /** doorway points (a_door_exit / a_exit_door) where walkers wait politely while someone else is in the way */
  doorPoints: P2[] = []
  stats = { meshesIn: 0, meshesOut: 0, triangles: 0 }

  constructor(id: string, gltf: GLTF) {
    this.id = id
    this.scene = gltf.scene
    this.scene.updateMatrixWorld(true)
    this.root = this.scene.getObjectByName('room') ?? this.scene
    this.prepare(gltf)
  }

  // -------------------------------------------------------------------------
  private prepare(gltf: GLTF) {
    vcCache = new Map()
    try { this.prepareInner(gltf) } finally { vcCache = null }
  }

  private prepareInner(gltf: GLTF) {
    const assoc = gltf.parser?.associations
    const isNode = (o: THREE.Object3D) => !assoc || assoc.get(o)?.nodes !== undefined
    const ud = this.root.userData ?? {}
    this.wallH = Number(ud.wallH) || 2.7
    this.studio = truthy(ud.studio) || this.id === 'studio'
    this.scene.traverse(o => {
      if ((o as THREE.Mesh).isMesh) this.stats.meshesIn++
      const g = o.userData?.gear
      if (typeof g === 'string') for (const id of g.split(',')) if (id.trim()) this.bakedGear.add(gearNode(id))
    })

    // --- anchors, light anchors, camera anchors (anywhere in the tree)
    const toRemove: THREE.Object3D[] = []
    const q = new THREE.Quaternion(), s = new THREE.Vector3()
    this.scene.traverse(o => {
      const n = o.name
      if (n.startsWith('a_') || (o.userData && typeof o.userData.anchor === 'string')) {
        const pos = new THREE.Vector3()
        o.matrixWorld.decompose(pos, q, s)
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
        const name = typeof o.userData?.anchor === 'string' ? (o.userData.anchor as string) : n.slice(2)
        this.anchors.set(name, { name, pos, quat: q.clone(), yaw: Math.atan2(fwd.x, fwd.z), extras: { ...o.userData } })
        if (!(o as THREE.Mesh).isMesh && o.children.length === 0) toRemove.push(o)
      } else if (n.startsWith('l_')) {
        const pos = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)
        const d = o.userData ?? {}
        let color = new THREE.Color('#ffd9a0')
        try { if (typeof d.color === 'string') color = new THREE.Color(d.color) } catch { /* keep default */ }
        this.lights.push({ name: n, pos, type: String(d.light ?? 'lamp'), color, intensity: Number(d.intensity ?? 1), distance: Number(d.distance ?? 5) })
        if (!(o as THREE.Mesh).isMesh && o.children.length === 0) toRemove.push(o)
      }
    })
    const cam = this.anchors.get('cam'), camT = this.anchors.get('cam_target')
    if (cam) {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quat)
      this.camera = { pos: cam.pos.clone(), target: camT ? camT.pos.clone() : cam.pos.clone().addScaledVector(fwd, 20), fov: Number(cam.extras.fov) || 30 }
    }
    for (const o of toRemove) o.removeFromParent()
    for (const n of ['door_exit', 'exit_door']) { const a = this.anchors.get(n); if (a) this.doorPoints.push({ x: a.pos.x, z: a.pos.z }) }

    // --- classify top-level children
    const floors: THREE.Object3D[] = [], statics: THREE.Object3D[] = [], outside: THREE.Object3D[] = []
    const noCast = new Set<THREE.Object3D>()
    const wallNodes: { side: WallSide; node: THREE.Object3D }[] = []
    const interactiveNodes: { key: string; node: THREE.Object3D }[] = []
    for (const c of [...this.root.children]) {
      const d = c.userData ?? {}
      if (c.name === 'floor' || truthy(d.floor)) floors.push(c)
      else if (typeof d.wall === 'string' && /^[nesw]$/.test(d.wall)) wallNodes.push({ side: d.wall as WallSide, node: c })
      else if (/^wall_[nesw]$/.test(c.name)) wallNodes.push({ side: c.name.slice(5) as WallSide, node: c })
      else if (typeof d.interact === 'string') interactiveNodes.push({ key: d.interact, node: c })
      else if (d.staffdesk !== undefined || /^staffdesk_\d+$/.test(c.name)) {
        const n = Number(d.staffdesk ?? c.name.split('_')[1]) || 0
        this.staffDesks.set(n, c)
      } else if (c.name === 'outside' || truthy(d.outside)) outside.push(c)
      else {
        statics.push(c)
        if (c.name === 'slab' || /rug|carpet|doormat|floor_/.test(c.name)) noCast.add(c)
      }
    }

    // --- bounds from the floor
    const fb = new THREE.Box3()
    for (const f of floors) fb.expandByObject(f)
    if (fb.isEmpty()) {
      // no floor node (title_city): extras w/d, else the footprint of the whole diorama
      const w = Number(ud.w), d = Number(ud.d)
      if (w > 0 && d > 0) fb.set(new THREE.Vector3(-w / 2, -0.05, -d / 2), new THREE.Vector3(w / 2, 0, d / 2))
      else {
        const all = new THREE.Box3().setFromObject(this.root)
        if (all.isEmpty()) fb.set(new THREE.Vector3(-3, -0.05, -2.5), new THREE.Vector3(3, 0, 2.5))
        else fb.set(new THREE.Vector3(all.min.x, -0.05, all.min.z), new THREE.Vector3(all.max.x, 0, all.max.z))
      }
    }
    this.width = Number(ud.w) || fb.max.x - fb.min.x
    this.depth = Number(ud.d) || fb.max.z - fb.min.z
    this.bounds = { minX: fb.min.x, maxX: fb.max.x, minZ: fb.min.z, maxZ: fb.max.z }
    this.fitBox.set(new THREE.Vector3(fb.min.x, -0.3, fb.min.z), new THREE.Vector3(fb.max.x, this.wallH * 0.92, fb.max.z))
    if (!wallNodes.length) {
      // an open diorama (title_city): frame everything that stands on it
      const all = new THREE.Box3().setFromObject(this.root)
      if (!all.isEmpty()) this.fitBox.max.y = Math.max(this.fitBox.max.y, all.max.y)
      const b = new THREE.Box3()
      for (const c of this.root.children) {
        b.setFromObject(c)
        if (b.isEmpty()) continue
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) this.framePoints.push(new THREE.Vector3(x, y, z))
      }
    }

    // --- obstacle footprints (before merging, in world XZ)
    const obstacleNodes: { node: THREE.Object3D; staffdesk: number }[] = []
    for (const c of this.root.children) {
      const d = c.userData ?? {}
      if (!truthy(d.obstacle)) continue
      const sd = d.staffdesk !== undefined ? Number(d.staffdesk) || 0 : 0
      obstacleNodes.push({ node: c, staffdesk: sd })
    }
    for (const { node, staffdesk } of obstacleNodes) {
      const poly = footprint(node)
      if (poly) this.obstacles.push({ name: node.name, poly, staffdesk })
    }
    for (const w of wallNodes) {
      const b = new THREE.Box3().setFromObject(w.node)
      this.wallRects.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z })
    }

    // --- special materials
    const seen = new Set<THREE.Material>()
    this.scene.traverse(o => {
      for (const m of materialsOf(o)) {
        if (seen.has(m)) continue
        seen.add(m)
        const sm = m as THREE.MeshStandardMaterial
        const n = m.name
        if (n === 'm_window_sky') { this.special.sky.push(sm) }
        else if (n === 'm_window_glass') { sm.transparent = true; sm.depthWrite = false; this.special.glass.push(sm) }
        else if (n === 'm_lampshade') { this.special.lampshade.push(sm) }
        else if (n === 'm_screen') { this.special.screen.push(sm); if (sm.emissive && sm.emissive.getHex() === 0) sm.emissive.set('#8fd0ff') }
        else if (n.startsWith('m_neon')) { this.special.neon.push(sm); if (sm.emissive && sm.emissive.getHex() === 0) { sm.emissive.copy(sm.color); sm.emissiveIntensity = 1.6 } }
      }
    })

    // --- walls: move decor into one group, pivot at the floor for the cutaway
    for (const { side, node } of wallNodes) {
      const decorChildren = node.children.filter(c => isNode(c))
      let decor: THREE.Group | null = null
      if (decorChildren.length) {
        decor = new THREE.Group()
        decor.name = `${node.name}_decor`
        node.add(decor)
        for (const c of decorChildren) decor.attach(c)
      }
      const body = normalize(node)
      const pivot = new THREE.Group()
      pivot.name = `${body.name}_pivot`
      this.root.add(pivot)
      pivot.attach(body)
      const bb = new THREE.Box3().setFromObject(body)
      mergeUnit(body, o => o === decor, false, true)
      if (decor) mergeUnit(decor, null, false, true)
      this.walls.push({ side, body, pivot, decor, height: Math.max(0.5, bb.max.y), cut: false, level: 1 })
      body.traverse(o => { if ((o as THREE.Mesh).isMesh) this.pickables.push({ mesh: o as THREE.Mesh, kind: 'block' }) })
    }

    // --- floor
    for (const f of floors) {
      const g = normalize(f)
      mergeUnit(g, null, false, true)
      g.traverse(o => { if ((o as THREE.Mesh).isMesh) this.pickables.push({ mesh: o as THREE.Mesh, kind: 'floor' }) })
    }

    // --- interactive groups
    for (const { key, node } of interactiveNodes) {
      const g = normalize(node)
      mergeUnit(g, null, true, true)
      const list = this.interactives.get(key) ?? []
      list.push(g)
      this.interactives.set(key, list)
      g.traverse(o => { if ((o as THREE.Mesh).isMesh) this.pickables.push({ mesh: o as THREE.Mesh, kind: 'object', key }) })
      const box = this.interactiveBoxes.get(key) ?? new THREE.Box3()
      box.expandByObject(g)
      this.interactiveBoxes.set(key, box)
    }

    // --- staff desks
    for (const node of [...this.staffDesks.values()]) {
      const g = normalize(node)
      mergeUnit(g, null, true, true)
      const n = [...this.staffDesks.entries()].find(([, v]) => v === node)?.[0] ?? 0
      this.staffDesks.set(n, g)
      g.traverse(o => { if ((o as THREE.Mesh).isMesh) this.pickables.push({ mesh: o as THREE.Mesh, kind: 'block' }) })
    }

    // --- static furniture: all merged together (cast / no-cast sets)
    if (statics.length) {
      const castGroup = new THREE.Group(); castGroup.name = 'static_cast'
      const flatGroup = new THREE.Group(); flatGroup.name = 'static_flat'
      this.root.add(castGroup, flatGroup)
      const castSrc = statics.filter(s => !noCast.has(s)), flatSrc = statics.filter(s => noCast.has(s))
      mergeInto(castGroup, castSrc, true, true)
      mergeInto(flatGroup, flatSrc, false, true)
      for (const g of [castGroup, flatGroup]) g.traverse(o => { if ((o as THREE.Mesh).isMesh) this.pickables.push({ mesh: o as THREE.Mesh, kind: 'block' }) })
    }
    if (outside.length) {
      // sectors (children with extras {sector:<Blender degrees>}) merge on their own so the cutaway can sink the
      // ones on the camera's side (tier5's city); everything else outside merges into one always-visible unit
      const loose: THREE.Object3D[] = []
      for (const o of outside) {
        for (const c of [...o.children]) {
          const deg = Number(c.userData?.sector)
          if (c.userData?.sector === undefined || !Number.isFinite(deg)) continue
          const g = new THREE.Group(); g.name = `${c.name}_merged`
          this.root.add(g)
          mergeInto(g, [c], false, false)
          c.removeFromParent()
          const a = (deg * Math.PI) / 180
          // Blender (x, y) -> three.js (x, -z)
          this.outsideSectors.push({ obj: g, dirX: Math.cos(a), dirZ: -Math.sin(a), cut: false, level: 1 })
        }
        loose.push(o)
      }
      const og = new THREE.Group(); og.name = 'outside_merged'
      this.root.add(og)
      mergeInto(og, loose, false, false)
    }

    // --- shadow casters: the furniture never moves, so the shadow pass draws it as ONE position-only mesh
    // (layer 1, seen only by the sun's shadow camera) instead of one draw per mesh. Staff desks get their own
    // caster inside their group so hiding a desk hides its shadow.
    const staticRoots: THREE.Object3D[] = [...[...this.interactives.values()].flat()]
    const sc = this.root.getObjectByName('static_cast')
    if (sc) staticRoots.push(sc)
    buildShadowCaster(this.root, staticRoots, 'shadow_caster')
    for (const [n, g] of this.staffDesks) buildShadowCaster(g, [g], `shadow_caster_staff_${n}`)

    // prune empty groups left behind
    pruneEmpty(this.root)
    this.scene.updateMatrixWorld(true)
    this.scene.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        this.stats.meshesOut++
        const g = m.geometry
        this.stats.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
      }
    })
    this.buildNav(Infinity)
  }

  /** Rebuild the walk grid (staff desks beyond `staffShown` do not block). */
  buildNav(staffShown: number) {
    this.staffShown = staffShown
    const nav = new NavGrid(this.bounds, 0.2)
    nav.blockBorder(0.1)
    for (const r of this.wallRects) nav.blockRect(r, 0.15)
    for (const o of this.obstacles) {
      if (o.staffdesk && o.staffdesk > staffShown) continue
      nav.blockPolygon(o.poly, 0.15)
    }
    nav.finalize()
    this.nav = nav
  }

  setStaffDesks(n: number) {
    for (const [k, node] of this.staffDesks) node.visible = k <= n
    if (n !== this.staffShown) this.buildNav(n)
  }

  anchor(name: string): Anchor | undefined { return this.anchors.get(name.startsWith('a_') ? name.slice(2) : name) }
  has = (name: string) => this.anchors.has(name)

  anchorsWithPrefix(prefix: string): Anchor[] {
    return [...this.anchors.values()].filter(a => a.name.startsWith(prefix)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }

  dispose() {
    this.scene.removeFromParent()
    disposeObject(this.scene)
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Oriented footprint of a group: its local bounding box's bottom rectangle, projected to world XZ. */
function footprint(node: THREE.Object3D): P2[] | null {
  node.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert()
  const box = new THREE.Box3()
  const tmp = new THREE.Box3()
  const m = new THREE.Matrix4()
  node.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld))
    box.union(tmp)
  })
  if (box.isEmpty()) return null
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z),
  ].map(v => v.applyMatrix4(node.matrixWorld))
  return corners.map(v => ({ x: v.x, z: v.z }))
}

/**
 * Make sure `o` is a plain group whose meshes are leaves: a Mesh node becomes a Group with the same name, transform
 * and extras, holding the original mesh (identity transform) plus the original children.
 */
function normalize(o: THREE.Object3D): THREE.Object3D {
  const mesh = o as THREE.Mesh
  if (!mesh.isMesh) {
    for (const c of [...o.children]) if ((c as THREE.Mesh).isMesh && c.children.length) normalize(c)
    return o
  }
  const g = new THREE.Group()
  g.name = o.name
  g.userData = o.userData
  g.position.copy(o.position); g.quaternion.copy(o.quaternion); g.scale.copy(o.scale)
  g.visible = o.visible
  const parent = o.parent
  if (parent) {
    const i = parent.children.indexOf(o)
    parent.children[i] = g
    g.parent = parent
    o.parent = null
  }
  const kids = [...o.children]
  o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1)
  o.name = `${o.name}_geo`
  o.userData = {}
  g.add(o)
  for (const k of kids) { g.add(k); if ((k as THREE.Mesh).isMesh && k.children.length) normalize(k) }
  g.updateMatrixWorld(true)
  return g
}

function attributeSignature(g: THREE.BufferGeometry): string {
  return Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : '|n')
}

/** Collect leaf meshes of the listed subtrees (skipping `skip` subtrees and skinned/morphed meshes). */
function collectMeshes(roots: THREE.Object3D[], skip: ((o: THREE.Object3D) => boolean) | null): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  const walk = (o: THREE.Object3D) => {
    if (skip && skip(o)) return
    const m = o as THREE.Mesh
    if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !m.morphTargetInfluences?.length && !Array.isArray(m.material)) out.push(m)
    for (const c of o.children) walk(c)
  }
  for (const r of roots) walk(r)
  return out
}

/** shared vertex-colour materials of the room being prepared (set during Room.prepare) */
let vcCache: Map<string, THREE.MeshStandardMaterial> | null = null

/** A flat palette material the runtime never touches: colour can move into vertex colours. */
function isPlainPalette(m: THREE.Material): boolean {
  const s = m as THREE.MeshStandardMaterial
  if (!s.isMeshStandardMaterial || !vcCache) return false
  if (s.map || s.normalMap || s.emissiveMap || s.roughnessMap || s.metalnessMap || s.alphaMap || s.vertexColors) return false
  if (s.transparent || s.opacity < 1 || s.alphaTest > 0) return false
  if (s.emissive && (s.emissive.r + s.emissive.g + s.emissive.b) * (s.emissiveIntensity ?? 1) > 0.001) return false
  const n = m.name
  if (n === 'm_screen' || n === 'm_window_glass' || n === 'm_window_sky' || n === 'm_lampshade' || n.startsWith('m_neon')) return false
  return true
}

/** Merge the leaf meshes under `unit` (in its local space) by material; the merged meshes become children of `unit`. */
function mergeUnit(unit: THREE.Object3D, skip: ((o: THREE.Object3D) => boolean) | null, cast: boolean, receive: boolean) {
  mergeInto(unit, [unit], cast, receive, skip)
}

function mergeInto(target: THREE.Object3D, roots: THREE.Object3D[], cast: boolean, receive: boolean, skip: ((o: THREE.Object3D) => boolean) | null = null) {
  target.updateWorldMatrix(true, true)
  for (const r of roots) r.updateWorldMatrix(true, true)
  const meshes = collectMeshes(roots, skip)
  const inv = new THREE.Matrix4().copy(target.matrixWorld).invert()
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; srcs: THREE.Mesh[] }>()
  const col = new THREE.Color()
  for (const m of meshes) {
    const mat = m.material as THREE.Material
    const geo = m.geometry.clone()
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
    const plain = isPlainPalette(mat)
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && !(k === 'color' && !plain && mat.vertexColors)) geo.deleteAttribute(k)
    if (!geo.attributes.normal) geo.computeVertexNormals()
    geo.morphAttributes = {}
    let key: string, useMat = mat
    if (plain) {
      // plain palette colours: bake the colour into vertices and share one material per surface class, so a unit
      // (a desk with 15 coloured parts) draws in 1–3 calls instead of one per colour
      const sm = mat as THREE.MeshStandardMaterial
      const r = Math.round(sm.roughness * 10) / 10, mt = Math.round(sm.metalness * 4) / 4
      const ck = `vc|${r}|${mt}|${mat.side}`
      let shared = vcCache?.get(ck)
      if (!shared) {
        shared = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: mt, side: mat.side })
        shared.name = `m_vc_${r}_${mt}`
        vcCache?.set(ck, shared)
      }
      useMat = shared
      col.copy(sm.color)
      const n = geo.attributes.position.count
      const c = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3))
      key = `${ck}|${attributeSignature(geo)}`
    } else key = `${mat.uuid}|${attributeSignature(geo)}`
    const e = groups.get(key) ?? { mat: useMat, geos: [], srcs: [] }
    e.geos.push(geo); e.srcs.push(m)
    groups.set(key, e)
  }
  for (const m of meshes) { m.removeFromParent(); m.geometry.dispose() }
  for (const { mat, geos } of groups.values()) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (geos.length > 1) for (const g of geos) g.dispose()
    if (!merged) continue
    merged.computeBoundingBox(); merged.computeBoundingSphere()
    const mesh = new THREE.Mesh(merged, mat)
    mesh.name = `${target.name}_${mat.name || 'mat'}`
    const transparent = mat.transparent || mat.name === 'm_window_glass'
    mesh.castShadow = cast && !transparent && !mat.name.startsWith('m_window')
    mesh.receiveShadow = receive && !transparent
    mesh.matrixAutoUpdate = false
    target.add(mesh)
    mesh.updateMatrix(); mesh.updateMatrixWorld(true)
  }
}

function buildShadowCaster(target: THREE.Object3D, roots: THREE.Object3D[], name: string) {
  target.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(target.matrixWorld).invert()
  const geos: THREE.BufferGeometry[] = []
  const walk = (o: THREE.Object3D) => {
    const m = o as THREE.Mesh
    if (m.isMesh && m.castShadow && !m.userData.shadowOnly) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', m.geometry.attributes.position.clone())
      if (m.geometry.index) g.setIndex(m.geometry.index.clone())
      else g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i))
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
      geos.push(g)
      m.castShadow = false
    }
    for (const c of o.children) walk(c)
  }
  for (const r of roots) walk(r)
  if (!geos.length) return
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
  if (geos.length > 1) for (const g of geos) g.dispose()
  if (!merged) return
  merged.computeBoundingSphere()
  const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = false
  // three's shadow pass tests layers against the VIEW camera, so the caster stays on layer 0 and is simply invisible
  // in the colour pass (no colour, no depth writes): one cheap main-pass draw + one shadow draw for all furniture
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  mesh.userData.shadowOnly = true
  target.add(mesh)
}

function pruneEmpty(o: THREE.Object3D) {
  for (const c of [...o.children]) {
    pruneEmpty(c)
    if (!(c as THREE.Mesh).isMesh && c.children.length === 0 && c.type === 'Object3D') c.removeFromParent()
  }
}
