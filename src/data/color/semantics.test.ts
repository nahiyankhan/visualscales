import { describe, expect, it } from 'vitest'
import Color from 'colorjs.io'
import { palette } from './generator.js'
import { buildSemantics, evaluateContrast, resolveSemantics, semantics, type SemanticDefinition } from './semantics.js'

const role = (id: string, reference: string): SemanticDefinition => ({ id: `semantic.${id}`, reference, group: 'test', description: id })

describe('light semantic system', () => {
  it('resolves deterministically and measures every declared pair without failures', () => {
    expect(buildSemantics()).toEqual(semantics)
    expect(semantics.report.total).toBe(44)
    expect(semantics.report.checks).toBe(53)
    expect(semantics.report.issues).toEqual([])
    expect(semantics.report.failed).toBe(0)
    for (const check of semantics.checks) {
      expect(check.ratio).toBe(new Color(check.backgroundHex).contrast(check.foregroundHex, 'WCAG21'))
      expect(check.pass).toBe(check.ratio >= check.threshold)
    }
  })

  it('retains exact immediate references, full chains, and independent equal-valued identities', () => {
    const byId = new Map(semantics.tokens.map(token => [token.id, token]))
    expect(byId.get('semantic.action.primary.foreground')!.chain).toEqual(['semantic.action.primary.foreground', 'semantic.text.inverse', 'palette.gray.50'])
    expect(byId.get('semantic.surface.inverse')!.hex).toBe(byId.get('semantic.text.default')!.hex)
    expect(byId.get('semantic.surface.inverse')!.reference).toBe('palette.gray.900')
    expect(byId.get('semantic.text.default')!.reference).toBe('palette.gray.900')
    for (const token of semantics.tokens) {
      expect(token.chain[0]).toBe(token.id)
      expect(token.chain[1]).toBe(token.reference)
      expect(token.chain.at(-1)).toMatch(/^palette\./)
    }
  })

  it('rejects missing aliases, cycles, duplicate IDs, and nonopaque source values', () => {
    expect(() => resolveSemantics([role('a', 'palette.missing.50')], palette)).toThrow(/Missing/)
    expect(() => resolveSemantics([role('a', 'semantic.b'), role('b', 'semantic.a')], palette)).toThrow(/Circular/)
    expect(() => resolveSemantics([role('a', 'semantic.a')], palette)).toThrow(/Circular/)
    expect(() => resolveSemantics([role('a', 'palette.gray.50'), role('a', 'palette.gray.50')], palette)).toThrow(/duplicate/)
    const source = structuredClone(palette)
    source.families[0].swatches[0].hex = '#FFFFFF80'
    expect(() => resolveSemantics([role('a', 'palette.gray.50')], source)).toThrow(/opaque/)
  })

  it('reports failed contrast without changing the authored mapping', () => {
    const definitions = [role('foreground', 'palette.gray.100'), role('background', 'palette.gray.100')]
    const result = buildSemantics(palette, definitions, [{ id: 'same', label: 'same', foreground: 'semantic.foreground', background: 'semantic.background', kind: 'text', threshold: 4.5 }])
    expect(result.report.failed).toBe(1)
    expect(result.checks[0].ratio).toBe(1)
    expect(result.definitions).toEqual(definitions)
  })

  it('fails on unknown contrast roles and compares unrounded ratios', () => {
    const first = semantics.checks[0]
    expect(() => evaluateContrast(semantics.tokens, [{ ...first, foreground: 'semantic.missing' }])).toThrow(/Missing/)
    expect(() => evaluateContrast(semantics.tokens, [first, first])).toThrow(/Duplicate/)
    const check = evaluateContrast(semantics.tokens, [{ ...first, threshold: first.ratio + .00001 }])[0]
    expect(check.pass).toBe(false)
  })
})
