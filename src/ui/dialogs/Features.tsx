import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-management.
export default function FeaturesDialog({ close }: DialogProps) {
  return <DialogFrame title="Features" onClose={close}>Coming soon…</DialogFrame>
}
