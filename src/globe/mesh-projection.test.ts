import { describe, expect, it } from 'vitest'
import { project } from './model.js'
import { projectMeshPoint } from './mesh-projection.js'

describe('mesh projection', () => {
  it('matches the original spherical projection at flatness 0', () => {
    const radius = 2600
    const perspective = 1800
    for (const [x, y] of [[0, 0], [500, 300], [-650, 220], [900, -480]]) {
      const sphere = project(x, y, radius)
      const factor = perspective / (perspective - sphere.z)
      expect(projectMeshPoint(x, y, radius, perspective, 0)).toEqual({
        x: sphere.x * factor,
        y: sphere.y * factor,
      })
    }
  })

  it('uses unchanged centered viewport coordinates on the flat plane', () => {
    expect(projectMeshPoint(320, -180, 2600, 1800, 1)).toEqual({ x: 320, y: -180 })
    expect(projectMeshPoint(-75, 42, 2600, 1800, 1)).toEqual({ x: -75, y: 42 })
  })

  it('is continuous between sphere and flat projections', () => {
    const x = 780
    const y = -360
    const radius = 2600
    const perspective = 1800
    const before = projectMeshPoint(x, y, radius, perspective, 0.4)
    const after = projectMeshPoint(x, y, radius, perspective, 0.4001)
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.1)
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.1)
  })
})
