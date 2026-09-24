// Raycast picking (interactive groups, actors, floor) and the soft emissive hover glow.
import * as THREE from 'three'
import type { Room } from './room'
import { damp } from './math'

export interface Hit {
  key: string
  kind: 'object' | 'actor' | 'floor'
  point: THREE.Vector3
}

export interface ActorProxy { id: string; proxy: THREE.Object3D }

const GLOW = new THREE.Color('#ffe0ad')

function worldVisible(o: THREE.Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false
  return true
}

export class Picker {
  private ray = new THREE.Raycaster()
  private list: THREE.Object3D[] = []

  pick(ndc: THREE.Vector2, camera: THREE.Camera, room: Room | null, actors: ActorProxy[]): Hit | null {
    this.ray.setFromCamera(ndc, camera)
    this.list.length = 0
    const meta = new Map<THREE.Object3D, { kind: 'object' | 'actor' | 'floor' | 'block'; key?: string }>()
    if (room) for (const p of room.pickables) {
      if (!worldVisible(p.mesh)) continue
      this.list.push(p.mesh)
      meta.set(p.mesh, { kind: p.kind, key: p.key })
    }
    for (const a of actors) {
      if (!worldVisible(a.proxy)) continue
      this.list.push(a.proxy)
      meta.set(a.proxy, { kind: 'actor', key: `actor:${a.id}` })
    }
    const hits = this.ray.intersectObjects(this.list, false)
    // actors win ties with furniture they stand in front of / sit in (their proxy is slimmer than the mesh)
    const actorHit = hits.find(h => meta.get(h.object)?.kind === 'actor')
    for (const h of hits) {
      const m = meta.get(h.object)
      if (!m) continue
      if (actorHit && m.kind !== 'actor' && actorHit.distance - h.distance < 0.25) {
        return { key: meta.get(actorHit.object)!.key!, kind: 'actor', point: actorHit.point.clone() }
      }
      if (m.kind === 'object') return { key: m.key!, kind: 'object', point: h.point.clone() }
      if (m.kind === 'actor') return { key: m.key!, kind: 'actor', point: h.point.clone() }
      if (m.kind === 'floor') return { key: 'floor', kind: 'floor', point: h.point.clone() }
      // rugs and other flat static geometry at floor level count as floor
      if (h.point.y < 0.06) return { key: 'floor', kind: 'floor', point: h.point.clone() }
      return null
    }
    return null
  }
}

interface GlowEntry { level: number; target: number; meshes: THREE.Mesh[] }

/**
 * Give a standard material a soft hover glow: a warm flat lift plus a fresnel rim (reads like a soft outline).
 * Returns the uniform that drives it (0 = off). Idempotent per material.
 */
export function installGlow(m: THREE.Material): { value: number } {
  const ud = m.userData as { glow?: { value: number } }
  if (ud.glow) return ud.glow
  const u = { value: 0 }
  ud.glow = u
  const color = { value: GLOW.clone() }
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r)
    shader.uniforms.uGlow = u
    shader.uniforms.uGlowColor = color
    shader.fragmentShader = 'uniform float uGlow;\nuniform vec3 uGlowColor;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float glowRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
        totalEmissiveRadiance += uGlowColor * uGlow * (0.22 + 1.25 * glowRim);
      }`,
    )
  }
  const prevKey = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => prevKey() + '|glow'
  m.needsUpdate = true
  return u
}

/** Hover glow for room groups: meshes get a cloned material while glowing, restored when the glow fades out. */
export class Glow {
  private entries = new Map<string, GlowEntry>()
  private clones = new Map<THREE.Mesh, { orig: THREE.Material; clone: THREE.MeshStandardMaterial; u: { value: number } }>()
  private time = 0
  /** actor material access: returns the actor's own (already per-actor) materials */
  actorMaterials: (id: string) => THREE.MeshStandardMaterial[] = () => []

  set(keys: (string | null)[], room: Room | null) {
    const want = new Set(keys.filter((k): k is string => !!k))
    for (const [k, e] of this.entries) if (!want.has(k)) e.target = 0
    for (const k of want) {
      let e = this.entries.get(k)
      if (!e) {
        const meshes: THREE.Mesh[] = []
        if (!k.startsWith('actor:')) for (const g of room?.interactives.get(k) ?? []) g.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })
        e = { level: 0, target: 1, meshes }
        this.entries.set(k, e)
      }
      e.target = 1
    }
  }

  update(dt: number) {
    this.time += dt
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 4.2)
    for (const [k, e] of this.entries) {
      e.level += (e.target - e.level) * damp(e.target > e.level ? 14 : 9, dt)
      if (e.target === 0 && e.level < 0.01) e.level = 0
      const g = e.level * pulse * 0.7
      if (k.startsWith('actor:')) {
        // actor materials carry the glow permanently (installed at build), so hovering never recompiles
        for (const m of this.actorMaterials(k.slice(6))) installGlow(m).value = g
      } else {
        for (const mesh of e.meshes) {
          let c = this.clones.get(mesh)
          if (!c && e.level > 0) {
            const orig = mesh.material as THREE.Material
            const clone = orig.clone() as THREE.MeshStandardMaterial
            c = { orig, clone, u: installGlow(clone) }
            this.clones.set(mesh, c)
          }
          if (!c) continue
          if (e.level === 0) { mesh.material = c.orig; continue }
          mesh.material = c.clone
          // keep time-of-day tints (sky, lampshades) in sync with the original while glowing
          const o = c.orig as THREE.MeshStandardMaterial
          c.clone.color?.copy(o.color); c.clone.emissive?.copy(o.emissive); c.clone.emissiveIntensity = o.emissiveIntensity; c.clone.opacity = o.opacity
          c.u.value = g
        }
      }
      if (e.level === 0 && e.target === 0) this.entries.delete(k)
    }
  }

  /** drop room-bound state (materials restored and clones disposed) */
  clear() {
    for (const [mesh, c] of this.clones) { mesh.material = c.orig; c.clone.dispose() }
    this.clones.clear()
    for (const k of [...this.entries.keys()]) if (!k.startsWith('actor:')) this.entries.delete(k)
  }
}
