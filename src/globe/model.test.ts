import { describe, expect, it } from 'vitest'
import { CARD_WIDTH, CARD_HEIGHT, STEP_X, STEP_Y, gridMetrics, inkFor, mod, project, wrap } from './model.js'
import { MESH_COLUMNS, MESH_ROWS, SEARCH_DIM_PROMINENCE, SELECTION_DIM_PROMINENCE, VERTEX_SHADER } from './mesh-renderer.js'

describe('infinite spherical grid', () => {
  it('leaves an 8px gap between cards on both axes', () => {
    expect(STEP_X - CARD_WIDTH).toBe(8)
    expect(STEP_Y - CARD_HEIGHT).toBe(8)
  })
  it('wraps signed offsets consistently across either seam', () => {
    expect(wrap(0, 100)).toBe(0)
    expect(wrap(51, 100)).toBe(-49)
    expect(wrap(-51, 100)).toBe(49)
    expect(wrap(10051, 100)).toBe(-49)
    expect(mod(-1, 514)).toBe(513)
  })
  it('keeps the center flat and recedes subtly and symmetrically along the larger sphere', () => {
    expect(project(0, 0, 2600)).toEqual({ x: 0, y: 0, z: 0, latitude: 0, longitude: 0 })
    const oldRight = project(600, 0, 1300)
    const left = project(-600, 0, 2600), right = project(600, 0, 2600)
    expect(left.x).toBe(-right.x)
    expect(left.z).toBe(right.z)
    expect(right.z).toBeLessThan(0)
    expect(Math.abs(right.z)).toBeLessThan(Math.abs(oldRight.z) * 0.55)
    const point = project(500, 300, 2600)
    expect(Math.hypot(point.x, point.y, point.z + 2600)).toBeCloseTo(2600)
  })
  it.each([[390, 844], [1440, 1000], [2560, 1440]])('sizes a bounded pool for %ix%i, with symmetric overscan', (width, height) => {
    const metrics = gridMetrics(width, height)
    expect(metrics.rows % 2).toBe(0)
    expect(metrics.columns * metrics.rows).toBeLessThan(514)
    expect(metrics.radius).toBeGreaterThanOrEqual(Math.max(2600, width * 2.6, height * 3))
  })
  it('keeps every mesh vertex, including corners, on one sphere at different positions', () => {
    for (const radius of [1300, 1872, 3328]) {
      for (const [cx, cy, scale] of [[0, 0, 1], [650, -400, 1], [-450, 280, 0.76]]) {
        for (let row = 0; row <= MESH_ROWS; row++) {
          for (let col = 0; col <= MESH_COLUMNS; col++) {
            const p = project(cx + (col / MESH_COLUMNS - 0.5) * CARD_WIDTH * scale, cy + (row / MESH_ROWS - 0.5) * CARD_HEIGHT * scale, radius)
            expect(Math.hypot(p.x, p.y, p.z + radius)).toBeCloseTo(radius, 8)
          }
        }
      }
    }
    // Motion softness belongs exclusively to the postprocess, never geometry.
    expect(VERTEX_SHADER).toContain('vec2 world = uCenter + aLocal * uScale;')
    expect(VERTEX_SHADER).not.toMatch(/uFlex|uBlur|uMotion|uVelocity/)

  })
  it('dims non-neighborhood cards harder during selection than during search', () => {
    expect(SELECTION_DIM_PROMINENCE).toBeLessThan(SEARCH_DIM_PROMINENCE)
    expect(SELECTION_DIM_PROMINENCE).toBeLessThanOrEqual(0.25)
  })
  it('handles transparency over the light checkerboard', () => {
    expect(inkFor('#242A35')).toBe('#ffffff')
    expect(inkFor('#F4F5F8')).toBe('#111213')
    expect(inkFor('#315BE8')).toBe('#ffffff')
    expect(inkFor('#00000000')).toBe('#111213')
    expect(inkFor('#fff')).toBe('#111213')
  })
})
