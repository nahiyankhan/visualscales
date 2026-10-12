import { hexToOklch, NEUTRAL_CHROMA, type PerceptualColor } from './color-space.js'
import type { RelationshipToken } from './relationships.js'
import { buildSpatialColorLayout } from './spatial-layout.js'

export type LayoutOptions = {
  mode: 'color' | 'lineage' | 'spatial'
  /** Lineage family / sibling ordering only; color and spatial geography ignore this. */
  order: 'color' | 'name' | 'size'
  /** 0 = canonical. Positive seeds shuffle equal-RGBA ties / sibling subtrees. */
  seed: number
}
export type TokenPlacement = {
  token: RelationshipToken
  index: number
  col: number
  row: number
  /** Verified sourceId depth; lineage only. Not a column constraint. */
  depth?: number
}
export type LayoutGroup = {
  label: string
  start: number
  count: number
  tokenIds: readonly string[]
  /** Bounding box only: use tokenIds for membership, not this rectangle. */
  col: number
  row: number
  width: number
  height: number
}
export type TokenLayout = {
  placements: TokenPlacement[]
  count: number
  /** Row pitch, not a rectangular repeat period. */
  width: number
  height: number
  groups: LayoutGroup[]
  wrap?: boolean
}

type SequenceEntry = { token: RelationshipToken; depth?: number }
type SequenceGroup = { label: string; start: number; count: number }

const HUE_SECTORS = 8
const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** Stable keyed pseudo-random rank, independent of input order and JS locale. */
function rank(id: string, seed: number): number {
  let hash = 2166136261
  for (const char of `${seed}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  return (hash ^ (hash >>> 16)) >>> 0
}

/** Choose a compact row pitch without changing the meaningful sequence. */
function pack(sequence: SequenceEntry[], ranges: SequenceGroup[], lineage = false): TokenLayout {
  const count = sequence.length
  if (!count) return { placements: [], groups: [], width: 1, height: 1, count: 0 }
  const indices = new Map(sequence.map((entry, index) => [entry.token.id, index]))
  const edges: [number, number][] = []
  if (lineage) sequence.forEach(({ token }, index) => {
    const parent = token.sourceId == null ? undefined : indices.get(token.sourceId)
    if (parent !== undefined) edges.push([parent, index])
  })
  const target = Math.sqrt(count)
  const limit = Math.min(32, count), minimum = Math.min(4, count)
  const low = Math.max(minimum, Math.min(limit, Math.floor(target * 0.7)))
  const high = Math.max(low, Math.min(limit, Math.ceil(target * 1.3)))
  let width = low, best = Infinity
  for (let candidate = low; candidate <= high; candidate++) {
    let distance = 0, splits = 0
    for (const [parent, child] of edges) {
      distance += Math.abs(parent % candidate - child % candidate)
        + Math.abs(Math.floor(parent / candidate) - Math.floor(child / candidate))
    }
    for (const group of ranges) {
      splits += Math.floor((group.start + group.count - 1) / candidate) - Math.floor(group.start / candidate)
    }
    // Mean edge distance favors nearby verified relatives; row crossings
    // discourage fragmented groups. The mild shape term avoids skinny grids.
    const score = distance / Math.max(1, edges.length)
      + 0.15 * splits / Math.max(1, ranges.length)
      + 0.5 * Math.abs(candidate - Math.ceil(count / candidate)) / target
    // Ascending candidates make equal scores deterministic (smaller pitch).
    if (score < best) { best = score; width = candidate }
  }
  const placements = sequence.map((entry, index) => ({
    ...entry, index, col: index % width, row: Math.floor(index / width),
  }))
  const groups = ranges.map(group => {
    let col = width, row = count, right = 0, bottom = 0
    const tokenIds: string[] = []
    for (let index = group.start; index < group.start + group.count; index++) {
      const placement = placements[index]
      tokenIds.push(placement.token.id)
      col = Math.min(col, placement.col)
      row = Math.min(row, placement.row)
      right = Math.max(right, placement.col + 1)
      bottom = Math.max(bottom, placement.row + 1)
    }
    return { ...group, tokenIds, col, row, width: right - col, height: bottom - row }
  })
  return { placements, groups, width, height: Math.ceil(count / width), count }
}

/**
 * Pure dense sequence: exactly one placement per token, with no invented gaps.
 * The final canonical row can be incomplete. To fill a surface continuously,
 * sample placements[mod(row * width + col, count)] (guard count === 0), never
 * wrap row/column independently. This naturally skews successive repeats.
 * Groups describe contiguous sequence ranges, not exclusive bounding boxes.
 * Spatial mode refines a hue/lightness map against horizontal, vertical and
 * diagonal repeat neighbors; its single group describes the complete map.
 * Lineage is DFS preorder: parent before child and each whole subtree contiguous;
 * depth is metadata, NOT a column constraint. All modes validate hex/unique IDs;
 * lineage rejects all cycles. Color/lineage are O(n log n); spatial refinement
 * has a fixed pass/candidate budget, with exhaustive swaps only for small maps.
 */
export function buildLayout(tokens: readonly RelationshipToken[], options: LayoutOptions): TokenLayout {
  if (!Number.isSafeInteger(options.seed) || options.seed < 0) {
    throw new Error('Layout seed must be a nonnegative safe integer')
  }
  const byId = new Map<string, RelationshipToken>()
  const colors = new Map<string, PerceptualColor>()
  for (const token of tokens) {
    if (byId.has(token.id)) throw new Error(`Duplicate token ID: ${token.id}`)
    byId.set(token.id, token)
    colors.set(token.id, hexToOklch(token.light))
  }
  const tie = (a: RelationshipToken, b: RelationshipToken) =>
    (options.seed ? rank(a.id, options.seed) - rank(b.id, options.seed) : 0) || textOrder(a.id, b.id)
  if (options.mode === 'color') return colorLayout(tokens, colors, tie)
  if (options.mode === 'spatial') return buildSpatialColorLayout(tokens, colors, tie)
  return lineageLayout(tokens, byId, colors, options, tie)
}

function sector(color: PerceptualColor): number {
  return color.C < NEUTRAL_CHROMA ? HUE_SECTORS : Math.floor(color.h / 45)
}

function colorLayout(
  tokens: readonly RelationshipToken[], colors: Map<string, PerceptualColor>,
  tie: (a: RelationshipToken, b: RelationshipToken) => number,
): TokenLayout {
  // Opaque sectors ascend first, neutrals last; then the same alpha band.
  // Bucket ordering is descending perceptual L, canonical RGBA, then ID ties.
  const bands: RelationshipToken[][][] = Array.from({ length: 2 }, () =>
    Array.from({ length: HUE_SECTORS + 1 }, () => []))
  for (const token of tokens) {
    const color = colors.get(token.id)!
    bands[color.alpha < 1 ? 1 : 0][sector(color)].push(token)
  }
  const sequence: SequenceEntry[] = [], groups: SequenceGroup[] = []
  for (let band = 0; band < 2; band++) {
    for (let index = 0; index <= HUE_SECTORS; index++) {
      const bucket = bands[band][index]
      if (!bucket.length) continue
      bucket.sort((a, b) => {
        const ca = colors.get(a.id)!, cb = colors.get(b.id)!
        return cb.L - ca.L || textOrder(ca.rgba, cb.rgba) || tie(a, b)
      })
      const label = index === HUE_SECTORS ? 'Neutrals' : `Hue ${index * 45}–${(index + 1) * 45}°`
      groups.push({ label: `${band ? 'Alpha · ' : ''}${label}`, start: sequence.length, count: bucket.length })
      for (const token of bucket) sequence.push({ token })
    }
  }
  return pack(sequence, groups)
}

function lineageLayout(
  tokens: readonly RelationshipToken[], byId: Map<string, RelationshipToken>,
  colors: Map<string, PerceptualColor>, options: LayoutOptions,
  tie: (a: RelationshipToken, b: RelationshipToken) => number,
): TokenLayout {
  const children = new Map<string, RelationshipToken[]>(tokens.map(token => [token.id, []]))
  const roots: RelationshipToken[] = []
  for (const token of tokens) {
    // Only an explicit in-view sourceId constitutes an edge. References, mode
    // metadata, layer names and equal hex values cannot create ancestry.
    const source = token.sourceId == null ? undefined : byId.get(token.sourceId)
    if (source) children.get(source.id)!.push(token)
    else roots.push(token)
  }
  const preorder: RelationshipToken[] = [], pending = [...roots]
  while (pending.length) {
    const token = pending.pop()!
    preorder.push(token)
    for (const child of children.get(token.id)!) pending.push(child)
  }
  // In a single-parent graph, every acyclic component has a root. Cycles and
  // their attached descendants are unreachable from roots. This also detects
  // self-links / no-root input, without recursive DFS or stack overflow.
  if (preorder.length !== tokens.length) throw new Error('Cycle detected in token sourceId lineage')

  const sizes = new Map<string, number>()
  for (let i = preorder.length - 1; i >= 0; i--) {
    const token = preorder[i]
    let size = 1
    for (const child of children.get(token.id)!) size += sizes.get(child.id)!
    sizes.set(token.id, size)
  }
  const compare = (a: RelationshipToken, b: RelationshipToken) => {
    if (options.order === 'name') return textOrder(a.name, b.name) || tie(a, b)
    if (options.order === 'size') return sizes.get(b.id)! - sizes.get(a.id)! || tie(a, b)
    const ca = colors.get(a.id)!, cb = colors.get(b.id)!
    // Keep root hue geography even with a seed. Neutrals and alpha follow
    // chromatic opaque roots; undefined neutral hue never affects ordering.
    return Number(ca.alpha < 1) - Number(cb.alpha < 1)
      || Number(ca.C < NEUTRAL_CHROMA) - Number(cb.C < NEUTRAL_CHROMA)
      || (ca.C >= NEUTRAL_CHROMA ? ca.h - cb.h : 0)
      || cb.L - ca.L || textOrder(ca.rgba, cb.rgba) || tie(a, b)
  }
  roots.sort(compare)
  // A seeded variant reorders whole sibling branches, never individual rows
  // within a subtree. Root families retain the requested primary ordering.
  for (const siblings of children.values()) siblings.sort(options.seed ? tie : compare)

  const sequence: SequenceEntry[] = [], groups: SequenceGroup[] = []
  for (const root of roots) {
    let label = root.name
    if (root.sourceId != null && !byId.has(root.sourceId)) label += ` · Source outside view: ${root.sourceId}`
    else if (root.reference) label += ` · Unlinked reference: ${root.reference}${root.sourceMode ? ` (${root.sourceMode})` : ''}`
    groups.push({ label, start: sequence.length, count: sizes.get(root.id)! })
    const stack: { token: RelationshipToken; depth: number }[] = [{ token: root, depth: 0 }]
    while (stack.length) {
      const entry = stack.pop()!
      sequence.push(entry)
      const siblings = children.get(entry.token.id)!
      for (let i = siblings.length - 1; i >= 0; i--) {
        stack.push({ token: siblings[i], depth: entry.depth + 1 })
      }
    }
  }
  return pack(sequence, groups, true)
}
