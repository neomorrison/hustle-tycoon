import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-management.
export default function FinanceDialog({ close }: DialogProps) {
  return <DialogFrame title="Finance" onClose={close}>Coming soon…</DialogFrame>
}
