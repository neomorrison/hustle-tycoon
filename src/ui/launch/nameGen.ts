// Fun parody brand-name generator for the New Launch dialog's 🎲 button. OWNER: ui-launch. (UI only: Math.random is fine here.)
import type { NicheId, Product } from '../../core/types'

const PRE: Record<NicheId, string[]> = {
  pet: ['Paw', 'Floof', 'Woof', 'Purr', 'Snoot', 'Wag', 'Bork', 'Whisker'],
  home: ['Nest', 'Cozy', 'Tidy', 'Hygge', 'Glow', 'Homey', 'Nook', 'Sparkl'],
  kitchen: ['Zest', 'Whisk', 'Crumb', 'Snack', 'Sizzle', 'Chef', 'Munch', 'Sear'],
  gadgets: ['Zap', 'Nova', 'Byte', 'Gizmo', 'Pixel', 'Volt', 'Glitch', 'Nano'],
  beauty: ['Glow', 'Dewy', 'Luxe', 'Bloom', 'Velvet', 'Silk', 'Blush', 'Radi'],
  fitness: ['Flex', 'Pulse', 'Grit', 'Rep', 'Swole', 'Sweat', 'Core', 'Beast'],
  wellness: ['Zen', 'Calm', 'Aura', 'Snooze', 'Bliss', 'Lull', 'Soothe', 'Breathe'],
  car: ['Turbo', 'Vroom', 'Drive', 'Pitstop', 'Cruise', 'Rev', 'Torque', 'Road'],
  baby: ['Tiny', 'Coo', 'Snug', 'Bubba', 'Lulla', 'Cuddle', 'Nappy', 'Peek'],
  kids: ['Wiggle', 'Doodle', 'Giggle', 'Zoom', 'Pip', 'Boing', 'Kiddo', 'Jelly'],
  fashion: ['Chic', 'Muse', 'Luxe', 'Drip', 'Edge', 'Vogue', 'Strut', 'Glam'],
  outdoor: ['Trail', 'Ember', 'Camp', 'Sunny', 'Wild', 'Summit', 'Breeze', 'Moss'],
}
const SUF = ['ly', 'ify', 'Pal', 'Pro', 'io', 'Buddy', 'Lab', 'Max', 'Hub', 'zy', 'oo', 'Co', 'Nation', 'Hero']
const TAIL = ['Pro', 'X', 'Go', 'Max', '360', 'Plus', 'Mini', 'Ultra', '3000', 'Deluxe', 'Supreme', 'Lite']
const STOP = /^(the|a|an|for|with|and|of|set|kit|pack|pro|mini|smart|portable|reusable|electric|automatic|\d.*)$/i

/** The product's head noun: "Reusable Pet Hair Remover Roller" → "Roller". */
export function productNoun(p: Product): string {
  const words = p.name.replace(/\(.*?\)/g, ' ').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w && !STOP.test(w))
  const last = words[words.length - 1] ?? 'Thing'
  const noun = last.length <= 3 && words.length > 1 ? `${words[words.length - 2]} ${last}` : last
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}

const rnd = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]
const joinPre = (pre: string, suf: string) => (/^[a-z]/.test(suf) && /[aeiouy]$/i.test(pre) && /^[aeiouy]/.test(suf) ? pre.slice(0, -1) + suf : pre + suf)

/** A fresh random brand name, never equal to `avoid`. */
export function randomBrandName(p: Product, avoid = ''): string {
  const noun = productNoun(p)
  const pre = PRE[p.niche] ?? ['Hustle']
  for (let tries = 0; tries < 8; tries++) {
    const r = Math.random()
    let name: string
    if (r < 0.34) name = `${joinPre(rnd(pre), rnd(SUF))} ${noun}`
    else if (r < 0.52) name = `${rnd(pre)}${noun.replace(/\s+/g, '')}`
    else if (r < 0.68) name = `${noun} ${rnd(TAIL)}`
    else if (r < 0.8) name = `The ${noun.split(' ').pop()!.replace(/(er|e|y)$/i, '')}inator`
    else if (r < 0.92) name = `${joinPre(rnd(pre), rnd(SUF))} ${rnd(TAIL)}`
    else name = `Mr. ${noun}`
    if (name.length <= 36 && name !== avoid) return name
  }
  return `${rnd(pre)} ${noun}`
}
