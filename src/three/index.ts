// Public API of the 3D stage (docs/3D.md §6). Game code imports only from here (and './react' for the hook).
// Importing this module never touches window/document; the Stage does, once constructed.
export { Stage, webglAvailable } from './stage'
export { LOOK_PRESETS, resolveLook, presetLook, DEFAULT_LOOK, HAIR_STYLES, ACCESSORIES } from './looks'
export type {
  RoomId, HairStyle, Accessory, TopStyle, Look, AnimName, Mood, Emote, ActorSpec, ActorTask, Pick3D, StageOptions,
  ScreenRect, ScreenPoint, GearItem,
} from './types'
