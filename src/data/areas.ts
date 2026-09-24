// OWNER: sim-core. Focus areas (GDT sliders), dev stages and point types. DESIGN §2–3.
import type { AreaId, Points, StatId } from '../core/types'

export type PointKey = keyof Points

export interface PointDef { id: PointKey; name: string; icon: string; color: string; blurb: string }
export const POINT_TYPES: Record<PointKey, PointDef> = {
  conv: { id: 'conv', name: 'Conversion', icon: '🔵', color: '#4dabf7', blurb: 'Page, copy, trust. Drives CVR.' },
  traffic: { id: 'traffic', name: 'Traffic', icon: '🟠', color: '#ff922b', blurb: 'Hooks, creatives, targeting. Drives CTR.' },
  aov: { id: 'aov', name: 'Basket', icon: '💜', color: '#da77f2', blurb: 'Pricing, bundles, offers. Drives AOV.' },
  research: { id: 'research', name: 'Research', icon: '🟣', color: '#9775fa', blurb: 'Research points (RP) for the company.' },
  bugs: { id: 'bugs', name: 'Complaints', icon: '🔴', color: '#ff6b6b', blurb: 'Defects & complaints. Hurt CVR and brand.' },
}

/** What 1 effective point of focus in an area turns into. `fix` removes 🔴, `fans` adds pre-launch fans. */
export interface AreaYield { conv?: number; traffic?: number; aov?: number; research?: number; fix?: number; fans?: number }

export interface AreaDef {
  id: AreaId
  name: string
  icon: string
  stage: 0 | 1 | 2
  /** staff stat that powers this area */
  stat: Exclude<StatId, 'speed'>
  yield: AreaYield
  /** short slider hint */
  hint: string
}

export const AREAS: Record<AreaId, AreaDef> = {
  research: { id: 'research', name: 'Research', icon: '🔎', stage: 0, stat: 'research', yield: { research: 0.6, conv: 0.5 }, hint: 'Stalk competitors & reviews. Earns 🟣 RP and some 🔵.' },
  quality: { id: 'quality', name: 'Quality', icon: '🧪', stage: 0, stat: 'copy', yield: { fix: 0.6, conv: 0.6 }, hint: 'Order samples, grill suppliers. Prevents 🔴, adds 🔵.' },
  pricing: { id: 'pricing', name: 'Pricing', icon: '🏷️', stage: 0, stat: 'copy', yield: { aov: 0.8, conv: 0.3 }, hint: 'Anchors, tiers, bundles. Grows 💜 basket size.' },
  copy: { id: 'copy', name: 'Copy', icon: '✍️', stage: 1, stat: 'copy', yield: { conv: 1.1 }, hint: 'Headlines, bullets, FAQ. Pure 🔵 conversion.' },
  visuals: { id: 'visuals', name: 'Visuals', icon: '📸', stage: 1, stat: 'creative', yield: { conv: 0.6, traffic: 0.6 }, hint: 'Photos, GIFs, lifestyle shots. 🔵 plus 🟠.' },
  offer: { id: 'offer', name: 'Offer', icon: '🎁', stage: 1, stat: 'copy', yield: { aov: 0.7, conv: 0.5 }, hint: 'Bundles, freebies, guarantees. 💜 and 🔵.' },
  hooks: { id: 'hooks', name: 'Hooks', icon: '🎬', stage: 2, stat: 'creative', yield: { traffic: 1.1 }, hint: 'Scroll-stopping first 3 seconds. Big 🟠.' },
  targeting: { id: 'targeting', name: 'Targeting', icon: '🎯', stage: 2, stat: 'research', yield: { traffic: 0.8, research: 0.35 }, hint: 'Audiences, lookalikes, tests. 🟠 plus 🟣 RP.' },
  influencers: { id: 'influencers', name: 'Influencers', icon: '🤳', stage: 2, stat: 'creative', yield: { traffic: 0.9, fans: 3 }, hint: 'Seed creators, collect UGC. 🟠 plus launch-day fans.' },
}
export const AREA_IDS = Object.keys(AREAS) as AreaId[]

export interface StageDef { index: 0 | 1 | 2; name: string; icon: string; blurb: string; areas: [AreaId, AreaId, AreaId]; share: number }
export const STAGES: [StageDef, StageDef, StageDef] = [
  { index: 0, name: 'Sourcing', icon: '📦', share: 0.3, areas: ['research', 'quality', 'pricing'], blurb: 'Find the supplier, test samples, set the price.' },
  { index: 1, name: 'Store', icon: '🛒', share: 0.35, areas: ['copy', 'visuals', 'offer'], blurb: 'Build the product page that turns clicks into orders.' },
  { index: 2, name: 'Marketing', icon: '📣', share: 0.35, areas: ['hooks', 'targeting', 'influencers'], blurb: 'Make the ads, pick the audiences, seed the creators.' },
]
export const stageName = (i: number) => STAGES[Math.max(0, Math.min(2, i))].name
export const stageAreas = (i: number): [AreaId, AreaId, AreaId] => STAGES[Math.max(0, Math.min(2, i))].areas
