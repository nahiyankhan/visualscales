import { palette } from './generator.js'
import { semantics } from './semantics.js'
import { components } from './components.js'
import type { RelationshipToken } from '../../globe/relationships.js'

/** Adapt the independent collection without collapsing aliases or equal colors.
 * Palette generation is deterministic; only the view's arrangement is randomized.
 * No importer, local file, source checkout, or private dataset is involved. */
export function createGlobeData() {
  const primitives: RelationshipToken[] = palette.families.flatMap(family => family.swatches.map(swatch => ({
    id: swatch.id,
    name: swatch.id.slice('palette.'.length),
    layer: 'primitive',
    light: swatch.hex,
    reference: null,
    sourceId: null,
    sourceMode: null,
    sourceValue: null,
    alpha: null,
  })))
  const resolved = [...semantics.tokens, ...components.tokens]
  const values = new Map([...primitives.map(token => [token.id, token.light] as const), ...resolved.map(token => [token.id, token.hex] as const)])
  if (values.size !== primitives.length + resolved.length) throw new Error('Duplicate IDs in fictional collection')
  const aliases: RelationshipToken[] = resolved.map(token => {
    const sourceValue = values.get(token.reference)
    if (!sourceValue) throw new Error(`Missing source for ${token.id}: ${token.reference}`)
    if (sourceValue !== token.hex) throw new Error(`Resolved alias mismatch: ${token.id}`)
    return {
      id: token.id,
      name: token.id.slice(token.id.indexOf('.') + 1),
      layer: token.id.startsWith('component.') ? 'component' : 'semantic',
      light: token.hex,
      reference: token.reference,
      sourceId: token.reference,
      sourceMode: 'light',
      sourceValue,
      alpha: null,
    }
  })
  const tokens = [...primitives, ...aliases]
  const homeId = 'palette.indigo.600'
  if (!values.has(homeId)) throw new Error(`Missing starting token: ${homeId}`)
  return {
    meta: { name: palette.name, homeId, count: tokens.length, theme: 'light', fictional: true, version: 1 },
    tokens,
  }
}

export const sampleData = createGlobeData()
