// Live city diorama behind the title (title_city.glb in orbit). The still shows until it's ready, and stays if 3D can't run.
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useStage } from '../../three/react'
import { exposeStage, mark3dFailed, stageUrl, useQuality } from './three3d'
import './office3d.css'

export default function TitleCity({ active, onReady }: { active: boolean; onReady: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const quality = useQuality()
  const [ready, setReady] = useState(false)
  const stage = useStage(ref, { url: stageUrl, quality, onReady: () => { setReady(true); onReady() }, onError: () => mark3dFailed() })
  useEffect(() => {
    if (!stage) return
    exposeStage('__titleStage', stage)
    stage.setCameraMode('orbit')
    stage.setTimeOfDay(18.3)
    void stage.setRoom('title_city')
    return () => exposeStage('__titleStage', null)
  }, [stage])
  useEffect(() => { stage?.setActive(active) }, [stage, active])
  return <div className={clsx('m-title-3d', ready && 'on')} aria-hidden="true"><canvas ref={ref} /></div>
}
