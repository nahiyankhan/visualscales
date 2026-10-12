// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { sampleData } from '../data/color/globe-data.js'
import { hexToOklch } from './color-space.js'
import { buildLayout, type TokenLayout } from './layout.js'
import type { RelationshipToken } from './relationships.js'

const options = { mode: 'spatial', order: 'color', seed: 0 } as const
const token = (id: string, light = '#2468AB'): RelationshipToken => ({
  id, name: id, layer: 'synthetic', light, reference: null,
})

// These are the same neighbors navigation actually repeats, including the last
// token, incomplete final row, and vertical collection-boundary crossings.
function neighborEnergy(layout: TokenLayout, offset: number) {
  const colors = layout.placements.map(placement => hexToOklch(placement.token.light))
  return colors.reduce((sum, color, index) => {
    const other = colors[(index + offset) % colors.length]
    return sum + (color.L - other.L) ** 2 + (color.a - other.a) ** 2 + (color.b - other.b) ** 2
  }, 0) / colors.length
}

function assertDense(layout: TokenLayout, tokens: readonly RelationshipToken[]) {
  expect(layout.count).toBe(tokens.length)
  expect(layout.placements).toHaveLength(tokens.length)
  expect(new Set(layout.placements.map(placement => placement.token.id))).toEqual(new Set(tokens.map(value => value.id)))
  expect(new Set(layout.placements.map(placement => `${placement.col},${placement.row}`)).size).toBe(tokens.length)
  for (const [index, placement] of layout.placements.entries()) {
    expect(placement.index).toBe(index)
    expect(placement.col).toBe(index % layout.width)
    expect(placement.row).toBe(Math.floor(index / layout.width))
    expect(tokens.includes(placement.token)).toBe(true)
  }
  expect(layout.groups.flatMap(group => group.tokenIds)).toEqual(layout.placements.map(placement => placement.token.id))
}

describe('spatial color map', () => {
  it('reduces horizontal AND vertical color discontinuity across the repeating sample collection', () => {
    const spatial = buildLayout(sampleData.tokens, options)
    const ribbon = buildLayout(sampleData.tokens, { ...options, mode: 'color' })
    assertDense(spatial, sampleData.tokens)
    expect(neighborEnergy(spatial, 1)).toBeLessThan(neighborEnergy(ribbon, 1) * 0.7)
    expect(neighborEnergy(spatial, spatial.width)).toBeLessThan(neighborEnergy(ribbon, ribbon.width) * 0.7)
    const diagonal = (layout: TokenLayout) => (neighborEnergy(layout, layout.width - 1) + neighborEnergy(layout, layout.width + 1)) / 2
    expect(diagonal(spatial)).toBeLessThan(diagonal(ribbon) * 0.7)
  })

  it('is stable on reversed input without mutating tokens, preserving aliases and resolved values', () => {
    const input = Object.freeze(sampleData.tokens.map(value => Object.freeze({ ...value })))
    const first = buildLayout(input, options)
    expect(buildLayout([...input].reverse(), options)).toEqual(first)
    expect(buildLayout(input, { ...options, order: 'name' })).toEqual(first)
    for (const placement of first.placements) {
      expect(placement.token).toBe(input.find(value => value.id === placement.token.id))
    }
  })

  it('only changes identity order, not color geography, when seeding equal-value ties', () => {
    const input = Array.from({ length: 80 }, (_, index) => token(`alias-${index}`, ['#AAA', '#222', '#EEE', '#222222'][index % 4]))
    const canonical = buildLayout(input, options)
    const seeded = buildLayout(input, { ...options, seed: 17 })
    expect(seeded.placements.map(placement => hexToOklch(placement.token.light).rgba)).toEqual(canonical.placements.map(placement => hexToOklch(placement.token.light).rgba))
    expect(seeded.placements.map(placement => placement.token.id)).not.toEqual(canonical.placements.map(placement => placement.token.id))
    expect(buildLayout([...input].reverse(), { ...options, seed: 17 })).toEqual(seeded)
  })

  it('supports empty, singleton, equal-color, prime, neutral and alpha collections without padding', () => {
    expect(buildLayout([], options)).toEqual({ placements: [], groups: [], width: 1, height: 1, count: 0 })
    for (const count of [1, 2, 3, 5, 13, 31, 149, 257, 521]) {
      const input = Array.from({ length: count }, (_, index) => token(`t${index}`, ['#FFF', '#000', '#AAA', '#F008', '#0000', '#0F0', '#00F'][index % 7]))
      const layout = buildLayout(input, options)
      assertDense(layout, input)
      expect(layout.height).toBe(Math.ceil(count / layout.width))
      expect(layout.width * layout.height - count).toBeLessThan(layout.width)
    }
    const equal = Array.from({ length: 150 }, (_, index) => token(`same-${String(index).padStart(3, '0')}`))
    expect(buildLayout([...equal].reverse(), options).placements.map(placement => placement.token.id)).toEqual(equal.map(value => value.id))
  })

  it('rejects duplicate identities, invalid colors and invalid seeds', () => {
    expect(() => buildLayout([token('a'), token('a')], options)).toThrow(/Duplicate/)
    expect(() => buildLayout([token('a', 'red')], options)).toThrow(/hex/)
    for (const seed of [-1, 0.5, NaN, Infinity]) expect(() => buildLayout([], { ...options, seed })).toThrow(/seed/)
  })
})
