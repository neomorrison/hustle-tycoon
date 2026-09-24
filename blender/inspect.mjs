#!/usr/bin/env node
// GLB inspector + contract checker for the 3D pipeline (docs/3D.md). No dependencies: parses the GLB itself.
//
//   node blender/inspect.mjs <file.glb...> [--check room|character|props|title|studio] [--walk] [--map] [--quiet] [--strict]
//
// Prints the node tree (with extras, triangle counts, materials), materials, animations (name + duration) and
// the file size. --check validates the docs/3D.md contract for that asset kind and exits 1 listing violations.
// --walk rebuilds the runtime walk grid (0.2 m cells, obstacle mesh bounds + 0.15 m padding, walls blocked) and
// reports anchors that cannot be reached from a_door_stand (or a_exit_stand / a_spawn); --map also prints the grid.
// --quiet skips the tree. --strict turns walk warnings (narrow paths) into violations.
import { readFileSync, statSync } from 'node:fs'

// ---------------------------------------------------------------------------------------------------------------
// GLB parsing
// ---------------------------------------------------------------------------------------------------------------

function readGlb(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`)
  let off = 12
  let json = null
  let bin = null
  while (off < buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'))
    else if (type === 0x004e4942) bin = data
    off += 8 + len
  }
  return { json, bin, size: buf.length }
}

const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] }
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

function readAccessor(g, bin, idx) {
  const a = g.accessors[idx]
  if (a.bufferView === undefined || !bin) return null
  const bv = g.bufferViews[a.bufferView]
  if (bv.extensions && bv.extensions.EXT_meshopt_compression) return null
  const [T, sz] = COMP[a.componentType]
  const n = NCOMP[a.type]
  const stride = bv.byteStride || sz * n
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0)
  const out = []
  for (let i = 0; i < a.count; i++) {
    const row = []
    for (let k = 0; k < n; k++) {
      const o = base + i * stride + k * sz
      const dv = new DataView(bin.buffer, bin.byteOffset + o, sz)
      row.push(T === Float32Array ? dv.getFloat32(0, true) : T === Uint16Array ? dv.getUint16(0, true) : T === Uint32Array ? dv.getUint32(0, true) : T === Uint8Array ? dv.getUint8(0) : T === Int16Array ? dv.getInt16(0, true) : dv.getInt8(0))
    }
    out.push(row)
  }
  return out
}

// 4x4 column-major matrices ------------------------------------------------------------------------------------
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function mul(a, b) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function trs(n) {
  if (n.matrix) return n.matrix.slice()
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale || [1, 1, 1]
  const [tx, ty, tz] = n.translation || [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]

// ---------------------------------------------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------------------------------------------

function buildModel(g) {
  const nodes = (g.nodes || []).map((n, i) => ({ i, name: n.name || `#${i}`, def: n, children: n.children || [], parent: null, world: null }))
  for (const n of nodes) for (const c of n.children) nodes[c].parent = n.i
  const scene = g.scenes?.[g.scene ?? 0]
  const roots = scene ? scene.nodes : nodes.filter((n) => n.parent === null).map((n) => n.i)
  const walk = (i, m) => {
    const n = nodes[i]
    n.world = mul(m, trs(n.def))
    for (const c of n.children) walk(c, n.world)
  }
  for (const r of roots) walk(r, ident())
  const meshTris = (g.meshes || []).map((m) =>
    m.primitives.reduce((s, p) => {
      const mode = p.mode ?? 4
      const cnt = p.indices !== undefined ? g.accessors[p.indices].count : g.accessors[p.attributes.POSITION].count
      return s + (mode === 4 ? cnt / 3 : mode === 5 || mode === 6 ? cnt - 2 : 0)
    }, 0),
  )
  const byName = new Map(nodes.map((n) => [n.name, n]))
  return { g, nodes, roots, meshTris, byName }
}

const extras = (n) => n.def.extras || {}
const descendants = (M, n) => n.children.flatMap((c) => [M.nodes[c], ...descendants(M, M.nodes[c])])

/** world AABB (glTF coords) of one mesh node */
function meshBounds(M, n) {
  const mesh = M.g.meshes[n.def.mesh]
  let lo = [Infinity, Infinity, Infinity]
  let hi = [-Infinity, -Infinity, -Infinity]
  for (const p of mesh.primitives) {
    const a = M.g.accessors[p.attributes.POSITION]
    if (!a.min || !a.max) continue
    for (let k = 0; k < 8; k++) {
      const c = [k & 1 ? a.max[0] : a.min[0], k & 2 ? a.max[1] : a.min[1], k & 4 ? a.max[2] : a.min[2]]
      const w = apply(n.world, c)
      lo = lo.map((v, j) => Math.min(v, w[j]))
      hi = hi.map((v, j) => Math.max(v, w[j]))
    }
  }
  return { lo, hi }
}

// blender floor coords (x, y) from glTF (x, -z)
const toFloor = (p) => [p[0], -p[2], p[1]]

/** Where a character placed on this anchor looks (glTF +Z forward), as a compass word + bearing (Blender floor). */
function facingOf(n) {
  const fx = n.world[8]
  const fy = -n.world[10]
  const deg = ((Math.atan2(fx, fy) * 180) / Math.PI + 360) % 360 // 0 = north (+Y), 90 = east
  const names = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  return `${names[Math.round(deg / 45) % 8]} (${Math.round(deg) % 360} deg)`
}

// ---------------------------------------------------------------------------------------------------------------
// printing
// ---------------------------------------------------------------------------------------------------------------

function fmtExtras(e) {
  const s = JSON.stringify(e)
  return s === '{}' ? '' : ` ${s.length > 140 ? s.slice(0, 137) + '...' : s}`
}

function printTree(M) {
  const { g } = M
  const line = (i, depth) => {
    const n = M.nodes[i]
    let info = ''
    if (n.def.mesh !== undefined) {
      const m = g.meshes[n.def.mesh]
      const mats = [...new Set(m.primitives.map((p) => (p.material !== undefined ? g.materials[p.material].name : '-')))]
      info = ` [mesh ${M.meshTris[n.def.mesh]} tris, ${m.primitives.length} prim: ${mats.join(', ')}]`
      if (m.extras?.targetNames) info += ` morphs: ${m.extras.targetNames.join(',')}`
    }
    if (n.def.skin !== undefined) info += ' [skinned]'
    const t = n.world ? toFloor([n.world[12], n.world[13], n.world[14]]).map((v) => v.toFixed(2)).join(',') : ''
    const face = n.name.startsWith('a_') ? ` facing ${facingOf(n)}` : ''
    console.log(`${'  '.repeat(depth)}${n.name}${info}${fmtExtras(extras(n))}${/^(a|l)_/.test(n.name) ? ` @(${t})${face}` : ''}`)
    for (const c of n.children) line(c, depth + 1)
  }
  for (const r of M.roots) line(r, 1)
}

function summary(path, G, M, quiet) {
  const { g } = M
  console.log(`\n== ${path}`)
  console.log(`size ${(G.size / 1024).toFixed(1)} KB (${(G.size / 1048576).toFixed(3)} MB)`)
  const totalTris = drawStats(M)
  console.log(`nodes ${M.nodes.length}, meshes ${(g.meshes || []).length}, triangles ${totalTris.tris}, draw calls ~${totalTris.draws}, materials ${(g.materials || []).length}`)
  if (!quiet) {
    console.log('tree:')
    printTree(M)
  }
  console.log(`materials: ${(g.materials || []).map((m) => m.name + (m.alphaMode === 'BLEND' ? '(blend)' : '') + (m.emissiveFactor && m.emissiveFactor.some((v) => v > 0) ? '(emissive)' : '')).join(', ')}`)
  if (g.animations?.length) {
    console.log('animations:')
    for (const a of g.animations) console.log(`  ${a.name}: ${animDuration(g, a).toFixed(2)} s, ${a.channels.length} channels`)
  }
}

function drawStats(M) {
  let tris = 0
  let draws = 0
  for (const n of M.nodes) {
    if (n.def.mesh === undefined) continue
    tris += M.meshTris[n.def.mesh]
    draws += M.g.meshes[n.def.mesh].primitives.length
  }
  return { tris: Math.round(tris), draws }
}

function animDuration(g, a) {
  let d = 0
  for (const s of a.samplers) {
    const acc = g.accessors[s.input]
    if (acc.max) d = Math.max(d, acc.max[0])
  }
  return d
}

// ---------------------------------------------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------------------------------------------

const HOME_ANCHORS = ['a_spawn', 'a_bed_lie', 'a_bed_sit', 'a_bed_stand', 'a_computer_sit', 'a_computer_stand', 'a_fridge_stand', 'a_stove_stand', 'a_eat_sit', 'a_door_stand', 'a_door_exit', 'a_film_stand', 'a_idle_1', 'a_idle_2', 'a_idle_3', 'a_boxes_1', 'a_gear_desk', 'a_gear_floor_1', 'a_gear_floor_2']
const MCD_ANCHORS = ['a_spawn', 'a_counter_stand', 'a_fryer_stand', 'a_grill_stand', 'a_crew_1', 'a_crew_2', 'a_exit_stand', 'a_exit_door', 'a_queue_1', 'a_queue_2', 'a_queue_3', 'a_queue_4', 'a_booth_sit_1', 'a_booth_sit_2', 'a_booth_sit_3', 'a_booth_sit_4', 'a_booth_sit_5', 'a_booth_sit_6', 'a_idle_1', 'a_idle_2', 'a_idle_3']
const STAFF = { tier0: 0, tier1: 1, tier2: 2, tier3: 3, tier4: 5, tier5: 7 }
/** gear prop ids (props.glb node names) a room may name in a `gear` extra (baked item) or a_gear_desk `default` */
const GEAR_IDS = ['phone_cracked', 'phone_pro', 'ring_light', 'softbox_kit', 'mirrorless_camera', 'laptop_old', 'laptop_pro', 'workstation', 'lav_mic']

function checkGearTags(M, v) {
  for (const n of M.nodes) {
    const e = extras(n)
    if (e.gear !== undefined) {
      for (const id of String(e.gear).split(',').map((x) => x.trim())) if (!GEAR_IDS.includes(id)) v.push(`${n.name}: extras.gear "${id}" is not a gear prop id`)
    }
    if (e.default !== undefined) {
      if (n.name !== 'a_gear_desk') v.push(`${n.name}: extras.default is only meaningful on a_gear_desk`)
      else if (!['laptop_old', 'laptop_pro', 'workstation'].includes(e.default)) v.push(`a_gear_desk: extras.default "${e.default}" must be a desk computer id`)
    }
  }
}
const HAIR = ['short', 'messy', 'long', 'bun', 'braids', 'afro', 'buzz', 'curly', 'ponytail', 'bob']
const ACC = ['glasses', 'cap', 'cap_back', 'beanie', 'flatcap', 'hijab', 'headphones', 'visor', 'scarf', 'beard', 'apron']
const TOPS = ['top_hoodie', 'top_polo', 'top_blazer', 'top_sweater', 'top_uniform']
const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulder_l', 'upperarm_l', 'forearm_l', 'hand_l', 'shoulder_r', 'upperarm_r', 'forearm_r', 'hand_r', 'thigh_l', 'shin_l', 'foot_l', 'thigh_r', 'shin_r', 'foot_r']
const ANIMS = ['idle', 'idle_tired', 'walk', 'sit_idle', 'sit_type', 'sit_think', 'eat_sit', 'sleep', 'cook', 'cheer', 'stressed', 'phone', 'talk', 'wave', 'register', 'film', 'carry', 'stretch']
const MORPHS = ['smile', 'frown', 'sleepy', 'worried']
const BODY_MATS = ['m_skin', 'm_top', 'm_bottom', 'm_shoes', 'm_eye', 'm_eye_white', 'm_mouth']
const PROPS = ['phone', 'mug', 'plate', 'burger', 'fries', 'spatula', 'box_small', 'takeout_bag', 'phone_cracked', 'phone_pro', 'ring_light', 'softbox_kit', 'mirrorless_camera', 'laptop_old', 'laptop_pro', 'workstation', 'lav_mic', 'box_stack_unit']

function checkNames(M, v) {
  const seen = new Set()
  for (const n of M.nodes) {
    if (!/^[a-z0-9_]+$/.test(n.name)) v.push(`node name "${n.name}" is not lowercase [a-z0-9_]`)
    if (seen.has(n.name)) v.push(`duplicate node name "${n.name}"`)
    seen.add(n.name)
  }
  for (const m of M.g.materials || []) if (!/^m_[a-z0-9_]+$/.test(m.name || '')) v.push(`material name "${m.name}" should be m_<lowercase>`)
}

function checkBudget(label, val, max, v, unit = '') {
  if (val > max) v.push(`${label} ${val}${unit} exceeds budget ${max}${unit}`)
}

function checkAnchorsAndLights(M, v, w) {
  let lights = 0
  for (const n of M.nodes) {
    const e = extras(n)
    if (n.name.startsWith('a_')) {
      if (e.anchor !== n.name.slice(2)) v.push(`${n.name}: extras.anchor should be "${n.name.slice(2)}" (got ${JSON.stringify(e.anchor)})`)
      if (n.def.mesh !== undefined) v.push(`${n.name}: anchors must be empties`)
    }
    if (n.name.startsWith('l_')) {
      lights++
      if (!['lamp', 'ceiling', 'window'].includes(e.light)) v.push(`${n.name}: extras.light must be lamp|ceiling|window`)
      if (!/^#[0-9a-fA-F]{6}$/.test(e.color || '')) v.push(`${n.name}: extras.color must be #rrggbb`)
      if (typeof e.intensity !== 'number') v.push(`${n.name}: extras.intensity must be a number`)
      if (typeof e.distance !== 'number') v.push(`${n.name}: extras.distance must be a number`)
    }
  }
  if (!lights) v.push('no l_* light anchor (at least one per room)')
}

function checkRoom(M, G, v, w, kind = 'room') {
  checkNames(M, v)
  const root = M.byName.get('room')
  if (!root) {
    v.push('missing root node "room"')
    return
  }
  if (!M.roots.includes(root.i)) v.push('"room" must be a top-level node')
  const re = extras(root)
  const id = re.room
  if (typeof id !== 'string') v.push('room extras.room must be the room id string')
  for (const k of ['w', 'd', 'wallH']) if (typeof re[k] !== 'number') v.push(`room extras.${k} must be a number`)
  const floor = M.byName.get('floor')
  if (!floor || !extras(floor).floor) v.push('missing "floor" node with extras {floor:true}')
  if (!M.byName.get('slab')) v.push('missing "slab" node')
  for (const s of ['n', 'e', 's', 'w']) {
    const wn = M.byName.get(`wall_${s}`)
    if (!wn) v.push(`missing wall_${s}`)
    else if (extras(wn).wall !== s) v.push(`wall_${s}: extras.wall should be "${s}"`)
  }
  checkAnchorsAndLights(M, v, w)
  checkGearTags(M, v)
  const stats = drawStats(M)
  const triMax = id === 'title_city' ? 120000 : 90000
  checkBudget('triangles', stats.tris, triMax, v)
  checkBudget('GLB size', +(G.size / 1048576).toFixed(3), 2.0, v, ' MB')
  if (stats.draws > 250) (id === 'title_city' ? w : v).push(`draw calls ~${stats.draws} exceed 250`)
  const interacts = new Map()
  for (const n of M.nodes) {
    const e = extras(n)
    if (e.interact) interacts.set(e.interact, (interacts.get(e.interact) || 0) + 1)
    if (e.interact && n.parent !== null && extras(M.nodes[n.parent]).wall) v.push(`${n.name}: interactive groups must not be parented to a wall`)
  }
  const home = /^tier[0-5]$/.test(id)
  let required = []
  if (home) {
    for (const k of ['bed', 'computer', 'fridge', 'door', ...(id === 'tier4' ? ['garage'] : [])]) if (!interacts.has(k)) v.push(`no group with interact "${k}"`)
    required = [...HOME_ANCHORS, ...(id === 'tier4' ? ['a_garage_stand'] : [])]
    const nStaff = STAFF[id]
    for (let i = 1; i <= nStaff; i++) {
      const sd = M.byName.get(`staffdesk_${i}`)
      if (!sd) v.push(`missing staffdesk_${i} (${id} needs ${nStaff})`)
      else {
        if (extras(sd).staffdesk !== i) v.push(`staffdesk_${i}: extras.staffdesk should be ${i}`)
        if (!extras(sd).obstacle) v.push(`staffdesk_${i}: extras.obstacle should be true`)
      }
      required.push(`a_staff_${i}_sit`)
    }
    if (M.byName.get(`staffdesk_${nStaff + 1}`)) w.push(`${id} has more than ${nStaff} staff desks`)
    const b1 = M.byName.get('a_boxes_1')
    if (b1) for (const k of ['w', 'd', 'layers']) if (typeof extras(b1)[k] !== 'number') v.push(`a_boxes_1: extras.${k} must be a number`)
    const gd = M.byName.get('a_gear_desk')
    if (gd) for (const k of ['w', 'd']) if (typeof extras(gd)[k] !== 'number') v.push(`a_gear_desk: extras.${k} must be a number`)
    const hasCouch = M.nodes.some((n) => extras(n).interact === 'couch' || /^couch/.test(n.name))
    if (hasCouch && !M.byName.get('a_couch_sit')) w.push('room has a couch but no a_couch_sit')
    const lie = M.byName.get('a_bed_lie')
    if (lie) {
      const z = lie.world[13]
      if (z < 0.35 || z > 0.75) w.push(`a_bed_lie height ${z.toFixed(2)} m (mattress top should be ~0.5)`)
    }
  } else if (id === 'mcdoodles') {
    for (const k of ['counter', 'fryer', 'exit']) if (!interacts.has(k)) v.push(`no group with interact "${k}"`)
    required = MCD_ANCHORS
  } else if (id === 'title_city') {
    required = []
  } else {
    w.push(`room id "${id}" is not a game room: tier-specific checks skipped`)
  }
  for (const a of required) if (!M.byName.get(a)) v.push(`missing anchor ${a}`)
  const idle = M.nodes.filter((n) => /^a_idle_\d+$/.test(n.name)).length
  if ((home || id === 'mcdoodles') && idle > 6) w.push(`${idle} idle anchors (3-6 expected)`)
  // anchors on the floor
  if (typeof re.w === 'number') {
    for (const n of M.nodes) {
      if (!n.name.startsWith('a_') || /^a_(door_exit|exit_door|cam)/.test(n.name)) continue
      const [x, y] = toFloor([n.world[12], n.world[13], n.world[14]])
      if (Math.abs(x) > re.w / 2 + 0.01 || Math.abs(y) > re.d / 2 + 0.01) w.push(`${n.name} at (${x.toFixed(2)}, ${y.toFixed(2)}) is outside the floor`)
    }
  }
}

/** studio.glb: the character preview pedestal (no walls, one a_spawn, root extras {studio:true}) */
function checkStudio(M, G, v, w) {
  checkNames(M, v)
  const root = M.byName.get('room')
  if (!root) { v.push('missing root node "room"'); return }
  const re = extras(root)
  if (re.room !== 'studio') v.push('room extras.room must be "studio"')
  if (re.studio !== true) v.push('room extras.studio must be true')
  for (const k of ['w', 'd', 'wallH']) if (typeof re[k] !== 'number') v.push(`room extras.${k} must be a number`)
  const floor = M.byName.get('floor')
  if (!floor || !extras(floor).floor) v.push('missing "floor" node with extras {floor:true}')
  if (!M.byName.get('slab')) v.push('missing "slab" node')
  for (const s of ['n', 'e', 's', 'w']) if (M.byName.get(`wall_${s}`)) w.push(`wall_${s} present: the studio has no walls`)
  const sp = M.byName.get('a_spawn')
  if (!sp) v.push('missing anchor a_spawn')
  else if (Math.hypot(sp.world[12], sp.world[14]) > 0.05) v.push('a_spawn must sit at the pedestal centre')
  checkAnchorsAndLights(M, v, w)
  const stats = drawStats(M)
  checkBudget('triangles', stats.tris, 20000, v)
  checkBudget('GLB size', +(G.size / 1048576).toFixed(3), 0.5, v, ' MB')
}

function checkTitle(M, G, v, w) {
  checkNames(M, v)
  const cam = M.byName.get('a_cam')
  if (!cam) v.push('missing a_cam')
  else if (typeof extras(cam).fov !== 'number') v.push('a_cam: extras.fov must be a number')
  if (!M.byName.get('a_cam_target')) v.push('missing a_cam_target')
  checkAnchorsAndLights(M, v, w)
  const stats = drawStats(M)
  checkBudget('triangles', stats.tris, 120000, v)
  if (G.size / 1048576 > 2.5) w.push(`GLB size ${(G.size / 1048576).toFixed(2)} MB is large`)
}

function checkCharacter(M, G, v, w) {
  checkNames(M, v)
  const { g } = M
  if (!M.byName.get('rig')) v.push('missing armature node "rig"')
  for (const b of BONES) if (!M.byName.get(b)) v.push(`missing bone ${b}`)
  if (!(g.skins || []).length) v.push('no skin')
  for (const [s, hand] of [['socket_r', 'hand_r'], ['socket_l', 'hand_l']]) {
    const n = M.byName.get(s)
    if (!n) v.push(`missing ${s}`)
    else if (n.parent === null || M.nodes[n.parent].name !== hand) v.push(`${s} must be a child of ${hand}`)
  }
  const body = M.byName.get('body')
  if (!body || body.def.mesh === undefined) v.push('missing mesh node "body"')
  else {
    const mesh = g.meshes[body.def.mesh]
    const tn = mesh.extras?.targetNames || []
    for (const m of MORPHS) if (!tn.includes(m)) v.push(`body: missing morph target ${m}`)
    const mats = new Set(mesh.primitives.map((p) => g.materials[p.material]?.name))
    for (const m of BODY_MATS) if (!mats.has(m)) v.push(`body: missing material slot ${m}`)
    if (body.def.skin === undefined) v.push('body must be skinned')
  }
  const meshNode = (name) => {
    const n = M.byName.get(name)
    return n && (n.def.mesh !== undefined || descendants(M, n).some((d) => d.def.mesh !== undefined))
  }
  for (const h of HAIR) if (!meshNode(`hair_${h}`)) v.push(`missing hair_${h}`)
  for (const t of TOPS) if (!meshNode(t)) v.push(`missing ${t}`)
  for (const a of ACC) if (!meshNode(`acc_${a}`)) v.push(`missing acc_${a}`)
  const names = new Map((g.animations || []).map((a) => [a.name, a]))
  for (const a of ANIMS) if (!names.has(a)) v.push(`missing animation ${a}`)
  for (const [n, a] of names) {
    if (!ANIMS.includes(n)) w.push(`extra animation "${n}"`)
    const d = animDuration(g, a)
    if (n === 'cheer' && (d < 0.8 || d > 3)) w.push(`cheer lasts ${d.toFixed(2)} s (~1.5 s expected)`)
    // root motion: the root bone must not move horizontally
    const root = M.byName.get('root')
    for (const ch of a.channels) {
      if (!root || ch.target.node !== root.i || ch.target.path !== 'translation') continue
      const vals = readAccessor(g, M.bin, a.samplers[ch.sampler].output)
      if (!vals) continue
      const xs = vals.map((r) => r[0])
      const zs = vals.map((r) => r[2])
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
      if (span > 0.02) v.push(`${n}: root bone translates ${span.toFixed(3)} m horizontally (clips must be in place)`)
    }
  }
  const stats = drawStats(M)
  checkBudget('triangles', stats.tris, 12000, v)
  checkBudget('GLB size', +(G.size / 1048576).toFixed(3), 1.5, v, ' MB')
}

function checkProps(M, G, v, w) {
  checkNames(M, v)
  const top = new Set(M.roots.map((r) => M.nodes[r].name))
  for (const p of PROPS) if (!top.has(p)) v.push(`missing top-level prop node "${p}"`)
  for (const t of top) if (!PROPS.includes(t)) w.push(`extra top-level node "${t}"`)
  checkBudget('GLB size', +(G.size / 1048576).toFixed(3), 0.8, v, ' MB')
}

// ---------------------------------------------------------------------------------------------------------------
// walk grid (docs/3D.md section 5)
// ---------------------------------------------------------------------------------------------------------------

const CELL = 0.2
const PAD = 0.15

function walkCheck(M, v, w, showMap) {
  const root = M.byName.get('room')
  if (!root || typeof extras(root).w !== 'number') {
    v.push('--walk needs a "room" root with extras w/d')
    return
  }
  const W = extras(root).w
  const D = extras(root).d
  const nx = Math.round(W / CELL)
  const ny = Math.round(D / CELL)
  const blocked = new Uint8Array(nx * ny)
  const cx = (i) => -W / 2 + (i + 0.5) * (W / nx)
  const cy = (j) => -D / 2 + (j + 0.5) * (D / ny)
  const rects = []
  for (const n of M.nodes) {
    const e = extras(n)
    let meshes = []
    if (e.obstacle) meshes = [n, ...descendants(M, n)].filter((d) => d.def.mesh !== undefined)
    else if (e.wall) meshes = n.def.mesh !== undefined ? [n] : []
    for (const m of meshes) {
      const b = meshBounds(M, m)
      const lo = toFloor(b.lo)
      const hi = toFloor(b.hi)
      rects.push({ name: n.name, x0: Math.min(lo[0], hi[0]) - PAD, x1: Math.max(lo[0], hi[0]) + PAD, y0: Math.min(lo[1], hi[1]) - PAD, y1: Math.max(lo[1], hi[1]) + PAD })
    }
  }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const x = cx(i)
      const y = cy(j)
      if (rects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)) blocked[j * nx + i] = 1
    }
  const free = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !blocked[j * nx + i]
  const wide = (i, j) => {
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (!free(i + di, j + dj)) return false
    return true
  }
  const bfs = (starts, ok) => {
    const seen = new Uint8Array(nx * ny)
    const q = []
    for (const [i, j] of starts) {
      if (ok(i, j) && !seen[j * nx + i]) {
        seen[j * nx + i] = 1
        q.push([i, j])
      }
    }
    while (q.length) {
      const [i, j] = q.shift()
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue
          const a = i + di
          const b = j + dj
          if (!ok(a, b) || seen[b * nx + a]) continue
          if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue // no corner cutting
          seen[b * nx + a] = 1
          q.push([a, b])
        }
    }
    return seen
  }
  const anchorXY = (n) => toFloor([n.world[12], n.world[13], n.world[14]])
  const cellsNear = (x, y, r, ok) => {
    const out = []
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (ok(i, j) && Math.hypot(cx(i) - x, cy(j) - y) <= r) out.push([i, j, Math.hypot(cx(i) - x, cy(j) - y)])
    return out.sort((a, b) => a[2] - b[2])
  }
  const startNode = M.byName.get('a_door_stand') || M.byName.get('a_exit_stand') || M.byName.get('a_spawn')
  if (!startNode) {
    v.push('--walk: no a_door_stand / a_exit_stand / a_spawn to start from')
    return
  }
  const [sx, sy] = anchorXY(startNode)
  const starts = cellsNear(sx, sy, 1.0, free)
  if (!starts.length) v.push(`--walk: no free cell within 1.0 m of ${startNode.name}`)
  const reach = bfs(starts.slice(0, 1), free)
  const wideStarts = cellsNear(sx, sy, 1.0, wide)
  const reachWide = bfs(wideStarts.slice(0, 1), wide)
  const skip = /^a_(boxes_|gear_desk|door_exit|exit_door|cam)/
  const results = []
  for (const n of M.nodes) {
    if (!n.name.startsWith('a_') || skip.test(n.name)) continue
    const [x, y] = anchorXY(n)
    // lie anchors sit in the middle of a bed (a king is 1.95 m wide), so they get a 1.6 m approach radius
    const rad = /_lie$/.test(n.name) ? 1.6 : 1.0
    const near = cellsNear(x, y, rad, free)
    const ok = near.some(([i, j]) => reach[j * nx + i])
    const okWide = cellsNear(x, y, rad, wide).some(([i, j]) => reachWide[j * nx + i])
    results.push({ n: n.name, ok, okWide })
    if (!ok) v.push(`walk: ${n.name} at (${x.toFixed(2)}, ${y.toFixed(2)}) is unreachable from ${startNode.name}`)
    else if (!okWide) w.push(`walk: ${n.name} is only reachable through a path narrower than 0.8 m`)
  }
  const freeCount = blocked.reduce((s, b) => s + (b ? 0 : 1), 0)
  const reachCount = reach.reduce((s, b) => s + b, 0)
  console.log(`walk grid ${nx} x ${ny} cells (${CELL} m), ${freeCount} free, ${reachCount} reachable from ${startNode.name}; anchors checked ${results.length}, unreachable ${results.filter((r) => !r.ok).length}, narrow ${results.filter((r) => r.ok && !r.okWide).length}`)
  if (showMap) {
    const marks = new Map()
    let k = 0
    const legend = []
    for (const n of M.nodes) {
      if (!n.name.startsWith('a_')) continue
      const [x, y] = anchorXY(n)
      const i = Math.floor((x + W / 2) / (W / nx))
      const j = Math.floor((y + D / 2) / (D / ny))
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue
      const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[k++ % 62]
      marks.set(j * nx + i, ch)
      legend.push(`${ch}=${n.name.slice(2)}`)
    }
    console.log('map (north up; # blocked, . reachable, : free but unreachable, letters = anchors):')
    for (let j = ny - 1; j >= 0; j--) {
      let row = ''
      for (let i = 0; i < nx; i++) {
        const id = j * nx + i
        row += marks.get(id) || (blocked[id] ? '#' : reach[id] ? '.' : ':')
      }
      console.log('  ' + row)
    }
    console.log('  ' + legend.join('  '))
  }
}

// ---------------------------------------------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  const files = []
  let check = null
  const flags = new Set()
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = args[++i]
    else if (args[i].startsWith('--')) flags.add(args[i])
    else files.push(args[i])
  }
  if (!files.length) {
    console.log('usage: node blender/inspect.mjs <file.glb...> [--check room|character|props|title|studio] [--walk] [--map] [--quiet] [--strict]')
    process.exit(2)
  }
  let bad = 0
  for (const f of files) {
    const G = readGlb(f)
    const M = buildModel(G.json)
    M.bin = G.bin
    summary(f, G, M, flags.has('--quiet'))
    const v = []
    const w = []
    if (check === 'room') checkRoom(M, G, v, w)
    else if (check === 'character') checkCharacter(M, G, v, w)
    else if (check === 'props') checkProps(M, G, v, w)
    else if (check === 'title') checkTitle(M, G, v, w)
    else if (check === 'studio') checkStudio(M, G, v, w)
    else if (check) {
      console.error(`unknown --check ${check}`)
      process.exit(2)
    }
    if (flags.has('--walk') || flags.has('--map')) walkCheck(M, v, w, flags.has('--map'))
    if (flags.has('--strict')) v.push(...w.splice(0).filter((x) => x.startsWith('walk:')))
    for (const x of w) console.log(`warning: ${x}`)
    if (check || flags.has('--walk') || flags.has('--map')) {
      if (v.length) {
        console.log(`FAIL ${f}: ${v.length} violation(s)`)
        for (const x of v) console.log(`  - ${x}`)
        bad++
      } else console.log(`PASS ${f}${check ? ` (--check ${check})` : ''}${flags.has('--walk') ? ' (--walk)' : ''}`)
    }
  }
  process.exit(bad ? 1 : 0)
}

main()
