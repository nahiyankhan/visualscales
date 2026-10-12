import { describe, expect, it } from 'vitest'
import { LINK_GROW_MS, linkRevealPlan, zoomNetworkAt } from './network-motion.js'

const edges = [
  { id: 'root-parent', source: 'root', target: 'parent' },
  { id: 'parent-selected', source: 'parent', target: 'selected' },
  { id: 'selected-child', source: 'selected', target: 'child' },
  { id: 'child-leaf', source: 'child', target: 'leaf' },
]
describe('selection-origin link growth', () => {
  it('starts at the selected token and propagates one hop at a time in both directions', () => {
    const plan = linkRevealPlan(edges, 'selected')
    expect(plan.get('parent-selected')).toEqual({ reverse: true, delay: 0 })
    expect(plan.get('selected-child')).toEqual({ reverse: false, delay: 0 })
    expect(plan.get('root-parent')).toEqual({ reverse: true, delay: LINK_GROW_MS })
    expect(plan.get('child-leaf')).toEqual({ reverse: false, delay: LINK_GROW_MS })
  })
  it('terminates with cycles and leaves actual directed relationships untouched', () => {
    const cycle = [...edges, { id: 'back', source: 'leaf', target: 'root' }]
    expect(linkRevealPlan(cycle, 'selected').size).toBe(cycle.length)
    expect(cycle[0].source).toBe('root')
  })
})
describe('pointer-anchored network zoom', () => {
  it('keeps the graph coordinate underneath an arbitrary pointer stationary', () => {
    const camera = { x: -200, y: 90, scale: .76 }, point = { x: 123, y: -80 }
    const next = zoomNetworkAt(camera, 1.5, point)
    expect((point.x - next.x) / next.scale).toBeCloseTo((point.x - camera.x) / camera.scale)
    expect((point.y - next.y) / next.scale).toBeCloseTo((point.y - camera.y) / camera.scale)
  })
  it('zooms smoothly out of the full-collection overview without jumping to a reading scale', () => {
    const next = zoomNetworkAt({ x: -20, y: -350, scale: .02 }, 1.2, { x: 0, y: 0 })
    expect(next.scale).toBeCloseTo(.024)
    expect(next.y).toBeCloseTo(-420)
  })
  it('clamps scale without drifting the anchor at either zoom limit', () => {
    for (const factor of [1e-8, 1e8]) {
      const next = zoomNetworkAt({ x: 10, y: -20, scale: 1 }, factor, { x: 100, y: 200 })
      expect(next.scale).toBe(factor < 1 ? .005 : 3.5)
      expect((100 - next.x) / next.scale).toBeCloseTo(90)
    }
  })
})
