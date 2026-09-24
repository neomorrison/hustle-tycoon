import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-management.
export default function DayJobDialog({ close }: DialogProps) {
  return <DialogFrame title="DayJob" onClose={close}>Coming soon…</DialogFrame>
}
