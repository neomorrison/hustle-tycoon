import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-launch.
export default function PostMortemDialog({ close }: DialogProps) {
  return <DialogFrame title="PostMortem" onClose={close}>Coming soon…</DialogFrame>
}
