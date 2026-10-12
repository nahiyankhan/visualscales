import Color from 'colorjs.io'

export type Oklch = { l: number; c: number; h: number }
export type Swatch = { id: string; step: number; authored: Oklch; mapped: Oklch; hex: string; adjusted: boolean; ink: string }
export type Family = { id: string; name: string; purpose: string; swatches: Swatch[] }
export type Report = { total: number; adjusted: number; duplicates: number; allInGamut: boolean; monotonic: boolean; issues: string[] }
export type Palette = { name: string; version: number; families: Family[]; report: Report }
export type FamilySpec = { id: string; name: string; purpose: string; hue: number; intensity: number; overrides?: Partial<Record<number, Partial<Oklch>>> }

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
// Independently authored curves. Dense pale steps distinguish surfaces;
// chroma peaks around the middle, and both ends retain a little hue.
export const LIGHTNESS = [.978, .952, .905, .835, .745, .645, .545, .445, .345, .245, .165] as const
export const CHROMA_PROFILE = [.045, .095, .22, .43, .74, 1, .94, .77, .56, .34, .17] as const
export const FAMILIES: readonly FamilySpec[] = [
  { id: 'gray', name: 'Cool gray', purpose: 'Candidate surfaces, text, and borders', hue: 265, intensity: .065 },
  { id: 'indigo', name: 'Indigo', purpose: 'Candidate primary accent', hue: 278, intensity: .88 },
  { id: 'red', name: 'Red', purpose: 'Candidate danger and destructive states', hue: 27, intensity: .86 },
  { id: 'amber', name: 'Amber', purpose: 'Candidate warning states', hue: 82, intensity: .9 },
  { id: 'green', name: 'Green', purpose: 'Candidate success states', hue: 151, intensity: .76 },
  { id: 'cyan', name: 'Cyan', purpose: 'Candidate information and chart categories', hue: 218, intensity: .85 },
  { id: 'violet', name: 'Violet', purpose: 'Candidate chart and tag category', hue: 309, intensity: .78 },
  { id: 'rose', name: 'Rose', purpose: 'Candidate chart and tag category', hue: 350, intensity: .78 },
]

function color(value: Oklch) { return new Color('oklch', [value.l, value.c, value.h]) }
function validate(value: Oklch) {
  if (![value.l, value.c, value.h].every(Number.isFinite) || value.l <= 0 || value.l >= 1 || value.c < 0 || value.c > 1 || value.h < 0 || value.h >= 360) {
    throw new Error('Expected finite OKLCH: 0 < L < 1, 0 ≤ C ≤ 1, 0 ≤ h < 360')
  }
}

/** Strict chroma-only fit. No RGB channel clipping or hue/lightness changes.
 * Color.js supplies the conversion and gamut predicates. Bisection finds the
 * in-gamut side of the boundary at fixed L/h to sub-8-bit precision. */
export function mapToSrgb(value: Oklch): Oklch {
  validate(value)
  if (color(value).inGamut('srgb', { epsilon: 0 })) return { ...value }
  let low = 0, high = value.c
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2
    if (color({ ...value, c: mid }).inGamut('srgb', { epsilon: 0 })) low = mid
    else high = mid
  }
  return { ...value, c: low }
}

export function generatePalette(specs: readonly FamilySpec[] = FAMILIES): Palette {
  if (!specs.length) throw new Error('At least one palette family is required')
  const ids = new Set<string>()
  const families = specs.map(spec => {
    if (!/^[a-z][a-z0-9-]*$/.test(spec.id) || ids.has(spec.id)) throw new Error(`Invalid or duplicate family: ${spec.id}`)
    ids.add(spec.id)
    if (!Number.isFinite(spec.intensity) || spec.intensity <= 0 || spec.intensity > 1) throw new Error(`Invalid intensity: ${spec.id}`)
    for (const step of Object.keys(spec.overrides ?? {})) {
      if (!(STEPS as readonly number[]).includes(Number(step))) throw new Error(`Unknown step: ${step}`)
    }
    // The same fraction of each hue's maximum at the middle step, not the
    // same raw C across hues. Review is still needed for perceived balance.
    const peak = mapToSrgb({ l: LIGHTNESS[5], c: 1, h: spec.hue }).c * spec.intensity
    const swatches = STEPS.map((step, i): Swatch => {
      const authored = { l: LIGHTNESS[i], c: peak * CHROMA_PROFILE[i], h: spec.hue, ...spec.overrides?.[step] }
      const mapped = mapToSrgb(authored)
      const hex = color(mapped).to('srgb').toString({ format: 'hex', collapse: false }).toUpperCase()
      const display = new Color(hex)
      const ink = display.contrast('#111213', 'WCAG21') >= display.contrast('#FFFFFF', 'WCAG21') ? '#111213' : '#FFFFFF'
      return { id: `palette.${spec.id}.${step}`, step, authored, mapped, hex, adjusted: authored.c - mapped.c > 1e-7, ink }
    })
    return { id: spec.id, name: spec.name, purpose: spec.purpose, swatches }
  })
  const swatches = families.flatMap(family => family.swatches)
  const issues: string[] = []
  let monotonic = true
  for (const family of families) {
    for (let i = 1; i < family.swatches.length; i++) {
      const previous = family.swatches[i - 1], current = family.swatches[i]
      const previousL = new Color(previous.hex).to('oklch').coords[0]!
      const currentL = new Color(current.hex).to('oklch').coords[0]!
      if (current.authored.l >= previous.authored.l || currentL >= previousL) {
        monotonic = false; issues.push(`${current.id}: lightness does not decrease after ${previous.step}`)
      }
    }
  }
  const allInGamut = swatches.every(swatch => color(swatch.mapped).inGamut('srgb', { epsilon: 0 }) && new Color(swatch.hex).inGamut('srgb', { epsilon: 0 }))
  if (!allInGamut) issues.push('One or more mapped colors are outside sRGB')
  const duplicates = swatches.length - new Set(swatches.map(swatch => swatch.hex)).size
  if (duplicates) issues.push(`${duplicates} repeated hex values after 8-bit quantization`)
  return {
    name: 'Sample', version: 1, families,
    report: { total: swatches.length, adjusted: swatches.filter(swatch => swatch.adjusted).length, duplicates, allInGamut, monotonic, issues },
  }
}

export const palette = generatePalette()
