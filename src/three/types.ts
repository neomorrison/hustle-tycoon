// Public types of the 3D stage (see docs/3D.md §6–7). Pure types: no three.js import, safe for sim/tests.

export type RoomId = 'tier0' | 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5' | 'mcdoodles' | 'title_city' | 'studio'

export type HairStyle = 'short' | 'messy' | 'long' | 'bun' | 'braids' | 'afro' | 'buzz' | 'curly' | 'ponytail' | 'bob' | 'bald'
export type Accessory = 'glasses' | 'cap' | 'cap_back' | 'beanie' | 'flatcap' | 'hijab' | 'headphones' | 'visor' | 'scarf' | 'beard' | 'apron'
export type TopStyle = 'tee' | 'hoodie' | 'polo' | 'blazer' | 'sweater' | 'uniform'

/** A person's appearance. Colours are CSS hex strings (#rrggbb). */
export interface Look {
  skin: string
  hair: string
  hairStyle: HairStyle
  top: string
  topStyle?: TopStyle
  bottom: string
  shoes: string
  acc?: Accessory[]
  /** main accessory colour (cap, hijab, scarf, headphones…); defaults to the top colour */
  accColor?: string
  /** 0.9..1.1 (1 = default) */
  height?: number
  /** 0.85..1.2 body width (1 = default) */
  build?: number
}

export type AnimName =
  | 'idle' | 'idle_tired' | 'walk' | 'sit_idle' | 'sit_type' | 'sit_think' | 'sleep' | 'eat_sit' | 'cook' | 'cheer'
  | 'stressed' | 'phone' | 'talk' | 'wave' | 'register' | 'film' | 'carry' | 'stretch'

export type Mood = 'neutral' | 'happy' | 'tired' | 'stressed'
export type Emote = 'cheer' | 'wave' | 'stressed' | 'talk'

export interface ActorSpec {
  look: Look
  name?: string
  /** metres per second at 1× (default 1.35) */
  walkSpeed?: number
}

export type ActorTask =
  | { kind: 'idle'; at?: string; anim?: AnimName }
  | { kind: 'wander' }
  | { kind: 'sit'; at: string; anim?: 'sit_idle' | 'sit_type' | 'sit_think' | 'eat_sit' }
  | { kind: 'lie'; at: string }
  | { kind: 'use'; at: string; anim: AnimName }
  | { kind: 'goto'; point: { x: number; z: number } }
  | { kind: 'leave'; at?: string }
  | { kind: 'hidden' }

export interface Pick3D {
  /** interactive key ('bed', 'computer'…), 'actor:<id>' for people, or 'floor' */
  key: string
  kind: 'object' | 'actor' | 'floor'
  /** world-space hit point (three.js coordinates, Y up) */
  point?: { x: number; y: number; z: number }
}

export interface StageOptions {
  canvas: HTMLCanvasElement
  /** maps an asset path such as '3d/tier0.glb' to a full URL (the game's asset() helper) */
  url: (path: string) => string
  /** low: pixelRatio 1, 1024 shadows, no MSAA */
  quality?: 'low' | 'high'
  onHover?: (key: string | null) => void
  onPick?: (pick: Pick3D) => void
  /** first room + characters loaded and rendered */
  onReady?: () => void
  /** GLB load failure or lost GL context; the game falls back to its 2D scene */
  onError?: (err: unknown) => void
  /** dev/lab only: when character.glb is missing, show simple placeholder people instead of failing */
  placeholderActors?: boolean
}

export interface ScreenRect { x: number; y: number; w: number; h: number }
export interface ScreenPoint { x: number; y: number }

export interface GearItem {
  /** gear id; dropship data uses hyphens ('ring-light'), node names use underscores; both accepted */
  id: string
  /** anchor name (defaults: desk items → a_gear_desk, floor items → a_gear_floor_1/2) */
  anchor?: string
}
