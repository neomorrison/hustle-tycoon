import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-launch.
export default function LaunchDetailDialog({ close }: DialogProps) {
  return <DialogFrame title="LaunchDetail" onClose={close}>Coming soon…</DialogFrame>
}
