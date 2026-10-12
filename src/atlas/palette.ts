import { palette } from '../data/color/generator.js'

// Hue-ordered mid-ramp samples from the same generated palette that supplies
// the default globe. Keep source IDs so the artwork remains traceable.
const selections = [
  ['red', 400],
  ['amber', 400],
  ['green', 400],
  ['cyan', 400],
  ['indigo', 500],
  ['violet', 400],
  ['rose', 400],
] as const

export const atlasPalette = selections.map(([familyId, step]) => {
  const swatch = palette.families
    .find((family) => family.id === familyId)
    ?.swatches.find((swatch) => swatch.step === step)
  if (!swatch)
    throw new Error(`Missing Atlas color: palette.${familyId}.${step}`)
  return { id: swatch.id, hex: swatch.hex }
})
