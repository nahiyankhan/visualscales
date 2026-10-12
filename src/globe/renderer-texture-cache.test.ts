// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CARD_HEIGHT, CARD_WIDTH } from './model.js'
import { chooseRasterDpr, TEXTURE_CACHE_BYTES, textureBytesForDpr, WeightedLruCache } from './renderer-texture-cache.js'

describe('renderer texture cache policy', () => {
  it('keeps more than 80 visible textures pinned without reupload churn', () => {
    const disposed: number[] = []
    const cache = new WeightedLruCache<number>(TEXTURE_CACHE_BYTES, value => disposed.push(value))
    const pinned = new Set(Array.from({ length: 105 }, (_, i) => `token-${i}`))
    const bytes = textureBytesForDpr(chooseRasterDpr(pinned.size, 0.7))
    let creates = 0
    for (const key of pinned) {
      if (!cache.get(key)) cache.set(key, ++creates, bytes, pinned)
    }
    for (const key of pinned) {
      if (!cache.get(key)) cache.set(key, ++creates, bytes, pinned)
    }
    expect(creates).toBe(105)
    expect(cache.stats.entries).toBe(105)
    expect(disposed).toEqual([])
    expect(cache.stats.bytes).toBeLessThanOrEqual(TEXTURE_CACHE_BYTES)
  })

  it('evicts only idle non-pinned entries when reclaiming space', () => {
    const disposed: string[] = []
    const cache = new WeightedLruCache<string>(100, value => disposed.push(value))
    const pinned = new Set(['a', 'b'])
    cache.set('a', 'a', 30, pinned)
    cache.set('b', 'b', 30, pinned)
    cache.set('old', 'old', 30, pinned)
    pinned.add('new')
    cache.set('new', 'new', 35, pinned)
    expect(cache.get('a')).toBe('a')
    expect(cache.get('b')).toBe('b')
    expect(cache.get('old')).toBeUndefined()
    expect(cache.get('new')).toBe('new')
    expect(disposed).toEqual(['old'])
  })

  it('bounds the whole pinned working set by lowering raster tier', () => {
    expect(textureBytesForDpr(chooseRasterDpr(105, 0.8)) * 105).toBeLessThanOrEqual(TEXTURE_CACHE_BYTES)
    expect(textureBytesForDpr(chooseRasterDpr(217, 1.2)) * 217).toBeLessThanOrEqual(TEXTURE_CACHE_BYTES)
    expect(chooseRasterDpr(25, 1.2)).toBe(2)
    expect(chooseRasterDpr(105, 0.8)).toBe(1)
    expect(chooseRasterDpr(400, 0.35)).toBeLessThanOrEqual(0.5)
  })

  it('uses card dimensions for byte accounting', () => {
    expect(textureBytesForDpr(2)).toBe(CARD_WIDTH * 2 * CARD_HEIGHT * 2 * 4)
    expect(textureBytesForDpr(1)).toBe(CARD_WIDTH * CARD_HEIGHT * 4)
  })
  it('does not flap raster tiers around scale or working-set boundaries', () => {
    expect(chooseRasterDpr(25, .86, TEXTURE_CACHE_BYTES, 1)).toBe(1)
    expect(chooseRasterDpr(25, 1, TEXTURE_CACHE_BYTES, 1)).toBe(2)
    expect(chooseRasterDpr(84, 1, TEXTURE_CACHE_BYTES, 2)).toBe(1)
    expect(chooseRasterDpr(83, 1, TEXTURE_CACHE_BYTES, 1)).toBe(1)
    expect(chooseRasterDpr(40, 1, TEXTURE_CACHE_BYTES, 1)).toBe(2)
  })

  it('reclaims before creation, and clears all GPU resources exactly once', () => {
    const disposed: string[] = []
    const cache = new WeightedLruCache<string>(100, value => disposed.push(value))
    cache.set('old', 'old', 60, new Set())
    cache.set('visible', 'visible', 30, new Set(['visible']))
    cache.reclaimFor(60, new Set(['visible', 'new']))
    expect(disposed).toEqual(['old'])
    expect(cache.stats.bytes).toBe(30)
    cache.set('new', 'new', 60, new Set(['visible', 'new']))
    expect(cache.stats.bytes).toBe(90)
    cache.clear(); cache.clear()
    expect(disposed).toEqual(['old', 'visible', 'new'])
    expect(cache.stats).toEqual({ entries: 0, bytes: 0 })
  })

})
