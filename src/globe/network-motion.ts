import type { NetworkEdge } from './relationship-network.js'

export const LINK_GROW_MS = 220

/** Reveal away from the selection, including backwards up its ancestor chain.
 * This changes drawing direction only; actual source/target edges stay intact. */
export function linkRevealPlan(edges: readonly NetworkEdge[], selectedId: string) {
  const distance = new Map([[selectedId, 0]])
  const neighbors = new Map<string, string[]>()
  for (const edge of edges) {
    neighbors.set(edge.source, [...(neighbors.get(edge.source) ?? []), edge.target])
    neighbors.set(edge.target, [...(neighbors.get(edge.target) ?? []), edge.source])
  }
  const queue = [selectedId]
  for (let i = 0; i < queue.length; i++) {
    for (const id of neighbors.get(queue[i]) ?? []) {
      if (distance.has(id)) continue
      distance.set(id, distance.get(queue[i])! + 1)
      queue.push(id)
    }
  }
  return new Map(edges.map(edge => {
    const source = distance.get(edge.source) ?? 0, target = distance.get(edge.target) ?? 0
    return [edge.id, { reverse: source > target, delay: Math.min(source, target) * LINK_GROW_MS }]
  }))
}

export const NETWORK_MIN_SCALE = .005
export const NETWORK_MAX_SCALE = 3.5

export type NetworkCamera = { x: number; y: number; scale: number }
/** Keep the graph coordinate under the cursor/pinch midpoint stationary. */
export function zoomNetworkAt(camera: NetworkCamera, factor: number, point: { x: number; y: number }): NetworkCamera {
  const scale = Math.max(NETWORK_MIN_SCALE, Math.min(NETWORK_MAX_SCALE, camera.scale * factor))
  const ratio = scale / camera.scale
  return { scale, x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio }
}
