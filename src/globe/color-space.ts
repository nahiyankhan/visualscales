/** Uncomposited sRGB color, in OKLab / cylindrical OKLCH (D65). */
export type PerceptualColor = {
  /** Canonical RRGGBBAA key: equivalent short/long hex values share a key. */
  rgba: string
  alpha: number
  L: number
  a: number
  b: number
  C: number
  /** Degrees in [0, 360); hue is not meaningful for near-neutral colors. */
  h: number
}

/** Small-chroma colors get their own lane instead of an unstable hue sector. */
export const NEUTRAL_CHROMA = 0.025

/**
 * CSS hex only (#RGB, #RGBA, #RRGGBB, #RRGGBBAA). Invalid values fail explicitly.
 * Decode the sRGB transfer function before the standard OKLab matrices; HSL's
 * lightness is not perceptual. Alpha stays independent, never blended into RGB.
 * `light` is the importer's resolved RGBA value; do not apply token.alpha again.
 */
export function hexToOklch(hex: string): PerceptualColor {
  if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)) {
    throw new Error(`Unsupported sRGB hex color: ${hex}`)
  }
  let rgba = hex.slice(1).toUpperCase()
  if (rgba.length <= 4) rgba = [...rgba].map(char => char + char).join('')
  if (rgba.length === 6) rgba += 'FF'
  const linear = (offset: number) => {
    const value = parseInt(rgba.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const r = linear(0), g = linear(2), blue = linear(4)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * blue)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return {
    rgba, alpha: parseInt(rgba.slice(6), 16) / 255,
    L, a, b, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360,
  }
}
