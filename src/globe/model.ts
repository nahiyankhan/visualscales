export type GlobeToken = { id: string; name: string; layer: string; light: string; reference?: string | null; alpha?: number | null; labelLevel?: 'chapter' | 'group' }
export const CARD_WIDTH = 268
export const CARD_HEIGHT = 204
export const STEP_X = CARD_WIDTH + 8
export const STEP_Y = CARD_HEIGHT + 8
export const mod = (value: number, size: number) => ((value % size) + size) % size
export const wrap = (value: number, size: number) => mod(value + size / 2, size) - size / 2

export function gridMetrics(width: number, height: number) {
  const scale = width < 600 ? 0.76 : 1
  const radius = Math.max(2600, width * 2.6, height * 3)
  const columns = Math.ceil(width * 1.65 / (STEP_X * scale)) + 4
  // Symmetric overscan bounds sampling cost independently of sheet size.
  const rows = Math.ceil((height * 1.65 / (STEP_Y * scale) + 4) / 2) * 2
  return { scale, radius, columns, rows, perspective: 1800 }
}

// Distances along a sphere, not a visible ball. Front center lies at z=0.
export function project(x: number, y: number, radius: number) {
  const longitude = x / radius
  const latitude = y / radius
  return {
    x: radius * Math.sin(longitude) * Math.cos(latitude),
    y: radius * Math.sin(latitude),
    z: radius * (Math.cos(longitude) * Math.cos(latitude) - 1),
    longitude,
    latitude,
  }
}

export function inkFor(hex: string) {
  let c = hex.replace('#', '')
  if (c.length === 3 || c.length === 4) c = [...c].map(x => x + x).join('')
  const alpha = c.length === 8 ? parseInt(c.slice(6), 16) / 255 : 1
  const values = [0, 2, 4].map(i => {
    const v = (parseInt(c.slice(i, i + 2), 16) * alpha + 238 * (1 - alpha)) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 > 0.179 ? '#111213' : '#ffffff'
}
