// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildRelationships, neighborhood, type RelationshipToken } from './relationships.js'

const token = (id: string, sourceId: string | null = null): RelationshipToken => ({
  id, name: id, layer: 'base', light: '#FFFFFF', reference: sourceId, sourceId,
})

describe('immediate token relationships', () => {
  it('links aliases, not unrelated literals with the same hex', () => {
    const base = token('base'), alias = token('alias', 'base'), sameHex = token('sameHex')
    const index = buildRelationships([base, alias, sameHex])
    expect(index.byId.get('alias')).toBe(alias)
    expect(index.sourceById.get('alias')).toBe(base)
    expect(index.dependentsById.get('base')).toEqual([alias])
    expect(neighborhood(index, 'base')).toEqual(new Set(['base', 'alias']))
    expect(neighborhood(index, 'sameHex')).toEqual(new Set(['sameHex']))
  })

  it('includes the selected token and its full verified lineage', () => {
    const index = buildRelationships([
      token('base'), token('semantic', 'base'), token('component', 'semantic'),
      token('child', 'component'), token('sibling', 'base'),
    ])
    expect(neighborhood(index, 'semantic')).toEqual(new Set(['semantic', 'base', 'component', 'child']))
    expect(neighborhood(index, 'base')).toEqual(new Set(['base', 'semantic', 'component', 'child', 'sibling']))
    expect(neighborhood(index, 'child')).toEqual(new Set(['child', 'component', 'semantic', 'base']))
  })

  it('does not invent edges for missing targets or unverified references', () => {
    const missing = token('missing', 'absent')
    const unverified = { ...token('unverified'), reference: 'base.light', sourceId: undefined }
    const unavailable = { ...token('unavailable'), reference: 'base.dark', sourceMode: 'dark' }
    const index = buildRelationships([token('base'), missing, unverified, unavailable])
    expect(index.sourceById.size).toBe(0)
    expect(index.dependentsById.get('base')).toEqual([])
    expect(neighborhood(index, 'missing')).toEqual(new Set(['missing']))
    expect(neighborhood(index, 'absent')).toEqual(new Set())
  })

  it('deduplicates self references without traversing cycles', () => {
    const index = buildRelationships([token('self', 'self'), token('a', 'b'), token('b', 'a')])
    expect(neighborhood(index, 'self')).toEqual(new Set(['self']))
    expect(neighborhood(index, 'a')).toEqual(new Set(['a', 'b']))
  })
})

describe('verified source metadata', () => {
  it('keeps immediate identity and source values across transparent aliases', () => {
    const base = token('primitive.white')
    const first = { ...token('semantic.overlay', base.id), light: '#FFFFFF80',
      sourceValue: '#FFFFFF', sourceMode: 'light', alpha: 0.5 }
    const second = { ...token('component.overlay', first.id), light: '#FFFFFF40',
      sourceValue: '#FFFFFF80', sourceMode: 'light', alpha: 0.25 }
    const transparent = { ...token('transparent'), light: '#FFFFFF00', alpha: 0 }
    const index = buildRelationships([base, first, second, transparent])
    expect(index.sourceById.get(second.id)).toBe(first)
    expect(index.byId.get(first.id)).toMatchObject({ sourceValue: '#FFFFFF', alpha: 0.5 })
    expect(index.byId.get(second.id)).toMatchObject({ sourceValue: '#FFFFFF80', alpha: 0.25 })
    expect(index.byId.get(transparent.id)?.alpha).toBe(0)
    expect(neighborhood(index, base.id)).toEqual(new Set([base.id, first.id, second.id]))
  })

  it('preserves an unavailable source value without inventing a visible edge', () => {
    const base = token('primitive.tone')
    const alias = { ...token('semantic.contrast'), reference: 'primitive.tone.dark',
      sourceMode: 'dark', sourceValue: '#000000', light: '#00000080', alpha: 0.5 }
    const index = buildRelationships([base, alias])
    expect(index.sourceById.size).toBe(0)
    expect(index.byId.get(alias.id)).toMatchObject({ sourceValue: '#000000', sourceMode: 'dark' })
    expect(neighborhood(index, alias.id)).toEqual(new Set([alias.id]))
  })
})
