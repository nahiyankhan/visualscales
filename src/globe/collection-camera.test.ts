import { describe, expect, it } from 'vitest'
import { projectMeshPoint } from './mesh-projection.js'
import {
  COLLECTION_MAX_ZOOM,
  COLLECTION_MIN_ZOOM,
  type CollectionCamera,
  collectionProjection,
  zoomCollectionAt,
} from './collection-camera.js'

const metrics = { radius: 2600, perspective: 1800 }
const toScreen = (world: { x: number; y: number }, camera: CollectionCamera) =>
  projectMeshPoint(world.x * camera.zoom + camera.x, world.y * camera.zoom + camera.y, metrics.radius * camera.zoom, metrics.perspective * camera.zoom)

function expectClosePoint(actual: { x: number; y: number }, expected: { x: number; y: number }, digits = 8) {
  expect(actual.x).toBeCloseTo(expected.x, digits)
  expect(actual.y).toBeCloseTo(expected.y, digits)
}

describe('collection camera zoom support', () => {
  it('inverts the mesh projection on the safe front patch', () => {
    const unrolled = { x: 520, y: -240 }
    const screen = projectMeshPoint(unrolled.x, unrolled.y, metrics.radius, metrics.perspective)
    expectClosePoint(collectionProjection(screen, metrics), unrolled)
  })

  it('keeps the requested screen anchor exact before and after zoom', () => {
    const camera = { x: -140, y: 90, zoom: 1.2 }
    const world = { x: 430, y: -160 }
    const anchor = toScreen(world, camera)
    const next = zoomCollectionAt(camera, 1.35, anchor, metrics)
    expect(next.zoom).toBeCloseTo(1.62)
    expectClosePoint(toScreen(world, next), anchor, 7)
  })

  it('anchors the final change into a limit, then leaves the camera still at that limit', () => {
    for (const [camera, factor, limit] of [
      [{ x: 32, y: -48, zoom: 2.8 }, 2, COLLECTION_MAX_ZOOM],
      [{ x: -12, y: 8, zoom: 0.8 }, 0.5, COLLECTION_MIN_ZOOM],
    ] as const) {
      const world = { x: 70, y: -30 }
      const anchor = toScreen(world, camera)
      const next = zoomCollectionAt(camera, factor, anchor, metrics)
      expect(next.zoom).toBe(limit)
      expectClosePoint(toScreen(world, next), anchor, 7)
      expect(zoomCollectionAt(next, factor, anchor, metrics)).toEqual(next)
    }
  })

  it('stays at min and max under repeated zoom requests', () => {
    let camera = { x: 5, y: 6, zoom: 1 }
    for (let i = 0; i < 12; i++) camera = zoomCollectionAt(camera, 2, { x: 80, y: -40 }, metrics)
    expect(camera.zoom).toBe(COLLECTION_MAX_ZOOM)
    const atMax = camera
    expect(zoomCollectionAt(camera, 2, { x: 80, y: -40 }, metrics)).toEqual(atMax)

    for (let i = 0; i < 12; i++) camera = zoomCollectionAt(camera, 0.5, { x: 80, y: -40 }, metrics)
    expect(camera.zoom).toBe(COLLECTION_MIN_ZOOM)
    const atMin = camera
    expect(zoomCollectionAt(camera, 0.5, { x: 80, y: -40 }, metrics)).toEqual(atMin)
  })

  it('is reversible for reciprocal factors while inside the zoom range', () => {
    const camera = { x: 27, y: -33, zoom: 1.1 }
    const point = { x: -210, y: 140 }
    const zoomed = zoomCollectionAt(camera, 1.4, point, metrics)
    const restored = zoomCollectionAt(zoomed, 1 / 1.4, point, metrics)
    expectClosePoint(restored, camera)
    expect(restored.zoom).toBeCloseTo(camera.zoom, 12)
  })

  it('ignores invalid factors and safely normalizes invalid camera values', () => {
    const camera = { x: 4, y: -9, zoom: 1.25 }
    expect(zoomCollectionAt(camera, Number.NaN, { x: 20, y: 30 }, metrics)).toEqual(camera)
    expect(zoomCollectionAt(camera, 0, { x: 20, y: 30 }, metrics)).toEqual(camera)
    const invalid = { x: Number.NaN, y: Infinity, zoom: Number.NaN }
    expect(zoomCollectionAt(invalid, 0, { x: 20, y: 30 }, metrics)).toEqual(invalid)
    expect(zoomCollectionAt(invalid, 1, { x: 20, y: 30 }, metrics)).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('uses a centered anchor when the screen point cannot be inverted', () => {
    const camera = { x: 10, y: 20, zoom: 1 }
    const next = zoomCollectionAt(camera, 1.2, { x: 100000, y: 100000 }, metrics)
    expect(next).toEqual({ x: 12, y: 24, zoom: 1.2 })
  })
})
