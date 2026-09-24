import type { DialogProps } from './types'
import { DialogFrame } from '../kit'

// PLACEHOLDER — owned by ui-main.
export default function SettingsDialog({ close }: DialogProps) {
  return <DialogFrame title="Settings" onClose={close}>Coming soon…</DialogFrame>
}
