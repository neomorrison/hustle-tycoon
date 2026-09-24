// useStage: the one React touch-point of src/three. Creates the Stage on mount, disposes it on unmount, and survives
// StrictMode's mount → unmount → mount (the second mount gets a fresh Stage on the same canvas).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Stage, webglAvailable } from './stage'
import type { StageOptions } from './types'

export type UseStageOptions = Omit<StageOptions, 'canvas'> & {
  /** false keeps the stage unmounted (e.g. 3D disabled in settings) */
  enabled?: boolean
}

export function useStage(canvasRef: RefObject<HTMLCanvasElement | null>, opts: UseStageOptions): Stage | null {
  const [stage, setStage] = useState<Stage | null>(null)
  // callbacks always read the latest props without recreating the stage
  const latest = useRef(opts)
  latest.current = opts
  const enabled = opts.enabled !== false
  const quality = opts.quality ?? 'high'
  const placeholder = !!opts.placeholderActors

  useEffect(() => {
    const canvas = canvasRef.current
    if (!enabled || !canvas || !webglAvailable()) return
    const s = new Stage({
      canvas,
      quality,
      placeholderActors: placeholder,
      url: p => latest.current.url(p),
      onHover: k => latest.current.onHover?.(k),
      onPick: p => latest.current.onPick?.(p),
      onReady: () => latest.current.onReady?.(),
      onError: e => latest.current.onError?.(e),
    })
    setStage(s)
    return () => {
      s.dispose()
      setStage(cur => (cur === s ? null : cur))
    }
  }, [canvasRef, enabled, quality, placeholder])

  return stage
}
