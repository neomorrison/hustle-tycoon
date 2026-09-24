// Contract check for public/assets/3d/character.glb (docs/3D.md section 7).
//   node blender/character/check_glb.mjs [path/to/character.glb] [--json]
// Reads the GLB JSON chunk only (no deps). Exits 1 on a contract violation.
import { readFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const file = resolve(args.find((a) => !a.startsWith('--')) ?? resolve(here, '../../public/assets/3d/character.glb'))
const buf = readFileSync(file)
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB')
const jsonLen = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))

const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulder_l', 'upperarm_l', 'forearm_l', 'hand_l',
  'shoulder_r', 'upperarm_r', 'forearm_r', 'hand_r', 'thigh_l', 'shin_l', 'foot_l', 'thigh_r', 'shin_r', 'foot_r']
const HAIR = ['short', 'messy', 'long', 'bun', 'braids', 'afro', 'buzz', 'curly', 'ponytail', 'bob'].map((h) => `hair_${h}`)
const TOPS = ['hoodie', 'polo', 'blazer', 'sweater', 'uniform'].map((t) => `top_${t}`)
const ACC = ['glasses', 'cap', 'cap_back', 'beanie', 'flatcap', 'hijab', 'headphones', 'visor', 'scarf', 'beard', 'apron'].map((a) => `acc_${a}`)
const ANIMS = ['idle', 'idle_tired', 'walk', 'sit_idle', 'sit_type', 'sit_think', 'eat_sit', 'sleep', 'cook', 'cheer',
  'stressed', 'phone', 'talk', 'wave', 'register', 'film', 'carry', 'stretch']
const MORPHS = ['smile', 'frown', 'sleepy', 'worried']
const BODY_MATS = ['m_skin', 'm_top', 'm_bottom', 'm_shoes', 'm_eye', 'm_eye_white', 'm_mouth']

const errors = []
const nodes = gltf.nodes ?? []
const nodeNames = nodes.map((n) => n.name)
const byName = Object.fromEntries(nodes.map((n, i) => [n.name, i]))
for (const n of ['rig', 'body', 'socket_l', 'socket_r', ...BONES, ...HAIR, ...TOPS, ...ACC]) {
  if (!(n in byName)) errors.push(`missing node ${n}`)
}
const dup = nodeNames.filter((n, i) => nodeNames.indexOf(n) !== i)
if (dup.length) errors.push(`duplicate node names: ${dup.join(', ')}`)
const bad = nodeNames.filter((n) => !/^[a-z0-9_]+$/.test(n ?? ''))
if (bad.length) errors.push(`non [a-z0-9_] node names: ${bad.join(', ')}`)

// sockets parented to hands
const parentOf = {}
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parentOf[c] = i)))
for (const s of ['l', 'r']) {
  const p = parentOf[byName[`socket_${s}`]]
  if (nodes[p]?.name !== `hand_${s}`) errors.push(`socket_${s} parent is ${nodes[p]?.name}, expected hand_${s}`)
}

// meshes: triangles, skinning, materials, morphs
const mats = (gltf.materials ?? []).map((m) => m.name)
let tris = 0
const perMesh = {}
for (const n of nodes) {
  if (n.mesh === undefined) continue
  const mesh = gltf.meshes[n.mesh]
  let t = 0
  for (const p of mesh.primitives) {
    const count = p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count
    t += count / 3
    if (!p.attributes.JOINTS_0 || !p.attributes.WEIGHTS_0) errors.push(`${n.name}: primitive not skinned`)
  }
  if (n.skin === undefined) errors.push(`${n.name}: no skin`)
  perMesh[n.name] = { tris: t, materials: mesh.primitives.map((p) => mats[p.material]) }
  tris += t
}
const body = nodes[byName.body]
if (body) {
  const bm = gltf.meshes[body.mesh]
  const used = bm.primitives.map((p) => mats[p.material])
  for (const m of BODY_MATS) if (!used.includes(m)) errors.push(`body lacks material ${m}`)
  const tn = bm.extras?.targetNames ?? []
  for (const m of MORPHS) if (!tn.includes(m)) errors.push(`body lacks morph ${m}`)
  perMesh.body.morphs = tn
}
for (const h of HAIR) if (perMesh[h] && !perMesh[h].materials.includes('m_hair')) errors.push(`${h} not m_hair`)
if (perMesh.acc_beard && !perMesh.acc_beard.materials.includes('m_hair')) errors.push('acc_beard not m_hair')
if (tris > 12000) errors.push(`triangles ${tris} > 12000`)

// skin joints
const skin = gltf.skins?.[0]
const jointNames = (skin?.joints ?? []).map((j) => nodes[j].name)
for (const b of BONES) if (!jointNames.includes(b)) errors.push(`skin lacks joint ${b}`)

// animations
const anims = {}
for (const a of gltf.animations ?? []) {
  let dur = 0
  const targets = new Set()
  let weights = false
  let rootMoves = false
  for (const ch of a.channels) {
    const s = a.samplers[ch.sampler]
    const inp = gltf.accessors[s.input]
    dur = Math.max(dur, inp.max?.[0] ?? 0)
    const nn = nodes[ch.target.node]?.name
    targets.add(nn)
    if (ch.target.path === 'weights') weights = true
    if (nn === 'root' && ch.target.path === 'translation') {
      const out = gltf.accessors[s.output]
      if (out.max && out.min && (Math.abs(out.max[0] - out.min[0]) > 1e-4 || Math.abs(out.max[2] - out.min[2]) > 1e-4)) rootMoves = true
    }
  }
  anims[a.name] = { duration: +dur.toFixed(3), channels: a.channels.length, bones: [...targets].filter((t) => BONES.includes(t)).length, weights, rootMoves }
  if (rootMoves) errors.push(`${a.name}: root translates horizontally`)
}
for (const n of ANIMS) if (!(n in anims)) errors.push(`missing animation ${n}`)
const extra = Object.keys(anims).filter((n) => !ANIMS.includes(n))
if (extra.length) errors.push(`unexpected animations: ${extra.join(', ')}`)

const size = statSync(file).size
if (size > 1.5 * 1024 * 1024) errors.push(`size ${(size / 1048576).toFixed(2)} MB > 1.5 MB`)

const report = { file, sizeKB: Math.round(size / 1024), triangles: tris, meshes: perMesh, materials: mats, animations: anims, errors }
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`${file}\n  size ${report.sizeKB} KB, ${tris} triangles, ${Object.keys(perMesh).length} meshes, ${mats.length} materials`)
  for (const [k, v] of Object.entries(perMesh)) console.log(`  ${k.padEnd(16)} ${String(v.tris).padStart(6)} tris  ${v.materials.join(' ')}${v.morphs ? '  morphs: ' + v.morphs.join(' ') : ''}`)
  for (const [k, v] of Object.entries(anims)) console.log(`  anim ${k.padEnd(11)} ${v.duration.toFixed(2)}s  ${v.channels} ch  ${v.bones} bones${v.weights ? '  +weights' : ''}`)
  console.log(errors.length ? `FAIL\n  - ${errors.join('\n  - ')}` : 'OK: character contract satisfied')
}
process.exit(errors.length ? 1 : 0)
