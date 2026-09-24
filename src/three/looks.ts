// Look presets for the 3D people (docs/3D.md §7) + helpers to resolve a partial look.
// Pure data: no three.js import, safe for sim/tests.
//
// The preset table between the @presets markers is strict JSON (quoted keys, no trailing commas):
// blender/character/character.py parses it for the preview lineup, so this file stays the single
// source of truth. Keep it JSON-valid when editing.

import type { Accessory, HairStyle, Look } from './types'

// @presets-begin
const PRESETS = {
  "player": { "skin": "#e3b08d", "hair": "#3f2a20", "hairStyle": "messy", "top": "#a7a3a0", "topStyle": "hoodie", "bottom": "#3e4f75", "shoes": "#f3f2ef" },
  "founder": { "skin": "#e3b08d", "hair": "#3f2a20", "hairStyle": "messy", "top": "#a7a3a0", "topStyle": "hoodie", "bottom": "#3e4f75", "shoes": "#f3f2ef" },

  "p01": { "skin": "#7d4e34", "hair": "#2a1d18", "hairStyle": "braids", "top": "#e2b24c", "topStyle": "tee", "bottom": "#3e4f75", "shoes": "#f3f2ef", "height": 0.98 },
  "p02": { "skin": "#f0cfb0", "hair": "#eadcb5", "hairStyle": "short", "top": "#a9b8c8", "topStyle": "tee", "bottom": "#2b2d33", "shoes": "#2b2d33", "acc": ["headphones"], "accColor": "#2b2d33", "build": 0.95 },
  "p03": { "skin": "#d9a07a", "hair": "#6f4b33", "hairStyle": "long", "top": "#c9a06b", "topStyle": "blazer", "bottom": "#3e4f75", "shoes": "#b07e55", "acc": ["glasses"], "height": 0.96, "build": 1.05 },
  "p04": { "skin": "#efc9ad", "hair": "#dcd8d2", "hairStyle": "short", "top": "#7a5a44", "topStyle": "blazer", "bottom": "#6f6a60", "shoes": "#6f4b33", "acc": ["flatcap", "beard"], "accColor": "#8a6a4f", "height": 0.97, "build": 1.1 },
  "p05": { "skin": "#c98e65", "hair": "#2a1d18", "hairStyle": "long", "top": "#a693c9", "topStyle": "tee", "bottom": "#3e4f75", "shoes": "#f3f2ef", "acc": ["hijab"], "accColor": "#c3b3e0", "height": 0.96 },
  "p06": { "skin": "#6b4230", "hair": "#1f1a17", "hairStyle": "buzz", "top": "#6f8fbf", "topStyle": "polo", "bottom": "#b9a58a", "shoes": "#3c4048", "acc": ["beard"], "height": 1.04, "build": 1.12 },
  "p07": { "skin": "#f6d8c4", "hair": "#b8532e", "hairStyle": "curly", "top": "#efe4cf", "topStyle": "tee", "bottom": "#6f8fbf", "shoes": "#e88c73", "height": 0.97 },
  "p08": { "skin": "#eccaa8", "hair": "#cfcac4", "hairStyle": "bob", "top": "#d8d4ce", "topStyle": "sweater", "bottom": "#7d7f86", "shoes": "#b07e55", "height": 0.93 },
  "p09": { "skin": "#c89470", "hair": "#2a1d18", "hairStyle": "curly", "top": "#5d7fb0", "topStyle": "polo", "bottom": "#3c4048", "shoes": "#f3f2ef", "acc": ["beard"], "height": 1.02 },
  "p10": { "skin": "#d9a07a", "hair": "#e7a6c9", "hairStyle": "buzz", "top": "#9fb4d9", "topStyle": "tee", "bottom": "#4f5a6b", "shoes": "#f3f2ef", "build": 0.92 },
  "p11": { "skin": "#f0cdb4", "hair": "#e3c27a", "hairStyle": "bob", "top": "#e8e1d6", "topStyle": "blazer", "bottom": "#3c4048", "shoes": "#3c4048", "height": 0.99 },
  "p12": { "skin": "#c98e65", "hair": "#2a1d18", "hairStyle": "short", "top": "#efe4cf", "topStyle": "tee", "bottom": "#3e4f75", "shoes": "#f3f2ef", "acc": ["cap_back"], "accColor": "#d8352a", "height": 1.03, "build": 1.05 },
  "p13": { "skin": "#6b4230", "hair": "#b3afa9", "hairStyle": "afro", "top": "#e88c73", "topStyle": "tee", "bottom": "#6f4b33", "shoes": "#b07e55", "acc": ["scarf"], "accColor": "#e2b24c", "height": 0.94, "build": 1.08 },
  "p14": { "skin": "#b57a55", "hair": "#1f1a17", "hairStyle": "short", "top": "#cdb89a", "topStyle": "sweater", "bottom": "#3e4f75", "shoes": "#6f4b33", "acc": ["glasses"], "build": 1.06 },
  "p15": { "skin": "#e7bd98", "hair": "#1f1a17", "hairStyle": "long", "top": "#efc3c0", "topStyle": "tee", "bottom": "#3e4f75", "shoes": "#f3f2ef", "acc": ["beanie"], "accColor": "#d99a9a", "height": 0.96 },
  "p16": { "skin": "#f3d5c0", "hair": "#d9d6d0", "hairStyle": "bun", "top": "#e6dccb", "topStyle": "sweater", "bottom": "#a7a3a0", "shoes": "#b07e55", "height": 0.93 },
  "p17": { "skin": "#b57a55", "hair": "#1f1a17", "hairStyle": "ponytail", "top": "#4f9a93", "topStyle": "tee", "bottom": "#3e4f75", "shoes": "#6f4b33", "height": 1.03 },
  "p18": { "skin": "#e7bd98", "hair": "#1f1a17", "hairStyle": "short", "top": "#5f6166", "topStyle": "hoodie", "bottom": "#2b2d33", "shoes": "#f3f2ef", "acc": ["glasses"], "build": 1.04 },

  "crew_1": { "skin": "#c98e65", "hair": "#2a1d18", "hairStyle": "ponytail", "top": "#d8352a", "topStyle": "uniform", "bottom": "#2b2d33", "shoes": "#2b2d33", "acc": ["visor"], "accColor": "#f5c342", "height": 0.97 },
  "crew_2": { "skin": "#f0cfb0", "hair": "#b8532e", "hairStyle": "short", "top": "#d8352a", "topStyle": "uniform", "bottom": "#2b2d33", "shoes": "#2b2d33", "acc": ["visor"], "accColor": "#f5c342", "build": 0.95 },
  "crew_3": { "skin": "#7d4e34", "hair": "#1f1a17", "hairStyle": "buzz", "top": "#d8352a", "topStyle": "uniform", "bottom": "#2b2d33", "shoes": "#2b2d33", "acc": ["visor", "apron"], "accColor": "#f5c342", "height": 1.04, "build": 1.1 },

  "customer_1": { "skin": "#eccaa8", "hair": "#6f4b33", "hairStyle": "bob", "top": "#4f9a93", "topStyle": "tee", "bottom": "#3e4f75", "shoes": "#f3f2ef", "height": 0.95 },
  "customer_2": { "skin": "#6b4230", "hair": "#1f1a17", "hairStyle": "short", "top": "#e2b24c", "topStyle": "hoodie", "bottom": "#a7a3a0", "shoes": "#2b2d33", "acc": ["cap"], "accColor": "#3e4f75", "height": 1.05 },
  "customer_3": { "skin": "#f6d8c4", "hair": "#e3c27a", "hairStyle": "ponytail", "top": "#e88c73", "topStyle": "tee", "bottom": "#6f8fbf", "shoes": "#f3f2ef", "height": 0.96 },
  "customer_4": { "skin": "#c89470", "hair": "#3f2a20", "hairStyle": "messy", "top": "#6f8fbf", "topStyle": "polo", "bottom": "#b9a58a", "shoes": "#6f4b33", "acc": ["glasses"], "build": 1.1 },
  "customer_5": { "skin": "#e7bd98", "hair": "#1f1a17", "hairStyle": "bun", "top": "#8fae8a", "topStyle": "sweater", "bottom": "#3c4048", "shoes": "#f3f2ef", "height": 0.94 },
  "customer_6": { "skin": "#a86f4c", "hair": "#1f1a17", "hairStyle": "afro", "top": "#3e4f75", "topStyle": "tee", "bottom": "#2b2d33", "shoes": "#e88c73", "acc": ["headphones"], "accColor": "#f3f2ef" },
  "customer_7": { "skin": "#f3d5c0", "hair": "#cfcac4", "hairStyle": "short", "top": "#a7a3a0", "topStyle": "blazer", "bottom": "#3e4f75", "shoes": "#3c4048", "acc": ["beard", "glasses"], "height": 1.02, "build": 1.08 },
  "customer_8": { "skin": "#d9a07a", "hair": "#2a1d18", "hairStyle": "braids", "top": "#d99a9a", "topStyle": "hoodie", "bottom": "#4f5a6b", "shoes": "#f3f2ef", "acc": ["beanie"], "accColor": "#efe4cf", "height": 0.97 }
}
// @presets-end

export const LOOK_PRESETS: Record<string, Look> = PRESETS as Record<string, Look>

/** The default look (the player / founder). */
export const DEFAULT_LOOK: Look = LOOK_PRESETS.player

export const HAIR_STYLES: HairStyle[] = ['short', 'messy', 'long', 'bun', 'braids', 'afro', 'buzz', 'curly', 'ponytail', 'bob', 'bald']
export const ACCESSORIES: Accessory[] = ['glasses', 'cap', 'cap_back', 'beanie', 'flatcap', 'hijab', 'headphones', 'visor', 'scarf', 'beard', 'apron']

/**
 * Hair styles that would poke through an accessory. When a look wears the accessory, the listed
 * hair mesh is swapped for HAIR_UNDER_HAT's replacement (see effectiveHair), or hidden if none.
 * Hats are modelled roomy enough to cover short, buzz, long, bob, braids, ponytail and curly.
 */
export const HAIR_HIDDEN_BY: Partial<Record<Accessory, HairStyle[]>> = {
  hijab: ['short', 'messy', 'long', 'bun', 'braids', 'afro', 'buzz', 'curly', 'ponytail', 'bob'],
  cap: ['messy', 'afro', 'bun'],
  cap_back: ['messy', 'afro', 'bun'],
  beanie: ['messy', 'afro', 'bun'],
  flatcap: ['messy', 'afro', 'bun'],
  visor: ['afro'],
}

/** What a hidden hair style becomes under a hat (keeps the sides/back of the hair visible). */
export const HAIR_UNDER_HAT: Partial<Record<HairStyle, HairStyle>> = {
  messy: 'short',
  afro: 'curly',
  bun: 'ponytail',
}

/** The hair mesh to show for a look: 'bald' means none (e.g. under a hijab). */
export function effectiveHair(look: Pick<Look, 'hairStyle' | 'acc'>): HairStyle {
  let style = look.hairStyle
  for (const a of look.acc ?? []) {
    const hidden = HAIR_HIDDEN_BY[a]
    if (!hidden || !hidden.includes(style)) continue
    if (a === 'hijab') return 'bald'
    const swap = HAIR_UNDER_HAT[style]
    style = swap && !hidden.includes(swap) ? swap : 'bald'
  }
  return style
}

/** glTF node name of the hair mesh for a look, or null for bald. */
export function hairNode(look: Pick<Look, 'hairStyle' | 'acc'>): string | null {
  const h = effectiveHair(look)
  return h === 'bald' ? null : `hair_${h}`
}

/** glTF node name of the clothing add-on for a look ('tee' has none: the body mesh is the tee). */
export function topNode(look: Pick<Look, 'topStyle'>): string | null {
  const t = look.topStyle ?? 'tee'
  return t === 'tee' ? null : `top_${t}`
}

/** glTF node names of the accessories to show (deduplicated, cap vs cap_back resolved to the last one). */
export function accNodes(look: Pick<Look, 'acc'>): string[] {
  const out: string[] = []
  const hats: Accessory[] = ['cap', 'cap_back', 'beanie', 'flatcap', 'hijab']
  let hat: Accessory | null = null
  for (const a of look.acc ?? []) {
    if (hats.includes(a)) hat = a
    else if (!out.includes(`acc_${a}`)) out.push(`acc_${a}`)
  }
  if (hat) out.push(`acc_${hat}`)
  return out
}

/** Every hair_/top_/acc_ node in character.glb (toggle all off, then show the look's ones). */
export const OPTIONAL_NODES: string[] = [
  ...HAIR_STYLES.filter((h) => h !== 'bald').map((h) => `hair_${h}`),
  'top_hoodie', 'top_polo', 'top_blazer', 'top_sweater', 'top_uniform',
  ...ACCESSORIES.map((a) => `acc_${a}`),
]

/**
 * Colour of each recolourable character material for a look (keys are glTF material names).
 * m_acc2 is the secondary accent: shirt under a blazer / sweater vest, uniform name tag, scarf stripes.
 * Glasses frames use m_eye (always near-black) and the beard + eyebrows use m_hair.
 */
export function lookColors(look: Look): Record<string, string> {
  return {
    m_skin: look.skin,
    m_hair: look.hair,
    m_top: look.top,
    m_bottom: look.bottom,
    m_shoes: look.shoes,
    m_acc: look.accColor ?? look.top,
    m_acc2: '#f3f2ef',
    m_mouth: mouthColor(look.skin),
  }
}

/** A lip colour that reads on any skin tone: the skin darkened and warmed. */
export function mouthColor(skin: string): string {
  const [r, g, b] = hexToRgb(skin)
  return rgbToHex(r * 0.55 + 40, g * 0.3 + 10, b * 0.3 + 12)
}

const HEX = /^#[0-9a-f]{6}$/i

function hexToRgb(hex: string): [number, number, number] {
  const h = HEX.test(hex) ? hex : '#e3b08d'
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Fill a partial look with defaults (the player look), normalise colours to #rrggbb and clamp
 * height (0.9..1.1) and build (0.85..1.2). Unknown hair styles / accessories are dropped.
 */
export function resolveLook(partial?: Partial<Look> | null, base: Look = DEFAULT_LOOK): Look {
  const p = partial ?? {}
  const col = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d)
  const hairStyle = p.hairStyle && HAIR_STYLES.includes(p.hairStyle) ? p.hairStyle : base.hairStyle
  const acc = (p.acc ?? base.acc ?? []).filter((a, i, arr) => ACCESSORIES.includes(a) && arr.indexOf(a) === i)
  const look: Look = {
    skin: col(p.skin, base.skin),
    hair: col(p.hair, base.hair),
    hairStyle,
    top: col(p.top, base.top),
    topStyle: p.topStyle ?? base.topStyle ?? 'tee',
    bottom: col(p.bottom, base.bottom),
    shoes: col(p.shoes, base.shoes),
    acc,
    height: clamp(p.height ?? base.height ?? 1, 0.9, 1.1),
    build: clamp(p.build ?? base.build ?? 1, 0.85, 1.2),
  }
  const accColor = p.accColor ?? base.accColor
  if (accColor && HEX.test(accColor)) look.accColor = accColor.toLowerCase()
  return look
}

/** Look for a preset id (unknown ids fall back to the player look). */
export function presetLook(id: string): Look {
  return resolveLook(LOOK_PRESETS[id] ?? DEFAULT_LOOK)
}
