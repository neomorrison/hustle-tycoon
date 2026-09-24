// Time-of-day keys (dawn 6h, day 12h, dusk 18h, night 22h) and blending. Pure: colours are linear RGB triples.

export type RGB = [number, number, number]

export interface TodParams {
  sunColor: RGB
  sunIntensity: number
  /** sun elevation / azimuth in degrees (azimuth uses the camera yaw convention: 0 = south, 90 = east) */
  sunElev: number
  sunAz: number
  hemiSky: RGB
  hemiGround: RGB
  hemiIntensity: number
  /** m_window_sky colour */
  sky: RGB
  /** m_window_glass tint and opacity */
  glass: RGB
  glassOpacity: number
  /** 0..1: how strongly lampshades glow and l_* point lights shine */
  lamps: number
  exposure: number
}

function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16)
  const f = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]
}

export const TOD_KEYS: Record<'dawn' | 'day' | 'dusk' | 'night', TodParams> = {
  dawn: {
    sunColor: hex('#ffc08f'), sunIntensity: 2.3, sunElev: 32, sunAz: 110,
    hemiSky: hex('#ffe2cf'), hemiGround: hex('#8f7c72'), hemiIntensity: 1.0,
    sky: hex('#f7c9a8'), glass: hex('#f6d8c4'), glassOpacity: 0.3, lamps: 0.35, exposure: 1.0,
  },
  day: {
    sunColor: hex('#fff1dc'), sunIntensity: 3.0, sunElev: 52, sunAz: 72,
    hemiSky: hex('#eef4ff'), hemiGround: hex('#b9a58f'), hemiIntensity: 1.15,
    sky: hex('#bfe3f5'), glass: hex('#bfe3f5'), glassOpacity: 0.35, lamps: 0, exposure: 1.0,
  },
  dusk: {
    sunColor: hex('#ffa36e'), sunIntensity: 2.1, sunElev: 26, sunAz: -60,
    hemiSky: hex('#f3c6b4'), hemiGround: hex('#7d6663'), hemiIntensity: 0.9,
    sky: hex('#f2a97a'), glass: hex('#f4b894'), glassOpacity: 0.32, lamps: 0.7, exposure: 1.0,
  },
  night: {
    sunColor: hex('#8fa6e6'), sunIntensity: 0.5, sunElev: 50, sunAz: -30,
    hemiSky: hex('#4f5d90'), hemiGround: hex('#2e2636'), hemiIntensity: 0.55,
    sky: hex('#1f2a4a'), glass: hex('#2c3a63'), glassOpacity: 0.45, lamps: 1, exposure: 1.05,
  },
}

/** key timeline (hours); holds give full night / full day plateaus */
const TIMELINE: [number, keyof typeof TOD_KEYS][] = [
  [4.5, 'night'], [6, 'dawn'], [9, 'day'], [16, 'day'], [18, 'dusk'], [21.5, 'night'],
]

const smooth = (t: number) => t * t * (3 - 2 * t)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]

export function blendParams(a: TodParams, b: TodParams, t: number): TodParams {
  return {
    sunColor: mixRGB(a.sunColor, b.sunColor, t),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity, t),
    sunElev: mix(a.sunElev, b.sunElev, t),
    sunAz: mix(a.sunAz, b.sunAz, t),
    hemiSky: mixRGB(a.hemiSky, b.hemiSky, t),
    hemiGround: mixRGB(a.hemiGround, b.hemiGround, t),
    hemiIntensity: mix(a.hemiIntensity, b.hemiIntensity, t),
    sky: mixRGB(a.sky, b.sky, t),
    glass: mixRGB(a.glass, b.glass, t),
    glassOpacity: mix(a.glassOpacity, b.glassOpacity, t),
    lamps: mix(a.lamps, b.lamps, t),
    exposure: mix(a.exposure, b.exposure, t),
  }
}

/** Parameters for an hour of the day (0..24, wraps). */
export function timeOfDay(hour: number): TodParams {
  let h = ((hour % 24) + 24) % 24
  if (h < TIMELINE[0][0]) h += 24
  for (let i = 0; i < TIMELINE.length; i++) {
    const [h0, k0] = TIMELINE[i]
    const [h1raw, k1] = TIMELINE[(i + 1) % TIMELINE.length]
    const h1 = i + 1 < TIMELINE.length ? h1raw : h1raw + 24
    if (h >= h0 && h <= h1) {
      const t = h1 > h0 ? smooth((h - h0) / (h1 - h0)) : 0
      return blendParams(TOD_KEYS[k0], TOD_KEYS[k1], t)
    }
  }
  return TOD_KEYS.day
}
