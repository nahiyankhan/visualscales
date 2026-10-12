import { expect, it } from 'vitest'
import { colorSurround, pickToken } from './selection.js'
import { project } from './model.js'

it('preserves opaque values and explicitly composites alpha over white', () => {
  expect(colorSurround('#3366CC')).toEqual({ rgb: [51 / 255, 102 / 255, 204 / 255], transparent: false })
  expect(colorSurround('#0000')).toEqual({ rgb: [1, 1, 1], transparent: true })
  expect(colorSurround('#00000080').rgb[0]).toBeCloseTo(127 / 255)
})
it('picks projected spherical cards, not their rectangular screen bounds', () => {
  const token = { id: 'a', name: 'a', layer: 'base', light: '#ffffff' }
  for (const [x, y, scale] of [[0, 0, 1], [600, -300, 1], [-150, 250, 0.76]]) {
    const cards = [{ token, x, y }]
    const p = project(x, y, 1800)
    const f = 1800 / (1800 - p.z)
    expect(pickToken(cards, p.x * f, p.y * f, 1800, 1800, scale)).toBe(token)
    const corner = project(x + 133 * scale, y + 101 * scale, 1800)
    const cf = 1800 / (1800 - corner.z)
    expect(pickToken(cards, corner.x * cf, corner.y * cf, 1800, 1800, scale)).toBeNull()
  }
  expect(pickToken([], 0, 0, 1800, 1800, 1)).toBeNull()
})
