import { describe, expect, it } from 'vitest'
import { sampleSplitIntro, SPLIT_INTRO_DURATION_MS } from './intro.js'

describe('split entrance timeline', () => {
  it('starts with a hidden, slightly smaller finished globe', () => {
    expect(sampleSplitIntro(0)).toEqual({ emerge: 0, scale: 0.92, done: false })
    expect(sampleSplitIntro(-100)).toEqual(sampleSplitIntro(0))
  })

  it('fades and grows together, with the same gentle emergence as before', () => {
    const globe = sampleSplitIntro(400)
    expect(globe.emerge).toBe(0.875)
    expect(globe.scale).toBeCloseTo(0.99)
    expect(globe.done).toBe(false)
    expect(sampleSplitIntro(600).emerge).toBeGreaterThan(0.9)
    expect(SPLIT_INTRO_DURATION_MS).toBe(800)
  })

  it('is monotonic and settles exactly without subsequent phases or drift', () => {
    let previous = sampleSplitIntro(0)
    for (let time = 20; time <= SPLIT_INTRO_DURATION_MS; time += 20) {
      const next = sampleSplitIntro(time)
      for (const key of ['emerge', 'scale'] as const) {
        expect(next[key]).toBeGreaterThanOrEqual(previous[key])
        expect(next[key]).toBeLessThanOrEqual(1)
      }
      previous = next
    }
    expect(previous).toEqual({ emerge: 1, scale: 1, done: true })
    expect(sampleSplitIntro(10000)).toEqual(previous)
  })
})
