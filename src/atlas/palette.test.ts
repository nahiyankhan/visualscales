import { describe, expect, it } from 'vitest'
import { atlasPalette } from './palette.js'
import { palette } from '../data/color/generator.js'
import { sampleData } from '../data/color/globe-data.js'
import { floorFragment, sphereFragment } from './shaders.js'

describe('Atlas artwork palette', () => {
  it('samples exact generated swatches present in the default globe', () => {
    const swatches = palette.families.flatMap((family) => family.swatches)
    expect(atlasPalette).toHaveLength(7)
    expect(new Set(atlasPalette.map((color) => color.hex)).size).toBe(7)
    for (const color of atlasPalette) {
      expect(swatches.find((swatch) => swatch.id === color.id)?.hex).toBe(
        color.hex
      )
      expect(
        sampleData.tokens.find((token) => token.id === color.id)?.light
      ).toBe(color.hex)
    }
    expect(atlasPalette.map((color) => color.id)).toEqual([
      'palette.red.400',
      'palette.amber.400',
      'palette.green.400',
      'palette.cyan.400',
      'palette.indigo.500',
      'palette.violet.400',
      'palette.rose.400',
    ])
  })

  it('uses the same sourced palette uniform for the sphere and emitted colors', () => {
    for (const shader of [sphereFragment, floorFragment]) {
      expect(shader).toContain(`uniform vec3 uPalette[${atlasPalette.length}]`)
      expect(shader).toContain('linearToLab(uPalette[index])')
    }
  })
})
