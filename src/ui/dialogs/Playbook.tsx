import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-management.
export default function PlaybookDialog({ close }: DialogProps) {
  return <DialogFrame title="Playbook" onClose={close}>Coming soon…</DialogFrame>
}
