import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-management.
export default function StaffDialog({ close }: DialogProps) {
  return <DialogFrame title="Staff" onClose={close}>Coming soon…</DialogFrame>
}
