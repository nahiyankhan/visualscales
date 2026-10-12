import { describe, expect, it } from 'vitest'
import { createGlobeData, sampleData } from './globe-data.js'
import { palette } from './generator.js'
import { semantics } from './semantics.js'
import { components } from './components.js'
import { buildRelationships } from '../../globe/relationships.js'
import { buildLayout } from '../../globe/layout.js'
import { shuffledLayout, selectionLayout } from '../../globe/exploration.js'
import { gridMetrics } from '../../globe/model.js'
import { indexLayout, nearestTokenOffset, sampleLayout } from '../../globe/navigation.js'
import { buildConnectorGeometry } from '../../globe/connectors.js'

describe('fictional globe collection', () => {
  it('contains every independent token and only the intended metadata', () => {
    expect(createGlobeData()).toEqual(sampleData)
    const primitives = palette.families.flatMap(family => family.swatches)
    expect(sampleData.tokens).toHaveLength(primitives.length + semantics.tokens.length + components.tokens.length)
    expect(sampleData.meta).toMatchObject({ name: 'Sample', count: 218, homeId: 'palette.indigo.600', fictional: true })
    expect(new Set(sampleData.tokens.map(token => token.id)).size).toBe(218)
    expect(sampleData.tokens.filter(token => token.layer === 'primitive')).toHaveLength(88)
    expect(sampleData.tokens.filter(token => token.layer === 'semantic')).toHaveLength(44)
    expect(sampleData.tokens.filter(token => token.layer === 'component')).toHaveLength(86)
    expect(sampleData.tokens.every(token => /^#[0-9A-F]{6}$/.test(token.light) && token.alpha === null)).toBe(true)
    expect(sampleData.tokens.every(token => /^(palette|semantic|component)\./.test(token.id))).toBe(true)
  })

  it('keeps every direct alias, transitive chain, and independent identical value', () => {
    const index = buildRelationships(sampleData.tokens)
    expect(index.sourceById.size).toBe(130)
    for (const token of [...semantics.tokens, ...components.tokens]) {
      expect(index.sourceById.get(token.id)?.id).toBe(token.reference)
      const entry = index.byId.get(token.id)!
      expect(entry.sourceValue).toBe(index.byId.get(token.reference)!.light)
      expect(entry.light).toBe(token.hex)
    }
    const chain = []
    let token = index.byId.get('component.button.primary.foreground')!
    while (token) { chain.push(token.id); token = index.sourceById.get(token.id)! }
    expect(chain).toEqual(['component.button.primary.foreground', 'semantic.action.primary.foreground', 'semantic.text.inverse', 'palette.gray.50'])
    expect(index.byId.get('semantic.surface.inverse')!.light).toBe(index.byId.get('semantic.text.default')!.light)
    expect(index.sourceById.get('semantic.surface.inverse')!.id).toBe('palette.gray.900')
  })

  it('retains every token in all arrangements and reproduces real selected edges', () => {
    const index = buildRelationships(sampleData.tokens)
    const layouts = [shuffledLayout(sampleData.tokens, 42), ...(['color', 'lineage'] as const).map(mode => buildLayout(sampleData.tokens, { mode, order: 'color', seed: 0 }))]
    const metrics = gridMetrics(1440, 1000)
    for (const layout of layouts) {
      expect(new Set(layout.placements.map(p => p.token.id)).size).toBe(218)
      const selected = 'semantic.action.primary.background'
      const ancestors = ['palette.indigo.600']
      const children = index.dependentsById.get(selected)!.map(token => token.id)
      const focused = selectionLayout(layout, selected, ancestors, children, 0)
      const offset = nearestTokenOffset(focused, selected, 0, 0, metrics.scale)
      const cards = sampleLayout(focused, indexLayout(focused), offset.x, offset.y, metrics.scale, metrics.columns, metrics.rows)
      expect(cards.length).toBe(metrics.columns * metrics.rows)
      const edges = buildConnectorGeometry(cards, index, selected, { ...metrics, width: 1440, height: 1000 })
      expect(edges.some(edge => edge.from === 'palette.indigo.600' && edge.to === selected)).toBe(true)
      expect(edges.every(edge => index.sourceById.get(edge.to)?.id === edge.from && edge.intersections === 0)).toBe(true)
    }
  })
})
