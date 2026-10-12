// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { sampleData } from '../data/color/globe-data.js'
import { buildRelationships, type RelationshipToken } from './relationships.js'
import { layoutRelationshipNetwork } from './relationship-network.js'

const token = (id: string, sourceId: string | null = null, light = '#4F46E5'): RelationshipToken => ({
  id,
  name: id,
  layer: id.split('.')[0] || 'synthetic',
  light,
  reference: sourceId,
  sourceId,
  sourceMode: sourceId ? 'light' : null,
  sourceValue: sourceId ? light : null,
  alpha: null,
})

function assertNoOverlap(layout: ReturnType<typeof layoutRelationshipNetwork>) {
  for (let i = 0; i < layout.nodes.length; i++) {
    const a = layout.nodes[i]
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const b = layout.nodes[j]
      const separated = a.x + layout.card.width <= b.x || b.x + layout.card.width <= a.x || a.y + layout.card.height <= b.y || b.y + layout.card.height <= a.y
      expect(separated, `${a.id} overlaps ${b.id}`).toBe(true)
    }
  }
}

function coordinates(layout: ReturnType<typeof layoutRelationshipNetwork>) {
  return layout.nodes.map(node => [node.id, node.x, node.y, node.depth, node.row])
}

function renderedEdges(layout: ReturnType<typeof layoutRelationshipNetwork>) {
  return layout.edges.map(edge => `${edge.source}→${edge.target}`).sort()
}

function orderedEdges(layout: ReturnType<typeof layoutRelationshipNetwork>) {
  return layout.edges.map(edge => `${edge.source}→${edge.target}`)
}

describe('layoutRelationshipNetwork', () => {
  it('renders the complete sample collection and every verified link for any selection', () => {
    const index = buildRelationships(sampleData.tokens)
    const verifiedLinkCount = [...index.sourceById.values()].length
    expect(sampleData.tokens).toHaveLength(218)
    expect(verifiedLinkCount).toBe(130)

    const empty = layoutRelationshipNetwork(index, '')
    const selected = layoutRelationshipNetwork(index, 'palette.indigo.600')
    const invalid = layoutRelationshipNetwork(index, 'missing.token')

    for (const layout of [empty, selected, invalid]) {
      expect(layout.nodes).toHaveLength(218)
      expect(layout.edges).toHaveLength(130)
      expect(layout.nodes.map(node => node.id).sort()).toEqual([...index.byId.keys()].sort())
      expect(layout.edges.every(edge => index.byId.has(edge.source) && index.byId.has(edge.target))).toBe(true)
      expect(layout.columns.map(column => column.label)).not.toContain('Selected')
      assertNoOverlap(layout)
    }

    expect(coordinates(selected)).toEqual(coordinates(empty))
    expect(coordinates(invalid)).toEqual(coordinates(empty))
    expect(renderedEdges(selected)).toEqual(renderedEdges(empty))
    expect(renderedEdges(invalid)).toEqual(renderedEdges(empty))
    expect(empty.pathIds.size).toBe(0)
    expect(invalid.pathIds.size).toBe(0)
    expect(selected.nodes.find(node => node.id === 'palette.indigo.600')!.selected).toBe(true)
  })

  it('uses actual explicit edges for the indigo relationship family within the full collection', () => {
    const index = buildRelationships(sampleData.tokens)
    const layout = layoutRelationshipNetwork(index, 'palette.indigo.600')
    const edges = new Set(renderedEdges(layout))
    expect(edges.has('palette.indigo.600→semantic.focus.ring')).toBe(true)
    expect(edges.has('semantic.focus.ring→component.switch.focus')).toBe(true)
    expect(edges.has('palette.indigo.600→semantic.action.primary.background')).toBe(true)
    expect(layout.nodes.map(node => node.id)).toContain('component.switch.focus')
    expect(layout.nodes.map(node => node.id)).toContain('semantic.action.primary.background')
    expect(layout.nodes.find(node => node.id === 'palette.indigo.600')!.x).toBeLessThan(layout.nodes.find(node => node.id === 'semantic.focus.ring')!.x)
    expect(layout.nodes.find(node => node.id === 'semantic.focus.ring')!.x).toBeLessThan(layout.nodes.find(node => node.id === 'component.switch.focus')!.x)
    expect(layout.nodes.find(node => node.id === 'palette.indigo.600')!.x).toBeLessThan(layout.nodes.find(node => node.id === 'semantic.action.primary.background')!.x)
    assertNoOverlap(layout)
  })

  it('preserves branching with deterministic stable coordinates independent of selected id', () => {
    const tokens = [
      token('primitive.indigo.600'),
      token('semantic.action.primary.background', 'primitive.indigo.600'),
      token('semantic.focus.ring', 'primitive.indigo.600'),
      token('component.switch.focus', 'semantic.focus.ring'),
      token('component.button.background', 'semantic.action.primary.background'),
      token('component.link.focus', 'semantic.focus.ring'),
    ]
    const index = buildRelationships(tokens)
    const first = layoutRelationshipNetwork(index, 'primitive.indigo.600')
    const second = layoutRelationshipNetwork(index, 'component.switch.focus')
    const empty = layoutRelationshipNetwork(index, '')
    expect(coordinates(first)).toEqual(coordinates(second))
    expect(coordinates(first)).toEqual(coordinates(empty))
    expect(first.nodes.find(node => node.id === 'semantic.action.primary.background')!.x).toBe(first.nodes.find(node => node.id === 'semantic.focus.ring')!.x)
    expect(first.nodes.find(node => node.id === 'component.button.background')!.x).toBeGreaterThan(first.nodes.find(node => node.id === 'semantic.action.primary.background')!.x)
    expect(first.nodes.find(node => node.id === 'component.switch.focus')!.y).not.toBe(first.nodes.find(node => node.id === 'component.link.focus')!.y)
    assertNoOverlap(first)
  })

  it('orders sample palette indigo shades by numeric step', () => {
    const layout = layoutRelationshipNetwork(buildRelationships(sampleData.tokens), '')
    const indigoIds = layout.nodes.map(node => node.id).filter(id => id.startsWith('palette.indigo.'))
    expect(indigoIds).toEqual([
      'palette.indigo.50',
      'palette.indigo.100',
      'palette.indigo.200',
      'palette.indigo.300',
      'palette.indigo.400',
      'palette.indigo.500',
      'palette.indigo.600',
      'palette.indigo.700',
      'palette.indigo.800',
      'palette.indigo.900',
      'palette.indigo.950',
    ])
  })

  it('uses natural numeric ordering for siblings and isolated ids with stable shuffled-input coordinates', () => {
    const tokens = [
      token('family.1'),
      token('family.2'),
      token('family.10'),
      token('parent.1'),
      token('child.10', 'parent.1'),
      token('child.2', 'parent.1'),
      token('child.alpha', 'parent.1'),
      token('child.beta', 'parent.1'),
    ]
    const shuffled = [tokens[6], tokens[2], tokens[4], tokens[0], tokens[7], tokens[3], tokens[1], tokens[5]]
    const first = layoutRelationshipNetwork(buildRelationships(tokens), '')
    const second = layoutRelationshipNetwork(buildRelationships(shuffled), '')

    expect(coordinates(second)).toEqual(coordinates(first))
    expect(first.nodes.filter(node => node.depth === 0).map(node => node.id)).toEqual(['family.1', 'family.2', 'family.10', 'parent.1'])
    expect(first.nodes.filter(node => node.depth === 1).map(node => node.id)).toEqual(['child.2', 'child.10', 'child.alpha', 'child.beta'])
    expect(orderedEdges(first)).toEqual(['parent.1→child.2', 'parent.1→child.10', 'parent.1→child.alpha', 'parent.1→child.beta'])
    assertNoOverlap(first)
  })

  it('renders isolated independent equal values without inventing relationships', () => {
    const tokens = [token('a', null, '#111111'), token('b', null, '#111111'), token('c', null, '#111111')]
    const layout = layoutRelationshipNetwork(buildRelationships(tokens), '')
    expect(layout.nodes.map(node => node.id)).toEqual(['a', 'b', 'c'])
    expect(layout.edges).toEqual([])
    expect(new Set(layout.nodes.map(node => node.y)).size).toBe(3)
    expect(new Set(layout.nodes.map(node => node.x))).toEqual(new Set([0]))
    assertNoOverlap(layout)
  })

  it('ignores external references but still renders the referencing token', () => {
    const tokens = [token('a'), token('external.consumer', 'missing.source')]
    const layout = layoutRelationshipNetwork(buildRelationships(tokens), 'external.consumer')
    expect(layout.nodes.map(node => node.id).sort()).toEqual(['a', 'external.consumer'])
    expect(layout.edges).toEqual([])
    expect(layout.nodes.find(node => node.id === 'external.consumer')!.selected).toBe(true)
    assertNoOverlap(layout)
  })

  it('retains all verified cycle edges while using a cycle-broken forest for positions', () => {
    const tokens = [token('a', 'c'), token('b', 'a'), token('c', 'b'), token('d')]
    const index = buildRelationships(tokens)
    const first = layoutRelationshipNetwork(index, 'a')
    const second = layoutRelationshipNetwork(index, '')
    expect(first.nodes.map(node => node.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(renderedEdges(first)).toEqual(['a→b', 'b→c', 'c→a'])
    expect(coordinates(first)).toEqual(coordinates(second))
    expect(renderedEdges(first)).toEqual(renderedEdges(second))
    assertNoOverlap(first)
  })
})
