import { NEUTRAL_CHROMA, type PerceptualColor } from './color-space.js'
import type { LayoutGroup, TokenLayout, TokenPlacement } from './layout.js'
import type { RelationshipToken } from './relationships.js'

type PositionedToken = {
  token: RelationshipToken
  color: PerceptualColor
  initialIndex: number
  initialCol: number
  initialRow: number
}

type WeightedOffset = { offset: number; weight: number }
type WeightedNeighbor = { index: number; weight: number }
type Edge = { a: number; b: number; weight: number }
type LayoutGraph = { edges: Edge[]; neighbors: WeightedNeighbor[][] }

const MAX_WIDTH = 32
const SMALL_EXHAUSTIVE_LIMIT = 512
const PASSES = 7
const DIAGONAL_WEIGHT = 0.35
const OPACITY_WEIGHT = 0.45
const ANCHOR_WEIGHT = 0.012
const IMPROVEMENT_EPSILON = 1e-12

const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const isAlpha = (color: PerceptualColor) => color.alpha < 1
const isNeutral = (color: PerceptualColor) => color.C < NEUTRAL_CHROMA
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor

function colorFor(colors: Map<string, PerceptualColor>, token: RelationshipToken): PerceptualColor {
  const color = colors.get(token.id)
  if (!color) throw new Error(`Missing perceptual color for token ID: ${token.id}`)
  return color
}

function spatialColorDistance(a: PerceptualColor, b: PerceptualColor): number {
  // RGB is measured in uncomposited OKLab space, with hidden-RGB differences
  // fading as opacity approaches zero. Alpha remains an independent dimension.
  const visible = (a.alpha + b.alpha) / 2
  const dL = a.L - b.L
  const da = a.a - b.a
  const db = a.b - b.b
  const dalpha = a.alpha - b.alpha
  return visible * (dL * dL + da * da + db * db) + OPACITY_WEIGHT * dalpha * dalpha
}

function compareInitialEntries(
  tie: (a: RelationshipToken, b: RelationshipToken) => number,
) {
  return (a: PositionedToken, b: PositionedToken) => {
    const ca = a.color, cb = b.color
    return cb.L - ca.L
      || (isNeutral(ca) && isNeutral(cb) ? 0 : Number(isNeutral(ca)) - Number(isNeutral(cb)))
      || (isNeutral(ca) || isNeutral(cb) ? 0 : ca.h - cb.h)
      || textOrder(ca.rgba, cb.rgba)
      || tie(a.token, b.token)
      || textOrder(a.token.id, b.token.id)
  }
}

function compareRowEntries(
  tie: (a: RelationshipToken, b: RelationshipToken) => number,
) {
  return (a: PositionedToken, b: PositionedToken) => {
    const ca = a.color, cb = b.color
    return Number(isAlpha(ca)) - Number(isAlpha(cb))
      || Number(!isNeutral(ca)) - Number(!isNeutral(cb))
      || (isNeutral(ca) || isNeutral(cb) ? cb.L - ca.L : ca.h - cb.h)
      || cb.L - ca.L
      || textOrder(ca.rgba, cb.rgba)
      || tie(a.token, b.token)
      || textOrder(a.token.id, b.token.id)
  }
}

function widthCandidates(count: number): number[] {
  const target = Math.sqrt(count)
  const limit = Math.min(MAX_WIDTH, count)
  const minimum = Math.min(4, count)
  const low = Math.max(minimum, Math.min(limit, Math.floor(target * 0.7)))
  const high = Math.max(low, Math.min(limit, Math.ceil(target * 1.3)))
  return Array.from({ length: high - low + 1 }, (_, index) => low + index)
}

function createPositionedTokens(
  tokens: readonly RelationshipToken[],
  colors: Map<string, PerceptualColor>,
  tie: (a: RelationshipToken, b: RelationshipToken) => number,
): PositionedToken[] {
  return tokens
    .map((token, initialIndex) => ({
      token,
      color: colorFor(colors, token),
      initialIndex,
      initialCol: 0,
      initialRow: 0,
    }))
    .sort(compareInitialEntries(tie))
}

function initialSequence(
  sorted: readonly PositionedToken[],
  tie: (a: RelationshipToken, b: RelationshipToken) => number,
  width: number,
): PositionedToken[] {
  const rowCompare = compareRowEntries(tie)
  const arranged: PositionedToken[] = []
  for (let start = 0; start < sorted.length; start += width) {
    arranged.push(...sorted.slice(start, start + width).sort(rowCompare))
  }
  return arranged.map((entry, index) => ({
    ...entry,
    initialCol: index % width,
    initialRow: Math.floor(index / width),
  }))
}

function neighborOffsets(width: number, count: number): WeightedOffset[] {
  const offsets: WeightedOffset[] = [{ offset: 1, weight: 1 }]
  // A one-row map has no distinct vertical neighbor. Diagonals that wrap
  // directly back to the same token are likewise not useful edges.
  if (width !== count) offsets.push({ offset: width, weight: 1 })
  for (const offset of [width - 1, width + 1]) {
    if (offset > 0 && offset % count !== 0) offsets.push({ offset, weight: DIAGONAL_WEIGHT })
  }
  return offsets
}

function buildLayoutGraph(width: number, count: number): LayoutGraph {
  const edgeWeights = new Map<number, number>()
  for (const { offset, weight } of neighborOffsets(width, count)) {
    for (let index = 0; index < count; index++) {
      const other = mod(index + offset, count)
      if (other === index) continue
      const a = Math.min(index, other)
      const b = Math.max(index, other)
      const key = a * count + b
      edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + weight)
    }
  }

  const edges: Edge[] = []
  const neighbors: WeightedNeighbor[][] = Array.from({ length: count }, () => [])
  for (const [key, weight] of edgeWeights) {
    const a = Math.floor(key / count)
    const b = key - a * count
    edges.push({ a, b, weight })
    neighbors[a].push({ index: b, weight })
    neighbors[b].push({ index: a, weight })
  }
  return { edges, neighbors }
}

function buildDistanceLookup(sequence: readonly PositionedToken[]): Float64Array | undefined {
  const count = sequence.length
  if (count > SMALL_EXHAUSTIVE_LIMIT) return undefined
  const distances = new Float64Array(count * count)
  for (let i = 0; i < count - 1; i++) {
    const ci = sequence[i].color
    const rowOffset = sequence[i].initialIndex * count
    for (let j = i + 1; j < count; j++) {
      const distance = spatialColorDistance(ci, sequence[j].color)
      const a = rowOffset + sequence[j].initialIndex
      const b = sequence[j].initialIndex * count + sequence[i].initialIndex
      distances[a] = distance
      distances[b] = distance
    }
  }
  return distances
}

function colorDistance(a: PositionedToken, b: PositionedToken, distances: Float64Array | undefined, count: number): number {
  return distances ? distances[a.initialIndex * count + b.initialIndex] : spatialColorDistance(a.color, b.color)
}

function edgeEnergy(sequence: readonly PositionedToken[], graph: LayoutGraph, distances: Float64Array | undefined): number {
  const count = sequence.length
  let energy = 0
  for (const { a, b, weight } of graph.edges) {
    energy += weight * colorDistance(sequence[a], sequence[b], distances, count)
  }
  return energy
}

function chooseInitialSequence(
  sorted: readonly PositionedToken[],
  tie: (a: RelationshipToken, b: RelationshipToken) => number,
  distances: Float64Array | undefined,
) {
  let bestWidth = 1
  let bestSequence: PositionedToken[] = []
  let bestScore = Infinity
  const target = Math.sqrt(sorted.length)
  for (const width of widthCandidates(sorted.length)) {
    const sequence = initialSequence(sorted, tie, width)
    const graph = buildLayoutGraph(width, sorted.length)
    const height = Math.ceil(sorted.length / width)
    const score = edgeEnergy(sequence, graph, distances) + 0.02 * Math.abs(width - height) / Math.max(1, target)
    if (score < bestScore) {
      bestScore = score
      bestWidth = width
      bestSequence = sequence
    }
  }
  return { width: bestWidth, sequence: bestSequence }
}

function anchorPenalty(entry: PositionedToken, index: number, width: number, height: number): number {
  const col = index % width
  const row = Math.floor(index / width)
  const dx = (col - entry.initialCol) / Math.max(1, width - 1)
  const dy = (row - entry.initialRow) / Math.max(1, height - 1)
  return ANCHOR_WEIGHT * (dx * dx + dy * dy)
}

function deltaSwap(
  sequence: readonly PositionedToken[],
  graph: LayoutGraph,
  distances: Float64Array | undefined,
  width: number,
  height: number,
  i: number,
  j: number,
): number {
  const entryI = sequence[i], entryJ = sequence[j]
  const count = sequence.length
  let before = anchorPenalty(entryI, i, width, height) + anchorPenalty(entryJ, j, width, height)
  let after = anchorPenalty(entryI, j, width, height) + anchorPenalty(entryJ, i, width, height)

  for (const { index, weight } of graph.neighbors[i]) {
    if (index === j) continue
    const neighbor = sequence[index]
    before += weight * colorDistance(entryI, neighbor, distances, count)
    after += weight * colorDistance(entryJ, neighbor, distances, count)
  }
  for (const { index, weight } of graph.neighbors[j]) {
    if (index === i) continue
    const neighbor = sequence[index]
    before += weight * colorDistance(entryJ, neighbor, distances, count)
    after += weight * colorDistance(entryI, neighbor, distances, count)
  }
  return after - before
}

function boundedCandidates(index: number, width: number, count: number): number[] {
  const offsets = new Set<number>()
  for (let delta = 1; delta <= Math.min(count - 1, Math.max(12, width * 3)); delta++) offsets.add(delta)
  for (const base of [width, width - 1, width + 1, width * 2, width * 2 - 1, width * 2 + 1, width * 3]) {
    for (const delta of [-2, -1, 0, 1, 2]) {
      const offset = base + delta
      if (offset > 0 && offset < count) offsets.add(offset)
    }
  }
  return [...offsets]
    .flatMap(offset => [mod(index + offset, count), mod(index - offset, count)])
    .filter(candidate => candidate !== index)
}

function canSwap(a: PositionedToken, b: PositionedToken): boolean {
  return a.color.rgba !== b.color.rgba && isAlpha(a.color) === isAlpha(b.color)
}

function optimize(sequence: PositionedToken[], graph: LayoutGraph, distances: Float64Array | undefined, width: number): void {
  const count = sequence.length
  if (count < 3) return
  const height = Math.ceil(count / width)
  for (let pass = 0; pass < PASSES; pass++) {
    let changed = false
    for (let i = 0; i < count - 1; i++) {
      let bestJ = -1
      let bestDelta = -IMPROVEMENT_EPSILON
      if (count <= SMALL_EXHAUSTIVE_LIMIT) {
        for (let j = i + 1; j < count; j++) {
          if (!canSwap(sequence[i], sequence[j])) continue
          const delta = deltaSwap(sequence, graph, distances, width, height, i, j)
          if (delta < bestDelta) {
            bestDelta = delta
            bestJ = j
          }
        }
      } else {
        for (const j of boundedCandidates(i, width, count)) {
          if (j <= i || !canSwap(sequence[i], sequence[j])) continue
          const delta = deltaSwap(sequence, graph, distances, width, height, i, j)
          if (delta < bestDelta) {
            bestDelta = delta
            bestJ = j
          }
        }
      }
      if (bestJ >= 0) {
        const next = sequence[i]
        sequence[i] = sequence[bestJ]
        sequence[bestJ] = next
        changed = true
      }
    }
    if (!changed) break
  }
}

function spatialGroup(placements: readonly TokenPlacement[], width: number, height: number): LayoutGroup {
  let col = width, row = height, right = 0, bottom = 0
  const tokenIds: string[] = []
  for (const placement of placements) {
    tokenIds.push(placement.token.id)
    col = Math.min(col, placement.col)
    row = Math.min(row, placement.row)
    right = Math.max(right, placement.col + 1)
    bottom = Math.max(bottom, placement.row + 1)
  }
  return {
    label: 'Spatial color map',
    start: 0,
    count: placements.length,
    tokenIds,
    col,
    row,
    width: right - col,
    height: bottom - row,
  }
}

/**
 * Dense 2D color geography for the infinite ribbon sampler. Every token appears
 * exactly once in row-major order; consumers still repeat with
 * mod(row * width + col, count), so prime counts and short final rows receive no
 * padding. The local optimizer is deliberately bounded and approximate: it
 * reduces repeated-grid neighbor discontinuities while a small anchor penalty
 * preserves the initial lightness-down / hue-across map and repeat seams can
 * still expose unavoidable jumps.
 */
export function buildSpatialColorLayout(
  tokens: readonly RelationshipToken[],
  colors: Map<string, PerceptualColor>,
  tie: (a: RelationshipToken, b: RelationshipToken) => number,
): TokenLayout {
  const count = tokens.length
  if (!count) return { placements: [], groups: [], width: 1, height: 1, count: 0 }

  const sorted = createPositionedTokens(tokens, colors, tie)
  const distances = buildDistanceLookup(sorted)
  const { width, sequence } = chooseInitialSequence(sorted, tie, distances)
  const graph = buildLayoutGraph(width, count)
  optimize(sequence, graph, distances, width)
  const height = Math.ceil(count / width)
  const placements: TokenPlacement[] = sequence.map(({ token }, index) => ({
    token,
    index,
    col: index % width,
    row: Math.floor(index / width),
  }))
  return { placements, groups: [spatialGroup(placements, width, height)], width, height, count }
}
