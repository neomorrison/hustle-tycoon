import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-management.
export default function ResearchDialog({ close }: DialogProps) {
  return <DialogFrame title="Research" onClose={close}>Coming soon…</DialogFrame>
}
