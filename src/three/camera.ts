// Game camera: fit-to-room framing at any aspect, damped yaw drag with inertia, zoom/pinch, clamped pan,
// animated rotate/zoom/reset, a slow orbit mode for title screens (per-yaw fit that keeps the logo area empty) and
// the studio framing (one person, full body, turntable) for the character preview room.
import * as THREE from 'three'
import { clamp, damp, lerp } from './math'

const DEG = Math.PI / 180
export const DEFAULT_YAW = 45
const FOV = 28
const ELEV_OUT = 40
const ELEV_IN = 31
const ZOOM_MIN = 0.32
const ZOOM_MAX = 1.25

/** Studio (character preview): lower, tighter camera on one person standing at the pedestal centre. */
const STUDIO = { fov: 26, elev: 9, zoomMin: 0.5, zoomMax: 1.15, margin: 0.09, faceY: 1.45 } as const
/**
 * Orbit (title screens): the diorama spans ORBIT.side of the canvas width (0.9 on portrait canvases) and stays
 * between ORBIT.bottom and ORBIT.top in NDC (y = +1 is the canvas top), so the upper third stays open for the logo
 * at every yaw of the slow circle. The camera keeps a_cam's elevation and field of view.
 */
export const ORBIT = { side: 0.8, sidePortrait: 0.9, top: 0.6, bottom: -0.98, speed: 5 } as const

export interface RigRoomOptions {
  /** character preview framing: one person on the spawn point, drag turns the world (see `turntable`) */
  studio?: { center: THREE.Vector3 } | null
  /** silhouette sample points of an open diorama (used by the orbit framing instead of the fit box) */
  points?: THREE.Vector3[] | null
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  mode: 'room' | 'orbit' = 'room'
  private box = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 2.7, 3))
  private boxPts: THREE.Vector3[] = []
  private points: THREE.Vector3[] | null = null
  private studio: { center: THREE.Vector3; pts: THREE.Vector3[] } | null = null
  private orbitSpec: { target: THREE.Vector3; radius: number; height: number; fov: number; yaw0: number; elev: number } | null = null
  private aspect = 16 / 9
  yaw = DEFAULT_YAW
  tYaw = DEFAULT_YAW
  zoom = 1
  tZoom = 1
  pan = new THREE.Vector2()
  tPan = new THREE.Vector2()
  private dragVel = 0
  dragging = false
  private target = new THREE.Vector3()
  private fitTarget = new THREE.Vector3()
  private fitDist = 10
  private viewShift = 0

  constructor() {
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 400)
    this.setRoom(this.box, null)
  }

  setAspect(a: number) {
    this.aspect = a > 0 && Number.isFinite(a) ? a : 16 / 9
    this.camera.aspect = this.aspect
    this.viewShift = NaN // force the view offset to be re-applied for the new aspect
    this.camera.updateProjectionMatrix()
  }

  setRoom(box: THREE.Box3, cam: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null, opts: RigRoomOptions = {}) {
    this.box.copy(box)
    this.boxPts = corners(box)
    this.points = opts.points?.length ? opts.points : null
    if (opts.studio) {
      const c = opts.studio.center
      const b = new THREE.Box3(new THREE.Vector3(c.x - 0.42, c.y - 0.16, c.z - 0.42), new THREE.Vector3(c.x + 0.42, c.y + 1.95, c.z + 0.42))
      // plus the pedestal's front lip (toward the camera) so the person stands ON something, not cut at the feet
      const a = DEFAULT_YAW * DEG
      const lip = new THREE.Vector3(c.x + Math.sin(a) * 0.8, c.y - 0.2, c.z + Math.cos(a) * 0.8)
      this.studio = { center: c.clone(), pts: [...corners(b), lip] }
    } else this.studio = null
    if (cam) {
      const off = cam.pos.clone().sub(cam.target)
      const radius = Math.hypot(off.x, off.z)
      this.orbitSpec = { target: cam.target.clone(), radius, height: off.y, fov: cam.fov, yaw0: Math.atan2(off.x, off.z) / DEG, elev: Math.atan2(off.y, radius) / DEG }
    } else this.orbitSpec = null
    this.snap()
  }

  /** true while the studio framing is active (character preview room) */
  get isStudio() { return !!this.studio }

  /**
   * Studio only: the rotation (radians about +Y) the stage applies to the world so a drag spins the pedestal like a
   * turntable while the camera and the lights stay put. 0 in every other framing.
   */
  get turntable(): number { return this.studio ? (DEFAULT_YAW - this.yaw) * DEG : 0 }

  /** jump to the default view with no animation */
  snap() {
    this.yaw = this.tYaw = this.orbitSpec && this.mode === 'orbit' ? this.orbitSpec.yaw0 : DEFAULT_YAW
    this.zoom = this.tZoom = 1
    this.pan.set(0, 0); this.tPan.set(0, 0)
    this.dragVel = 0
    this.update(0)
  }

  rotate(stepDeg: number) { this.tYaw += stepDeg; this.dragVel = 0 }
  /** delta > 0 zooms in (one unit = one step) */
  zoomBy(delta: number) { this.tZoom = this.clampZoom(this.tZoom * Math.pow(0.8, delta)) }
  zoomFactor(f: number) { this.tZoom = this.clampZoom(this.tZoom * f) }
  reset() { this.tYaw = this.nearestYaw(this.mode === 'orbit' && this.orbitSpec ? this.orbitSpec.yaw0 : DEFAULT_YAW); this.tZoom = 1; this.tPan.set(0, 0); this.dragVel = 0 }

  private clampZoom(z: number) { return this.studio ? clamp(z, STUDIO.zoomMin, STUDIO.zoomMax) : clamp(z, ZOOM_MIN, ZOOM_MAX) }

  private nearestYaw(y: number) {
    // animate the short way round to the default yaw
    const k = Math.round((this.yaw - y) / 360)
    return y + k * 360
  }

  // --- drag input (pixels)
  dragStart() { this.dragging = true; this.dragVel = 0 }
  dragRotate(dxPx: number, dt: number) {
    const d = -dxPx * (this.studio ? 0.45 : 0.32)
    this.tYaw += d
    if (dt > 0) this.dragVel = lerp(this.dragVel, d / dt, 0.35)
  }
  dragEnd() {
    this.dragging = false
    // coast: carry the release velocity a little further
    this.tYaw += clamp(this.dragVel * 0.09, -40, 40)
    this.dragVel = 0
  }
  /** screen-space pan in pixels (right-drag / two fingers) */
  dragPan(dxPx: number, dyPx: number, viewH: number) {
    if (this.studio || this.mode === 'orbit') return
    const dist = this.fitDist * this.zoom
    const worldPerPx = (2 * Math.tan((this.camera.fov * DEG) / 2) * dist) / Math.max(1, viewH)
    const a = this.yaw * DEG
    // camera right (in XZ) and forward projected on the ground
    const rx = Math.cos(a), rz = -Math.sin(a)
    const fx = -Math.sin(a), fz = -Math.cos(a)
    const k = worldPerPx * 1.0
    this.tPan.x += (-dxPx * rx + dyPx * fx * 1.4) * k
    this.tPan.y += (-dxPx * rz + dyPx * fz * 1.4) * k
  }

  private clampPan(p: THREE.Vector2, zoom: number) {
    if (this.studio || this.mode === 'orbit') { p.set(0, 0); return }
    const hx = (this.box.max.x - this.box.min.x) / 2, hz = (this.box.max.z - this.box.min.z) / 2
    const f = clamp((1.08 - zoom) / (1.08 - ZOOM_MIN), 0, 1)
    p.x = clamp(p.x, -hx * f, hx * f)
    p.y = clamp(p.y, -hz * f, hz * f)
  }

  /** elevation for a zoom level: slightly lower when zoomed in (more cinematic) */
  private elevFor(zoom: number) { return lerp(ELEV_IN, ELEV_OUT, clamp((zoom - ZOOM_MIN) / (1 - ZOOM_MIN), 0, 1)) }

  /** vertical lens shift (NDC units, + = content moves up) without tilting the camera */
  private setShift(ndcY: number) {
    if (ndcY === this.viewShift) return
    this.viewShift = ndcY
    const cam = this.camera
    if (Math.abs(ndcY) < 1e-4) cam.clearViewOffset()
    else {
      const fh = 1000, fw = fh * this.aspect
      // three shifts the frustum DOWN for a positive offsetY, which moves the picture UP
      cam.setViewOffset(fw, fh, 0, (ndcY * fh) / 2, fw, fh)
    }
  }

  update(dt: number) {
    if (this.mode === 'orbit' && !this.dragging) this.tYaw += dt * ORBIT.speed
    // inertia is folded into tYaw; everything chases its target
    const k = damp(this.dragging ? 18 : 7, dt)
    this.yaw = dt === 0 ? this.tYaw : this.yaw + (this.tYaw - this.yaw) * k
    this.tZoom = this.clampZoom(this.tZoom)
    this.zoom = dt === 0 ? this.tZoom : this.zoom + (this.tZoom - this.zoom) * damp(8, dt)
    this.clampPan(this.tPan, this.tZoom)
    if (dt === 0) this.pan.copy(this.tPan)
    else this.pan.lerp(this.tPan, damp(9, dt))
    this.clampPan(this.pan, this.zoom)

    const cam = this.camera
    if (this.mode === 'orbit' && this.orbitSpec) {
      const o = this.orbitSpec
      const pts = this.points ?? this.boxPts
      const side = this.aspect < 1 ? ORBIT.sidePortrait : ORBIT.side
      const hy = (ORBIT.top - ORBIT.bottom) / 2
      this.fitTarget.copy(o.target)
      this.fitDist = fitPoints(pts, this.yaw, o.elev, o.fov, this.aspect, side, hy, this.fitTarget, true)
      // the fit is centred; the lens shift moves it down into [bottom, top]
      this.setShift((ORBIT.top + ORBIT.bottom) / 2)
      const dist = this.fitDist * this.zoom
      const a = this.yaw * DEG, el = o.elev * DEG
      cam.fov = o.fov
      cam.position.set(
        this.fitTarget.x + Math.sin(a) * Math.cos(el) * dist,
        this.fitTarget.y + Math.sin(el) * dist,
        this.fitTarget.z + Math.cos(a) * Math.cos(el) * dist,
      )
      cam.lookAt(this.fitTarget)
      cam.near = Math.max(0.5, dist * 0.1); cam.far = dist * 3 + 200
      cam.updateProjectionMatrix()
      return
    }
    this.setShift(0)
    if (this.studio) {
      // the camera stays at the default yaw; the stage turns the world by `turntable`
      const s = this.studio
      const m = 1 - STUDIO.margin
      this.fitTarget.copy(s.center).setY(s.center.y + 0.9)
      this.fitDist = fitPoints(s.pts, DEFAULT_YAW, STUDIO.elev, STUDIO.fov, this.aspect, m, m, this.fitTarget, false)
      const zin = clamp((1 - this.zoom) / (1 - STUDIO.zoomMin), 0, 1)
      this.target.copy(this.fitTarget)
      this.target.y = lerp(this.fitTarget.y, s.center.y + STUDIO.faceY, zin)
      const dist = this.fitDist * this.zoom
      const a = DEFAULT_YAW * DEG, el = STUDIO.elev * DEG
      cam.fov = STUDIO.fov
      cam.position.set(
        this.target.x + Math.sin(a) * Math.cos(el) * dist,
        this.target.y + Math.sin(el) * dist,
        this.target.z + Math.cos(a) * Math.cos(el) * dist,
      )
      cam.lookAt(this.target)
      cam.near = 0.1; cam.far = dist * 4 + 20
      cam.updateProjectionMatrix()
      return
    }
    cam.fov = FOV
    const elev = this.elevFor(this.zoom)
    const margin = this.aspect < 1 ? 0.05 : 0.07
    this.fitTarget.copy(this.box.getCenter(this.target)).setY(0.35)
    this.fitDist = fitPoints(this.boxPts, this.yaw, elev, FOV, this.aspect, 1 - margin, 1 - margin, this.fitTarget, false)
    const dist = this.fitDist * this.zoom
    const a = this.yaw * DEG, el = elev * DEG
    // zoomed in: drift the look-at point toward the floor centre height of people
    this.target.copy(this.fitTarget)
    this.target.y = lerp(0.8, this.fitTarget.y, clamp((this.zoom - ZOOM_MIN) / (1 - ZOOM_MIN), 0, 1))
    this.target.x += this.pan.x
    this.target.z += this.pan.y
    cam.position.set(
      this.target.x + Math.sin(a) * Math.cos(el) * dist,
      this.target.y + Math.sin(el) * dist,
      this.target.z + Math.cos(a) * Math.cos(el) * dist,
    )
    cam.lookAt(this.target)
    cam.near = Math.max(0.1, dist * 0.2)
    cam.far = dist * 4 + 400 // the tier5 city floor lies far below and around the room
    cam.updateProjectionMatrix()
  }

  /** horizontal direction from the look-at point to the camera (for the cutaway) */
  horizontalDir(out: THREE.Vector2): THREE.Vector2 {
    const a = (this.studio ? DEFAULT_YAW : this.yaw) * DEG
    return out.set(Math.sin(a), Math.cos(a))
  }

  get isAnimating() {
    return this.dragging || Math.abs(this.tYaw - this.yaw) > 0.01 || Math.abs(this.tZoom - this.zoom) > 1e-4 || this.pan.distanceTo(this.tPan) > 1e-4 || this.mode === 'orbit'
  }
}

function corners(b: THREE.Box3): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new THREE.Vector3(x, y, z))
  return out
}

const _D = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0)
/**
 * Camera distance (and, in place, the look-at target) so every point fits inside a symmetric window of
 * ±halfX × ±halfY (fractions of the half-frustum) for a yaw/elevation/vertical FOV, centred on the points'
 * projection. `target` is the starting guess (with `centroid`, the points' centroid replaces it). A few
 * fixed-point iterations: the result is a continuous function of the yaw, so an orbit using it never jumps.
 */
export function fitPoints(pts: THREE.Vector3[], yawDeg: number, elevDeg: number, fovDeg: number, aspect: number, halfX: number, halfY: number, target: THREE.Vector3, centroid: boolean): number {
  const yaw = yawDeg * DEG, el = elevDeg * DEG
  const D = _D.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el))
  const r = _r.set(-D.x, -D.y, -D.z).cross(_up).normalize()
  const u = _u.crossVectors(r, D.clone().negate()).normalize()
  const tanV = Math.tan((fovDeg * DEG) / 2) * halfY
  const tanH = Math.tan((fovDeg * DEG) / 2) * aspect * halfX
  if (centroid && pts.length) {
    target.set(0, 0, 0)
    for (const p of pts) target.add(p)
    target.multiplyScalar(1 / pts.length)
  }
  let dist = 10
  const v = _v
  for (let it = 0; it < 5; it++) {
    dist = 0
    for (const c of pts) {
      v.subVectors(c, target)
      const depthOff = v.dot(D)
      dist = Math.max(dist, depthOff + Math.abs(v.dot(r)) / tanH, depthOff + Math.abs(v.dot(u)) / tanV)
    }
    // centre: project the points to normalised window coords and shift the target by the extent's midpoint
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const c of pts) {
      v.subVectors(c, target)
      const depth = dist - v.dot(D)
      const sx = v.dot(r) / (depth * tanH), sy = v.dot(u) / (depth * tanV)
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy)
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    if (Math.abs(cx) < 1e-3 && Math.abs(cy) < 1e-3) break
    target.addScaledVector(r, cx * dist * tanH * 0.9).addScaledVector(u, cy * dist * tanV * 0.9)
  }
  return dist
}
