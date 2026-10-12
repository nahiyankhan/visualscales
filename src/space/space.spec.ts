import { expect, test } from '@playwright/test'

const ruler = '.space-world'
async function find(page: import('@playwright/test').Page, query: string) {
  await page.getByRole('searchbox', { name: 'Search space tokens' }).fill(query)
  await page.locator('.space-results button').first().click()
}

test('opens on a partial edge-to-edge ruler, not a fitted catalog, with no console errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/space.html')
  const world = page.locator(ruler)
  await expect(world).toHaveAttribute('data-center', '16')
  await expect(world).toHaveAttribute('data-scale', '30')
  await expect(
    page.getByRole('region', { name: 'Focused measurement', exact: true })
  ).toHaveCount(0)
  // Assert final geometry after the existing entrance animation settles.
  await expect(page.locator('.space-atlas')).toHaveAttribute('data-intro', 'done')
  const bounds = await page.locator('.space-ruler-axis').boundingBox()
  const width = page.viewportSize()!.width
  expect(bounds!.x).toBe(0)
  expect(bounds!.width).toBe(width)
  expect(await page.locator('.space-stop').count()).toBeLessThan(50)
  await expect(
    page.locator(
      '.space-header, .space-geography, .space-center-readout, .space-scale-key, .space-gesture-hint'
    )
  ).toHaveCount(0)
  await expect(
    page.getByRole('combobox', { name: 'Root font size' })
  ).toHaveCount(0)
  await expect(
    page.locator('.space-stop-kinds, .space-stop-expand')
  ).toHaveCount(0)
  await find(page, 'space.400')
  await expect(
    page.getByRole('heading', { name: '16px', exact: true })
  ).toBeVisible()
  await expect(page.locator('.space-specimen')).toHaveCount(5)
  await expect(page.locator('.space-specimen-type-sample')).toHaveCSS(
    'font-size',
    '16px'
  )
  await expect(page.locator('.space-specimen-gap-row').first()).toHaveCSS(
    'gap',
    '16px'
  )
  await expect(page.locator('.space-specimen-radius-object')).toHaveCSS(
    'border-radius',
    '16px'
  )
  await page.getByRole('button', { name: 'Clear focus', exact: true }).click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  expect(errors).toEqual([])
})

test('mixed focus preserves alias identity and local navigation remains selectable', async ({
  page,
}) => {
  await page.goto('/space.html')
  await find(page, 'space.500')
  await expect(
    page.getByRole('heading', { name: '24px', exact: true })
  ).toBeVisible()
  await expect(page.locator('.space-specimen')).toHaveCount(6)
  await expect(page.locator('.space-specimen-leading-text')).toHaveCSS(
    'line-height',
    '24px'
  )
  await expect(
    page.locator('.space-specimen').filter({ hasText: 'space.inset' })
  ).toContainText('alias of space.500')
  await expect(page.locator('.space-stop[data-value="24"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.locator('.space-specimen').filter({ hasText: 'radius.24' }).click()
  await expect(
    page.locator('.space-specimen').filter({ hasText: 'radius.24' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.space-specimen')).toHaveCount(6)
  // Check the settled focus layout, not the in-flight selection transition.
  await expect
    .poll(async () => {
      const stopBounds = await page
        .locator('.space-stop[data-value="24"]')
        .boundingBox()
      const specimenBounds = await page
        .locator('.space-specimen-strip')
        .boundingBox()
      return stopBounds!.y + stopBounds!.height - specimenBounds!.y
    })
    .toBeLessThan(0)
})

test('root context recomputes rem and leading, but px stays invariant', async ({
  page,
}) => {
  await page.goto('/space.html')
  await find(page, 'type.body.size')
  await expect(
    page.getByRole('heading', { name: '16px', exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Browse all tokens', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Root font size' })
    .selectOption('20')
  await expect(
    page.getByRole('heading', { name: '20px', exact: true })
  ).toBeVisible()
  await expect(
    page.locator('.space-specimen').filter({ hasText: 'type.body.size' })
  ).toContainText('1rem → 20px')
  await find(page, 'type.body.leading')
  await expect(
    page.getByRole('heading', { name: '30px', exact: true })
  ).toBeVisible()
  await expect(page.locator('.space-specimen-leading-text').first()).toHaveCSS(
    'line-height',
    '30px'
  )
  await find(page, 'space.400')
  await expect(
    page.getByRole('heading', { name: '16px', exact: true })
  ).toBeVisible()
})

test('keyboard pans and zooms, Enter selects center and Escape clears, search stays literal', async ({
  page,
}) => {
  await page.goto('/space.html')
  const world = page.locator(ruler)
  await world.focus()
  await page.keyboard.press('ArrowRight')
  expect(Number(await world.getAttribute('data-center'))).toBeGreaterThan(16)
  await page.keyboard.press('+')
  expect(Number(await world.getAttribute('data-scale'))).toBeGreaterThan(30)
  await page.keyboard.press('Home')
  await expect(world).toHaveAttribute('data-center', '16')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: '16px', exact: true })
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('region', { name: 'Focused measurement', exact: true })
  ).toHaveCount(0)
  await page
    .getByRole('searchbox', { name: 'Search space tokens' })
    .fill('nonexistent-xyz')
  await expect(page.locator('.space-results')).toContainText('No matches')
  await page
    .getByRole('searchbox', { name: 'Search space tokens' })
    .fill('radius.8')
  await page
    .getByRole('searchbox', { name: 'Search space tokens' })
    .press('Enter')
  await expect(
    page.getByRole('heading', { name: '8px', exact: true })
  ).toBeVisible()
})

test('browse exposes all 50 expressions, large dimensions are not silently scaled', async ({
  page,
}) => {
  await page.goto('/space.html')
  await page
    .getByRole('button', { name: 'Browse all tokens', exact: true })
    .click()
  await expect(page.locator('.space-results button')).toHaveCount(50)
  await page
    .locator('.space-results button')
    .filter({ hasText: 'size.container.960' })
    .click()
  await expect(page.locator(ruler)).toHaveAttribute('data-center', '960')
  await expect(page.locator('.space-specimen-wide-box')).toHaveCSS(
    'width',
    '960px'
  )
  await expect(page.locator('.space-specimen')).toContainText('clipped')
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect(page.locator(ruler)).toHaveAttribute('data-center', '16')
})

test('pointer drag vs click, wheel pan, cursor anchored zoom, and blank geography', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'mouse/trackpad path; touch covered separately')
  await page.goto('/space.html')
  const world = page.locator(ruler)
  const bounds = await world.boundingBox()
  const width = bounds!.width
  const x = width * 0.65,
    y = bounds!.y + 20
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 140, y, { steps: 10 })
  const centerDuring = Number(await world.getAttribute('data-center'))
  expect(centerDuring).toBeCloseTo(16 + 140 / 30)
  await page.mouse.up()
  await world.focus()
  await page.keyboard.press('Home')
  const stop = page.locator('.space-stop[data-value="24"]')
  await stop.click()
  await expect(
    page.getByRole('heading', { name: '24px', exact: true })
  ).toBeVisible()
  await expect(world).toHaveAttribute('data-center', '24')
  await page.mouse.move(width * 0.65, bounds!.y + 20)
  const beforeCenter = Number(await world.getAttribute('data-center'))
  const beforeScale = Number(await world.getAttribute('data-scale'))
  const anchorValue = beforeCenter + (width * 0.65 - width / 2) / beforeScale
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -40)
  await page.keyboard.up('Control')
  await expect
    .poll(async () => Number(await world.getAttribute('data-scale')))
    .toBeGreaterThan(beforeScale)
  const center = Number(await world.getAttribute('data-center')),
    scale = Number(await world.getAttribute('data-scale'))
  expect(width / 2 + (anchorValue - center) * scale).toBeCloseTo(
    width * 0.65,
    1
  )
  await page.mouse.wheel(0, 320)
  await expect
    .poll(async () => Number(await world.getAttribute('data-center')))
    .toBeGreaterThan(center)
  await find(page, 'size.container.960')
  await page.getByRole('button', { name: 'Clear focus', exact: true }).click()
  await world.focus()
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.space-no-landmarks')).toContainText('No tokens')
})

test('coarse clusters zoom into real separate measurements; fine strokes remain inspectable', async ({
  page,
}) => {
  await page.goto('/space.html')
  const cluster = page
    .locator('.space-stop[data-cluster]')
    .filter({ hasText: '16–18' })
  if (await cluster.count()) {
    await cluster.click()
    await expect
      .poll(async () =>
        Number(await page.locator(ruler).getAttribute('data-scale'))
      )
      .toBeGreaterThan(30)
    await expect(page.locator('.space-stop[data-value="16"]')).toBeVisible()
  }
  await find(page, 'border.0.5')
  await expect(
    page.getByRole('heading', { name: '0.5px', exact: true })
  ).toBeVisible()
  await expect(page.locator('.space-specimen-border-line')).toHaveCSS(
    'height',
    '0.5px'
  )
})

test('touch pinch hands back to one-finger pan without jump or accidental selection', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'mobile pointer path')
  await page.goto('/space.html')
  const world = page.locator(ruler)
  const bounds = await world.boundingBox()
  await world.dispatchEvent('pointerdown', {
    pointerId: 101,
    pointerType: 'touch',
    button: 0,
    clientX: 140,
    clientY: bounds!.y + 20,
  })
  await world.dispatchEvent('pointerdown', {
    pointerId: 102,
    pointerType: 'touch',
    button: 0,
    clientX: 240,
    clientY: bounds!.y + 20,
  })
  await world.dispatchEvent('pointermove', {
    pointerId: 102,
    pointerType: 'touch',
    clientX: 300,
    clientY: bounds!.y + 20,
  })
  expect(Number(await world.getAttribute('data-scale'))).toBeGreaterThan(30)
  await world.dispatchEvent('pointerup', {
    pointerId: 102,
    pointerType: 'touch',
    clientX: 300,
    clientY: bounds!.y + 20,
  })
  const center = Number(await world.getAttribute('data-center'))
  await world.dispatchEvent('pointermove', {
    pointerId: 101,
    pointerType: 'touch',
    clientX: 100,
    clientY: bounds!.y + 20,
  })
  expect(Number(await world.getAttribute('data-center'))).toBeGreaterThan(
    center
  )
  await world.dispatchEvent('pointerup', {
    pointerId: 101,
    pointerType: 'touch',
  })
  await expect(world).not.toHaveAttribute('data-dragging')
  await expect(
    page.getByRole('region', { name: 'Focused measurement', exact: true })
  ).toHaveCount(0)
})

test('selection can be reached immediately by keyboard after pointer cancellation; blur stops inertia', async ({
  page,
  isMobile,
}) => {
  await page.goto('/space.html')
  const world = page.locator(ruler)
  await world.dispatchEvent('pointercancel', {
    pointerId: 1,
    pointerType: 'touch',
  })
  const stop = page.locator('.space-stop[data-value="24"]')
  await stop.focus()
  await page.keyboard.press('Enter')
  await expect(world).toHaveAttribute('data-center', '24')
  await expect(
    page.getByRole('heading', { name: '24px', exact: true })
  ).toBeVisible()
  if (!isMobile) {
    const bounds = await world.boundingBox()
    await page.mouse.move(bounds!.width * 0.6, bounds!.y + 20)
    await page.mouse.down()
    await page.mouse.move(bounds!.width * 0.6 - 100, bounds!.y + 20, {
      steps: 3,
    })
    await page.mouse.up()
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    const center = await world.getAttribute('data-center')
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    expect(await world.getAttribute('data-center')).toBe(center)
  }
})

test('active ruler stop clears focus without adding a separate detail view', async ({
  page,
}) => {
  await page.goto('/space.html')
  const stop = page.locator('.space-stop[data-value="24"]')
  await stop.click()
  await expect(stop).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.space-specimen')).toHaveCount(6)
  await expect(
    page.locator('.space-focus-header, .space-specimen-head')
  ).toHaveCount(0)
  await expect(page.locator('.space-specimen-detail')).toHaveCount(1)
  await stop.click()
  await expect(page.locator('.space-focus')).toHaveCount(0)
  await expect(stop).toHaveAttribute('aria-pressed', 'false')
})

test('engraved marks retain each unique value through zoom, pan, search and root changes', async ({
  page,
}) => {
  await page.goto('/space.html')
  const world = page.locator(ruler)
  const marks = page.locator('.space-value-mark')
  await expect(page.locator('.space-atlas')).toHaveAttribute(
    'data-intro',
    'done'
  )
  const { groupMeasurements, resolveMeasurements } = await import('./data.js')
  await expect
    .poll(
      async () => (await page.locator('.space-ruler-axis').boundingBox())!.width
    )
    .toBe(page.viewportSize()!.width)
  async function check(root = 16) {
    const expected = groupMeasurements(resolveMeasurements(root)).map(
      (group) => group.value
    )
    const actual = await marks.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          value: Number((element as HTMLElement).dataset.value),
          x: rect.x + rect.width / 2,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }
      })
    )
    expect(actual.map((mark) => mark.value)).toEqual(expected)
    const center = Number(await world.getAttribute('data-center'))
    const scale = Number(await world.getAttribute('data-scale'))
    const axis = await page.locator('.space-ruler-axis').boundingBox()
    for (const mark of actual) {
      expect(mark.x).toBeCloseTo(
        page.viewportSize()!.width / 2 + (mark.value - center) * scale,
        1
      )
      expect(mark.width).toBe(1)
      expect(mark.height).toBe(8)
      expect(mark.y - axis!.y).toBeCloseTo(2, 1)
    }
    return actual
  }
  const opening = await check()
  expect(opening.filter((mark) => mark.value === 16)).toHaveLength(1)
  await expect(page.locator('.space-value-marks')).toHaveAttribute(
    'aria-hidden',
    'true'
  )
  await expect(page.locator('.space-stop[data-cluster]')).not.toHaveCount(0)
  await world.focus()
  for (let i = 0; i < 6; i++) await page.keyboard.press('+')
  const fine = await check()
  const distance = (values: typeof fine) =>
    values.find((mark) => mark.value === 1)!.x -
    values.find((mark) => mark.value === 0.5)!.x
  expect(distance(fine)).toBeGreaterThan(distance(opening))
  for (let i = 0; i < 24; i++) await page.keyboard.press('-')
  const coarse = await check()
  expect(distance(coarse)).toBeLessThan(1)
  await page.keyboard.press('ArrowRight')
  await check()
  await page
    .getByRole('searchbox', { name: 'Search space tokens' })
    .fill('radius')
  await check()
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect
    .poll(async () => Number(await world.getAttribute('data-scale')))
    .toBeCloseTo(30, 6)
  await expect(world).toHaveAttribute('data-center', '16')
  await page
    .getByRole('button', { name: 'Browse all tokens', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Root font size' })
    .selectOption('20')
  await check(20)
  await find(page, 'size.container.960')
  await expect(world).toHaveAttribute('data-center', '960')
  await check(20)
  await expect(page.locator('.space-value-mark[data-active]')).toHaveAttribute(
    'data-value',
    '960'
  )
})

test('number motion is restrained and interruption leaves no stale labels or moving engravings', async ({
  page,
}) => {
  await page.goto('/space.html')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const world = page.locator(ruler)
  // The world is full-width before ResizeObserver commits ruler projection.
  await expect(page.locator('.space-ruler')).toHaveAttribute(
    'data-width',
    String(page.viewportSize()!.width)
  )
  const result = await page.evaluate(async () => {
    const zoomIn = document.querySelector<HTMLButtonElement>(
      '[aria-label="Zoom in"]'
    )!
    const zoomOut = document.querySelector<HTMLButtonElement>(
      '[aria-label="Zoom out"]'
    )!
    const ruler = document.querySelector<HTMLElement>('.space-ruler')!
    const frames = async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
    }
    const click = (node: HTMLElement) => {
      node.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 })
      )
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    }
    click(zoomIn)
    await frames()
    const departures = [
      ...document.querySelectorAll<HTMLElement>('.space-number-departure'),
    ]
    const exits = departures.map((node) => ({
      hidden: node.getAttribute('aria-hidden'),
      inert: node.inert,
      interactive: node.querySelector('button, input, a, [tabindex]') !== null,
    }))
    const effects = [
      ...ruler.querySelectorAll(
        '[data-number-key], .space-number-departure > span'
      ),
    ].flatMap((node) =>
      node.getAnimations().map((animation) => ({
        duration: animation.effect!.getTiming().duration,
        keys: (animation.effect as KeyframeEffect)
          .getKeyframes()
          .map((frame) => ({
            transform: String(frame.transform),
            opacity: Number(frame.opacity),
          })),
      }))
    )
    const engravingAnimations = [
      ...ruler.querySelectorAll('.space-value-mark, .space-tick > i'),
    ].flatMap((node) => node.getAnimations()).length
    const returningKey = departures
      .find((node) => node.querySelector('[data-number-value]'))
      ?.querySelector<HTMLElement>('[data-number-value]')?.dataset.numberValue
    click(zoomOut)
    await frames()
    const restored = returningKey
      ? [...ruler.querySelectorAll<HTMLElement>('[data-number-key]')].some(
          (node) => node.dataset.numberValue === returningKey
        )
      : true
    return { exits, effects, engravingAnimations, restored }
  })
  expect(result.exits.length).toBeGreaterThan(0)
  expect(
    result.exits.every(
      (exit) => exit.hidden === 'true' && exit.inert && !exit.interactive
    )
  ).toBe(true)
  expect(result.effects.some((effect) => effect.duration === 180)).toBe(true)
  expect(result.effects.some((effect) => effect.duration === 140)).toBe(true)
  expect(
    result.effects.every((effect) =>
      effect.keys.every(
        (frame) =>
          frame.transform !== 'scale(0)' &&
          frame.opacity >= 0 &&
          frame.opacity <= 1
      )
    )
  ).toBe(true)
  expect(result.engravingAnimations).toBe(0)
  expect(result.restored).toBe(true)
  await world.focus()
  await page.keyboard.press('Home')
  await expect(page.locator('.space-number-departure')).toHaveCount(0)
  expect(
    await page
      .locator('[data-number-key]')
      .evaluateAll(
        (nodes) => nodes.flatMap((node) => node.getAnimations()).length
      )
  ).toBe(0)
  await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>(
      '[aria-label="Zoom in"]'
    )!
    button.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0 })
    )
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.space-number-departure')).toHaveCount(0)
  expect(
    await page
      .locator('[data-number-key]')
      .evaluateAll(
        (nodes) => nodes.flatMap((node) => node.getAnimations()).length
      )
  ).toBe(0)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  expect(
    await page
      .locator('[data-number-key]')
      .evaluateAll(
        (nodes) => nodes.flatMap((node) => node.getAnimations()).length
      )
  ).toBe(0)
})
