import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-launch.
export default function ReviewDialog({ close }: DialogProps) {
  return <DialogFrame title="Review" onClose={close}>Coming soon…</DialogFrame>
}
