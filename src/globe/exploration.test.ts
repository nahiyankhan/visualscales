// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { TokenLayout } from './layout.js'
import type { RelationshipToken } from './relationships.js'
import { focusLayout, searchTokens, selectionLayout, shuffledLayout } from './exploration.js'

const token = (id: string, extra: Partial<RelationshipToken> = {}): RelationshipToken => ({
  id, name: id, layer: 'base', light: '#FFFFFF', reference: null, ...extra,
})
const tokens = (count: number) => Array.from({ length: count }, (_, i) => token(`t${i}`))
const grid = (count = 25, width = 5): TokenLayout => ({
  placements: tokens(count).map((token, index) => ({ token, index, col: index % width, row: Math.floor(index / width), depth: index })),
  count, width, height: Math.max(1, Math.ceil(count / width)), groups: [],
})
const ids = (layout: TokenLayout) => layout.placements.map(p => p.token.id)
const at = (layout: TokenLayout, index: number) => layout.placements[((index % layout.count) + layout.count) % layout.count].token.id
function permutation(base: TokenLayout, result: TokenLayout) {
  expect(result.count).toBe(base.count)
  expect(new Set(ids(result)).size).toBe(base.count)
  expect([...ids(result)].sort()).toEqual([...ids(base)].sort())
  expect(result.placements.map(({ index, col, row }) => ({ index, col, row })))
    .toEqual(base.placements.map(({ index, col, row }) => ({ index, col, row })))
  expect(result.groups.flatMap(g => g.tokenIds).sort()).toEqual([...ids(base)].sort())
  expect(result.groups.every(g => g.label.startsWith('Exploring '))).toBe(true)
  for (const placement of result.placements) {
    expect(placement.depth).toBe(base.placements.find(p => p.token.id === placement.token.id)?.depth)
  }
}

describe('shuffled exploration', () => {
  it('shuffles every token deterministically without mutating inputs', () => {
    const input = tokens(101).map((t, i) => ({ ...t, light: `#${i.toString(16).padStart(6, '0')}` }))
    const before = structuredClone(input)
    const a = shuffledLayout(input)
    expect(a).toEqual(shuffledLayout(input, 1))
    expect(ids(a)).not.toEqual(ids(shuffledLayout(input, 2)))
    expect(ids(a)).not.toEqual(input.map(t => t.id))
    expect(new Set(ids(a)).size).toBe(input.length)
    expect([...ids(a)].sort()).toEqual(input.map(t => t.id).sort())
    expect(a.width).toBe(10)
    expect(a.height).toBe(11)
    expect(a.placements.every(p => p.index === p.row * a.width + p.col)).toBe(true)
    expect(input).toEqual(before)
  })

  it('handles empty/singleton input and rejects ambiguous IDs or invalid seeds', () => {
    expect(shuffledLayout([])).toMatchObject({ placements: [], count: 0, width: 1, height: 1 })
    expect(ids(shuffledLayout([token('only')], 0))).toEqual(['only'])
    expect(() => shuffledLayout([token('same'), token('same')])).toThrow('Duplicate')
    for (const seed of [-1, 1.5, Infinity, NaN]) expect(() => shuffledLayout([], seed)).toThrow('seed')
  })
})

describe('literal search', () => {
  const input = [
    token('substring', { name: 'Infrared', layer: 'semantic' }),
    token('prefix', { name: 'Redwood background', layer: 'semantic' }),
    token('red', { name: 'Alert red', light: '#FF0000' }),
    token('exact-name', { name: 'Red' }),
    token('alias', { name: 'Warning', sourceId: 'red', reference: 'red' }),
    token('regex', { name: 'Surface [red].*' }),
  ]
  it('ranks exact IDs/names/hex above word prefixes above substrings with stable ties', () => {
    const hits = searchTokens(input, 'RED')
    expect(hits.map(hit => hit.token.id)).toEqual(['red', 'exact-name', 'prefix', 'regex', 'substring'])
    expect(hits[0].score).toBeGreaterThan(hits[2].score)
    expect(hits[2].score).toBeGreaterThan(hits[4].score)
    expect(searchTokens(input, '#ff0000').map(hit => hit.token.id)).toEqual(['red'])
    expect(searchTokens(input, 'red')).toEqual(hits)
  })
  it('normalizes whitespace and uses AND terms across only the four literal fields', () => {
    expect(searchTokens(input, ' \tRED  \n Semantic ').map(hit => hit.token.id)).toEqual(['prefix', 'substring'])
    expect(searchTokens(input, 'red base #ff0000').map(hit => hit.token.id)).toEqual(['red'])
    expect(searchTokens(input, 'red missing')).toEqual([])
    expect(searchTokens(input, 'danger')).toEqual([])
    expect(searchTokens(input, 'red').some(hit => hit.token.id === 'alias')).toBe(false)
    expect(searchTokens(input, '.*').map(hit => hit.token.id)).toEqual(['regex'])
    expect(searchTokens(input, '[red]').map(hit => hit.token.id)).toEqual(['regex'])
    expect(searchTokens(input, '\n \t')).toEqual([])
  })
})

describe('focused layouts', () => {
  it('uses local swaps, preserves all slots/depth and keeps a selected token pinned', () => {
    const base = grid(), before = structuredClone(base)
    const focused = focusLayout(base, ['t24', 't23', 't22', 't22', 'missing'], 12, 't0')
    expect(at(focused, 12)).toBe('t0')
    for (const id of ['t24', 't23', 't22']) {
      expect([7, 11, 13, 17]).toContain(focused.placements.find(p => p.token.id === id)!.index)
    }
    expect(at(focused, 4)).toBe('t4')
    expect(focused.placements.filter((p, i) => p.token !== base.placements[i].token).length).toBeLessThanOrEqual(8)
    permutation(base, focused)
    expect(base).toEqual(before)
    expect(focusLayout(focused, ['t24', 't23', 't22'], 12, 't0')).toEqual(focused)
  })


  it('retains continuing matches on equally near slots and has deterministic original-order ties', () => {
    const base = grid()
    const first = focusLayout(base, ['t12', 't17', 't24'], 12)
    expect(at(first, 17)).toBe('t17')
    expect(at(first, 7)).toBe('t24')
    const next = focusLayout(first, ['t12', 't17', 't24', 't23'], 12)
    expect(at(next, 17)).toBe('t17')
    expect(at(next, 7)).toBe('t24')
    expect(at(next, 11)).toBe('t23')
    expect(next).toEqual(focusLayout(first, ['t12', 't17', 't24', 't23'], 12))
    permutation(base, next)
  })

  it('does not let a new equal-distance match displace a continuing match', () => {
    const base = grid()
    const first = focusLayout(base, ['t12', 't7'], 12)
    const next = focusLayout(first, ['t12', 't24', 't7'], 12)
    expect(at(next, 7)).toBe('t7')
    expect(at(next, 11)).toBe('t24')
    expect(focusLayout(next, ['t12', 't24', 't7'], 12)).toEqual(next)
    permutation(base, next)
  })

  it('ignores missing priorities, handles dense ribbon anchor wrapping and full focus', () => {
    const base = grid(23)
    expect(focusLayout(base, ['missing'], 0)).toBe(base)
    expect(focusLayout(grid(0), ['missing'], 0).count).toBe(0)
    expect(at(focusLayout(base, ['t10'], -1), 22)).toBe('t10')
    const result = focusLayout(base, ids(base).reverse(), 46, 't7')
    expect(at(result, 0)).toBe('t7')
    permutation(base, result)
    expect(focusLayout(result, ids(base).reverse(), 46, 't7')).toEqual(result)
  })
})

describe('selection neighborhoods', () => {
  it('puts direct source then ancestors left, selected at anchor, branches right then down', () => {
    const base = grid(), before = structuredClone(base)
    const result = selectionLayout(base, 't24', ['t23', 't22'], ['t0', 't1', 't2', 't3', 't4'], 12)
    expect(at(result, 12)).toBe('t24')
    expect(at(result, 11)).toBe('t23')
    expect(at(result, 10)).toBe('t22')
    expect([13, 14, 18, 19, 23].map(index => at(result, index))).toEqual(['t0', 't1', 't2', 't3', 't4'])
    expect(at(result, 6)).toBe('t6')
    permutation(base, result)
    expect(base).toEqual(before)
    expect(selectionLayout(result, 't24', ['t23', 't22'], ['t0', 't1', 't2', 't3', 't4'], 12)).toEqual(result)
  })

  it('never collides even for duplicate/cyclic requests, boundary anchors, and overflowing branches', () => {
    for (const count of [1, 2, 5, 23, 25]) {
      const base = grid(count, Math.min(5, count))
      for (const anchor of [-1, 0, count - 1, count * 2]) {
        const sources = count > 1 ? ['t1', 't1', 't0', 'absent'] : ['t0']
        const result = selectionLayout(base, 't0', sources, [...ids(base).reverse(), 'absent'], anchor)
        expect(at(result, anchor)).toBe('t0')
        if (count > 1) expect(at(result, anchor - 1)).toBe('t1')
        permutation(base, result)
        expect(selectionLayout(result, 't0', sources, ids(base).reverse(), anchor)).toEqual(result)
      }
    }
  })


  it('handles absent selections and empty collections without changing them', () => {
    const base = grid(), empty = grid(0)
    expect(selectionLayout(base, 'absent', [], [], 0)).toBe(base)
    expect(selectionLayout(empty, 'absent', [], [], 0)).toBe(empty)
  })
})
