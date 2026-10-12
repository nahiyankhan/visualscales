import { describe, expect, it } from 'vitest'
import Color from 'colorjs.io'
import { CHROMA_PROFILE, FAMILIES, LIGHTNESS, STEPS, generatePalette, mapToSrgb, palette } from './generator.js'

describe('independent fictional palette', () => {
  it('is deterministic with original stable IDs, eleven steps, and a clean report', () => {
    expect(generatePalette()).toEqual(palette)
    expect(palette.report.total).toBe(88)
    expect(palette.report).toMatchObject({ duplicates: 0, allInGamut: true, monotonic: true, issues: [] })
    expect(new Set(palette.families.flatMap(f => f.swatches.map(s => s.id))).size).toBe(88)
    for (const family of palette.families) expect(family.swatches.map(s => s.step)).toEqual([...STEPS])
  })

  it('preserves authored hue and lightness when fitting chroma, without out-of-gamut RGB', () => {
    for (const family of palette.families) for (const swatch of family.swatches) {
      expect(swatch.mapped.l).toBe(swatch.authored.l)
      expect(swatch.mapped.h).toBe(swatch.authored.h)
      expect(swatch.mapped.c).toBeLessThanOrEqual(swatch.authored.c)
      const rgb = new Color('oklch', [swatch.mapped.l, swatch.mapped.c, swatch.mapped.h]).to('srgb')
      for (const channel of rgb.coords) { expect(channel).toBeGreaterThanOrEqual(0); expect(channel).toBeLessThanOrEqual(1) }
      expect(swatch.hex).toMatch(/^#[0-9A-F]{6}$/)
      expect(new Color(swatch.hex).to('oklch').coords[0]).toBeCloseTo(swatch.mapped.l, 2)
      expect(new Color(swatch.hex).contrast(swatch.ink, 'WCAG21')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('uses hue-relative peak chroma, dense pale steps, and tapered chroma', () => {
    expect(LIGHTNESS[0] - LIGHTNESS[1]).toBeLessThan(LIGHTNESS[8] - LIGHTNESS[9])
    expect(CHROMA_PROFILE.indexOf(Math.max(...CHROMA_PROFILE) as typeof CHROMA_PROFILE[number])).toBe(5)
    const [a, b] = generatePalette([
      { ...FAMILIES[1], id: 'one', hue: 82, intensity: .8 },
      { ...FAMILIES[1], id: 'two', hue: 278, intensity: .8 },
    ]).families
    expect(a.swatches[5].authored.c).not.toBeCloseTo(b.swatches[5].authored.c, 2)
  })

  it('reduces extreme chroma and leaves already in-gamut colors unchanged', () => {
    const vivid = { l: .7, c: .8, h: 50 }
    const fitted = mapToSrgb(vivid)
    expect(fitted.c).toBeLessThan(vivid.c)
    expect(new Color('oklch', [fitted.l, fitted.c, fitted.h]).inGamut('srgb', { epsilon: 0 })).toBe(true)
    const gray = { l: .5, c: 0, h: 265 }
    expect(mapToSrgb(gray)).toEqual(gray)
  })

  it('allows explicit overrides but reports nonmonotonic or duplicate outcomes', () => {
    const result = generatePalette([{ ...FAMILIES[0], overrides: { 100: { l: .978, c: 0 }, 50: { c: 0 } } }])
    expect(result.report.monotonic).toBe(false)
    expect(result.report.duplicates).toBe(1)
    expect(result.report.issues.length).toBeGreaterThan(0)
  })

  it('rejects invalid specifications instead of silently clipping them', () => {
    expect(() => generatePalette([])).toThrow()
    expect(() => generatePalette([FAMILIES[0], FAMILIES[0]])).toThrow(/duplicate/)
    expect(() => generatePalette([{ ...FAMILIES[0], intensity: 2 }])).toThrow(/intensity/)
    expect(() => generatePalette([{ ...FAMILIES[0], overrides: { 123: { c: .1 } } }])).toThrow(/step/)
    for (const value of [{ l: NaN, c: .1, h: 20 }, { l: .5, c: -.1, h: 20 }, { l: .5, c: .1, h: 360 }]) {
      expect(() => mapToSrgb(value)).toThrow(/OKLCH/)
    }
  })
})
