// OWNER: sim-core. Ad platforms (parody brands). Base rates per DESIGN §2.
import type { PlatformId } from '../core/types'

export interface PlatformDef {
  id: PlatformId
  name: string
  /** short label for chips */
  short: string
  icon: string
  color: string
  blurb: string
  /** who is on it and what works there */
  audience: string
  /** baseline click-through rate (fraction) */
  baseCtr: number
  /** baseline conversion rate (fraction) */
  baseCvr: number
  /** cost per 1,000 impressions ($) */
  cpm: number
  /** creative fatigue added per week (0..1) */
  fatigue: number
}

export const PLATFORMS: Record<PlatformId, PlatformDef> = {
  fadbook: {
    id: 'fadbook', name: 'Fadbook', short: 'Fadbook', icon: '📘', color: '#4c6ef5',
    blurb: 'The OG ad machine. Reliable, grown-up, a little pricey.',
    audience: '25–55, skews women. Loves pain-point fixes, wholesome stories and social proof.',
    baseCtr: 0.011, baseCvr: 0.018, cpm: 14, fatigue: 0.06,
  },
  tiktak: {
    id: 'tiktak', name: 'TikTak', short: 'TikTak', icon: '🎵', color: '#f06595',
    blurb: 'Cheap reach, goldfish attention spans, lottery-ticket virality.',
    audience: '16–34, impulse shoppers. Aesthetic, before/after and budget buys fly.',
    baseCtr: 0.0095, baseCvr: 0.013, cpm: 10.5, fatigue: 0.09,
  },
  reels: {
    id: 'reels', name: 'Instaglam Reels', short: 'Reels', icon: '📸', color: '#cc5de8',
    blurb: 'Pretty people, pretty products, pretty good CPMs.',
    audience: '18–40, style-driven. Aesthetic, luxury and gift angles shine.',
    baseCtr: 0.01, baseCvr: 0.015, cpm: 12, fatigue: 0.08,
  },
  pinterestt: {
    id: 'pinterestt', name: 'Pinterestt', short: 'Pinterestt', icon: '📌', color: '#fa5252',
    blurb: 'Planners and dreamers saving ideas for later. Slow burn, long life.',
    audience: 'Planners: home, beauty, fashion, kitchen, baby — and gift lists.',
    baseCtr: 0.007, baseCvr: 0.016, cpm: 8, fatigue: 0.04,
  },
  poogle: {
    id: 'poogle', name: 'Poogle Shopping', short: 'Poogle', icon: '🔍', color: '#40c057',
    blurb: 'They are already searching for it. Pricey clicks, red-hot intent.',
    audience: 'Search intent. Pain-point and convenience products; weak for pure vibes.',
    baseCtr: 0.022, baseCvr: 0.03, cpm: 30, fatigue: 0.03,
  },
  tiktak_shop: {
    id: 'tiktak_shop', name: 'TikTak Shop', short: 'TT Shop', icon: '🛍️', color: '#ff922b',
    blurb: 'Buy without leaving the app. Impulse heaven, creator-powered.',
    audience: 'In-app checkout. Budget deals, social proof, impulse beauty & gadgets.',
    baseCtr: 0.013, baseCvr: 0.024, cpm: 9, fatigue: 0.1,
  },
}

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[]
