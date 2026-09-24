// Renders the open dialog stack (top-most last). OWNER: ui-main.
import { Suspense } from 'react'
import { useUI, closeDialog } from '../../core/ui'
import { DIALOGS } from './registry'

export default function DialogHost() {
  const dialogs = useUI(s => s.dialogs)
  return (
    <Suspense fallback={null}>
      {dialogs.map(d => {
        const C = DIALOGS[d.id]
        return <C key={d.id} props={d.props} close={() => closeDialog(d.id)} />
      })}
    </Suspense>
  )
}
