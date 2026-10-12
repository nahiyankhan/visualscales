// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hexToOklch, NEUTRAL_CHROMA } from './color-space.js'
import { buildLayout, type LayoutOptions, type TokenLayout } from './layout.js'
import type { RelationshipToken } from './relationships.js'

const token = (id: string, light = '#2468AB', sourceId: string | null = null): RelationshipToken => ({
  id, name: id, light, sourceId, reference: sourceId, layer: 'synthetic',
})
const options = (mode: LayoutOptions['mode'], seed = 0, order: LayoutOptions['order'] = 'color'): LayoutOptions => ({ mode, seed, order })
function check(layout: TokenLayout, tokens: readonly RelationshipToken[]) {
  expect(layout.count).toBe(tokens.length)
  expect(layout.placements).toHaveLength(tokens.length)
  expect(new Set(layout.placements.map(p => p.token.id))).toEqual(new Set(tokens.map(t => t.id)))
  expect(new Set(layout.placements.map(p => `${p.col},${p.row}`)).size).toBe(tokens.length)
  expect(Number.isInteger(layout.width) && Number.isInteger(layout.height)).toBe(true)
  expect(layout.width).toBeGreaterThanOrEqual(Math.min(4, tokens.length) || 1)
  expect(layout.width).toBeLessThanOrEqual(Math.min(32, tokens.length) || 1)
  expect(layout.height).toBe(Math.ceil(tokens.length / layout.width) || 1)
  layout.placements.forEach((p, index) => {
    expect(p.index).toBe(index)
    expect(p.col).toBe(index % layout.width)
    expect(p.row).toBe(Math.floor(index / layout.width))
    expect(tokens.includes(p.token)).toBe(true)
    expect(layout.groups.filter(g => g.tokenIds.includes(p.token.id))).toHaveLength(1)
  })
  let start = 0
  for (const group of layout.groups) {
    expect(group.start).toBe(start)
    expect(group.count).toBeGreaterThan(0)
    const members = layout.placements.slice(group.start, group.start + group.count)
    expect(group.tokenIds).toEqual(members.map(p => p.token.id))
    const cols = members.map(p => p.col), rows = members.map(p => p.row)
    expect(group.col).toBe(Math.min(...cols))
    expect(group.row).toBe(Math.min(...rows))
    expect(group.width).toBe(Math.max(...cols) - group.col + 1)
    expect(group.height).toBe(Math.max(...rows) - group.row + 1)
    start += group.count
  }
  expect(start).toBe(tokens.length)
}

function checkForest(layout: TokenLayout, tokens: readonly RelationshipToken[]) {
  check(layout, tokens)
  const positions = new Map(layout.placements.map(p => [p.token.id, p]))
  const children = new Map(tokens.map(t => [t.id, tokens.filter(child => child.sourceId === t.id)]))
  const descendants = (root: RelationshipToken) => {
    const result = [], stack = [root]
    while (stack.length) {
      const t = stack.pop()!
      result.push(t)
      stack.push(...children.get(t.id)!)
    }
    return result
  }
  for (const p of layout.placements) {
    const parent = positions.get(p.token.sourceId ?? '')
    expect(p.depth).toBe(parent ? parent.depth! + 1 : 0)
    if (parent) expect(p.index).toBeGreaterThan(parent.index)
    const subtree = descendants(p.token)
    const indices = subtree.map(t => positions.get(t.id)!.index)
    expect(Math.min(...indices)).toBe(p.index)
    expect(Math.max(...indices) - p.index + 1).toBe(subtree.length)
    const childRanges = children.get(p.token.id)!.map(child => {
      const indices = descendants(child).map(t => positions.get(t.id)!.index)
      return [Math.min(...indices), Math.max(...indices)]
    }).sort((a, b) => a[0] - b[0])
    if (childRanges.length) expect(childRanges[0][0]).toBe(p.index + 1)
    for (let i = 1; i < childRanges.length; i++) expect(childRanges[i][0]).toBe(childRanges[i - 1][1] + 1)
  }
}

describe('sRGB → OKLab / OKLCH', () => {
  it('matches reference red, green, blue and white, rather than HSL lightness', () => {
    for (const [hex, L, a, b] of [
      ['#f00', 0.62795536, 0.22486306, 0.12584630],
      ['#0f0', 0.86643961, -0.23388757, 0.17949848],
      ['#00f', 0.45201372, -0.03245698, -0.31152815],
      ['#fff', 1, 0, 0],
    ] as const) {
      const color = hexToOklch(hex)
      expect(color.L).toBeCloseTo(L, 6)
      expect(color.a).toBeCloseTo(a, 6)
      expect(color.b).toBeCloseTo(b, 6)
      expect(color.h).toBeGreaterThanOrEqual(0)
      expect(color.h).toBeLessThan(360)
    }
    expect(hexToOklch('#000').L).toBe(0)
    expect(hexToOklch('#777').C).toBeLessThan(NEUTRAL_CHROMA)
  })
  it('canonicalizes hex and never composites opacity into lightness', () => {
    expect(hexToOklch('#ABC8')).toEqual(hexToOklch('#aabbcc88'))
    expect(hexToOklch('#abcdef').rgba).toBe('ABCDEFFF')
    expect(hexToOklch('#ffffff00')).toMatchObject({ L: hexToOklch('#fff').L, alpha: 0 })
    for (const bad of ['red', '#12', '#GGGGGG', '#12345', '#123456789', '123456']) expect(() => hexToOklch(bad)).toThrow(/hex/)
  })
})

describe('layout invariants', () => {
  for (const mode of ['color', 'lineage'] as const) {
    it(`${mode}: empty and singleton have explicit counts and compact dimensions`, () => {
      expect(buildLayout([], options(mode))).toEqual({ placements: [], groups: [], width: 1, height: 1, count: 0 })
      const input = [token('one')]
      check(buildLayout(input, options(mode)), input)
    })
    it(`${mode}: repeated builds and reversed inputs agree without mutating tokens`, () => {
      const input = Array.from({ length: 80 }, (_, i) => Object.freeze(token(`id-${i}`, '#123456', i ? 'id-0' : null)))
      Object.freeze(input)
      for (const seed of [0, 1, 42, 4294967296]) {
        const layout = buildLayout(input, options(mode, seed))
        expect(buildLayout(input, options(mode, seed))).toEqual(layout)
        expect(buildLayout([...input].reverse(), options(mode, seed))).toEqual(layout)
        check(layout, input)
      }
      expect(buildLayout(input, options(mode, 42))).not.toEqual(buildLayout(input, options(mode)))
    })
    it(`${mode}: rejects duplicate IDs, bad colors and invalid seeds`, () => {
      expect(() => buildLayout([token('a'), token('a')], options(mode))).toThrow(/Duplicate/)
      expect(() => buildLayout([token('a', 'not-a-color')], options(mode))).toThrow(/hex/)
      for (const seed of [-1, 1.5, NaN, Infinity]) expect(() => buildLayout([], options(mode, seed))).toThrow(/seed/)
    })
  }
})

describe('dense row pitch and cyclic surface sampling', () => {
  it('packs varied sizes with only an incomplete final row, never internal gaps', () => {
    for (const count of [2, 3, 4, 5, 7, 13, 31, 67, 149, 257]) {
      const input = Array.from({ length: count }, (_, i) => token(`n${i}`, '#123456', i ? `n${Math.floor((i - 1) / 3)}` : null))
      for (const mode of ['color', 'lineage'] as const) {
        const layout = buildLayout(input, options(mode))
        check(layout, input)
        expect(layout.width * layout.height - count).toBeLessThan(layout.width)
        const target = Math.sqrt(count), limit = Math.min(32, count)
        const low = Math.max(Math.min(4, count), Math.min(limit, Math.floor(target * 0.7)))
        expect(layout.width).toBeGreaterThanOrEqual(low)
        expect(layout.width).toBeLessThanOrEqual(Math.max(low, Math.min(limit, Math.ceil(target * 1.3))))
      }
    }
  })
  it('has no missing cyclic samples, including negatives and the incomplete final row', () => {
    const input = Array.from({ length: 13 }, (_, i) => token(`n${i}`))
    const layout = buildLayout(input, options('color'))
    expect(layout.width * layout.height).toBeGreaterThan(layout.count)
    const sample = (row: number, col: number) => {
      const index = ((row * layout.width + col) % layout.count + layout.count) % layout.count
      return layout.placements[index]
    }
    for (let row = -10; row < 10; row++) {
      for (let col = -10; col < 10; col++) {
        expect(sample(row, col)).toBeDefined()
        expect(sample(row, col + layout.width)).toBe(sample(row + 1, col))
      }
    }
    expect(sample(Math.floor(layout.count / layout.width), layout.count % layout.width)).toBe(layout.placements[0])
  })
})

describe('color geography', () => {
  it('packs an uneven 150-token bucket without gutters, with canonical ID ties', () => {
    const input = Array.from({ length: 150 }, (_, i) => token(`same-${String(i).padStart(3, '0')}`, '#FF0000'))
    const layout = buildLayout([...input].reverse(), options('color'))
    check(layout, input)
    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]).toMatchObject({ col: 0, row: 0, start: 0, count: 150, width: layout.width, height: layout.height })
    expect(layout.placements.map(p => p.token.id)).toEqual(input.map(t => t.id))
    expect(new Set(layout.placements.map(p => p.col)).size).toBe(layout.width)
  })
  it('orders opaque hue sectors then neutrals, followed by the alpha sequence', () => {
    const input = ['#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#777', '#000', '#fff', '#f008', '#7778', '#0000'].map((hex, i) => token(`c${i}`, hex))
    const layout = buildLayout(input, options('color'))
    check(layout, input)
    const opaque = layout.groups.filter(g => !g.label.startsWith('Alpha'))
    const hueGroups = opaque.filter(g => g.label.startsWith('Hue'))
    expect(hueGroups.map(g => parseInt(g.label.slice(4)))).toEqual(hueGroups.map(g => parseInt(g.label.slice(4))).sort((a, b) => a - b))
    expect(opaque.at(-1)?.label).toBe('Neutrals')
    const alphaStart = layout.groups.find(g => g.label.startsWith('Alpha'))!.start
    for (const p of layout.placements) expect(p.index >= alphaStart).toBe(hexToOklch(p.token.light).alpha < 1)
    const alpha = layout.groups.filter(g => g.label.startsWith('Alpha'))
    expect(alpha.at(-1)?.label).toBe('Alpha · Neutrals')
    const sectors = alpha.filter(g => g.label.includes('Hue')).map(g => parseInt(g.label.split('Hue ')[1]))
    expect(sectors).toEqual([...sectors].sort((a, b) => a - b))
    expect(layout.groups.find(g => g.label === 'Alpha · Neutrals')).toBeDefined()
    expect(buildLayout(input, options('color', 0, 'name'))).toEqual(layout)
    expect(buildLayout(input, options('color', 0, 'size'))).toEqual(layout)
  })
  it('descends in perceptual L, keeps identical RGBA consecutive, and seeds only exact ties', () => {
    const input = Array.from({ length: 90 }, (_, i) => token(`gray-${i}`, ['#aaa', '#222', '#eee', '#222222'][i % 4]))
    const canonical = buildLayout(input, options('color'))
    for (const seed of [0, 17]) {
      const layout = buildLayout(input, options('color', seed))
      check(layout, input)
      const sorted = [...layout.placements].sort((a, b) => a.row - b.row || a.col - b.col)
      const values = sorted.map(p => hexToOklch(p.token.light))
      expect(values.map(c => c.L)).toEqual(values.map(c => c.L).sort((a, b) => b - a))
      for (const rgba of new Set(values.map(c => c.rgba))) {
        const indices = values.flatMap((c, i) => c.rgba === rgba ? [i] : [])
        expect(indices.at(-1)! - indices[0] + 1).toBe(indices.length)
      }
      expect(layout.placements.map(p => [p.col, p.row, hexToOklch(p.token.light).rgba])).toEqual(canonical.placements.map(p => [p.col, p.row, hexToOklch(p.token.light).rgba]))
    }
  })
})

describe('verified lineage forest', () => {
  it('packs all 150 broad-hub dependents without blank cells', () => {
    const input = [token('root'), ...Array.from({ length: 150 }, (_, i) => token(`child-${i}`, '#2468AB', 'root'))]
    const layout = buildLayout(input, options('lineage'))
    checkForest(layout, input)
    expect(layout.groups[0]).toMatchObject({ start: 0, count: 151, width: layout.width, height: layout.height })
    expect(layout.height).toBeLessThan(20)
    expect(layout.placements[0]).toMatchObject({ col: 0, row: 0 })
  })
  it('handles deep chains iteratively, with depth metadata rather than depth columns', () => {
    const input = Array.from({ length: 12000 }, (_, i) => token(`n${i}`, '#fff', i ? `n${i - 1}` : null))
    const layout = buildLayout(input, options('lineage'))
    expect(layout.placements).toHaveLength(input.length)
    expect(layout.count).toBe(input.length)
    expect(layout.groups[0]).toMatchObject({ start: 0, count: input.length, width: 32, height: 375 })
    expect(layout.width).toBe(32)
    expect(layout.height).toBe(375)
    expect(new Set(layout.placements.map(p => p.token.id)).size).toBe(input.length)
    layout.placements.forEach((p, i) => {
      expect(p.depth).toBe(i)
      expect(p.index).toBe(i)
      expect(p.col).toBe(i % layout.width)
      expect(p.row).toBe(Math.floor(i / layout.width))
    })
  })
  it('keeps nested sibling blocks contiguous, and sorts root families by color/name/size', () => {
    const input = [token('red', '#f00'), token('green', '#0f0'), token('blue', '#00f'),
      token('r-a', '#f00', 'red'), token('r-b', '#f00', 'red'), token('r-aa', '#f00', 'r-a'),
      token('r-ab', '#f00', 'r-a'), token('g-a', '#0f0', 'green')]
    for (const seed of [0, 7, 999]) {
      for (const order of ['color', 'name', 'size'] as const) {
        const layout = buildLayout(input, options('lineage', seed, order))
        checkForest(layout, input)
        expect(layout.groups.map(g => g.label)).toEqual(order === 'name' ? ['blue', 'green', 'red'] : ['red', 'green', 'blue'])
      }
    }
    const name = buildLayout(input, options('lineage', 0, 'name'))
    expect(name.placements.filter(p => p.token.sourceId === 'red').map(p => p.token.id)).toEqual(['r-a', 'r-b'])
  })
  it('orders entire canonical sibling branches by their subtree size', () => {
    const input = [token('root'), token('a-small', '#fff', 'root'), token('z-large', '#fff', 'root'), token('leaf', '#fff', 'z-large')]
    const layout = buildLayout(input, options('lineage', 0, 'size'))
    expect(layout.placements.map(p => p.token.id)).toEqual(['root', 'z-large', 'leaf', 'a-small'])
    checkForest(layout, input)
  })
  it('makes disconnected and unavailable-source roots explicit without invented edges', () => {
    const input = [token('base'), token('missing', '#2468AB', 'outside'),
      { ...token('unverified'), reference: 'base.light' },
      { ...token('other-mode'), reference: 'base.dark', sourceMode: 'dark' }, token('child', '#2468AB', 'missing')]
    const layout = buildLayout(input, options('lineage'))
    checkForest(layout, input)
    expect(layout.groups).toHaveLength(4)
    expect(layout.groups.some(g => g.label.includes('Source outside view: outside'))).toBe(true)
    expect(layout.groups.some(g => g.label.includes('base.dark (dark)'))).toBe(true)
    expect(layout.placements.filter(p => p.depth! > 0).map(p => p.token.id)).toEqual(['child'])
  })
  it('fails explicitly for self, rootless and disconnected cycles', () => {
    const cycle = [token('a', '#fff', 'b'), token('b', '#fff', 'a'), token('attached', '#fff', 'a')]
    for (const input of [[token('self', '#fff', 'self')], cycle, [token('valid-root'), ...cycle]]) {
      expect(() => buildLayout(input, options('lineage'))).toThrow(/Cycle/)
    }
  })
})
