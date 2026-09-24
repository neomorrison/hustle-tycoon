// Sims-style wall cutaway: walls whose outward normal faces the camera drop to a 0.3 m stub. Outside sectors (the
// tier5 city) on the camera's side sink out of view the same way, so nothing ever stands between camera and room.
import * as THREE from 'three'
import type { Room } from './room'
import { damp, nextCutState, wallFacing } from './math'

export const STUB_HEIGHT = 0.3
/** how far a cut outside sector sinks (m) before it is hidden */
export const SECTOR_SINK = 45

export function updateCutaway(room: Room, camDir: THREE.Vector2, dt: number, instant = false) {
  for (const w of room.walls) {
    const dot = wallFacing(w.side, camDir.x, camDir.y)
    w.cut = nextCutState(w.cut, dot)
    const target = w.cut ? Math.min(1, STUB_HEIGHT / w.height) : 1
    if (instant) w.level = target
    else {
      w.level += (target - w.level) * damp(w.cut ? 9 : 7, dt)
      if (Math.abs(w.level - target) < 1e-3) w.level = target
    }
    w.pivot.scale.y = w.level
    w.pivot.visible = true
    if (w.decor) w.decor.visible = !w.cut && w.level > 0.985
  }
  for (const sct of room.outsideSectors) {
    const dot = (sct.dirX * camDir.x + sct.dirZ * camDir.y) / (Math.hypot(camDir.x, camDir.y) || 1)
    sct.cut = nextCutState(sct.cut, dot, 0.3, 0.2)
    const target = sct.cut ? 0 : 1
    if (instant) sct.level = target
    else {
      sct.level += (target - sct.level) * damp(sct.cut ? 6 : 4, dt)
      if (Math.abs(sct.level - target) < 1e-3) sct.level = target
    }
    sct.obj.position.y = -(1 - sct.level) * SECTOR_SINK
    sct.obj.visible = sct.level > 0.01
  }
}
