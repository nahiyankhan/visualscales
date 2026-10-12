// Identity-preserving card transitions for the globe's infinite surface.
//
// Pure math, no RAF, no renderer edits. The main loop owns time: it calls
// createCardTransition(from, to, now) when the target layout changes, then
// sampleCardTransition(transition, now) each frame and feeds the resulting
// cards straight into the native WebGL mesh renderer.
//
// Design contract:
// - Cards never morph. Every in-flight card carries the exact `token` object
//   it was created with; labels/colors are stable for the whole flight.
// - Stable token ids may legitimately repeat in the viewport (the surface
//   tiles). Copies of the same id are matched one-to-one by nearest distance,
//   deterministically, so the closest copy slides rather than a far one
//   teleporting across the screen.
// - Unmatched incoming cards enter from just outside the combined bounding
//   extents of `from` ∪ `to` (plus one card width), along the nearest edge to
//   their destination. Unmatched outgoing cards exit past that same boundary.
//   No opacity is involved — travel does the work, so the renderer needs no
//   changes. Callers should hand in generously overscanned layouts so the
//   boundary sits comfortably off-screen.
// - Interruptible: sample mid-flight, feed the live cards back in as `from`
//   for a retarget, and motion is positionally continuous.
// - At `done`, the sample is exactly `to`: same order, same token references,
//   same coordinates. Zero drift, zero residue.
//
// Reduced motion is the caller's job: skip the transition and render `to`.

import type { MeshCard } from './mesh-renderer.js'
import { CARD_WIDTH } from './model.js'

/** Flight time, ms. Short enough to feel like the surface snapping to intent. */
export const TRANSITION_DURATION_MS = 280

/** Off-screen margin beyond the from∪to bounding extents, px (render coords). */
export const TRANSITION_MARGIN = CARD_WIDTH

type Flight = {
  token: MeshCard['token']
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export type CardTransition = {
  start: number
  duration: number
  /** Matched + entering cards, ordered by their index in `to`. */
  flights: Flight[]
  /** Outgoing cards flying past the boundary; dropped exactly at `done`. */
  exits: Flight[]
  /** The authoritative end state, returned verbatim (order and data) at done. */
  to: MeshCard[]
  /** True when nothing moves; sampling is immediately done. */
  settled: boolean
}

export type CardTransitionSample = {
  cards: MeshCard[]
  done: boolean
}

/** Strong cubic ease-out: fast launch, soft landing. Own math, endpoint-exact. */
export function easeOutCubic(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const u = 1 - t
  return 1 - u * u * u
}

type Extents = { minX: number; maxX: number; minY: number; maxY: number }

function extentsOf(...groups: MeshCard[][]): Extents {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const group of groups) {
    for (const card of group) {
      if (card.x < minX) minX = card.x
      if (card.x > maxX) maxX = card.x
      if (card.y < minY) minY = card.y
      if (card.y > maxY) maxY = card.y
    }
  }
  if (minX > maxX) return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  return { minX, maxX, minY, maxY }
}

/**
 * Project an anchor point onto the nearest edge of the boundary, one margin
 * outside. Ties resolve left → right → top → bottom, deterministically.
 */
function nearestEdgePoint(x: number, y: number, box: Extents): { x: number; y: number } {
  const dLeft = x - box.minX
  const dRight = box.maxX - x
  const dTop = y - box.minY
  const dBottom = box.maxY - y
  const min = Math.min(dLeft, dRight, dTop, dBottom)
  if (min === dLeft) return { x: box.minX - TRANSITION_MARGIN, y }
  if (min === dRight) return { x: box.maxX + TRANSITION_MARGIN, y }
  if (min === dTop) return { x, y: box.minY - TRANSITION_MARGIN }
  return { x, y: box.maxY + TRANSITION_MARGIN }
}

/**
 * Build a transition from one card layout to another.
 *
 * Matching is per token id, one-to-one across repeated copies: all candidate
 * (from, to) pairs for an id are ranked by squared distance (ties by from
 * index, then to index) and taken greedily. Identical inputs always produce
 * identical transitions.
 */
export function createCardTransition(from: MeshCard[], to: MeshCard[], now: number): CardTransition {
  // Group indices by token id so copies only ever match copies of themselves.
  const fromById = new Map<string, number[]>()
  from.forEach((card, i) => {
    const list = fromById.get(card.token.id)
    if (list) list.push(i)
    else fromById.set(card.token.id, [i])
  })
  const toById = new Map<string, number[]>()
  to.forEach((card, i) => {
    const list = toById.get(card.token.id)
    if (list) list.push(i)
    else toById.set(card.token.id, [i])
  })

  const matchForTo = new Array<number>(to.length).fill(-1)
  const fromMatched = new Array<boolean>(from.length).fill(false)

  for (const [id, toIndices] of toById) {
    const fromIndices = fromById.get(id)
    if (!fromIndices) continue
    // Rank every candidate pair; greedy pick is deterministic and, for the
    // common one-copy case, exact nearest matching.
    const pairs: Array<{ d: number; fi: number; ti: number }> = []
    for (const fi of fromIndices) {
      for (const ti of toIndices) {
        const dx = from[fi].x - to[ti].x
        const dy = from[fi].y - to[ti].y
        pairs.push({ d: dx * dx + dy * dy, fi, ti })
      }
    }
    pairs.sort((a, b) => a.d - b.d || a.fi - b.fi || a.ti - b.ti)
    for (const pair of pairs) {
      if (fromMatched[pair.fi] || matchForTo[pair.ti] !== -1) continue
      fromMatched[pair.fi] = true
      matchForTo[pair.ti] = pair.fi
    }
  }

  // Off-screen boundary from the combined extents. Callers pass overscanned
  // layouts, so "one card width past the union box" is safely out of view.
  const box = extentsOf(from, to)

  const flights: Flight[] = []
  let moving = false
  for (let ti = 0; ti < to.length; ti++) {
    const target = to[ti]
    const fi = matchForTo[ti]
    let fromX: number
    let fromY: number
    if (fi !== -1) {
      fromX = from[fi].x
      fromY = from[fi].y
    } else {
      const entry = nearestEdgePoint(target.x, target.y, box)
      fromX = entry.x
      fromY = entry.y
    }
    if (fromX !== target.x || fromY !== target.y) moving = true
    // Identity lock: the in-flight card carries the *destination* token object
    // so at no point does a label repaint mid-flight or at landing.
    flights.push({ token: target.token, fromX, fromY, toX: target.x, toY: target.y })
  }

  const exits: Flight[] = []
  for (let fi = 0; fi < from.length; fi++) {
    if (fromMatched[fi]) continue
    const card = from[fi]
    const out = nearestEdgePoint(card.x, card.y, box)
    exits.push({ token: card.token, fromX: card.x, fromY: card.y, toX: out.x, toY: out.y })
    moving = true
  }

  return {
    start: now,
    duration: TRANSITION_DURATION_MS,
    flights,
    exits,
    to,
    settled: !moving,
  }
}

/**
 * Sample the transition at a timestamp. Pure; call as often as you like.
 *
 * While in flight, the card list is flights (in `to` order) plus exits, so the
 * population is bounded by from.length + to.length. Once done, the result is
 * exactly `to` — same order, same token references, same coordinates — and
 * exits vanish by having already travelled past the boundary.
 */
export function sampleCardTransition(transition: CardTransition, now: number): CardTransitionSample {
  const elapsed = now - transition.start
  if (transition.settled || elapsed >= transition.duration) {
    return { cards: transition.to, done: true }
  }

  const t = elapsed <= 0 ? 0 : elapsed / transition.duration
  const e = easeOutCubic(t)

  const cards: MeshCard[] = []
  for (const f of transition.flights) {
    cards.push({
      token: f.token,
      x: f.fromX + (f.toX - f.fromX) * e,
      y: f.fromY + (f.toY - f.fromY) * e,
    })
  }
  for (const f of transition.exits) {
    cards.push({
      token: f.token,
      x: f.fromX + (f.toX - f.fromX) * e,
      y: f.fromY + (f.toY - f.fromY) * e,
    })
  }
  return { cards, done: false }
}
