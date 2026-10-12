import { CARD_HEIGHT, CARD_WIDTH, STEP_X, STEP_Y, project } from './model.js'
import type { MeshCard } from './mesh-renderer.js'
import { lineage, type RelationshipIndex, type RelationshipToken } from './relationships.js'

export type ConnectorPoint = { x: number; y: number }
export type ConnectorGeometry = {
  id: string
  from: string
  to: string
  description: string
  points: ConnectorPoint[]
  screenPoints: ConnectorPoint[]
  intersections: number
}

type Rect = { id: string; left: number; right: number; top: number; bottom: number }
type Metrics = { scale: number; radius: number; perspective: number; width: number; height: number }

const GAP_X = (STEP_X - CARD_WIDTH) / 2
const GAP_Y = (STEP_Y - CARD_HEIGHT) / 2
const EPSILON = 0.5

function cardRect(card: MeshCard, scale: number): Rect {
  const halfW = CARD_WIDTH * scale / 2
  const halfH = CARD_HEIGHT * scale / 2
  return { id: card.token.id, left: card.x - halfW, right: card.x + halfW, top: card.y - halfH, bottom: card.y + halfH }
}

function occurrence(cards: readonly MeshCard[], id: string, origin: ConnectorPoint): MeshCard | undefined {
  return cards.filter(card => card.token.id === id)
    .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0]
}

function compact(points: ConnectorPoint[]): ConnectorPoint[] {
  const output: ConnectorPoint[] = []
  for (const point of points) {
    const prior = output.at(-1)
    if (prior && Math.hypot(prior.x - point.x, prior.y - point.y) < EPSILON) continue
    output.push(point)
  }
  return output
}

function segmentIntersectsRect(a: ConnectorPoint, b: ConnectorPoint, rect: Rect) {
  const left = rect.left - 1, right = rect.right + 1, top = rect.top - 1, bottom = rect.bottom + 1
  if ((a.x <= left && b.x <= left) || (a.x >= right && b.x >= right) || (a.y <= top && b.y <= top) || (a.y >= bottom && b.y >= bottom)) return false
  if (a.x >= left && a.x <= right && a.y >= top && a.y <= bottom) return true
  if (b.x >= left && b.x <= right && b.y >= top && b.y <= bottom) return true
  // Routes are axis-aligned in surface space.
  if (Math.abs(a.x - b.x) < EPSILON) return a.x > left && a.x < right && Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom)
  if (Math.abs(a.y - b.y) < EPSILON) return a.y > top && a.y < bottom && Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right)
  return false
}

export function countRouteIntersections(points: readonly ConnectorPoint[], rects: readonly Rect[], excludeIds: ReadonlySet<string>) {
  let count = 0
  for (let i = 1; i < points.length; i++) {
    for (const rect of rects) {
      if (!excludeIds.has(rect.id) && segmentIntersectsRect(points[i - 1], points[i], rect)) count++
    }
  }
  return count
}

function routeBetween(source: MeshCard, target: MeshCard, cards: readonly MeshCard[], scale: number): { points: ConnectorPoint[]; intersections: number } {
  const direction = target.x >= source.x ? 1 : -1
  const halfW = CARD_WIDTH * scale / 2
  const start = { x: source.x + direction * halfW, y: source.y }
  const end = { x: target.x - direction * halfW, y: target.y }
  const rects = cards.map(card => cardRect(card, scale))
  const exclude = new Set([source.token.id, target.token.id])
  const sameRow = Math.abs(source.y - target.y) < EPSILON
  const adjacentGap = Math.abs(end.x - start.x) <= (STEP_X - CARD_WIDTH) * scale * 1.5
  if (sameRow && adjacentGap) {
    const direct = compact([start, end])
    return { points: direct, intersections: countRouteIntersections(direct, rects, exclude) }
  }

  const sourceGapX = source.x + direction * (CARD_WIDTH / 2 + GAP_X) * scale
  const targetGapX = target.x - direction * (CARD_WIDTH / 2 + GAP_X) * scale
  const rowStep = STEP_Y * scale
  const candidates = [...new Set([
    target.y + (target.y > source.y ? -1 : 1) * (CARD_HEIGHT / 2 + GAP_Y) * scale,
    source.y - (CARD_HEIGHT / 2 + GAP_Y) * scale,
    source.y + (CARD_HEIGHT / 2 + GAP_Y) * scale,
    Math.min(source.y, target.y) - rowStep / 2,
    Math.max(source.y, target.y) + rowStep / 2,
  ].map(value => Math.round(value * 1000) / 1000))]

  let best = { points: [] as ConnectorPoint[], intersections: Infinity, length: Infinity }
  for (const laneY of candidates) {
    const points = compact([
      start,
      { x: sourceGapX, y: source.y },
      { x: sourceGapX, y: laneY },
      { x: targetGapX, y: laneY },
      { x: targetGapX, y: target.y },
      end,
    ])
    const intersections = countRouteIntersections(points, rects, exclude)
    const length = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0)
    if (intersections < best.intersections || (intersections === best.intersections && length < best.length)) best = { points, intersections, length }
  }
  return best
}

function screenPoint(point: ConnectorPoint, metrics: Metrics): ConnectorPoint {
  const p = project(point.x, point.y, metrics.radius)
  const factor = metrics.perspective / (metrics.perspective - p.z)
  return { x: metrics.width / 2 + p.x * factor, y: metrics.height / 2 + p.y * factor }
}

// A straight segment in unrolled space becomes curved after projection.
// Tessellate it like the cards, rather than joining only projected corners.
function projectRoute(points: ConnectorPoint[], metrics: Metrics): ConnectorPoint[] {
  const samples: ConnectorPoint[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12))
    if (i === 1) samples.push(screenPoint(a, metrics))
    for (let step = 1; step <= steps; step++) {
      const t = step / steps
      samples.push(screenPoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, metrics))
    }
  }
  return samples
}

function alphaText(token: RelationshipToken) {
  return token.alpha == null ? '' : `, ${Math.round(token.alpha * 100)}% alpha modifier`
}

export function relationshipDescriptions(index: RelationshipIndex<RelationshipToken>, selectedId: string): string[] {
  const selected = index.byId.get(selectedId)
  if (!selected) return []
  const descriptions: string[] = []
  const { ancestors, descendants } = lineage(index, selected.id)
  let child = selected
  for (const parent of ancestors) {
    descriptions.push(`${parent.id} points to ${child.id}${alphaText(child)}.`)
    child = parent
  }
  const visible = new Set([selected.id, ...descendants.map(token => token.id)])
  for (const dependent of descendants) {
    const parent = index.sourceById.get(dependent.id)
    if (parent && visible.has(parent.id)) descriptions.push(`${parent.id} points to ${dependent.id}${alphaText(dependent)}.`)
  }
  return descriptions
}

export function buildConnectorGeometry(
  cards: readonly MeshCard[], index: RelationshipIndex<RelationshipToken>, selectedId: string, metrics: Metrics,
): ConnectorGeometry[] {
  const selected = occurrence(cards, selectedId, { x: 0, y: 0 })
  if (!selected) return []
  const output: ConnectorGeometry[] = []
  const usedTargets = new Set<string>()
  const add = (fromId: string, toId: string, description: string) => {
    if (fromId === toId || usedTargets.has(`${fromId}->${toId}`)) return
    const from = occurrence(cards, fromId, selected)
    const to = occurrence(cards, toId, selected)
    if (!from || !to) return
    // Match the mesh renderer's front-patch culling; never connect hidden back faces.
    if ([from, to].some(card => Math.abs(card.x / metrics.radius) > 1.25 || Math.abs(card.y / metrics.radius) > 1.25)) return
    usedTargets.add(`${fromId}->${toId}`)
    const routed = routeBetween(from, to, cards, metrics.scale)
    if (routed.intersections) return // Never disguise a blocked route by crossing a swatch.
    output.push({
      id: `${fromId}->${toId}`,
      from: fromId,
      to: toId,
      description,
      points: routed.points,
      screenPoints: projectRoute(routed.points, metrics),
      intersections: routed.intersections,
    })
  }

  const { ancestors, descendants } = lineage(index, selectedId)
  let child = index.byId.get(selectedId)
  for (const parent of ancestors) {
    if (child) add(parent.id, child.id, `${parent.id} source to ${child.id}${alphaText(child)}`)
    child = parent
  }
  const visible = new Set([selectedId, ...descendants.map(token => token.id)])
  for (const dependent of descendants) {
    const parent = index.sourceById.get(dependent.id)
    if (parent && visible.has(parent.id)) add(parent.id, dependent.id, `${parent.id} source to ${dependent.id}${alphaText(dependent)}`)
  }
  return output
}
