import { expect, it } from 'vitest'
import { nearestTokenOffset, indexLayout, sampleLayout, placementAt, rowOffset } from './navigation.js'
import { buildLayout } from './layout.js'
import { STEP_X, STEP_Y } from './model.js'
import type { RelationshipToken } from './relationships.js'
const fixture = (count: number): RelationshipToken[] => Array.from({ length: count }, (_, i) => ({ id: `t${i}`, name: `t${i}`, light: '#2468AB', layer: 'base', reference: i ? 't0' : null, sourceId: i ? 't0' : null }))
for (const mode of ['color', 'lineage', 'spatial'] as const) {
  it(`${mode}: fills EVERY sampled cell across negative positions, repeats, and prime counts`, () => {
    for (const count of [1, 17, 200, 257, 514]) {
      const layout = buildLayout(fixture(count), { mode, order: 'color', seed: 7 })
      const slots = indexLayout(layout)
      for (const scale of [1, 0.76]) for (const [x, y] of [[0, 0], [-12000, 9000], [99999, -37291]]) {
        const cards = sampleLayout(layout, slots, x, y, scale, 12, 12)
        expect(cards).toHaveLength(144)
        expect(new Set(cards.map(c => `${c.x},${c.y}`)).size).toBe(144)
        expect(cards.every(c => c.token)).toBe(true)
        const repeated = sampleLayout(layout, slots, x + count * STEP_X * scale, y, scale, 12, 12)
        expect(repeated.map(c => c.token.id)).toEqual(cards.map(c => c.token.id))
        const offsets = new Set<number>()
        for (const card of cards) {
          const row = Math.round((card.y - y) / (STEP_Y * scale))
          const col = Math.round((card.x - x - rowOffset(row, scale)) / (STEP_X * scale))
          expect(card.x).toBeCloseTo(col * STEP_X * scale + rowOffset(row, scale) + x)
          offsets.add(Math.round(rowOffset(row, scale) * 1000))
        }
        expect(offsets.size).toBeGreaterThan(2)
      }
    }
  })
  it(`${mode}: every real token remains reachable at center, without padding tokens`, () => {
    const tokens = fixture(514), layout = buildLayout(tokens, { mode, order: 'name', seed: 0 }), slots = indexLayout(layout)
    expect(slots.size).toBe(tokens.length)
    for (const token of tokens) {
      const target = nearestTokenOffset(layout, token.id, -12000, 9000, 0.76)
      const cards = sampleLayout(layout, slots, target.x, target.y, 0.76, 12, 12)
      expect(cards.find(c => Math.abs(c.x) < .001 && Math.abs(c.y) < .001)?.token.id).toBe(token.id)
    }
  })
  it(`${mode}: keeps sorted neighbors continuous across row and collection boundaries`, () => {
    const layout = buildLayout(fixture(257), { mode, order: 'name', seed: 0 })
    for (let i = 0; i < 514; i++) {
      const col = i % layout.width, row = Math.floor(i / layout.width)
      expect(placementAt(layout, col, row)?.token.id).toBe(layout.placements[i % 257].token.id)
    }
    const slots = indexLayout(layout)
    const small = sampleLayout(layout, slots, -40, -50, 1, 6, 6)
    const large = sampleLayout(layout, slots, -40, -50, 1, 12, 12)
    for (const card of small) expect(large).toContainEqual(card)
    // Adjacent rows correspond to one row-width step, not arbitrary family jumps.
    expect(placementAt(layout, 0, 1)).toBe(layout.placements[layout.width])
    expect(nearestTokenOffset(layout, 'not-there', 0, 0, 1)).toEqual({ x: 0, y: 0, distance: 0 })
    expect(STEP_Y).toBeGreaterThan(0)
  })
}
