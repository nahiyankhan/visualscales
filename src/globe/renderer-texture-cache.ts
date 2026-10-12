import { CARD_HEIGHT, CARD_WIDTH } from './model.js'

export type TextureCacheEntry<T> = {
  key: string
  value: T
  bytes: number
}

export type TextureCacheStats = {
  entries: number
  bytes: number
}

/** Byte budget chosen from the former worst case: ~80 cards at 2x raster DPR. */
export const TEXTURE_CACHE_BYTES = 70 * 1024 * 1024

export const RASTER_TIERS = [2, 1, 0.5, 0.25] as const
export const MIN_RASTER_TIER = 0.125

export function textureBytesForDpr(dpr: number, width = CARD_WIDTH, height = CARD_HEIGHT): number {
  return Math.max(1, Math.round(width * dpr)) * Math.max(1, Math.round(height * dpr)) * 4
}

function tierForProjectedScale(maxProjectedScale: number): number {
  if (maxProjectedScale <= 0.35) return 0.5
  if (maxProjectedScale <= 0.85) return 1
  return 2
}

export function chooseRasterDpr(uniqueTextures: number, maxProjectedScale: number, budgetBytes = TEXTURE_CACHE_BYTES, previousDpr?: number): number {
  if (uniqueTextures <= 0) return RASTER_TIERS[0]
  let dpr = tierForProjectedScale(maxProjectedScale)
  const ordered = [...RASTER_TIERS, MIN_RASTER_TIER].filter(tier => tier <= dpr)
  for (const tier of ordered) {
    if (textureBytesForDpr(tier) * uniqueTextures <= budgetBytes) {
      // Demote immediately for safety; upgrade only with headroom. A single
      // card entering the frustum must not flip the entire cache each frame.
      if (previousDpr !== undefined && tier > previousDpr) {
        const upgradeScale = tier === 2 ? 0.95 : tier === 1 ? 0.4 : 0.2
        if (maxProjectedScale < upgradeScale || textureBytesForDpr(tier) * uniqueTextures > budgetBytes * 0.8) return previousDpr
      }
      return tier
    }
    dpr = tier
  }
  while (dpr > 1 / 1024 && textureBytesForDpr(dpr) * uniqueTextures > budgetBytes) dpr /= 2
  return dpr
}

export class WeightedLruCache<T> {
  private entries = new Map<string, TextureCacheEntry<T>>()
  private totalBytes = 0

  constructor(
    private readonly budgetBytes: number,
    private readonly disposeValue: (value: T) => void,
  ) {}

  get stats(): TextureCacheStats {
    return { entries: this.entries.size, bytes: this.totalBytes }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  /** Reclaim non-pinned entries before an allocation would push the cache over budget. */
  reclaimFor(bytesNeeded: number, pinnedKeys: ReadonlySet<string>): void {
    this.evictUntil(Math.max(0, this.budgetBytes - bytesNeeded), pinnedKeys)
  }

  set(key: string, value: T, bytes: number, pinnedKeys: ReadonlySet<string>): void {
    const existing = this.entries.get(key)
    if (existing) {
      this.entries.delete(key)
      this.totalBytes -= existing.bytes
      this.disposeValue(existing.value)
    }
    this.reclaimFor(bytes, pinnedKeys)
    this.entries.set(key, { key, value, bytes })
    this.totalBytes += bytes
    this.evictUntil(this.budgetBytes, pinnedKeys)
  }

  evictIdle(pinnedKeys: ReadonlySet<string>): void {
    this.evictUntil(this.budgetBytes, pinnedKeys)
  }

  clear(): void {
    for (const entry of this.entries.values()) this.disposeValue(entry.value)
    this.entries.clear()
    this.totalBytes = 0
  }

  private evictUntil(targetBytes: number, pinnedKeys: ReadonlySet<string>): void {
    if (this.totalBytes <= targetBytes) return
    for (const [key, entry] of this.entries) {
      if (pinnedKeys.has(key)) continue
      this.entries.delete(key)
      this.totalBytes -= entry.bytes
      this.disposeValue(entry.value)
      if (this.totalBytes <= targetBytes) return
    }
  }
}
