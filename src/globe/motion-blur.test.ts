import { describe, expect, it } from 'vitest'
import { createBlur, blurActive, MAX_BLUR_PX, resetBlur, stepBlur, velocityBlur } from './motion-blur.js'

describe('peripheral motion softness', () => {
  it('keeps precise movements sharp and scales with speed', () => {
    expect(velocityBlur(0, 0)).toEqual(createBlur())
    expect(velocityBlur(60, 40)).toEqual(createBlur())
    expect(velocityBlur(200, 0).x).toBeLessThan(velocityBlur(1800, 0).x)
    expect(velocityBlur(-1800, 0).x).toBe(-velocityBlur(1800, 0).x)
    const diagonal = velocityBlur(10000, 10000)
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeLessThanOrEqual(MAX_BLUR_PX)
  })
  it('gives an ordinary 500px/s pan a visible trail without saturating', () => {
    expect(velocityBlur(500, 0).x).toBeGreaterThan(12)
    expect(velocityBlur(500, 0).x).toBeLessThan(16)
    expect(velocityBlur(1800, 0).x).toBeGreaterThan(22)
  })
  it('is frame-rate independent', () => {
    const results = [30, 60, 120].map(hz => {
      const state = createBlur()
      for (let i = 0; i < hz; i++) stepBlur(state, { x: 6, y: -4 }, 1 / hz)
      return state
    })
    for (const state of results) {
      expect(state.x).toBeCloseTo(results[0].x, 10)
      expect(state.y).toBeCloseTo(results[0].y, 10)
    }
  })
  it('clears promptly to exact zero without ringing', () => {
    const state = { x: 10, y: 0 }
    let previous = state.x
    for (let i = 0; i < 20; i++) {
      stepBlur(state, createBlur(), 1 / 60)
      expect(state.x).toBeLessThanOrEqual(previous)
      expect(state.x).toBeGreaterThanOrEqual(0)
      previous = state.x
    }
    expect(state).toEqual(createBlur())
    expect(blurActive(state)).toBe(false)
  })
  it('clears immediately for reduced motion, reset, and keyboard input', () => {
    const state = { x: 4, y: 7 }
    resetBlur(state)
    expect(state).toEqual(createBlur())
  })
})
