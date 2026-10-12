import { describe, expect, it } from 'vitest'
import {
  groupMeasurements,
  resolveMeasurements,
  searchMeasurements,
  tokens,
} from './data.js'
import { layoutStops } from './layout.js'

describe('Visual Scales dimensional fixture', () => {
  it('preserves each of 50 expressions with six specimen kinds and exact aliases', () => {
    expect(tokens).toHaveLength(50)
    expect(new Set(tokens.map((token) => token.id)).size).toBe(50)
    expect(new Set(tokens.map((token) => token.kind)).size).toBe(6)
    for (const root of [16, 18, 20]) {
      const items = resolveMeasurements(root)
      for (const item of items) {
        expect(item.value).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(item.value)).toBe(true)
        if (item.reference)
          expect(item.value).toBe(
            items.find((source) => source.id === item.reference)!.value
          )
      }
    }
  })
  it('groups equal lengths without merging identities or inventing dependencies', () => {
    const groups = groupMeasurements(resolveMeasurements())
    const sixteen = groups.find((group) => group.value === 16)!
    expect(sixteen.items.map((item) => item.id)).toEqual([
      'type.body.size',
      'space.400',
      'space.stack',
      'radius.16',
      'size.icon.16',
    ])
    expect(
      sixteen.items.filter((item) => item.reference).map((item) => item.id)
    ).toEqual(['space.stack'])
    expect(groups.flatMap((group) => group.items)).toHaveLength(50)
  })
  it('states the root context and resolves leading as a composite ingredient', () => {
    const items = resolveMeasurements(20)
    const size = items.find((item) => item.id === 'type.body.size')!
    const leading = items.find((item) => item.id === 'type.body.leading')!
    expect(size.value).toBe(20)
    expect(size.expression).toBe('1rem')
    expect(size.context).toContain('20px')
    expect(leading.value).toBe(30)
    expect(leading.expression).toBe('1.5 × 1rem')
    expect(leading.context).toBe('computed from 20px type × 1.5')
    expect(items.find((item) => item.id === 'space.400')!.value).toBe(16)
  })
  it('search finds every real token including off-screen dimensions', () => {
    const items = resolveMeasurements()
    expect(
      searchMeasurements(items, 'radius 16px').map((item) => item.id)
    ).toEqual(['radius.16'])
    expect(searchMeasurements(items, '960').map((item) => item.id)).toEqual([
      'size.container.960',
    ])
    expect(searchMeasurements(items, '1rem').map((item) => item.id)).toContain(
      'type.body.size'
    )
    expect(searchMeasurements(items, '')).toEqual([])
    expect(searchMeasurements(items, 'nothing-here')).toEqual([])
  })
})

describe('local ruler landmarks', () => {
  const groups = groupMeasurements(resolveMeasurements())
  it('labels coarse clusters as exact ranges and separates the focused coordinate', () => {
    const stops = layoutStops(groups, { center: 16, scale: 30 }, 1440, 16)
    expect(
      stops
        .find((stop) => stop.groups.some((group) => group.value === 16))!
        .groups.map((group) => group.value)
    ).toEqual([16])
    expect(stops.some((stop) => stop.clustered)).toBe(true)
    expect(
      new Set(
        stops.flatMap((stop) =>
          stop.groups.flatMap((group) => group.items.map((item) => item.id))
        )
      ).size
    ).toBe(
      stops.flatMap((stop) => stop.groups.flatMap((group) => group.items))
        .length
    )
  })
  it('a large magnification splits close values while never pretending midpoints are tokens', () => {
    const coarse = layoutStops(groups, { center: 16, scale: 30 }, 390)
    expect(
      coarse.find((stop) => stop.groups.some((group) => group.value === 16))!
        .clustered
    ).toBe(true)
    const fine = layoutStops(groups, { center: 16, scale: 160 }, 390)
    expect(
      fine.find((stop) => stop.groups.some((group) => group.value === 16))!
        .clustered
    ).toBe(false)
    for (const stop of fine)
      if (!stop.clustered) expect(stop.value).toBe(stop.groups[0].value)
  })
  it('reveals honest empty geography beyond the last token', () => {
    expect(layoutStops(groups, { center: 1100, scale: 100 }, 390)).toEqual([])
  })
})

it('visible stops never overlap, including a selected stop at wide magnification', () => {
  const groups = groupMeasurements(resolveMeasurements())
  for (const scale of [0.45, 1, 2, 5, 10, 30, 60, 160])
    for (const focused of [undefined, 16, 24, 32]) {
      const stops = layoutStops(
        groups,
        { center: focused ?? 16, scale },
        1440,
        focused
      )
      for (let i = 0; i < stops.length; i++)
        for (let j = i + 1; j < stops.length; j++) {
          const a = stops[i],
            b = stops[j]
          expect(
            a.top !== b.top ||
              Math.abs(a.x - b.x) >=
                (a.clustered ? 58 : 54) + (b.clustered ? 58 : 54),
            `scale=${scale},focus=${focused},${a.groups.map((g) => g.value)}|${b.groups.map((g) => g.value)}`
          ).toBe(true)
        }
    }
})

it('pan culling never changes the groups or lane of a visible stop', () => {
  const groups = groupMeasurements(resolveMeasurements())
  const left = layoutStops(groups, { center: 16, scale: 30 }, 390)
  const right = layoutStops(groups, { center: 18, scale: 30 }, 390)
  for (const stop of left) {
    const same = right.find(
      (candidate) =>
        candidate.groups.map((group) => group.value).join(',') ===
        stop.groups.map((group) => group.value).join(',')
    )
    if (same) {
      expect(same.top).toBe(stop.top)
      expect(same.x - stop.x).toBeCloseTo(-60)
    }
  }
})
