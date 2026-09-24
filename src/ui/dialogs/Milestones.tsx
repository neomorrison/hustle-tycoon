import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-management.
export default function MilestonesDialog({ close }: DialogProps) {
  return <DialogFrame title="Milestones" onClose={close}>Coming soon…</DialogFrame>
}
