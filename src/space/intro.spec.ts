import { expect, test, type Page } from '@playwright/test'

const root = '.space-atlas'
const world = '.space-world'
const introIds = [
  'space-intro-axis',
  'space-intro-tick',
  'space-intro-mark',
  'space-intro-stem',
  'space-intro-label',
]

async function gotoFrozen(
  page: Page,
  motion: 'reduce' | 'no-preference' = 'no-preference'
) {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(0)
  await page.emulateMedia({ reducedMotion: motion })
  await page.goto('/space.html')
}

async function twoFrames(page: Page) {
  await page.clock.runFor(32)
  // Native ResizeObserver and React commits aren't driven by the mocked clock.
  await expect(page.locator('.space-ruler')).toHaveAttribute(
    'data-width',
    String(page.viewportSize()!.width)
  )
  if ((await page.locator(root).getAttribute('data-intro')) === 'pending')
    await page.clock.runFor(16)
}

async function introAnimations(page: Page) {
  return page.locator(root).evaluate((atlas, ids) => {
    const animations = atlas
      .getAnimations({ subtree: true })
      .filter((animation) => ids.includes(animation.id))
    return animations.map((animation) => {
      const effect = animation.effect as KeyframeEffect
      const target = effect.target as HTMLElement
      const timing = effect.getTiming()
      const landmark = target.closest<HTMLElement>('.space-landmark')
      const tick = target.closest<HTMLElement>('.space-tick')
      return {
        id: animation.id,
        target: target.className,
        inlineTransform: target.style.transform,
        laneTop: landmark ? Number.parseFloat(landmark.style.top) : null,
        isTopTick: Boolean(tick),
        isLandmark: Boolean(landmark),
        duration: Number(timing.duration),
        delay: Number(timing.delay),
        easing: String(timing.easing),
        transformOrigin: getComputedStyle(target).transformOrigin,
        frames: effect.getKeyframes().map((frame) => ({
          opacity: frame.opacity == null ? undefined : String(frame.opacity),
          transform:
            frame.transform == null ? undefined : String(frame.transform),
          clipPath: frame.clipPath == null ? undefined : String(frame.clipPath),
        })),
      }
    })
  }, introIds)
}

async function expectFinalProjection(page: Page) {
  const width = page.viewportSize()!.width
  await expect
    .poll(() =>
      page
        .locator('.space-ruler')
        .evaluate((ruler) => Math.round(ruler.getBoundingClientRect().y))
    )
    .toBe(Math.round(page.viewportSize()!.height * 0.46))
  const axis = await page.locator('.space-ruler-axis').boundingBox()
  expect(axis!.x).toBe(0)
  expect(axis!.width).toBe(width)
  const center = Number(await page.locator(world).getAttribute('data-center'))
  const scale = Number(await page.locator(world).getAttribute('data-scale'))
  const marks = await page.locator('.space-value-mark').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        value: Number((node as HTMLElement).dataset.value),
        x: rect.left + rect.width / 2,
        width: rect.width,
        height: rect.height,
        y: rect.y,
      }
    })
  )
  for (const mark of marks) {
    expect(mark.x).toBeCloseTo(width / 2 + (mark.value - center) * scale, 1)
    expect(mark.width).toBe(1)
    expect(mark.height).toBe(8)
    expect(mark.y - axis!.y).toBeCloseTo(2, 1)
  }
}

function translateXs(transform: string) {
  const matches = [...transform.matchAll(/translateX\((-?[\d.]+)px\)/g)]
  expect(matches.length, transform).toBeGreaterThan(0)
  return matches.map((match) => Number(match[1]))
}

function entranceTranslateX(transform: string) {
  return translateXs(transform).at(-1)!
}

function expectTranslateOnly(
  animation: Awaited<ReturnType<typeof introAnimations>>[number]
) {
  for (const frame of animation.frames) {
    expect(frame.clipPath).toBeUndefined()
    if (frame.transform) {
      expect(frame.transform).not.toMatch(
        /perspective|rotate|rotateY|rotateZ|clip/i
      )
      expect(frame.transform).toMatch(
        /^(?:none|translateX\(-?[\d.]+px\)(?: translateX\(-?[\d.]+px\))*)$/
      )
    }
  }
}

test('normal motion intro waits two RAFs, uses specified WAAPI timing, and lands exactly', async ({
  page,
}) => {
  await gotoFrozen(page, 'no-preference')
  await expect(page.locator(root)).toHaveAttribute('data-intro', 'pending')
  const originalAxis = await page
    .locator('.space-ruler-axis')
    .evaluate((axis) => axis.outerHTML)
  const pendingHidden = await page.locator('.space-ruler').evaluate((node) => {
    const style = getComputedStyle(node)
    return (
      style.visibility === 'hidden' ||
      style.display === 'none' ||
      style.opacity === '0'
    )
  })
  expect(pendingHidden).toBe(true)

  await twoFrames(page)
  await expect(page.locator(root)).toHaveAttribute('data-intro', 'running')
  const animations = await introAnimations(page)
  expect(new Set(animations.map((animation) => animation.id))).toEqual(
    new Set(introIds)
  )
  expect(animations.every((animation) => animation.duration === 800)).toBe(true)
  expect(
    animations.every((animation) => animation.easing.includes('cubic-bezier'))
  ).toBe(true)
  expect(
    animations.filter((animation) => animation.id === 'space-intro-axis')
  ).toHaveLength(1)
  expect(
    animations.find((animation) => animation.id === 'space-intro-axis')!.target
  ).toBe('space-ruler-axis')
  expect(
    animations.every((animation) => animation.frames[0].opacity === '0')
  ).toBe(true)
  expect(
    animations.every((animation) => animation.frames.at(-1)!.opacity === '1')
  ).toBe(true)
  for (const animation of animations) expectTranslateOnly(animation)

  const width = page.viewportSize()!.width
  const travel = width + 160
  const axis = animations.find(
    (animation) => animation.id === 'space-intro-axis'
  )!
  expect(axis.delay).toBe(60)
  expect(entranceTranslateX(axis.frames[0].transform!)).toBeCloseTo(-travel, 1)

  const marks = animations.filter(
    (animation) => animation.id === 'space-intro-mark'
  )
  expect(marks.length).toBeGreaterThan(0)
  for (const mark of marks) {
    expect(mark.delay).toBe(60)
    expect(entranceTranslateX(mark.frames[0].transform!)).toBeCloseTo(
      -travel,
      1
    )
  }

  const topTicks = animations.filter(
    (animation) => animation.id === 'space-intro-tick'
  )
  expect(topTicks.length).toBeGreaterThan(0)
  for (const tick of topTicks) {
    expect(tick.delay).toBe(0)
    expect(entranceTranslateX(tick.frames[0].transform!)).toBeCloseTo(travel, 1)
  }
  const topLabels = animations.filter(
    (animation) => animation.id === 'space-intro-label' && animation.isTopTick
  )
  expect(topLabels.length).toBeGreaterThan(0)
  for (const label of topLabels) {
    expect(label.delay).toBe(0)
    expect(entranceTranslateX(label.frames[0].transform!)).toBeCloseTo(
      travel,
      1
    )
  }

  const laneDirections = new Map<number, { delay: number; direction: number }>()
  const lanes = [
    ...new Set(
      animations
        .filter((animation) => animation.isLandmark)
        .map((animation) => animation.laneTop!)
    ),
  ].sort((a, b) => a - b)
  expect(lanes).toEqual([32, 96])
  lanes.forEach((lane, index) => {
    laneDirections.set(lane, {
      delay: index === 0 ? 120 : 180,
      direction: index % 2 === 0 ? -1 : 1,
    })
  })
  const lower = animations.filter(
    (animation) =>
      animation.id === 'space-intro-stem' ||
      (animation.id === 'space-intro-label' && animation.isLandmark)
  )
  expect(lower.length).toBeGreaterThan(0)
  for (const animation of lower) {
    const expected = laneDirections.get(animation.laneTop!)!
    expect(animation.delay).toBe(expected.delay)
    expect(entranceTranslateX(animation.frames[0].transform!)).toBeCloseTo(
      expected.direction * travel,
      1
    )
  }
  const grouped = new Map<string, typeof lower>()
  for (const animation of lower) {
    const key = `${animation.laneTop}:${animation.inlineTransform}`
    grouped.set(key, [...(grouped.get(key) ?? []), animation])
  }
  for (const pair of grouped.values()) {
    if (!pair.some((animation) => animation.id === 'space-intro-stem')) continue
    expect(pair.some((animation) => animation.id === 'space-intro-label')).toBe(
      true
    )
    expect(new Set(pair.map((animation) => animation.delay)).size).toBe(1)
    expect(
      new Set(
        pair.map((animation) =>
          entranceTranslateX(animation.frames[0].transform!)
        )
      ).size
    ).toBe(1)
  }

  expect(
    Math.max(
      ...animations.map(
        (animation) => Number(animation.delay) + Number(animation.duration)
      )
    )
  ).toBeLessThanOrEqual(980)

  const samples = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.space-atlas')!
    const animations = root
      .getAnimations({ subtree: true })
      .filter((a) => a.id.startsWith('space-intro-'))
    for (const animation of animations) {
      animation.pause()
      const timing = animation.effect!.getTiming()
      animation.currentTime = Number(timing.delay) + Number(timing.duration)
    }
    const axis = document.querySelector<HTMLElement>('.space-ruler-axis')!
    const before = {
      transform: getComputedStyle(axis).transform,
      box: axis.getBoundingClientRect().toJSON(),
    }
    const animation = animations.find((a) => a.id === 'space-intro-axis')!
    animation.currentTime =
      Number(animation.effect!.getTiming().delay) +
      Number(animation.effect!.getTiming().duration) / 2
    const during = { transform: getComputedStyle(axis).transform }
    for (const animation of animations) animation.play()
    return { before, during }
  })
  expect(samples.before.transform).toMatch(
    /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/
  )
  expect(samples.during.transform).not.toBe(samples.before.transform)
  expect(samples.before.box.x).toBe(0)
  expect(samples.before.box.width).toBe(width)
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.id.startsWith('space-intro-')) animation.finish()
    }
  })
  await page.clock.runFor(1000)
  await expect(page.locator(root)).toHaveAttribute('data-intro', 'done')
  expect(await introAnimations(page)).toHaveLength(0)
  await expect(page.locator('.space-ruler-axis')).toHaveCount(1)
  await expect(page.locator('.space-intro-axis-piece')).toHaveCount(0)
  expect(
    await page.locator('.space-ruler-axis').evaluate((axis) => axis.outerHTML)
  ).toBe(originalAxis)
  await expectFinalProjection(page)
})

test('reduced motion shows the ruler immediately and creates no intro animations', async ({
  page,
}) => {
  await gotoFrozen(page, 'reduce')
  await twoFrames(page)
  await expect(page.locator(root)).toHaveAttribute('data-intro', 'done')
  expect(await introAnimations(page)).toHaveLength(0)
  await expect(page.locator('.space-ruler-axis')).toBeVisible()
})

for (const eventName of [
  'wheel',
  'keydown',
  'pointerdown',
  'focusin',
  'input',
  'gesturestart',
  'click',
] as const) {
  test(`${eventName} on the atlas capture path cancels intro before camera changes`, async ({
    page,
  }) => {
    await gotoFrozen(page, 'no-preference')
    await twoFrames(page)
    const beforeCenter = await page.locator(world).getAttribute('data-center')
    const beforeScale = await page.locator(world).getAttribute('data-scale')
    await page.locator(root).evaluate((atlas, name) => {
      const target =
        name === 'focusin' || name === 'input'
          ? document.querySelector<HTMLInputElement>('input')!
          : atlas
      const init = { bubbles: true, cancelable: true, composed: true }
      if (name === 'keydown')
        target.dispatchEvent(
          new KeyboardEvent('keydown', { ...init, key: 'ArrowRight' })
        )
      else if (name === 'pointerdown')
        target.dispatchEvent(
          new PointerEvent('pointerdown', { ...init, button: 0, pointerId: 1 })
        )
      else if (name === 'wheel')
        target.dispatchEvent(new WheelEvent('wheel', { ...init, deltaY: 120 }))
      else target.dispatchEvent(new Event(name, init))
    }, eventName)
    await expect(page.locator(root)).toHaveAttribute('data-intro', 'done')
    expect(await introAnimations(page)).toHaveLength(0)
    await expect(page.locator('.space-intro-axis-piece')).toHaveCount(0)
    expect(await page.locator(world).getAttribute('data-center')).toBe(
      beforeCenter
    )
    expect(await page.locator(world).getAttribute('data-scale')).toBe(
      beforeScale
    )
  })
}

for (const action of ['resize', 'blur', 'hidden', 'reduce'] as const) {
  test(`${action} snaps a running intro done without stale effects`, async ({
    page,
  }) => {
    await gotoFrozen(page, 'no-preference')
    await twoFrames(page)
    if (action === 'resize')
      await page.setViewportSize({ width: 900, height: 700 })
    if (action === 'blur')
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    if (action === 'hidden') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          value: true,
          configurable: true,
        })
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }
    if (action === 'reduce')
      await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator(root)).toHaveAttribute('data-intro', 'done')
    expect(await introAnimations(page)).toHaveLength(0)
    await expect(page.locator('.space-intro-axis-piece')).toHaveCount(0)
    await expectFinalProjection(page)
  })
}

test('completed intro does not replay on pan, root changes or preferences, but reload starts a new intro', async ({
  page,
}) => {
  await gotoFrozen(page, 'no-preference')
  await twoFrames(page)
  await page.clock.runFor(1000)
  await expect(page.locator(root)).toHaveAttribute('data-intro', 'done')
  await page.locator(world).focus()
  await page.keyboard.press('ArrowRight')
  await page
    .getByRole('button', { name: 'Browse all tokens', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Root font size' })
    .selectOption('20')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator(root)).toHaveAttribute('data-intro', 'done')
  expect(await introAnimations(page)).toHaveLength(0)

  await page.reload()
  await expect(page.locator(root)).toHaveAttribute('data-intro', 'pending')
  await twoFrames(page)
  await expect(page.locator(root)).toHaveAttribute('data-intro', 'running')
})

test('wheel and keyboard interrupt the wave and apply their camera input immediately', async ({
  page,
}) => {
  await gotoFrozen(page)
  await twoFrames(page)
  const result = await page.locator(world).evaluate((surface) => {
    const event = new WheelEvent('wheel', {
      deltaX: 120,
      bubbles: true,
      cancelable: true,
    })
    surface.dispatchEvent(event)
    return {
      prevented: event.defaultPrevented,
      intro: surface.closest<HTMLElement>('.space-atlas')!.dataset.intro,
      effects: document
        .getAnimations()
        .filter((a) => a.id.startsWith('space-intro-')).length,
      axisPieces: document.querySelectorAll('.space-intro-axis-piece').length,
    }
  })
  expect(result).toEqual({
    prevented: true,
    intro: 'done',
    effects: 0,
    axisPieces: 0,
  })
  await expect(page.locator(world)).toHaveAttribute('data-center', '20')
  await page.locator(world).dispatchEvent('keydown', { key: 'Home' })
  await expect(page.locator(world)).toHaveAttribute('data-center', '16')
  expect(await introAnimations(page)).toHaveLength(0)
  await expectFinalProjection(page)
})
