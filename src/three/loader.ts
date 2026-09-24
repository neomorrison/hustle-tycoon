// GLB loading (GLTFLoader + meshopt), a small cache for shared assets, and disposal helpers.
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

export type { GLTF }

export class AssetLoader {
  private loader = new GLTFLoader()
  private shared = new Map<string, Promise<GLTF>>()

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder)
  }

  /** Fresh parse every call (rooms: the caller owns and disposes the result). */
  load(url: string): Promise<GLTF> {
    return this.loader.loadAsync(url)
  }

  /** Parsed once and kept for the stage's lifetime (character, props). */
  loadShared(url: string): Promise<GLTF> {
    let p = this.shared.get(url)
    if (!p) {
      p = this.loader.loadAsync(url)
      this.shared.set(url, p)
      p.catch(() => this.shared.delete(url))
    }
    return p
  }

  dispose() {
    for (const p of this.shared.values()) p.then(g => disposeObject(g.scene), () => {})
    this.shared.clear()
  }
}

/** Dispose every geometry, material and texture under `root` (skips ones listed in `keep`). */
export function disposeObject(root: THREE.Object3D, keep?: Set<unknown>) {
  const mats = new Set<THREE.Material>()
  const geos = new Set<THREE.BufferGeometry>()
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (m.geometry) geos.add(m.geometry)
    if (m.material) for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mm)
    const sk = o as THREE.SkinnedMesh
    if (sk.isSkinnedMesh && sk.skeleton && !keep?.has(sk.skeleton)) sk.skeleton.dispose()
  })
  for (const g of geos) if (!keep?.has(g)) g.dispose()
  for (const m of mats) if (!keep?.has(m)) disposeMaterial(m)
}

export function disposeMaterial(m: THREE.Material) {
  for (const v of Object.values(m)) {
    if (v && typeof v === 'object' && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose()
  }
  m.dispose()
}

export function materialsOf(o: THREE.Object3D): THREE.Material[] {
  const m = (o as THREE.Mesh).material
  if (!m) return []
  return Array.isArray(m) ? m : [m]
}
