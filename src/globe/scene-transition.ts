import type { MeshCard } from './mesh-renderer.js'
import { easeOutCubic } from './transitions.js'

const value = (card: MeshCard, key: 'scale' | 'flatness' | 'prominence') => card[key] ?? (key === 'flatness' ? 0 : 1)
export function createSceneTransition(from: MeshCard[], to: MeshCard[], start: number) {
  const available = new Set(from)
  const flights = to.map(target => {
    const source = [...available].filter(card => card.token.id === target.token.id)
      .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0]
    if (source) available.delete(source)
    return { source: source ?? { ...target, x: target.x + 500, prominence: 0 }, target }
  })
  // Removed repeated family copies fade in place; no duplicate survives settling.
  for (const source of available) flights.push({ source, target: { ...source, prominence: 0 } })
  return { flights, to, start }
}
export function sampleSceneTransition(transition: ReturnType<typeof createSceneTransition>, now: number) {
  const t = Math.min(1, Math.max(0, (now - transition.start) / 280))
  if (t === 1) return { cards: transition.to, done: true }
  const ease = easeOutCubic(t)
  return { done: false, cards: transition.flights.map(({ source, target }) => ({
    token: target.token,
    x: source.x + (target.x - source.x) * ease,
    y: source.y + (target.y - source.y) * ease,
    scale: value(source, 'scale') + (value(target, 'scale') - value(source, 'scale')) * ease,
    flatness: value(source, 'flatness') + (value(target, 'flatness') - value(source, 'flatness')) * ease,
    prominence: value(source, 'prominence') + (value(target, 'prominence') - value(source, 'prominence')) * ease,
  })) }
}
