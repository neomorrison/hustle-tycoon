import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-launch.
export default function NewLaunchDialog({ close }: DialogProps) {
  return <DialogFrame title="NewLaunch" onClose={close}>Coming soon…</DialogFrame>
}
