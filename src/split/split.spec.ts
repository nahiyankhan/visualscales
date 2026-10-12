import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const IDENTITY_ROTATION = '0.0000,0.0000,0.0000,1.0000'

type Rotation = [number, number, number, number]

type WheelOptions = {
  deltaX?: number
  deltaY?: number
  deltaMode?: number
  ctrlKey?: boolean
  metaKey?: boolean
  defaultPrevented?: boolean
  xFactor?: number
  yFactor?: number
}

function parseRotation(rotation: string | null): Rotation {
  expect(rotation).toBeTruthy()
  return rotation!.split(',').map(Number) as Rotation
}

function expectedWheelRotation(
  deltaX: number,
  deltaY: number,
  radius: number
): Rotation {
  const length = Math.hypot(deltaX, deltaY)
  if (!length) return [0, 0, 0, 1]
  const angle = Math.min(length / radius, Math.PI / 3)
  const sine = Math.sin(angle / 2)
  return [
    (-deltaY / length) * sine,
    (-deltaX / length) * sine,
    0,
    Math.cos(angle / 2),
  ]
}

function expectRotationClose(
  actual: string | null,
  expected: Rotation,
  precision = 3
) {
  const rotation = parseRotation(actual)
  for (let i = 0; i < rotation.length; i++)
    expect(rotation[i]).toBeCloseTo(expected[i], precision)
}

async function resetSpin(page: Page) {
  const sphere = page.locator('.split-spin')
  await sphere.focus()
  await page.keyboard.press('Home')
  await expect(sphere).toHaveAttribute('data-rotation', IDENTITY_ROTATION)
}

async function dispatchWheel(page: Page, options: WheelOptions) {
  return page.locator('.split-spin').evaluate((spin, input) => {
    const bounds = spin.getBoundingClientRect()
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width * (input.xFactor ?? 0.5),
      clientY: bounds.top + bounds.height * (input.yFactor ?? 0.5),
      deltaX: input.deltaX ?? 0,
      deltaY: input.deltaY ?? 0,
      deltaMode: input.deltaMode ?? 0,
      ctrlKey: input.ctrlKey,
      metaKey: input.metaKey,
    })
    if (input.defaultPrevented) event.preventDefault()
    const accepted = spin.dispatchEvent(event)
    return {
      accepted,
      defaultPrevented: event.defaultPrevented,
      rotation: spin.dataset.rotation ?? null,
      radius: bounds.width / 2,
      width: bounds.width,
      height: bounds.height,
    }
  }, options)
}

async function spinPixels(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '#split-canvas canvas'
    )!
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')!
    const controls = document.querySelector<HTMLElement>('.split-spin')!
    const bounds = controls.getBoundingClientRect()
    controls.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    const ratio = canvas.width / innerWidth
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    )
    const left: number[] = [],
      right: number[] = []
    for (
      let y = bounds.y + bounds.height * 0.25;
      y < bounds.y + bounds.height * 0.75;
      y += 4
    ) {
      for (const [sign, output] of [
        [-1, left],
        [1, right],
      ] as const) {
        for (
          let distance = bounds.width * 0.08;
          distance < bounds.width * 0.3;
          distance += 4
        ) {
          const x = Math.floor((innerWidth / 2 + distance * sign) * ratio)
          const row = canvas.height - Math.floor(y * ratio) - 1
          const i = (row * canvas.width + x) * 4
          output.push(pixels[i], pixels[i + 1], pixels[i + 2])
        }
      }
    }
    const chroma = (values: number[]) => {
      let total = 0
      for (let i = 0; i < values.length; i += 3)
        total +=
          Math.max(...values.slice(i, i + 3)) -
          Math.min(...values.slice(i, i + 3))
      return total / (values.length / 3)
    }
    return {
      left,
      right,
      leftChroma: chroma(left),
      rightChroma: chroma(right),
      rotation: controls.dataset.rotation,
    }
  })
}

test('one shared rotation preserves the screen-fixed color and measurement split', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.split-app')).toHaveAttribute(
    'data-renderer',
    'webgl'
  )
  await expect(page.locator('#split-canvas canvas')).toHaveCount(1)
  const first = await spinPixels(page)
  const next = await spinPixels(page)
  expect(first.rotation).not.toBe(next.rotation)
  expect(first.leftChroma).toBeGreaterThan(20)
  expect(first.rightChroma).toBeLessThan(15)
  expect(next.leftChroma).toBeGreaterThan(20)
  expect(next.rightChroma).toBeLessThan(15)
  expect(first.left).not.toEqual(next.left)
  expect(first.right).not.toEqual(next.right)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  expect(errors).toEqual([])
})

test('trackpad wheel pixels rotate immediately and do not coast', async ({
  page,
}) => {
  await page.goto('/')
  const sphere = page.locator('.split-spin')
  await expect(sphere).toBeVisible()
  const horizontal = await dispatchWheel(page, { deltaX: 48 })
  expect(horizontal.accepted).toBe(false)
  expect(horizontal.defaultPrevented).toBe(true)
  expectRotationClose(
    horizontal.rotation,
    expectedWheelRotation(48, 0, horizontal.radius)
  )

  const undoHorizontal = await dispatchWheel(page, { deltaX: -48 })
  expect(undoHorizontal.defaultPrevented).toBe(true)
  expectRotationClose(undoHorizontal.rotation, [0, 0, 0, 1])

  await resetSpin(page)
  const vertical = await dispatchWheel(page, { deltaY: 40 })
  expect(vertical.defaultPrevented).toBe(true)
  expectRotationClose(
    vertical.rotation,
    expectedWheelRotation(0, 40, vertical.radius)
  )

  await resetSpin(page)
  const diagonal = await dispatchWheel(page, { deltaX: 32, deltaY: -24 })
  expect(diagonal.defaultPrevented).toBe(true)
  expectRotationClose(
    diagonal.rotation,
    expectedWheelRotation(32, -24, diagonal.radius)
  )
  const afterBurst = diagonal.rotation
  await page.waitForTimeout(220)
  await expect(sphere).toHaveAttribute('data-rotation', afterBurst!)

  const undoDiagonal = await dispatchWheel(page, { deltaX: -32, deltaY: 24 })
  expectRotationClose(undoDiagonal.rotation, [0, 0, 0, 1])

  const clamped = await dispatchWheel(page, { deltaX: 10_000 })
  expect(clamped.defaultPrevented).toBe(true)
  expectRotationClose(
    clamped.rotation,
    expectedWheelRotation(10_000, 0, clamped.radius)
  )
  await resetSpin(page)

  const line = await dispatchWheel(page, { deltaX: 3, deltaMode: 1 })
  expect(line.defaultPrevented).toBe(true)
  expectRotationClose(line.rotation, expectedWheelRotation(48, 0, line.radius))
  await resetSpin(page)

  const pageMode = await dispatchWheel(page, { deltaY: 1, deltaMode: 2 })
  expect(pageMode.defaultPrevented).toBe(true)
  expectRotationClose(
    pageMode.rotation,
    expectedWheelRotation(0, pageMode.height, pageMode.radius)
  )
  await resetSpin(page)
})

test('trackpad wheel is consumed only inside the sphere circle', async ({
  page,
}) => {
  await page.goto('/')
  const sphere = page.locator('.split-spin')
  await expect(sphere).toBeVisible()
  await resetSpin(page)

  for (const input of [
    { deltaX: 40, xFactor: 0, yFactor: 0 },
    { deltaY: 40, xFactor: 1, yFactor: 0 },
    { deltaX: 40, xFactor: 0, yFactor: 1 },
    { deltaY: 40, xFactor: 1, yFactor: 1 },
    { deltaX: 40, xFactor: -0.1, yFactor: 0.5 },
    { deltaY: 40, xFactor: 0.5, yFactor: 1.1 },
    { deltaX: 40, ctrlKey: true },
    { deltaY: 40, metaKey: true },
    { deltaX: 40, defaultPrevented: true },
  ]) {
    const result = await dispatchWheel(page, input)
    expect(result.accepted).toBe(input.defaultPrevented !== true)
    expect(result.defaultPrevented).toBe(input.defaultPrevented === true)
    expect(result.rotation).toBe(IDENTITY_ROTATION)
  }
})

test('trackpad wheel is ignored during an active drag and Home resets after wheel input', async ({
  page,
}) => {
  await page.goto('/')
  const sphere = page.locator('.split-spin')
  await expect(sphere).toBeVisible()
  const bounds = (await sphere.boundingBox())!
  await sphere.dispatchEvent('pointerdown', {
    pointerId: 91,
    pointerType: 'touch',
    button: 0,
    clientX: bounds.x + bounds.width * 0.5,
    clientY: bounds.y + bounds.height * 0.5,
  })
  await expect(sphere).toHaveAttribute('data-dragging', 'true')
  const result = await dispatchWheel(page, { deltaX: 44 })
  expect(result.accepted).toBe(true)
  expect(result.defaultPrevented).toBe(false)
  expect(result.rotation).toBe(IDENTITY_ROTATION)
  await sphere.dispatchEvent('pointercancel', {
    pointerId: 91,
    pointerType: 'touch',
  })

  const rotated = await dispatchWheel(page, { deltaY: 44 })
  expect(rotated.defaultPrevented).toBe(true)
  expect(rotated.rotation).not.toBe(IDENTITY_ROTATION)
  await resetSpin(page)
})

test('desktop real wheel over the globe rotates without drag or navigation', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'real mouse wheel path is desktop-only')
  await page.goto('/')
  const sphere = page.locator('.split-spin')
  await expect(sphere).toBeVisible()
  const bounds = (await sphere.boundingBox())!
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2
  )
  await page.mouse.wheel(64, 0)
  await expect(sphere).not.toHaveAttribute('data-rotation', IDENTITY_ROTATION)
  await expect(sphere).not.toHaveAttribute('data-dragging')
  await expect(page).toHaveURL(/\/$/)

  await resetSpin(page)
  await page.mouse.move(
    bounds.x + bounds.width + 20,
    bounds.y + bounds.height / 2
  )
  await page.mouse.wheel(64, 0)
  await expect(sphere).toHaveAttribute('data-rotation', IDENTITY_ROTATION)
  await expect(page).toHaveURL(/\/$/)
})

test('drag does not navigate and each half opens the correct atlas', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'real mouse path; touch capture tested separately')
  await page.goto('/')
  const sphere = page.getByRole('button', {
    name: 'Rotate the shared color and space sphere',
  })
  await expect(sphere).toBeVisible()
  const box = (await sphere.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4, {
    steps: 8,
  })
  await page.mouse.up()
  await expect(page).toHaveURL(/\/$/)
  await expect(sphere).not.toHaveAttribute('data-dragging')
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5)
  await expect(page).toHaveURL(/space.html$/)
  await page.goto('/')
  await expect(sphere).toBeVisible()
  const again = (await sphere.boundingBox())!
  await page.mouse.click(
    again.x + again.width * 0.3,
    again.y + again.height * 0.5
  )
  await expect(page).toHaveURL(/\/globe\.html\?token=palette\./)
  const grid = page.locator('.surface-grid')
  await expect(grid).toHaveAttribute('data-intro', 'done')
  await expect(grid).toHaveAttribute('data-center-token', /palette\./)
})

test('reduced motion and WebGL failure retain artwork and native atlas links', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.split-poster img')).toBeVisible()
  await expect(page.locator('.split-spin')).toBeHidden()
  await expect(page.locator('#split-canvas canvas')).toHaveCount(0)
  const wheel = await dispatchWheel(page, { deltaX: 40 })
  expect(wheel.accepted).toBe(true)
  expect(wheel.defaultPrevented).toBe(false)
  expect(
    await page
      .locator('.split-poster img')
      .evaluate((img) => (img as HTMLImageElement).naturalWidth)
  ).toBeGreaterThan(0)
  await page.getByRole('link', { name: 'space', exact: true }).click()
  await expect(page).toHaveURL(/space.html$/)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith('webgl')) return null
      return Reflect.apply(original, this, [type, ...args])
    } as typeof original
  })
  await page.goto('/')
  await expect(page.locator('.split-app')).toHaveAttribute(
    'data-renderer',
    'poster'
  )
  await expect(
    page.getByRole('link', { name: 'color', exact: true })
  ).toBeVisible()
})

test('context loss cleans up and motion preference can change live', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.split-spin')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('#split-canvas canvas')).toHaveCount(0)
  const reducedWheel = await dispatchWheel(page, { deltaY: 40 })
  expect(reducedWheel.accepted).toBe(true)
  expect(reducedWheel.defaultPrevented).toBe(false)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.split-app')).toHaveAttribute(
    'data-renderer',
    'webgl'
  )
  await expect(page.locator('#split-canvas canvas')).toHaveCount(1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('#split-canvas canvas')).toHaveCount(0)
  const disposedWheel = await dispatchWheel(page, { deltaX: 40 })
  expect(disposedWheel.accepted).toBe(true)
  expect(disposedWheel.defaultPrevented).toBe(false)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.split-app')).toHaveAttribute(
    'data-renderer',
    'webgl'
  )
  await page
    .locator('#split-canvas canvas')
    .dispatchEvent('webglcontextlost', { cancelable: true })
  await expect(page.locator('#split-canvas canvas')).toHaveCount(0)
  await expect(page.locator('.split-poster img')).toBeVisible()
})

test('touch capture shares rotation, cancellation stops motion, and keyboard links stay usable', async ({
  page,
}) => {
  await page.goto('/')
  const sphere = page.locator('.split-spin')
  await expect(sphere).toBeVisible()
  const bounds = (await sphere.boundingBox())!
  const initial = await sphere.getAttribute('data-rotation')
  await sphere.dispatchEvent('pointerdown', {
    pointerId: 77,
    pointerType: 'touch',
    button: 0,
    clientX: bounds.x + bounds.width * 0.6,
    clientY: bounds.y + bounds.height * 0.5,
  })
  await sphere.dispatchEvent('pointermove', {
    pointerId: 77,
    pointerType: 'touch',
    clientX: bounds.x + bounds.width * 0.35,
    clientY: bounds.y + bounds.height * 0.4,
  })
  await expect(sphere).not.toHaveAttribute('data-rotation', initial!)
  await sphere.dispatchEvent('pointercancel', {
    pointerId: 77,
    pointerType: 'touch',
  })
  await expect(sphere).not.toHaveAttribute('data-dragging')
  await expect(page).toHaveURL(/\/$/)
  await sphere.focus()
  await page.keyboard.press('Home')
  await expect(sphere).toHaveAttribute('data-rotation', IDENTITY_ROTATION)
  const space = page.getByRole('link', { name: 'space', exact: true })
  await space.focus()
  await space.press('Enter')
  await expect(page).toHaveURL(/space.html$/)
})

test('split startup keeps poster hidden until delayed scene fades in without resizing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1280, height: 800 })
  let releaseScene!: () => void
  const sceneGate = new Promise<void>((resolve) => (releaseScene = resolve))
  await page.route(/\/src\/split\/scene\.ts(?:\?.*)?$/, async (route) => {
    await sceneGate
    await route.continue()
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const app = page.locator('.split-app')
  await expect(app).toHaveAttribute('data-renderer', 'loading')
  await expect(page.locator('.split-poster')).toBeHidden()
  await expect(page.locator('#split-canvas canvas')).toHaveCount(0)
  await expect
    .poll(() =>
      page.locator('.split-app header').evaluate((header) => {
        const rect = header.getBoundingClientRect()
        return Math.round(rect.left + rect.width / 2 - innerWidth / 2)
      })
    )
    .toBe(0)

  releaseScene()
  await expect(app).toHaveAttribute('data-renderer', 'webgl')
  await expect(page.locator('.split-poster')).toBeHidden()
  await expect(page.locator('#split-canvas canvas')).toHaveCount(1)
  await expect(page.locator('#split-canvas')).toHaveCSS(
    'transition-property',
    /(^|,\s*)opacity(,|$)/
  )
  const stable = async () => {
    const before = await page.locator('.split-spin').boundingBox()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    const after = await page.locator('.split-spin').boundingBox()
    expect(after).toEqual(before)
  }
  await stable()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('.split-spin').evaluate((spin) => {
    const box = spin.getBoundingClientRect()
    return Math.round(box.x + box.width / 2)
  })).toBe(195)
  await stable()
})

test('split inline watchdog restores poster when the scene module never resolves', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route(/\/src\/split\/scene\.ts(?:\?.*)?$/, () => new Promise(() => {}))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.split-app')).toHaveAttribute(
    'data-renderer',
    'loading'
  )
  await expect(page.locator('.split-poster')).toBeHidden()
  await expect(page.locator('.split-app')).toHaveAttribute(
    'data-renderer',
    'poster',
    { timeout: 7000 }
  )
  await expect(page.locator('.split-poster img')).toBeVisible()
})

test('legacy collection URLs redirect to globe before paint', async ({ page }) => {
  await page.goto('/?view=collection&token=palette.violet.400', {
    waitUntil: 'domcontentloaded',
  })
  await expect(page).toHaveURL('/globe.html?token=palette.violet.400')
  await expect(page.locator('.split-app')).toHaveCount(0)
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-center-token',
    'palette.violet.400'
  )
})

test('delayed globe module starts dark without entrance artwork then renders the token grid', async ({
  page,
}) => {
  let releaseGlobe!: () => void
  const globeGate = new Promise<void>((resolve) => (releaseGlobe = resolve))
  await page.route(/\/src\/globe\/main\.tsx(?:\?.*)?$/, async (route) => {
    await globeGate
    await route.continue()
  })
  await page.goto('/globe.html?token=palette.violet.400', {
    waitUntil: 'commit',
  })
  await expect(page.locator('.split-app')).toHaveCount(0)
  await expect(page.locator('.split-poster')).toHaveCount(0)
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  ).toBe('rgb(17, 18, 19)')

  releaseGlobe()
  await expect(page.locator('.token-surface')).toHaveAttribute(
    'data-renderer',
    /^(webgl|unavailable)$/
  )
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-center-token',
    'palette.violet.400'
  )
})

test('pagehide freezes the live split frame instead of swapping back to poster', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.split-app')).toHaveAttribute(
    'data-renderer',
    'webgl'
  )
  await dispatchWheel(page, { deltaX: 56, deltaY: -24 })
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect(page.locator('.split-app')).toHaveAttribute(
    'data-renderer',
    'webgl'
  )
  await expect(page.locator('.split-poster')).toBeHidden()
  await expect(page.locator('.split-spin')).toBeHidden()
  const frozen = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '#split-canvas canvas'
    )!
    const context = canvas.getContext('2d')!
    const { width, height } = canvas
    const pixel = context.getImageData(
      Math.floor(width * 0.35),
      Math.floor(height / 2),
      1,
      1
    ).data
    return { width, height, pixel: Array.from(pixel) }
  })
  expect(frozen.width).toBeGreaterThan(0)
  expect(frozen.height).toBeGreaterThan(0)
  expect(frozen.pixel[3]).toBeGreaterThan(0)
  expect(frozen.pixel.slice(0, 3).some((value) => value > 8)).toBe(true)
})

test('no-JavaScript keeps the original poster and both native destinations', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(`${baseURL}/`)
  await expect(page.locator('.split-poster img')).toBeVisible()
  expect(
    await page
      .locator('.split-poster img')
      .evaluate((img) => (img as HTMLImageElement).naturalWidth)
  ).toBeGreaterThan(0)
  await expect(
    page.getByRole('link', { name: 'color', exact: true })
  ).toHaveAttribute('href', '/globe.html?token=palette.indigo.600')
  await expect(
    page.getByRole('link', { name: 'space', exact: true })
  ).toHaveAttribute('href', '/space.html')
  await context.close()
})

test('both Visual Scales home pills and browser Back return to the shared entrance', async ({ page }) => {
  for (const destination of ['color', 'space']) {
    await page.goto('/')
    await page.getByRole('link', { name: destination, exact: true }).click()
    await expect(page).toHaveURL(destination === 'color'
      ? /\/globe\.html\?token=palette\./ : /\/space\.html$/)
    const home = page.getByRole('link', { name: 'visual scales home' })
    await expect(home).toHaveAttribute('href', '/')
    await home.focus()
    await home.press('Enter')
    await expect(page).toHaveURL('/')
    await expect(page.locator('.split-app')).toHaveAttribute('data-renderer', 'webgl')
    await page.getByRole('link', { name: destination, exact: true }).click()
    await expect(page).not.toHaveURL(/\/$/)
    await page.goBack()
    await expect(page).toHaveURL('/')
    await expect(page.locator('.split-spin')).toBeVisible()
  }
})

test('color entry keeps its alternating-row intro and exact sampled-token center', async ({ page }) => {
  await page.addInitScript(() => {
    const states: string[] = []
    ;(window as unknown as { introStates: string[] }).introStates = states
    new MutationObserver(() => {
      const state = document.querySelector('.surface-grid')?.getAttribute('data-intro')
      if (state && state !== states.at(-1)) states.push(state)
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-intro'] })
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'color', exact: true }).click()
  await expect(page.locator('.surface-grid')).toHaveAttribute('data-intro', 'done')
  expect(await page.evaluate(() => (window as unknown as { introStates: string[] }).introStates)).toContain('running')
  await expect(page.locator('.surface-grid')).toHaveAttribute('data-center-token', 'palette.indigo.600')
})

test('split study URL redirects and invalid color tokens use the fixture home', async ({ page }) => {
  await page.goto('/split.html')
  await expect(page).toHaveURL('/')
  await expect(page.locator('.split-spin')).toBeVisible()
  await page.goto('/globe.html?token=not-a-token')
  await expect(page.locator('.surface-grid')).toHaveAttribute('data-center-token', 'palette.indigo.600')
  await expect(page.getByRole('link', { name: 'visual scales home' })).toHaveAttribute('href', '/')
})
