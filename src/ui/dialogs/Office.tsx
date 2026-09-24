import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-management.
export default function OfficeDialog({ close }: DialogProps) {
  return <DialogFrame title="Office" onClose={close}>Coming soon…</DialogFrame>
}
