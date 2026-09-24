// Gear props on a_gear_* anchors and inventory boxes (instanced box_stack_unit) filling a_boxes_* regions.
import * as THREE from 'three'
import type { GLTF } from './loader'
import type { Room } from './room'
import type { GearItem } from './types'
import { boxCapacity, boxCount, COMPUTER_GEAR, planGear, regionSlotList, type BoxRegion, type BoxSlot } from './math'

export class Props {
  readonly group = new THREE.Group()
  private gear: { key: string; obj: THREE.Object3D }[] = []
  private boxMeshes: THREE.InstancedMesh[] = []
  private slots: { slot: BoxSlot; m: THREE.Matrix4 }[] = []
  private boxUnits = 0
  private gearWant: GearItem[] = []
  private boxShown = 0
  private boxAnim = 0

  constructor() { this.group.name = 'props' }

  setGear(items: GearItem[], room: Room | null, props: GLTF | null) {
    this.gearWant = items.slice()
    for (const g of this.gear) g.obj.removeFromParent()
    this.gear = []
    if (!room || !props) return
    const desk = room.anchor('gear_desk')
    const placed = planGear(items, {
      baked: room.bakedGear,
      deskDefault: typeof desk?.extras.default === 'string' ? desk.extras.default : null,
      hasDesk: !!desk,
      floorAnchors: room.anchorsWithPrefix('gear_floor_').map(a => a.name),
    })
    for (const p of placed) {
      const a = room.anchor(p.anchor)
      const src = props.scene.getObjectByName(p.node)
      if (!a || !src) continue
      const obj = src.clone(true)
      obj.position.set(0, 0, 0); obj.quaternion.identity()
      obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
      const holder = new THREE.Group()
      holder.name = `gear_${p.node}`
      holder.position.copy(a.pos)
      holder.quaternion.copy(a.quat)
      if (p.anchor === 'gear_desk') {
        // a_gear_desk (anchor-local: +X toward the desk middle, +Z toward the sitter). A bare desk names `center`
        // (metres to the desk middle): the computer sits there and small gear in the gear zone beside it. On a
        // desk that already shows monitors the zone is small: the computer stays on the anchor, small gear in front.
        const center = Number(a.extras.center) || 0
        const hasComputer = placed.some(q => q.anchor === 'gear_desk' && COMPUTER_GEAR.has(q.node))
        if (COMPUTER_GEAR.has(p.node)) {
          obj.position.set(center, 0, center ? 0 : -0.04)
          if (center) {
            // centre the prop's footprint on the desk and shrink a wide one (workstation) to fit the desk top
            const bb = new THREE.Box3().setFromObject(src)
            const deskW = center * 2 + 0.5
            const pw = bb.max.x - bb.min.x
            const k = pw > deskW - 0.08 ? (deskW - 0.08) / pw : 1
            obj.scale.setScalar(k)
            obj.position.x = center - ((bb.min.x + bb.max.x) / 2 - src.getWorldPosition(new THREE.Vector3()).x) * k
          }
        }
        else {
          const k = placed.filter(q => q.anchor === 'gear_desk' && !COMPUTER_GEAR.has(q.node)).findIndex(q => q.node === p.node)
          const xs = center ? [-0.06, 0.1, -0.2] : [-0.12, 0.1, 0.0]
          obj.position.set(xs[k % 3] ?? 0, 0, hasComputer ? 0.15 : 0.04)
          obj.rotation.y = (k % 2 ? -1 : 1) * 0.22
        }
      }
      holder.add(obj)
      this.group.add(holder)
      this.gear.push({ key: `${p.node}@${p.anchor}`, obj: holder })
    }
  }

  setBoxes(units: number, room: Room | null, props: GLTF | null) {
    this.boxUnits = units
    if (!room || !props) return
    if (!this.boxMeshes.length) this.buildBoxes(room, props)
    const cap = this.slots.length
    this.boxShown = boxCount(units, cap)
  }

  private buildBoxes(room: Room, props: GLTF) {
    this.clearBoxes()
    const regions = room.anchorsWithPrefix('boxes_')
    const src = props.scene.getObjectByName('box_stack_unit')
    if (!regions.length || !src) return
    const slots: { slot: BoxSlot; m: THREE.Matrix4 }[] = []
    regions.forEach((a, ri) => {
      const r: BoxRegion = { w: Number(a.extras.w) || 0.8, d: Number(a.extras.d) || 0.6, layers: Number(a.extras.layers) || 2 }
      const base = new THREE.Matrix4().compose(a.pos, a.quat, new THREE.Vector3(1, 1, 1))
      for (const s of regionSlotList(r, ri)) {
        const local = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot), new THREE.Vector3(1, 1, 1))
        slots.push({ slot: s, m: base.clone().multiply(local) })
      }
    })
    void boxCapacity
    this.slots = slots
    src.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert()
    src.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, slots.length)
      im.name = `boxes_${mesh.name}`
      im.castShadow = true
      im.receiveShadow = true
      im.count = 0
      im.userData.rel = rel
      im.frustumCulled = false
      this.boxMeshes.push(im)
      this.group.add(im)
    })
    this.boxAnim = 0
  }

  /** animate boxes popping in/out one by one */
  update(dt: number) {
    if (!this.boxMeshes.length) return
    const target = this.boxShown
    if (Math.abs(this.boxAnim - target) < 1e-4) return
    const rate = Math.max(6, Math.abs(target - this.boxAnim) * 2.5)
    this.boxAnim += Math.sign(target - this.boxAnim) * Math.min(Math.abs(target - this.boxAnim), rate * dt)
    this.writeBoxes()
  }

  private writeBoxes() {
    const n = Math.ceil(this.boxAnim - 1e-6)
    const m = new THREE.Matrix4(), sc = new THREE.Matrix4()
    for (const im of this.boxMeshes) {
      const rel = im.userData.rel as THREE.Matrix4
      for (let i = 0; i < n; i++) {
        const grow = Math.min(1, this.boxAnim - i)
        const s = grow >= 1 ? 1 : 0.6 + 0.4 * Math.sin((grow * Math.PI) / 2)
        sc.makeScale(s, s, s)
        m.copy(this.slots[i].m).multiply(sc).multiply(rel)
        im.setMatrixAt(i, m)
      }
      im.count = n
      im.instanceMatrix.needsUpdate = true
    }
  }

  private clearBoxes() {
    for (const im of this.boxMeshes) { im.removeFromParent(); im.dispose() }
    this.boxMeshes = []
    this.slots = []
  }

  /** room swapped: rebuild from the remembered wishes (boxes appear without animation) */
  setRoom(room: Room | null, props: GLTF | null) {
    this.clearBoxes()
    this.boxShown = 0
    this.setGear(this.gearWant, room, props)
    this.setBoxes(this.boxUnits, room, props)
    this.boxAnim = this.boxShown
    this.writeBoxes()
  }

  get stats() { return { gear: this.gear.length, gearIds: this.gear.map(g => g.key), boxes: this.boxShown, capacity: this.slots.length } }

  dispose() {
    for (const g of this.gear) g.obj.removeFromParent()
    this.gear = []
    this.clearBoxes()
    this.group.removeFromParent()
  }
}
