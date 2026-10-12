import { describe, expect, it } from 'vitest'

import type { GlobeToken } from './model.js'
import type { MeshCard } from './mesh-renderer.js'
import {
  TRANSITION_DURATION_MS,
  TRANSITION_MARGIN,
  createCardTransition,
  easeOutCubic,
  sampleCardTransition,
} from './transitions.js'

const token = (id: string): GlobeToken => ({ id, name: id, layer: 'core', light: '#808080' })

const card = (id: string, x: number, y: number): MeshCard => ({ token: token(id), x, y })

const T0 = 1000
const MID = T0 + TRANSITION_DURATION_MS / 2
const END = T0 + TRANSITION_DURATION_MS

describe('easeOutCubic', () => {
  it('is endpoint-exact and monotonic', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(-0.5)).toBe(0)
    expect(easeOutCubic(1.5)).toBe(1)
    let prev = 0
    for (let i = 1; i <= 20; i++) {
      const v = easeOutCubic(i / 20)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })
})

describe('endpoints', () => {
  it('starts exactly at from positions for matched cards', () => {
    const from = [card('a', 10, 20), card('b', 100, 200)]
    const to = [card('b', 150, 260), card('a', 0, 0)]
    const tr = createCardTransition(from, to, T0)
    const { cards, done } = sampleCardTransition(tr, T0)
    expect(done).toBe(false)
    const a = cards.find((c) => c.token.id === 'a')!
    const b = cards.find((c) => c.token.id === 'b')!
    expect([a.x, a.y]).toEqual([10, 20])
    expect([b.x, b.y]).toEqual([100, 200])
  })

  it('lands exactly on to: order, coordinates, and token references', () => {
    const from = [card('a', 10, 20), card('b', 100, 200), card('gone', 50, 50)]
    const to = [card('b', 150, 260), card('a', 0, 0), card('new', 300, 300)]
    const tr = createCardTransition(from, to, T0)
    const { cards, done } = sampleCardTransition(tr, END)
    expect(done).toBe(true)
    expect(cards).toHaveLength(to.length)
    cards.forEach((c, i) => {
      expect(c.token).toBe(to[i].token) // exact reference, exact order
      expect(c.x).toBe(to[i].x)
      expect(c.y).toBe(to[i].y)
    })
    // Well past the end stays settled on to.
    expect(sampleCardTransition(tr, END + 5000).cards).toEqual(to)
  })

  it('is immediately done when nothing moves', () => {
    const to = [card('a', 10, 20)]
    const tr = createCardTransition([card('a', 10, 20)], to, T0)
    const s = sampleCardTransition(tr, T0)
    expect(s.done).toBe(true)
    expect(s.cards).toEqual(to)
  })
})

describe('repeated token ids', () => {
  it('matches copies one-to-one by nearest distance', () => {
    // Two copies of the same id; each should slide to its near neighbour,
    // not swap across the surface.
    const from = [card('dup', 0, 0), card('dup', 1000, 0)]
    const to = [card('dup', 990, 0), card('dup', 20, 0)]
    const tr = createCardTransition(from, to, T0)
    const { cards } = sampleCardTransition(tr, MID)
    expect(cards).toHaveLength(2)
    // Nearest matching means every mid-flight copy sits within its own short
    // hop (max 20px), never on a ~1000px cross-court trajectory.
    for (const c of cards) {
      const nearOrigin = Math.abs(c.x - 0) <= 20 || Math.abs(c.x - 1000) <= 20
      expect(nearOrigin).toBe(true)
    }
  })

  it('handles unbalanced copy counts without duplicating matches', () => {
    const from = [card('dup', 0, 0)]
    const to = [card('dup', 10, 0), card('dup', 500, 0)]
    const tr = createCardTransition(from, to, T0)
    const start = sampleCardTransition(tr, T0).cards
    // The near copy starts at the old position; the extra copy enters from
    // outside the extents.
    const atOld = start.filter((c) => c.x === 0 && c.y === 0)
    expect(atOld).toHaveLength(1)
    const end = sampleCardTransition(tr, END)
    expect(end.done).toBe(true)
    expect(end.cards).toEqual(to)
  })
})

describe('entries and exits travel past the bounding extents', () => {
  const from = [card('a', 0, 0), card('b', 400, 300), card('out', 380, 20)]
  const to = [card('a', 0, 0), card('b', 400, 300), card('in', 350, 280)]

  it('incoming cards start at least one card width outside the from∪to box', () => {
    const tr = createCardTransition(from, to, T0)
    const start = sampleCardTransition(tr, T0).cards
    const incoming = start.find((c) => c.token.id === 'in')!
    const outside =
      incoming.x <= 0 - TRANSITION_MARGIN ||
      incoming.x >= 400 + TRANSITION_MARGIN ||
      incoming.y <= 0 - TRANSITION_MARGIN ||
      incoming.y >= 300 + TRANSITION_MARGIN
    expect(outside).toBe(true)
  })

  it('outgoing cards end just past the box and are gone exactly at done', () => {
    const tr = createCardTransition(from, to, T0)
    const nearEnd = sampleCardTransition(tr, END - 1).cards
    const outgoing = nearEnd.find((c) => c.token.id === 'out')
    expect(outgoing).toBeDefined()
    const done = sampleCardTransition(tr, END)
    expect(done.done).toBe(true)
    expect(done.cards.some((c) => c.token.id === 'out')).toBe(false)
  })

  it('bounds the in-flight population by from + to', () => {
    const tr = createCardTransition(from, to, T0)
    for (const t of [T0, T0 + 70, MID, END - 1, END]) {
      const { cards } = sampleCardTransition(tr, t)
      expect(cards.length).toBeLessThanOrEqual(from.length + to.length)
    }
  })
})

describe('identity', () => {
  it('never morphs tokens: every sampled token is an input token reference', () => {
    const from = [card('a', 0, 0), card('gone', 50, 60)]
    const to = [card('a', 90, 90), card('new', 200, 10)]
    const allowed = new Set([...from, ...to].map((c) => c.token))
    const tr = createCardTransition(from, to, T0)
    for (const t of [T0, T0 + 40, MID, END - 1, END]) {
      for (const c of sampleCardTransition(tr, t).cards) {
        expect(allowed.has(c.token)).toBe(true)
      }
    }
  })
})

describe('interruption / retarget continuity', () => {
  it('feeding a mid-flight sample back as from is positionally continuous', () => {
    const from = [card('a', 0, 0), card('b', 500, 0)]
    const to = [card('a', 200, 200), card('b', 300, 400)]
    const tr = createCardTransition(from, to, T0)
    const live = sampleCardTransition(tr, MID).cards

    const to2 = [card('a', -100, -100), card('b', 500, 0)]
    const tr2 = createCardTransition(live, to2, MID)
    const resumed = sampleCardTransition(tr2, MID).cards

    // At the retarget instant the new transition renders exactly the live
    // frame — no pop, no snap.
    for (const c of live) {
      const match = resumed.find((r) => r.token.id === c.token.id)!
      expect(match.x).toBeCloseTo(c.x, 10)
      expect(match.y).toBeCloseTo(c.y, 10)
    }

    // And it still lands exactly on the new target.
    const settled = sampleCardTransition(tr2, MID + TRANSITION_DURATION_MS)
    expect(settled.done).toBe(true)
    expect(settled.cards).toEqual(to2)
  })
})

describe('determinism', () => {
  it('identical inputs produce identical samples, including tie-heavy repeats', () => {
    // Symmetric repeat layout: distances tie, so ordering must come from
    // deterministic index tie-breaks, not object identity or Map luck.
    const from = [card('dup', -100, 0), card('dup', 100, 0), card('solo', 0, 50)]
    const to = [card('dup', 0, -100), card('dup', 0, 100), card('solo', 10, 60)]
    const a = createCardTransition(from, to, T0)
    const b = createCardTransition(from, to, T0)
    for (const t of [T0, T0 + 33, MID, END - 7, END]) {
      const sa = sampleCardTransition(a, t)
      const sb = sampleCardTransition(b, t)
      expect(sa.done).toBe(sb.done)
      expect(sa.cards.map((c) => [c.token.id, c.x, c.y])).toEqual(
        sb.cards.map((c) => [c.token.id, c.x, c.y])
      )
    }
  })
})
