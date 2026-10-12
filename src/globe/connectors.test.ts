import { describe, expect, it } from 'vitest'
import { CARD_WIDTH } from './model.js'
import { buildConnectorGeometry, relationshipDescriptions } from './connectors.js'
import { buildRelationships, type RelationshipToken } from './relationships.js'

const token = (id: string, sourceId: string | null = null, alpha: number | null = null): RelationshipToken => ({
  id, name: id, layer: 'base', light: '#FFFFFF', reference: sourceId, sourceId, alpha,
})

describe('selected relationship connectors', () => {
  it('uses actual directed source-to-dependent edges without ancestor shortcuts', () => {
    const tokens = [token('root'), token('parent', 'root'), token('selected', 'parent'), token('child', 'selected', 0.4), token('grandchild', 'child'), token('unrelated')]
    const index = buildRelationships(tokens)
    const cards = [
      { token: tokens[0], x: -576, y: 0 },
      { token: tokens[1], x: -288, y: 0 },
      { token: tokens[2], x: 0, y: 0 },
      { token: tokens[3], x: 288, y: 0 },
      { token: tokens[4], x: 576, y: 0 },
      { token: tokens[5], x: 0, y: 224 },
    ]
    const connectors = buildConnectorGeometry(cards, index, 'selected', { scale: 1, radius: 2600, perspective: 1800, width: 1440, height: 1000 })
    expect(connectors.map(edge => edge.id)).toEqual(['parent->selected', 'root->parent', 'selected->child', 'child->grandchild'])
    expect(connectors.some(edge => edge.id === 'root->selected')).toBe(false)
    expect(connectors.every(edge => edge.intersections === 0)).toBe(true)
    expect(connectors[0].points[0].x).toBeCloseTo(-288 + CARD_WIDTH / 2)
    expect(connectors[0].points.at(-1)!.x).toBeCloseTo(-CARD_WIDTH / 2)
  })

  it('routes through dense card gaps and reports accessible alpha descriptions', () => {
    const tokens = [token('selected'), token('child', 'selected', 0.4), token('blocker'), token('other')]
    const index = buildRelationships(tokens)
    const cards = [
      { token: tokens[0], x: 0, y: 0 },
      { token: tokens[1], x: 576, y: 224 },
      { token: tokens[2], x: 288, y: 0 },
      { token: tokens[3], x: 288, y: 224 },
    ]
    const [edge] = buildConnectorGeometry(cards, index, 'selected', { scale: 1, radius: 2600, perspective: 1800, width: 1440, height: 1000 })
    expect(edge.id).toBe('selected->child')
    expect(edge.points.length).toBeGreaterThan(2)
    expect(edge.intersections).toBe(0)
    expect(relationshipDescriptions(index, 'selected')).toEqual(['selected points to child, 40% alpha modifier.'])
  })
})

it('keeps broad neighborhoods connected through occupied grid gutters at desktop and mobile scales', () => {
  const selected = token('selected')
  const children = Array.from({ length: 12 }, (_, i) => token(`child-${i}`, selected.id))
  const index = buildRelationships([selected, ...children])
  for (const scale of [1, .76]) {
    const cards = []
    for (let row = -1; row < 5; row++) for (let col = -1; col < 5; col++) {
      const child = row >= 0 && col >= 1 && col <= 3 ? children[row * 3 + col - 1] : undefined
      cards.push({ token: row === 0 && col === 0 ? selected : child ?? token(`other-${row}-${col}`), x: col * 288 * scale, y: row * 224 * scale })
    }
    const edges = buildConnectorGeometry(cards, index, selected.id, { scale, radius: 3744, perspective: 1800, width: 1440, height: 1000 })
    expect(edges).toHaveLength(children.length)
    expect(edges.every(edge => edge.intersections === 0)).toBe(true)
    expect(new Set(edges.map(edge => edge.id)).size).toBe(children.length)
    expect(edges.some(edge => edge.screenPoints.length > edge.points.length)).toBe(true)
  }
})
