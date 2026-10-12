import { describe, expect, it } from 'vitest'
import { CARD_HEIGHT, CARD_WIDTH, gridMetrics, project, STEP_X, STEP_Y } from './model.js'
import { applyIntroRowEntrance, createIntroRowEntrance, INTRO_DURATION_MS } from './intro-motion.js'
import { rowOffset } from './navigation.js'

const token = { id: 'a', name: 'A', layer: 'base', light: '#3366CC' }

describe('alternating row entrance', () => {
  it.each([[390, 844], [1440, 1000], [2560, 1440]])('enters outside both sides and settles within 1.1s at %ix%i', (width, height) => {
    const { columns, rows, scale, radius, perspective } = gridMetrics(width, height)
    const cards = Array.from({ length: rows * columns }, (_, i) => ({ token,
      x: (i % columns - Math.floor(columns / 2)) * STEP_X * scale + rowOffset(Math.floor(i / columns) - Math.floor(rows / 2), scale),
      y: (Math.floor(i / columns) - Math.floor(rows / 2)) * STEP_Y * scale,
    }))
    const intro = createIntroRowEntrance(cards, 1000, width, height, scale)
    const start = applyIntroRowEntrance(cards, intro, 1000)
    const visibleRows = intro.rows.filter(row => Math.abs(row.y) <= height / 2 + CARD_HEIGHT * scale / 2)
    expect(visibleRows[0].direction).toBe(-1)
    visibleRows.forEach((row, i) => expect(row.direction).toBe(i % 2 === 0 ? -1 : 1))
    // Even overscanned cards must not appear in the viewport at the start.
    for (const card of start.cards) {
      if (Math.abs(card.x / radius) > 1.25 || Math.abs(card.y / radius) > 1.25) continue
      const p = project(card.x, card.y, radius)
      expect(Math.abs(p.x * perspective / (perspective - p.z))).toBeGreaterThan(width / 2 + CARD_WIDTH * scale / 2)
    }
    const mid = applyIntroRowEntrance(cards, intro, 1400)
    expect(mid.done).toBe(false)
    mid.cards.forEach((card, i) => { expect(card.y).toBe(cards[i].y); expect(card.token).toBe(token) })
    const end = applyIntroRowEntrance(cards, intro, 1000 + INTRO_DURATION_MS)
    expect(end.done).toBe(true)
    expect(end.cards).toBe(cards)
    expect(end.offsets).toEqual([])
  })

  it('keeps every card in a row locked together and decelerates toward its original slot', () => {
    const cards = [{ token, x: 0, y: 0 }, { token, x: STEP_X, y: 0 }]
    const intro = createIntroRowEntrance(cards, 0, 1440, 1000, 1)
    let previous = Infinity
    for (let t = 0; t <= 800; t += 100) {
      const sample = applyIntroRowEntrance(cards, intro, t)
      expect(sample.cards[1].x - sample.cards[0].x).toBeCloseTo(STEP_X)
      expect(Math.abs(sample.cards[0].x)).toBeLessThanOrEqual(previous)
      previous = Math.abs(sample.cards[0].x)
    }
  })
})
