const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
export const asset = (path: string) => `${BASE}assets/${path}`
export const productImage = (id: string) => asset(`products/${id}.webp`)
export const roomImage = (tier: number | 'mcdoodles' | 'title') => asset(`rooms/${typeof tier === 'number' ? `tier${tier}` : tier}.webp`)
export const portrait = (id: string) => asset(`people/${id}.webp`)
export const founderPortrait = (mood: 'neutral' | 'happy' | 'tired' | 'stressed' = 'neutral') => asset(`player/${mood}.webp`)
export const audioFile = (name: string) => asset(`audio/${name}`)
export const PORTRAITS = Array.from({ length: 18 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
/** Coach Kev's portrait (never used for staff) */
export const COACH_PORTRAIT = 'p12'
