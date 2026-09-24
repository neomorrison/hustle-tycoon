// Dev check for useStage under React StrictMode (mount → unmount → mount on the same canvas).
// Served by `npx vite` at /src/three/lab/react.html; not part of the production build.
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useStage } from '../react'
import { LOOK_PRESETS } from '../index'

const log: string[] = []
;(window as unknown as { __reactLab: { log: string[]; ready: boolean } }).__reactLab = { log, ready: false }

function App() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [show, setShow] = useState(true)
  const [hover, setHover] = useState<string | null>(null)
  const stage = useStage(ref, {
    url: p => `/assets/${p}`,
    onHover: setHover,
    onReady: () => { log.push('ready'); (window as unknown as { __reactLab: { ready: boolean } }).__reactLab.ready = true },
    onError: e => log.push(`error ${String(e)}`),
    enabled: show,
  })
  useEffect(() => {
    if (!stage) return
    log.push('stage')
    ;(window as unknown as { __stage: unknown }).__stage = stage
    stage.setActor('p', { look: LOOK_PRESETS.player })
    stage.task('p', { kind: 'sit', at: 'computer_sit', anim: 'sit_type' })
    void stage.setRoom('tier1')
  }, [stage])
  return (
    <>
      <div style={{ height: 32, display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px' }}>
        <button onClick={() => setShow(s => !s)}>{show ? 'disable 3D' : 'enable 3D'}</button>
        <span>hover: {hover ?? '-'}</span>
      </div>
      <canvas ref={ref} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
