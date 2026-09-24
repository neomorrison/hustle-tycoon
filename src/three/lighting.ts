// Hemisphere + shadowed sun + up to 4 point lights from l_* anchors, blended over the time of day.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { Room } from './room'
import { blendParams, timeOfDay, type TodParams } from './timeofday'
import { damp } from './math'

const MAX_POINTS = 4
const DEG = Math.PI / 180

export class Lighting {
  readonly hemi: THREE.HemisphereLight
  readonly sun: THREE.DirectionalLight
  readonly points: THREE.PointLight[] = []
  private pointInfo: { base: number; type: string; color: THREE.Color }[] = []
  private envRT: THREE.WebGLRenderTarget | null = null
  private cur: TodParams
  private target: TodParams
  private center = new THREE.Vector3()
  private radius = 8
  private room: Room | null = null
  private tmpColor = new THREE.Color()

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, quality: 'low' | 'high') {
    this.cur = timeOfDay(12)
    this.target = this.cur
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1)
    this.sun = new THREE.DirectionalLight(0xffffff, 2)
    this.sun.castShadow = true
    const size = quality === 'low' ? 1024 : 2048
    this.sun.shadow.mapSize.set(size, size)
    this.sun.shadow.radius = quality === 'low' ? 2 : 3.5
    this.sun.shadow.blurSamples = 12
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.025
    scene.add(this.hemi, this.sun, this.sun.target)
    for (let i = 0; i < MAX_POINTS; i++) {
      const p = new THREE.PointLight(0xffd9a0, 0, 5, 2)
      p.castShadow = false
      this.points.push(p)
      this.pointInfo.push({ base: 0, type: 'lamp', color: new THREE.Color() })
      scene.add(p)
    }
    // soft image-based fill so metals and glossy plastics are not black
    try {
      const pm = new THREE.PMREMGenerator(renderer)
      const env = new RoomEnvironment()
      this.envRT = pm.fromScene(env, 0.04)
      scene.environment = this.envRT.texture
      scene.environmentIntensity = 0.35
      env.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose() } })
      pm.dispose()
    } catch { /* optional */ }
  }

  setRoom(room: Room | null) {
    this.room = room
    if (!room) return
    const b = room.fitBox
    b.getCenter(this.center)
    this.center.y = 0
    this.radius = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.62 + 1.2
    const cam = this.sun.shadow.camera
    cam.left = -this.radius; cam.right = this.radius; cam.top = this.radius; cam.bottom = -this.radius
    cam.near = 0.5; cam.far = this.radius * 4 + 30
    cam.updateProjectionMatrix()
    // pick up to 4 light anchors: strongest first, lamps/ceilings before windows
    const ls = [...room.lights].sort((a, b) => (b.type === 'window' ? 0 : 1) - (a.type === 'window' ? 0 : 1) || b.intensity - a.intensity).slice(0, MAX_POINTS)
    for (let i = 0; i < MAX_POINTS; i++) {
      const p = this.points[i], l = ls[i]
      if (l) {
        p.position.copy(l.pos)
        p.color.copy(l.color)
        p.distance = Math.max(1, l.distance)
        this.pointInfo[i] = { base: l.intensity, type: l.type, color: l.color.clone() }
      } else this.pointInfo[i] = { base: 0, type: 'lamp', color: new THREE.Color() }
      p.intensity = 0
    }
    this.apply(this.cur)
  }

  setHour(hour: number, instant = false) {
    this.target = timeOfDay(hour)
    if (instant) { this.cur = this.target; this.apply(this.cur) }
  }

  update(dt: number) {
    this.cur = blendParams(this.cur, this.target, damp(3.5, dt))
    this.apply(this.cur)
  }

  private apply(p: TodParams) {
    this.hemi.color.setRGB(p.hemiSky[0], p.hemiSky[1], p.hemiSky[2])
    this.hemi.groundColor.setRGB(p.hemiGround[0], p.hemiGround[1], p.hemiGround[2])
    this.hemi.intensity = p.hemiIntensity
    this.sun.color.setRGB(p.sunColor[0], p.sunColor[1], p.sunColor[2])
    this.sun.intensity = p.sunIntensity
    const el = p.sunElev * DEG, az = p.sunAz * DEG
    const dist = this.radius * 2 + 10
    this.sun.position.set(
      this.center.x + Math.sin(az) * Math.cos(el) * dist,
      this.center.y + Math.sin(el) * dist,
      this.center.z + Math.cos(az) * Math.cos(el) * dist,
    )
    this.sun.target.position.copy(this.center)
    this.sun.target.updateMatrixWorld()
    this.scene.environmentIntensity = 0.25 + 0.2 * (1 - p.lamps)
    for (let i = 0; i < MAX_POINTS; i++) {
      const info = this.pointInfo[i]
      const f = info.type === 'window' ? (1 - p.lamps) * 0.6 : p.lamps
      this.points[i].intensity = info.base * f * 5
    }
    const room = this.room
    if (!room) return
    const s = room.special
    for (const m of s.sky) {
      m.color.setRGB(p.sky[0], p.sky[1], p.sky[2])
      if (m.emissive) { m.emissive.setRGB(p.sky[0], p.sky[1], p.sky[2]); m.emissiveIntensity = 0.85 }
    }
    for (const m of s.glass) {
      m.color.setRGB(p.glass[0], p.glass[1], p.glass[2])
      m.opacity = p.glassOpacity
      if (m.emissive) { m.emissive.setRGB(p.glass[0], p.glass[1], p.glass[2]); m.emissiveIntensity = 0.25 }
    }
    for (const m of s.lampshade) {
      if (!m.emissive) continue
      this.tmpColor.set('#ffd49a')
      m.emissive.copy(this.tmpColor)
      m.emissiveIntensity = 0.05 + p.lamps * 1.35
    }
  }

  get lampLevel() { return this.cur.lamps }
  get exposure() { return this.cur.exposure }

  dispose() {
    this.scene.remove(this.hemi, this.sun, this.sun.target, ...this.points)
    this.sun.shadow.map?.dispose()
    this.sun.dispose()
    this.hemi.dispose()
    for (const p of this.points) p.dispose()
    if (this.envRT) { this.envRT.dispose(); this.envRT = null }
    this.scene.environment = null
  }
}
