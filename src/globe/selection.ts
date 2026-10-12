import { CARD_WIDTH, CARD_HEIGHT, type GlobeToken } from './model.js'

export const NEUTRAL = [17 / 255, 18 / 255, 19 / 255] as const
export type RGB = readonly [number, number, number]

export function colorSurround(hex: string): { rgb: RGB; transparent: boolean } {
  let value = hex.slice(1)
  if (value.length === 3 || value.length === 4) value = [...value].map(c => c + c).join('')
  const alpha = value.length === 8 ? parseInt(value.slice(6), 16) / 255 : 1
  const rgb = [0, 2, 4].map(i => (parseInt(value.slice(i, i + 2), 16) * alpha + 255 * (1 - alpha)) / 255) as [number, number, number]
  return { rgb, transparent: alpha < 1 }
}

// Invert the exact sphere projection, then test the unrolled rounded card face.
// Screen coordinates are relative to the viewport center, in CSS pixels.
export function pickToken(cards: { token: GlobeToken; x: number; y: number }[], sx: number, sy: number, radius: number, perspective: number, scale: number): GlobeToken | null {
  const a = sx * sx + sy * sy + perspective * perspective
  const b = -2 * perspective * (perspective + radius)
  const c = perspective * perspective + 2 * perspective * radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return null
  const t = (-b - Math.sqrt(discriminant)) / (2 * a)
  const lon = Math.atan2(t * sx, perspective - t * perspective + radius)
  const lat = Math.asin(Math.max(-1, Math.min(1, t * sy / radius)))
  if (Math.abs(lon) > 1.25 || Math.abs(lat) > 1.25) return null
  for (const card of cards) {
    const dx = Math.abs((lon * radius - card.x) / scale)
    const dy = Math.abs((lat * radius - card.y) / scale)
    const hw = CARD_WIDTH / 2, hh = CARD_HEIGHT / 2, rounding = 19
    if (dx > hw || dy > hh) continue
    if (Math.hypot(Math.max(0, dx - hw + rounding), Math.max(0, dy - hh + rounding)) <= rounding) return card.token
  }
  return null
}
