// OWNER: sim-core. Marketing angles (= Game Dev Tycoon genres). Ideal focus lives in data/combos.ts.
import type { AngleId } from '../core/types'

export interface AngleDef {
  id: AngleId
  name: string
  icon: string
  /** one-liner shown on the angle card */
  blurb: string
  /** what this angle rewards (sliders / platforms) — a nudge, not the answer */
  wants: string
  /** example hook line for flavour */
  example: string
  color: string
}

export const ANGLES: Record<AngleId, AngleDef> = {
  pain_point: {
    id: 'pain_point', name: 'Pain Point', icon: '🩹', color: '#ff6b6b',
    blurb: 'Name the problem, twist the knife, sell the fix.',
    wants: 'Sharp copy and solid quality. Search and Fadbook crowds love a fix.',
    example: '"Still picking dog hair off the couch at 11pm?"',
  },
  convenience: {
    id: 'convenience', name: 'Convenience', icon: '⚡', color: '#ffd43b',
    blurb: 'Saves time, saves steps, saves sanity.',
    wants: 'Balanced sourcing, tight targeting at people already busy and annoyed.',
    example: '"Dinner prep in 90 seconds. No, really."',
  },
  gift: {
    id: 'gift', name: 'Gift', icon: '🎁', color: '#f783ac',
    blurb: 'The perfect present for someone impossible to shop for.',
    wants: 'Pretty visuals, a sweet offer, and a price that feels generous.',
    example: '"The gift they\'ll actually use (and brag about)."',
  },
  aesthetic: {
    id: 'aesthetic', name: 'Aesthetic', icon: '✨', color: '#b197fc',
    blurb: 'Vibes first. Looks incredible on camera.',
    wants: 'Gorgeous visuals and hooks. Words matter less than the glow.',
    example: '"POV: your room at 9pm now."',
  },
  social_proof: {
    id: 'social_proof', name: 'Social Proof', icon: '⭐', color: '#fcc419',
    blurb: '12,000 happy customers can\'t be wrong.',
    wants: 'Quality that earns reviews, and creators spreading the word.',
    example: '"Why is everyone at my office buying this?"',
  },
  budget: {
    id: 'budget', name: 'Budget', icon: '💸', color: '#69db7c',
    blurb: 'Why pay mall prices? Cheap, cheerful, instant yes.',
    wants: 'Pricing and offers above all. Pairs with budget price tags.',
    example: '"Same thing as the $60 one. It\'s $19."',
  },
  wholesome: {
    id: 'wholesome', name: 'Wholesome', icon: '🐶', color: '#ffa94d',
    blurb: 'Pets, babies, family. Warm fuzzy feelings convert.',
    wants: 'Honest copy and real visuals. Fadbook families eat it up.',
    example: '"Biscuit has never been this happy."',
  },
  before_after: {
    id: 'before_after', name: 'Before/After', icon: '🔁', color: '#4dabf7',
    blurb: 'Show the transformation. Let the results sell.',
    wants: 'Quality that actually delivers, killer visuals and hooks.',
    example: '"Day 1 vs day 14. We didn\'t edit this."',
  },
  luxury: {
    id: 'luxury', name: 'Luxury', icon: '💎', color: '#e599f7',
    blurb: 'Premium look, premium price, premium buyers.',
    wants: 'Flawless quality and visuals, plus influencer clout. Premium pricing welcome.',
    example: '"Quiet luxury for people who notice."',
  },
}

export const ANGLE_IDS = Object.keys(ANGLES) as AngleId[]
export const START_ANGLES: AngleId[] = ['pain_point', 'convenience', 'gift']
