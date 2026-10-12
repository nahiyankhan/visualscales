import { spaceTokens, typeTokens, type TypeToken } from '../data/dimensions.js'

export type SpaceKind =
  | 'type'
  | 'leading'
  | 'gap'
  | 'radius'
  | 'border'
  | 'dimension'
export type Length = { value: number; unit: 'px' | 'rem' }
export type SpaceToken = {
  id: string
  name: string
  kind: SpaceKind
  length: Length
  type?: TypeToken
  multiplier?: number
  reference?: string
}
export type Measurement = SpaceToken & {
  value: number
  expression: string
  context: string
}
export type MeasurementGroup = { value: number; items: Measurement[] }
export const kindLabels: Record<SpaceKind, string> = {
  type: 'type size',
  leading: 'line height',
  gap: 'space',
  radius: 'radius',
  border: 'border',
  dimension: 'dimension',
}
export const kindGlyphs: Record<SpaceKind, string> = {
  type: 'Aa',
  leading: '≋',
  gap: '↔',
  radius: '◜',
  border: '━',
  dimension: '□',
}

// Original fictional fixture. Typography contributes dimensional ingredients,
// not whole composites masquerading as lengths. Alias identity stays intact.
export const tokens: SpaceToken[] = [
  ...typeTokens.flatMap((type) => [
    {
      id: `${type.id}.size`,
      name: type.label,
      kind: 'type' as const,
      length: { value: type.size / 16, unit: 'rem' as const },
      type,
    },
    {
      id: `${type.id}.leading`,
      name: `${type.label} leading`,
      kind: 'leading' as const,
      length: { value: type.size / 16, unit: 'rem' as const },
      multiplier: type.lineHeight,
      type,
    },
  ]),
  ...spaceTokens.map((token) => ({
    id: token.id,
    name: token.label,
    kind: 'gap' as const,
    length: { value: token.value, unit: 'px' as const },
    reference: token.reference,
  })),
  ...[48, 64, 96].map((value) => ({
    id: `space.section.${value}`,
    name: 'Section space',
    kind: 'gap' as const,
    length: { value, unit: 'px' as const },
  })),
  ...[0, 4, 8, 12, 16, 24, 32].map((value) => ({
    id: `radius.${value}`,
    name:
      value === 0
        ? 'Square corner'
        : value <= 8
          ? 'Small corner'
          : value <= 16
            ? 'Medium corner'
            : 'Large corner',
    kind: 'radius' as const,
    length: { value, unit: 'px' as const },
  })),
  ...[0.5, 1, 2, 4].map((value) => ({
    id: `border.${value}`,
    name: value <= 1 ? 'Fine stroke' : 'Strong stroke',
    kind: 'border' as const,
    length: { value, unit: 'px' as const },
  })),
  ...[16, 20, 24, 32].map((value) => ({
    id: `size.icon.${value}`,
    name: 'Icon box',
    kind: 'dimension' as const,
    length: { value, unit: 'px' as const },
  })),
  ...[44, 48].map((value) => ({
    id: `size.control.${value}`,
    name: 'Control height',
    kind: 'dimension' as const,
    length: { value, unit: 'px' as const },
  })),
  ...[160, 240, 320, 480, 640, 960].map((value) => ({
    id: `size.container.${value}`,
    name: 'Container width',
    kind: 'dimension' as const,
    length: { value, unit: 'px' as const },
  })),
]
export const format = (value: number) => Number(value.toFixed(3)).toString()
export function resolveMeasurements(rootSize = 16): Measurement[] {
  return tokens.map((token) => {
    const size =
      token.length.value * (token.length.unit === 'rem' ? rootSize : 1)
    const value = Number((size * (token.multiplier ?? 1)).toFixed(4))
    const authored = `${format(token.length.value)}${token.length.unit}`
    return {
      ...token,
      value,
      expression: token.multiplier
        ? `${format(token.multiplier)} × ${authored}`
        : authored,
      context: token.multiplier
        ? `computed from ${format(size)}px type × ${format(token.multiplier)}`
        : token.length.unit === 'rem'
          ? `computed at root ${rootSize}px`
          : token.reference
            ? `alias of ${token.reference}`
            : 'literal length',
    }
  })
}
export function groupMeasurements(items: Measurement[]): MeasurementGroup[] {
  const groups = new Map<number, Measurement[]>()
  for (const item of items)
    groups.set(item.value, [...(groups.get(item.value) ?? []), item])
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([value, items]) => ({ value, items }))
}
export function searchMeasurements(items: Measurement[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return terms.length
    ? items.filter((item) =>
        terms.every((term) =>
          `${item.id} ${item.name} ${kindLabels[item.kind]} ${item.expression} ${format(item.value)}px`
            .toLowerCase()
            .includes(term)
        )
      )
    : []
}
