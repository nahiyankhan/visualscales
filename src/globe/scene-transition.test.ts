import { expect, it } from 'vitest'
import { createSceneTransition, sampleSceneTransition } from './scene-transition.js'
import type { MeshCard } from './mesh-renderer.js'

const token = { id: 'a', name: 'a', light: '#5D61CA', layer: 'primitive' }
it('retains token faces while position and sphere projection unfold, then removes duplicate occurrences', () => {
  const from: MeshCard[] = [{ token, x: 0, y: 0 }, { token, x: 900, y: 0 }]
  const to: MeshCard[] = [{ token, x: 100, y: 200, flatness: 1, scale: 1, prominence: 1 }]
  const transition = createSceneTransition(from, to, 0)
  const middle = sampleSceneTransition(transition, 140)
  expect(middle.cards.every(card => card.token === token)).toBe(true)
  expect(middle.cards[0].flatness).toBeGreaterThan(0)
  expect(middle.cards[0].flatness).toBeLessThan(1)
  const settled = sampleSceneTransition(transition, 280)
  expect(settled.cards).toBe(to)
  expect(settled.cards).toHaveLength(1)
})
it('reverses and retargets from live mesh coordinates rather than restarting at the sphere', () => {
  const flat: MeshCard = { token, x: 100, y: 200, flatness: 1 }
  const sphere: MeshCard = { token, x: -200, y: 0 }
  const middle = sampleSceneTransition(createSceneTransition([flat], [sphere], 0), 140)
  const retarget = sampleSceneTransition(createSceneTransition(middle.cards, [flat], 140), 140)
  expect(retarget.cards[0].x).toBe(middle.cards[0].x)
  expect(retarget.cards[0].flatness).toBe(middle.cards[0].flatness)
})
