export type RelationshipToken = {
  id: string
  name: string
  layer: string
  light: string
  reference: string | null
  sourceId?: string | null
  sourceMode?: string | null
  sourceValue?: string | null
  alpha?: number | null
  labelLevel?: 'chapter' | 'group'
}

export type RelationshipIndex<T extends RelationshipToken = RelationshipToken> = {
  byId: Map<string, T>
  sourceById: Map<string, T>
  dependentsById: Map<string, T[]>
}

export type TokenLineage<T extends RelationshipToken = RelationshipToken> = {
  ancestors: T[]
  descendants: T[]
}

/** Index only explicit, importer-verified edges. Equal colors never imply a link. */
export function buildRelationships<T extends RelationshipToken>(tokens: readonly T[]): RelationshipIndex<T> {
  const byId = new Map(tokens.map(token => [token.id, token]))
  const sourceById = new Map<string, T>()
  const dependentsById = new Map<string, T[]>(tokens.map(token => [token.id, []]))
  for (const token of tokens) {
    const source = token.sourceId ? byId.get(token.sourceId) : undefined
    if (!source) continue
    sourceById.set(token.id, source)
    dependentsById.get(source.id)!.push(token)
  }
  return { byId, sourceById, dependentsById }
}

/** Complete verified alias lineage for a token: ancestors first, then every descendant in branch order. */
export function lineage<T extends RelationshipToken>(index: RelationshipIndex<T>, id: string): TokenLineage<T> {
  if (!index.byId.has(id)) return { ancestors: [], descendants: [] }
  const ancestors: T[] = []
  const seenAncestors = new Set([id])
  let source = index.sourceById.get(id)
  while (source && !seenAncestors.has(source.id)) {
    ancestors.push(source)
    seenAncestors.add(source.id)
    source = index.sourceById.get(source.id)
  }

  const descendants: T[] = []
  const seenDescendants = new Set([id])
  const visit = (parentId: string) => {
    for (const dependent of index.dependentsById.get(parentId) ?? []) {
      if (seenDescendants.has(dependent.id)) continue
      seenDescendants.add(dependent.id)
      descendants.push(dependent)
      visit(dependent.id)
    }
  }
  visit(id)
  return { ancestors, descendants }
}

/** Whole verified alias lineage, not color-value groups. */
export function neighborhood(index: RelationshipIndex, id: string): Set<string> {
  if (!index.byId.has(id)) return new Set()
  const { ancestors, descendants } = lineage(index, id)
  return new Set([id, ...ancestors.map(token => token.id), ...descendants.map(token => token.id)])
}
