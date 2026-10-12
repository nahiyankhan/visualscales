import { mod, STEP_X, STEP_Y } from './model.js'
import type { TokenLayout } from './layout.js'

const ROW_STAGGER_PATTERN = [-0.42, 0.16, -0.08, 0.37, -0.24, 0.29, -0.35, 0.05] as const

export function rowOffset(row: number, scale: number, stagger = true) {
  if (!stagger) return 0
  // Use a small deterministic row motif instead of a strict checkerboard/brick
  // offset. A half-step stagger is still an obvious grid; varied row phases
  // break the vertical seams while keeping selection and infinite repeats stable.
  return ROW_STAGGER_PATTERN[mod(row, ROW_STAGGER_PATTERN.length)] * STEP_X * scale
}

// The collection is a continuous, ordered ribbon folded into rows. Repeating
// the ribbon (rather than padding its last row) fills every slot for any count,
// including prime counts. Crossing a collection boundary is repetition, not a link.
export function indexLayout(layout: TokenLayout) {
  return new Map(layout.placements.map(p => [p.index, p]))
}

export function placementAt(layout: TokenLayout, col: number, row: number) {
  if (!layout.count) return undefined
  const index = row * layout.width + col
  return layout.wrap === false
    ? layout.placements.find(placement => placement.index === index)
    : layout.placements[mod(index, layout.count)]
}

export function nearestTokenOffset(layout: TokenLayout, id: string, x: number, y: number, scale: number, stagger = true) {
  const placement = layout.placements.find(p => p.token.id === id)
  if (!placement || !layout.count) return { x, y, distance: 0 }
  const sx = STEP_X * scale, sy = STEP_Y * scale
  if (layout.wrap === false) {
    return {
      x: -(placement.col * sx + rowOffset(placement.row, scale, stagger)),
      y: -placement.row * sy,
      distance: 0,
    }
  }
  const centerRow = Math.round(-y / sy)
  let best = { x, y, distance: Infinity }
  // For each candidate row, find the nearest occurrence of this exact index.
  // The initial row gives an upper bound; rows beyond that distance cannot win.
  const candidate = (row: number) => {
    const base = placement.index - row * layout.width
    const col = base + Math.round(((-x - rowOffset(row, scale, stagger)) / sx - base) / layout.count) * layout.count
    const tx = -(col * sx + rowOffset(row, scale, stagger)), ty = -row * sy
    const distance = Math.hypot(tx - x, ty - y)
    if (distance < best.distance) best = { x: tx, y: ty, distance }
  }
  candidate(centerRow)
  const reach = Math.ceil(best.distance / sy) + 1
  for (let row = centerRow - reach; row <= centerRow + reach; row++) candidate(row)
  return best
}

export function sampleLayout(layout: TokenLayout, slots: ReturnType<typeof indexLayout>, x: number, y: number, scale: number, columns: number, rows: number, stagger = true) {
  if (!layout.count) return []
  const sx = STEP_X * scale, sy = STEP_Y * scale
  const firstRow = Math.floor(-y / sy + 1e-8) - Math.floor(rows / 2)
  const cards = []
  for (let r = 0; r < rows; r++) {
    const row = firstRow + r
    const firstCol = Math.floor((-x - rowOffset(row, scale, stagger)) / sx + 1e-8) - Math.floor(columns / 2)
    for (let c = 0; c < columns; c++) {
      const col = firstCol + c
      const index = row * layout.width + col
      const placement = layout.wrap === false ? slots.get(index) : slots.get(mod(index, layout.count))
      if (!placement) continue
      cards.push({ token: placement.token, x: col * sx + rowOffset(row, scale, stagger) + x, y: row * sy + y })
    }
  }
  return cards
}
