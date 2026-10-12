import type { TokenLayout, TokenPlacement } from './layout.js'
import type { RelationshipToken } from './relationships.js'

const mod = (value: number, count: number) => ((value % count) + count) % count
const normalize = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ')

/** Literal AND search only. Equal scores retain the caller's original order. */
export function searchTokens(tokens: readonly RelationshipToken[], query: string): { token: RelationshipToken; score: number }[] {
  const text = normalize(query)
  if (!text) return []
  const terms = [...new Set(text.split(' '))]
  return tokens.flatMap((token, index) => {
    const fields = [token.id, token.name, token.layer, token.light].map(normalize)
    if (!terms.every(term => fields.some(field => field.includes(term)))) return []
    const exact = [fields[0], fields[1], fields[3]].includes(text)
    const words = fields.flatMap(field => field.split(/[^\p{L}\p{N}#]+/u))
    // Keep exact matches above every prefix/substring result, regardless of
    // query length. Punctuation remains literal for matching, not a regex.
    const prefixes = terms.filter(term => fields.some(field => field.startsWith(term))
      || words.some(word => word.startsWith(term))).length
    const score = exact ? 3 : prefixes === terms.length ? 2 : 1
    return [{ token, score, index }]
  }).sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ token, score }) => ({ token, score }))
}

function exploring(base: TokenLayout, placements: TokenPlacement[], label: string): TokenLayout {
  return {
    ...base, placements,
    groups: placements.length ? [{
      label: `Exploring ${label}`, start: 0, count: placements.length,
      tokenIds: placements.map(p => p.token.id), col: 0, row: 0,
      width: base.width, height: base.height,
    }] : [],
  }
}

/** Seeded Fisher–Yates across ALL tokens, not just equal-color ties. */
export function shuffledLayout(tokens: readonly RelationshipToken[], seed = 1): TokenLayout {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Layout seed must be a nonnegative safe integer')
  const ids = new Set<string>()
  for (const token of tokens) {
    if (ids.has(token.id)) throw new Error(`Duplicate token ID: ${token.id}`)
    ids.add(token.id)
  }
  const sequence = [...tokens]
  let state = 2166136261
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  const random = () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  for (let i = sequence.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[sequence[i], sequence[j]] = [sequence[j], sequence[i]]
  }
  const count = sequence.length, width = Math.max(1, Math.round(Math.sqrt(count)))
  const placements = sequence.map((token, index) => ({ token, index, col: index % width, row: Math.floor(index / width) }))
  const base = { placements, count, width, height: Math.max(1, Math.ceil(count / width)), groups: [] }
  return exploring(base, placements, 'shuffled tokens')
}

function anchorSlot(base: TokenLayout, anchorIndex: number): number {
  if (!Number.isSafeInteger(anchorIndex)) throw new Error('Anchor index must be a safe integer')
  return mod(anchorIndex, base.count)
}

/** Distances on the same continuous folded ribbon as navigation.ts. No padded
 * last row or independent row/column wrapping: all offsets wrap by token count. */
function nearestSlots(base: TokenLayout, anchor: number): { index: number; distance: number }[] {
  const distances = Array<number>(base.count).fill(-1)
  distances[anchor] = 0
  const queue = [anchor]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]
    for (const offset of [-1, 1, -base.width, base.width]) {
      const neighbor = mod(index + offset, base.count)
      if (distances[neighbor] !== -1) continue
      distances[neighbor] = distances[index] + 1
      queue.push(neighbor)
    }
  }
  return distances.map((distance, index) => ({ index, distance }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
}

/** Swap token payloads, never slot coordinates. Uninvolved cards are untouched;
 * lineage depth travels with its token rather than remaining on the old slot. */
function swaps(base: TokenLayout, targets: readonly { id: string; index: number }[], label: string): TokenLayout {
  const placements = base.placements.map(p => ({ ...p }))
  const locations = new Map(placements.map((p, index) => [p.token.id, index]))
  for (const target of targets) {
    const from = locations.get(target.id)
    if (from === undefined || from === target.index) continue
    const a = placements[from], b = placements[target.index]
    placements[from] = { ...a, token: b.token }
    placements[target.index] = { ...b, token: a.token }
    delete placements[from].depth
    delete placements[target.index].depth
    if (b.depth !== undefined) placements[from].depth = b.depth
    if (a.depth !== undefined) placements[target.index].depth = a.depth
    locations.set(a.token.id, target.index)
    locations.set(b.token.id, from)
  }
  return exploring(base, placements, label)
}

/** Priority order fills nearest center slots. A pin always owns the anchor.
 * Pass the previous focused layout to retain existing positions on distance
 * ties; otherwise ties use the original dense order. Repeated calls are stable. */
export function focusLayout(base: TokenLayout, priorityIds: readonly string[], anchorIndex: number, pinnedId?: string): TokenLayout {
  if (!base.count) return base
  const anchor = anchorSlot(base, anchorIndex)
  const positions = new Map(base.placements.map(p => [p.token.id, p.index]))
  const ids = [...new Set([...(pinnedId && positions.has(pinnedId) ? [pinnedId] : []), ...priorityIds])]
    .filter(id => positions.has(id))
  if (!ids.length) return base
  const slots = nearestSlots(base, anchor)
  const continuing = new Set(ids.map(id => positions.get(id)!))
  const targets = ids.map(id => {
    const current = positions.get(id)!
    continuing.delete(current)
    const existing = slots.findIndex(slot => slot.distance === slots[0].distance && slot.index === current)
    // New matches should not steal an equally near slot from a continuing
    // match when a free slot in the same distance band is available.
    const free = slots.findIndex(slot => slot.distance === slots[0].distance && !continuing.has(slot.index))
    const [slot] = slots.splice(existing >= 0 ? existing : free >= 0 ? free : 0, 1)
    return { id, index: slot.index }
  })
  return swaps(base, targets, 'search results')
}

/** Caller supplies verified sources (direct first) and dependents in desired
 * branch order. Sources go left; dependents fill a compact right-hand window,
 * then rows below it. Ribbon wrapping handles edge/prime-count anchors. */
export function selectionLayout(
  base: TokenLayout, selectedId: string, sourceIds: readonly string[], dependentIds: readonly string[], anchorIndex: number,
): TokenLayout {
  if (!base.count || !base.placements.some(p => p.token.id === selectedId)) return base
  const anchor = anchorSlot(base, anchorIndex)
  const available = new Set(base.placements.map(p => p.token.id))
  available.delete(selectedId)
  const unique = (ids: readonly string[]) => ids.filter(id => available.delete(id))
  const sources = unique(sourceIds), dependents = unique(dependentIds)
  const targets = [{ id: selectedId, index: anchor }]
  const occupied = new Set([anchor])
  sources.forEach((id, i) => {
    const index = mod(anchor - i - 1, base.count)
    occupied.add(index)
    targets.push({ id, index })
  })
  // A three-column window keeps a broad branch near the selected token, rather
  // than sending every dependent along a single arbitrarily long row.
  const columns = Math.max(1, Math.min(3, Math.floor(base.width / 2)))
  const right: number[] = []
  const seen = new Set(occupied)
  const rows = Math.ceil(base.count / base.width)
  for (let row = 0; row < rows && right.length < dependents.length; row++) {
    for (let col = 1; col <= columns && right.length < dependents.length; col++) {
      const index = mod(anchor + row * base.width + col, base.count)
      if (!seen.has(index)) { seen.add(index); right.push(index) }
    }
  }
  // Very large neighborhoods can exhaust the right half. Fill the nearest
  // remaining slots without collisions or dropping any requested token.
  if (right.length < dependents.length) {
    for (const { index } of nearestSlots(base, anchor)) {
      if (!seen.has(index)) { seen.add(index); right.push(index) }
      if (right.length === dependents.length) break
    }
  }
  dependents.forEach((id, i) => targets.push({ id, index: right[i] }))
  return swaps(base, targets, base.placements.find(p => p.token.id === selectedId)!.token.name)
}
