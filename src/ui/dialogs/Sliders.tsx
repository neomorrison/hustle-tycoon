import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-launch.
export default function SlidersDialog({ close }: DialogProps) {
  return <DialogFrame title="Sliders" onClose={close}>Coming soon…</DialogFrame>
}
