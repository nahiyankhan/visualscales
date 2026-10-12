import { CARD_WIDTH, CARD_HEIGHT } from './model.js'
import type { MeshCard } from './mesh-renderer.js'
import { easeOutCubic } from './transitions.js'

export const INTRO_DURATION_MS = 1100
export const INTRO_ROW_DURATION_MS = 800
export const INTRO_ROW_STAGGER_MS = 60

type Row = { y: number; direction: -1 | 1; delay: number }
export type IntroRowEntrance = { start: number; travel: number; rows: Row[] }

/** Snapshot the finite viewport pool: no recycling while rows travel in. */
export function createIntroRowEntrance(cards: MeshCard[], now: number, width: number, height: number, scale: number): IntroRowEntrance {
  const ys = [...new Set(cards.map(card => card.y))].sort((a, b) => a - b)
  const firstVisible = Math.max(0, ys.findIndex(y => y + CARD_HEIGHT * scale / 2 >= -height / 2))
  const lastVisible = ys.filter(y => y - CARD_HEIGHT * scale / 2 <= height / 2).length - 1
  const visibleCount = Math.max(1, lastVisible - firstVisible + 1)
  const stagger = Math.min(INTRO_ROW_STAGGER_MS, (INTRO_DURATION_MS - INTRO_ROW_DURATION_MS) / Math.max(1, visibleCount - 1))
  return {
    start: now,
    // Include overscan extents: moving only by viewport width would leave
    // recycled peripheral cards visible before their row actually enters.
    travel: Math.max(0, ...cards.map(card => Math.abs(card.x))) + width + CARD_WIDTH * scale,
    rows: ys.map((y, i) => ({
      y,
      direction: (i - firstVisible) % 2 === 0 ? -1 : 1,
      delay: Math.max(0, Math.min(visibleCount - 1, i - firstVisible)) * stagger,
    })),
  }
}

export function sampleIntroRowEntrance(intro: IntroRowEntrance, row: Row, now: number) {
  const t = Math.max(0, Math.min(1, (now - intro.start - row.delay) / INTRO_ROW_DURATION_MS))
  return row.direction * intro.travel * (1 - easeOutCubic(t))
}

export function applyIntroRowEntrance(cards: MeshCard[], intro: IntroRowEntrance, now: number) {
  const done = intro.rows.every(row => now >= intro.start + row.delay + INTRO_ROW_DURATION_MS)
  if (done) return { cards, offsets: [], done: true }
  const offsets = intro.rows.map(row => [row.y, sampleIntroRowEntrance(intro, row, now)] as const)
  const byY = new Map(offsets)
  return { cards: cards.map(card => ({ ...card, x: card.x + (byY.get(card.y) ?? 0) })), offsets, done: false }
}
