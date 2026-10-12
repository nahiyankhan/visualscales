export const COLLECTION_MIN_ZOOM = 0.65
export const COLLECTION_MAX_ZOOM = 3

export type CollectionCamera = { x: number; y: number; zoom: number }
export type CollectionPoint = { x: number; y: number }
export type CollectionProjectionMetrics = { radius: number; perspective: number }

const HORIZON_ANGLE = 1.25

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clampZoom(zoom: number) {
  return Math.max(COLLECTION_MIN_ZOOM, Math.min(COLLECTION_MAX_ZOOM, finiteOr(zoom, 1)))
}

/**
 * Inverts the same spherical perspective projection used by the mesh renderer.
 * Screen coordinates are centered CSS pixels. Points outside the safe front
 * patch return the sphere center so zoom anchoring remains finite and calm.
 */
export function collectionProjection(point: CollectionPoint, metrics: CollectionProjectionMetrics): CollectionPoint {
  const sx = finiteOr(point.x, 0)
  const sy = finiteOr(point.y, 0)
  const radius = finiteOr(metrics.radius, 0)
  const perspective = finiteOr(metrics.perspective, 0)
  if (radius <= 0 || perspective <= 0) return { x: 0, y: 0 }

  const a = sx * sx + sy * sy + perspective * perspective
  const b = -2 * perspective * (perspective + radius)
  const c = perspective * perspective + 2 * perspective * radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0 || a === 0) return { x: 0, y: 0 }

  const t = (-b - Math.sqrt(discriminant)) / (2 * a)
  const longitude = Math.atan2(t * sx, perspective - t * perspective + radius)
  const latitude = Math.asin(Math.max(-1, Math.min(1, t * sy / radius)))
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return { x: 0, y: 0 }
  if (Math.abs(longitude) > HORIZON_ANGLE || Math.abs(latitude) > HORIZON_ANGLE) return { x: 0, y: 0 }

  return { x: longitude * radius, y: latitude * radius }
}

export function zoomCollectionAt(
  camera: CollectionCamera,
  factor: number,
  point: CollectionPoint,
  metrics: CollectionProjectionMetrics,
): CollectionCamera {
  if (!Number.isFinite(factor) || factor <= 0) return camera
  const x = finiteOr(camera.x, 0)
  const y = finiteOr(camera.y, 0)
  const zoom = clampZoom(camera.zoom)

  const requestedZoom = zoom * factor
  const nextZoom = clampZoom(requestedZoom)
  if (nextZoom === zoom) return { x, y, zoom }

  const oldProjection = collectionProjection(point, {
    radius: metrics.radius * zoom,
    perspective: metrics.perspective * zoom,
  })
  const nextProjection = collectionProjection(point, {
    radius: metrics.radius * nextZoom,
    perspective: metrics.perspective * nextZoom,
  })
  const ratio = nextZoom / zoom

  return {
    x: nextProjection.x - (oldProjection.x - x) * ratio,
    y: nextProjection.y - (oldProjection.y - y) * ratio,
    zoom: nextZoom,
  }
}
