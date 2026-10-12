import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAMERA,
  MAX_SCALE,
  MIN_SCALE,
  constrain,
  glide,
  makeTicks,
  pan,
  project,
  unproject,
  visibleRange,
  zoomAt,
} from './camera.js'

describe('Visual Scales space camera', () => {
  it('projects an honest linear measurement axis and opens on a local stretch', () => {
    const camera = DEFAULT_CAMERA
    expect(project(16, camera, 1440)).toBe(720)
    expect(project(24, camera, 1440) - project(16, camera, 1440)).toBe(
      8 * camera.scale
    )
    expect(unproject(project(21.375, camera, 390), camera, 390)).toBeCloseTo(
      21.375
    )
    expect(visibleRange(camera, 1440)).toEqual({ min: 0, max: 40 })
  })
  it('anchors zoom precisely to the cursor at every unconstrained camera', () => {
    for (const width of [390, 1440])
      for (const x of [0, width * 0.3, width])
        for (const factor of [0.5, 2, 100]) {
          const camera = { center: 400, scale: 20 }
          const value = unproject(x, camera, width)
          const next = zoomAt(camera, factor, x, width)
          expect(project(value, next, width)).toBeCloseTo(x)
          expect(next.scale).toBeLessThanOrEqual(MAX_SCALE)
        }
  })
  it('pan is 1:1 screen movement and never invents negative length tokens', () => {
    const camera = { center: 400, scale: 20 }
    const next = pan(camera, 130)
    expect(project(400, next, 1440) - project(400, camera, 1440)).toBe(130)
    expect(constrain({ center: -100, scale: 0 })).toEqual({
      center: 0,
      scale: MIN_SCALE,
    })
    expect(constrain({ center: 5000, scale: 2000 })).toEqual({
      center: 1200,
      scale: MAX_SCALE,
    })
  })
  it('tick graduations stay bounded, positive, and correctly positioned at all zooms', () => {
    for (const scale of [MIN_SCALE, 1, 30, 100, MAX_SCALE]) {
      const camera = { center: 100, scale }
      const ticks = makeTicks(camera, 1440)
      expect(ticks.length).toBeLessThan(100)
      for (const tick of ticks) {
        expect(tick.value).toBeGreaterThanOrEqual(0)
        expect(tick.x).toBeCloseTo(project(tick.value, camera, 1440))
      }
      expect(ticks.some((tick) => tick.major)).toBe(true)
    }
  })
  it('inertia matches across frame rates and terminates at the navigation bound', () => {
    const camera = { center: 400, scale: 30 }
    const whole = glide(camera, 600, 0.1)
    const first = glide(camera, 600, 0.05)
    const second = glide(first.camera, first.velocity, 0.05)
    expect(second.camera.center).toBeCloseTo(whole.camera.center)
    expect(second.velocity).toBeCloseTo(whole.velocity)
    expect(glide({ center: 0, scale: 30 }, 600, 0.1).velocity).toBe(0)
  })
})
