import type { RelationshipIndex, RelationshipToken } from './relationships.js'

export type NetworkNode<T extends RelationshipToken = RelationshipToken> = {
  id: string
  token: T
  x: number
  y: number
  depth: number
  row: number
  selected: boolean
}

export type NetworkEdge = {
  id: string
  source: string
  target: string
}

export type NetworkColumn = {
  depth: number
  label: string
  x: number
}

export type RelationshipNetworkLayout<T extends RelationshipToken = RelationshipToken> = {
  selectedId: string
  nodes: NetworkNode<T>[]
  edges: NetworkEdge[]
  columns: NetworkColumn[]
  pathIds: Set<string>
  bounds: { x: number; y: number; width: number; height: number }
  card: { width: number; height: number }
}

export type RelationshipNetworkLayoutOptions = {
  cardWidth?: number
  cardHeight?: number
  columnGap?: number
  rowGap?: number
}

const DEFAULT_CARD_WIDTH = 260
const DEFAULT_CARD_HEIGHT = 68
const DEFAULT_COLUMN_GAP = 96
const DEFAULT_ROW_GAP = 12

const idCollator = new Intl.Collator('en', { numeric: true })

function compareIds(a: string, b: string) {
  return idCollator.compare(a, b) || a.localeCompare(b, 'en')
}

function sortedIds(ids: Iterable<string>) {
  return [...ids].sort(compareIds)
}

function wouldCreateCycle(children: Map<string, string[]>, source: string, target: string) {
  if (source === target) return true
  const stack = [target]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === source) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(children.get(id) ?? []))
  }
  return false
}

function collectPathIds(index: RelationshipIndex, selectedId: string) {
  if (!index.byId.has(selectedId)) return new Set<string>()

  const pathIds = new Set([selectedId])
  let source = index.sourceById.get(selectedId)
  while (source && !pathIds.has(source.id)) {
    pathIds.add(source.id)
    source = index.sourceById.get(source.id)
  }

  const visitDescendants = (id: string) => {
    for (const child of [...(index.dependentsById.get(id) ?? [])].sort((a, b) => compareIds(a.id, b.id))) {
      if (pathIds.has(child.id)) continue
      pathIds.add(child.id)
      visitDescendants(child.id)
    }
  }
  visitDescendants(selectedId)

  return pathIds
}

function semanticColumnLabel(depth: number, maxDepth: number) {
  if (depth === 0) return 'Source'
  if (depth === maxDepth) return 'Consumers'
  return 'Aliases'
}

/**
 * Builds the flat, deterministic source → consumer DAG shown over the globe.
 * Only importer-verified source edges from RelationshipIndex are included; equal
 * color values and missing external references never imply extra links.
 */
export function layoutRelationshipNetwork<T extends RelationshipToken>(
  index: RelationshipIndex<T>,
  selectedId: string,
  options: RelationshipNetworkLayoutOptions = {},
): RelationshipNetworkLayout<T> {
  const cardWidth = options.cardWidth ?? DEFAULT_CARD_WIDTH
  const cardHeight = options.cardHeight ?? DEFAULT_CARD_HEIGHT
  const stepX = cardWidth + (options.columnGap ?? DEFAULT_COLUMN_GAP)
  const stepY = cardHeight + (options.rowGap ?? DEFAULT_ROW_GAP)
  const tokens = new Map(sortedIds(index.byId.keys()).map(id => [id, index.byId.get(id)!]))

  if (!tokens.size) {
    return { selectedId, nodes: [], edges: [], columns: [], pathIds: new Set(), bounds: { x: 0, y: 0, width: 0, height: 0 }, card: { width: cardWidth, height: cardHeight } }
  }

  const edges: NetworkEdge[] = []
  for (const id of sortedIds(tokens.keys())) {
    const source = index.sourceById.get(id)
    if (source && tokens.has(source.id)) edges.push({ id: `${source.id}→${id}`, source: source.id, target: id })
  }
  edges.sort((a, b) => compareIds(a.source, b.source) || compareIds(a.target, b.target))

  const children = new Map<string, string[]>([...tokens.keys()].map(id => [id, []]))
  const parentById = new Map<string, string>()
  for (const edge of edges) {
    if (wouldCreateCycle(children, edge.source, edge.target)) continue
    children.get(edge.source)!.push(edge.target)
    parentById.set(edge.target, edge.source)
  }
  for (const ids of children.values()) ids.sort(compareIds)

  const depthById = new Map<string, number>()
  const rowById = new Map<string, number>()
  let cursor = 0

  const place = (id: string, depth: number): number => {
    depthById.set(id, depth)
    const childRows = (children.get(id) ?? []).map(child => place(child, depth + 1))
    const row = childRows.length ? (Math.min(...childRows) + Math.max(...childRows)) / 2 : cursor++
    rowById.set(id, row)
    return row
  }

  for (const id of sortedIds(tokens.keys())) {
    if (!parentById.has(id)) place(id, 0)
  }

  const maxDepth = Math.max(...depthById.values())
  const maxRow = Math.max(...rowById.values())

  const nodes = [...tokens.values()]
    .map(token => {
      const depth = depthById.get(token.id) ?? 0
      const row = rowById.get(token.id) ?? 0
      return {
        id: token.id,
        token,
        depth,
        row,
        x: depth * stepX,
        y: row * stepY,
        selected: token.id === selectedId,
      }
    })
    .sort((a, b) => a.depth - b.depth || a.row - b.row || compareIds(a.id, b.id))

  const columns = Array.from(new Set(nodes.map(node => node.depth))).sort((a, b) => a - b).map(depth => ({
    depth,
    label: semanticColumnLabel(depth, maxDepth),
    x: depth * stepX,
  }))

  return {
    selectedId,
    nodes,
    edges,
    columns,
    pathIds: collectPathIds(index, selectedId),
    bounds: {
      x: 0,
      y: 0,
      width: maxDepth * stepX + cardWidth,
      height: maxRow * stepY + cardHeight,
    },
    card: { width: cardWidth, height: cardHeight },
  }
}
