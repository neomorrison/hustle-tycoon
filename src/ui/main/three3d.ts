// Glue between the game and the 3D stage (src/three): settings, device checks, looks, backdrops.
// The 3D world is a bonus layer: whenever it can't run, the game quietly keeps its 2D art.
import { useSyncExternalStore } from 'react'
import { presetLook, resolveLook, LOOK_PRESETS } from '../../three/looks'
import type { Look } from '../../three/types'
import type { Stage } from '../../three'
import type { Person } from '../../core/types'
import { useUI, type Graphics } from '../../core/ui'
import { asset } from '../../core/assets'

export const stageUrl = (p: string) => asset(p)

// ---------------------------------------------------------------------------
// Can this device run it? (WebGL + not failed earlier this session)
// ---------------------------------------------------------------------------
let failed = false
const subs = new Set<() => void>()
/** A stage hit an error (lost context, missing GLB...): stay 2D for the rest of the session. */
export function mark3dFailed() {
  if (failed) return
  failed = true
  for (const f of subs) f()
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
const snapshot = () => failed

let capable: boolean | null = null
/** WebGL is there (checked once, like src/three's webglAvailable, without loading three.js up front). */
export function can3d(): boolean {
  if (capable === null) {
    try {
      const c = document.createElement('canvas')
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
      capable = !!gl
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch { capable = false }
  }
  return capable && !failed
}

/** true when the live 3D scenes should render (setting on, device capable, no failure this session). */
export function use3d(): boolean {
  const on = useUI(u => u.office3d)
  const hasFailed = useSyncExternalStore(subscribe, snapshot, snapshot)
  return on && !hasFailed && can3d()
}

/** Graphics preference → the stage's quality. Auto goes low on phones and small/weak machines. */
export function useQuality(): 'low' | 'high' {
  const g = useUI(u => u.graphics)
  return resolveQuality(g)
}
export function resolveQuality(g: Graphics): 'low' | 'high' {
  if (g !== 'auto') return g
  try {
    const nav = navigator as Navigator & { deviceMemory?: number }
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    const small = Math.max(window.screen?.width ?? 0, window.screen?.height ?? 0) < 1000
    if ((coarse && small) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 4)) return 'low'
  } catch { /* default high */ }
  return 'high'
}

/** DEV-only QA hook (scripts/e2e/office3d.cjs reads window.__stage). */
export function exposeStage(name: '__stage' | '__titleStage' | '__lookStage', s: Stage | null) {
  if (!import.meta.env.DEV) return
  const w = window as unknown as Record<string, unknown>
  if (s) w[name] = s
  else if (w[name]) delete w[name]
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------
export function founderLook(p: Person | null | undefined): Look {
  return p?.look ? resolveLook(p.look, presetLook('founder')) : presetLook('founder')
}

const TOP_SWAP = ['#6f8fbf', '#e2b24c', '#4f9a93', '#e88c73', '#a693c9', '#8fae8a', '#d99a9a', '#3e4f75']
/** Staff look from their portrait preset; a second hire with the same face gets a different top. */
export function staffLook(p: Person, dupIndex = 0): Look {
  const base = LOOK_PRESETS[p.portrait] ? presetLook(p.portrait) : presetLook('p18')
  if (!dupIndex) return base
  return { ...base, top: TOP_SWAP[(dupIndex - 1) % TOP_SWAP.length] }
}

// ---------------------------------------------------------------------------
// Room backdrops (same colours as the Blender stills, so 2D ↔ 3D swaps don't flash)
// ---------------------------------------------------------------------------
export const ROOM_BG: Record<number, string> = {
  0: '#fbf3e7', 1: '#fdf6e8', 2: '#fdf4e3', 3: '#fcf6e7', 4: '#fbf4e5', 5: '#08143a',
}
