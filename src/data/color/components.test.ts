import { describe, expect, it } from 'vitest'
import { components, buildComponents, color, resolveComponents } from './components.js'
import { semantics } from './semantics.js'

describe('component mappings', () => {
  it('is deterministic, covers twelve families, and passes every declared pair', () => {
    expect(buildComponents()).toEqual(components)
    expect(new Set(components.tokens.map(token => token.group)).size).toBe(12)
    expect(components.report.issues).toEqual([])
    expect(components.report.failed).toBe(0)
    expect(components.report.total).toBe(86)
    expect(components.report.checks).toBe(56)
  })

  it('preserves immediate semantic edges and the full primitive ancestry', () => {
    expect(components.tokens.find(token => token.id === 'component.button.primary.foreground')!.chain).toEqual([
      'component.button.primary.foreground', 'semantic.action.primary.foreground', 'semantic.text.inverse', 'palette.gray.50',
    ])
    for (const token of components.tokens) {
      expect(token.reference).toMatch(/^semantic\./)
      expect(token.chain[1]).toBe(token.reference)
      expect(token.chain.at(-1)).toMatch(/^palette\./)
      expect(token.hex).toBe(semantics.tokens.find(parent => parent.id === token.reference)!.hex)
    }
  })

  it('rejects primitive shortcuts, unknown roles, duplicate IDs, and unknown rendering keys', () => {
    const definition = components.definitions[0]
    expect(() => resolveComponents([{ ...definition, reference: 'palette.indigo.600' }], semantics.tokens)).toThrow(/semantic/)
    expect(() => resolveComponents([{ ...definition, reference: 'semantic.missing' }], semantics.tokens)).toThrow(/Missing/)
    expect(() => resolveComponents([definition, definition], semantics.tokens)).toThrow(/duplicate/)
    expect(() => color('missing')).toThrow(/Unknown/)
  })

  it('flags contrast regressions without silently editing the source aliases', () => {
    const definitions = components.definitions.map(definition => definition.id === 'component.tooltip.foreground'
      ? { ...definition, reference: 'semantic.surface.inverse' } : definition)
    const result = buildComponents(definitions)
    expect(result.report.failed).toBe(1)
    expect(result.checks.find(check => check.foreground === 'component.tooltip.foreground')!.ratio).toBe(1)
    expect(result.definitions).toEqual(definitions)
  })
})
