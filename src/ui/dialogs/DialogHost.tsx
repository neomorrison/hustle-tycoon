// Renders the open dialog stack (top-most last). OWNER: ui-main.
// Each dialog is isolated in an error boundary; Esc closes the top management dialog.
import { Suspense, useEffect, useRef } from 'react'
import { useUI, closeDialog, type DialogId } from '../../core/ui'
import { act } from '../../core/store'
import { setStageSliders } from '../../sim/launch'
import { DIALOGS } from './registry'
import SafeBoundary from '../main/SafeBoundary'
import { playSfx } from '../audio'

/** Dialogs that drive the launch flow: never closed by Esc (they clear sim flags themselves). */
const STICKY = new Set<DialogId>(['sliders', 'review', 'postMortem'])

/**
 * Safety net: if a flow dialog crashes, closing the error card must still move the game on — otherwise the
 * auto-dialogs would reopen the broken window forever (sliders pause the clock until confirmed).
 */
function unstick(id: DialogId) {
  act(s => {
    if (id === 'sliders' && s.current?.awaitingSliders) setStageSliders(s, [1, 1, 1])
    if (id === 'review') delete s.flags.pendingReview
    if (id === 'postMortem') delete s.flags.pendingPostMortem
  })
}

function Loading() {
  return (
    <div className="k-backdrop m-dialog-loading" aria-busy="true">
      <div className="m-spinner" aria-label="Loading" />
    </div>
  )
}

export default function DialogHost() {
  const dialogs = useUI(s => s.dialogs)
  const count = useRef(dialogs.length)
  useEffect(() => {
    if (dialogs.length > count.current) playSfx('pop')
    count.current = dialogs.length
  }, [dialogs.length])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const top = useUI.getState().dialogs.at(-1)
      if (!top || STICKY.has(top.id)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') && (t as HTMLInputElement).value) return
      e.preventDefault()
      closeDialog(top.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      {dialogs.map(d => {
        const C = DIALOGS[d.id]
        const close = () => closeDialog(d.id)
        const crashClose = () => { if (STICKY.has(d.id)) unstick(d.id); close() }
        return (
          <SafeBoundary key={d.id} name={`The ${d.id} window`} onClose={crashClose}>
            <Suspense fallback={<Loading />}>
              <C props={d.props} close={close} />
            </Suspense>
          </SafeBoundary>
        )
      })}
    </>
  )
}
