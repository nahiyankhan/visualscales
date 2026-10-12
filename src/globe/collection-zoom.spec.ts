import { expect, test } from '@playwright/test'

const zoomIn = 'Zoom in'
const gridSelector = '.surface-grid'

test('zoom enlarges the same globe, preserves one-click relationships, and returns to exact camera', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/globe.html')
  const grid = page.locator(gridSelector)
  await expect(page.getByRole('button', { name: 'Explore color', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: zoomIn, exact: true }).click()
  await page.getByRole('button', { name: zoomIn, exact: true }).click()
  await page.getByRole('button', { name: zoomIn, exact: true }).click()
  await expect(grid).toHaveAttribute('data-collection-zoom', '1.9531')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.surface-viewport canvas')).toHaveCount(1)
  await page.mouse.move(650, 400)
  await page.mouse.wheel(130, 100)
  const position = await grid.getAttribute('data-position')
  const zoom = await grid.getAttribute('data-collection-zoom')
  const cards = JSON.parse((await grid.getAttribute('data-collection-cards'))!)
  const target = cards.sort((a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]
  const projected = await page.evaluate(async ({ x, y, z }) => {
    const path = '/src/globe/mesh-projection.ts'
    const { projectMeshPoint } = await import(/* @vite-ignore */ path)
    return projectMeshPoint(x, y, 3744 * z, 1800 * z)
  }, { x: target.x, y: target.y, z: Number(zoom) })
  await page.mouse.click(720 + projected.x, 500 + projected.y)
  await expect(page.locator('.token-surface')).toHaveAttribute('data-view', 'relationships')
  await expect(grid).toHaveAttribute('data-selected', target.id)
  await expect(grid).toHaveAttribute('data-rearranging', 'false')
  const network = JSON.parse((await grid.getAttribute('data-network-cards'))!)
  expect(network).toHaveLength(218)
  // Network pick uses its own scale, not the larger collection scale.
  const source = network.find((card: {id: string}) => card.id === target.id)
  await page.mouse.click(720 + source.x, 500 + source.y)
  await expect(grid).toHaveAttribute('data-selected', target.id)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Back to collection', exact: true }).click()
  await expect(grid).toHaveAttribute('data-position', position!)
  await expect(grid).toHaveAttribute('data-collection-zoom', zoom!)
  await page.screenshot({ path: 'test-results/globe-closeup-desktop.png' })
  await page.getByRole('button', { name: /^Reset zoom/ }).click()
  await expect(grid).toHaveAttribute('data-collection-zoom', '1.0000')
  expect(errors).toEqual([])
})

test('modified wheel anchors the sphere point; ordinary scroll still pans; clamps are reversible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/globe.html')
  const grid = page.locator(gridSelector)
  const point = { x: 380, y: 270 }
  const before = await grid.getAttribute('data-position')
  const prevented = await page.locator('.surface-viewport').evaluate((surface, point) => !surface.dispatchEvent(new WheelEvent('wheel', { clientX: point.x, clientY: point.y, deltaY: -50, ctrlKey: true, cancelable: true, bubbles: true })), point)
  expect(prevented).toBe(true)
  await expect.poll(async () => Number(await grid.getAttribute('data-collection-zoom'))).toBeGreaterThan(1)
  expect(await grid.getAttribute('data-position')).not.toBe(before)
  const zoom = await grid.getAttribute('data-collection-zoom')
  const zoomPosition = await grid.getAttribute('data-position')
  await page.mouse.move(500, 400)
  await page.mouse.wheel(80, 60)
  await expect(grid).toHaveAttribute('data-collection-zoom', zoom!)
  await expect(grid).not.toHaveAttribute('data-position', zoomPosition!)
  const viewport = page.getByRole('region', { name: 'Infinite curved token grid' })
  await viewport.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('+')
  await expect(grid).toHaveAttribute('data-collection-zoom', '3.0000')
  await expect(page.getByRole('button', { name: zoomIn, exact: true })).toBeDisabled()
  for (let i = 0; i < 15; i++) await page.keyboard.press('-')
  await expect(grid).toHaveAttribute('data-collection-zoom', '0.6500')
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled()
  await page.keyboard.press('0')
  await expect(grid).toHaveAttribute('data-collection-zoom', '1.0000')
  const browserZoomPrevented = await viewport.evaluate(surface => !surface.dispatchEvent(new KeyboardEvent('keydown', { key: '+', ctrlKey: true, cancelable: true, bubbles: true })))
  expect(browserZoomPrevented).toBe(false)
})

test('mobile touch pinch zooms the globe, hands off to pan, and does not select a card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/globe.html')
  const grid = page.locator(gridSelector)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 110, y: 410, id: 1 }, { x: 240, y: 410, id: 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 50, y: 410, id: 1 }, { x: 320, y: 410, id: 2 }] })
  await expect.poll(async () => Number(await grid.getAttribute('data-collection-zoom'))).toBeGreaterThan(1.9)
  await expect(grid).toHaveAttribute('data-selected', '')
  await expect(page.locator('.token-surface')).toHaveAttribute('data-view', 'collection')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 320, y: 410, id: 2 }] })
  const before = await grid.getAttribute('data-position')
  const zoom = await grid.getAttribute('data-collection-zoom')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 170, y: 440, id: 1 }] })
  await expect(grid).not.toHaveAttribute('data-position', before!)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(grid).toHaveAttribute('data-collection-zoom', zoom!)
  await expect(grid).toHaveAttribute('data-selected', '')
  const position = await grid.getAttribute('data-position')
  await page.getByRole('button', { name: 'Relationships', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(grid).toHaveAttribute('data-position', position!)
  await expect(grid).toHaveAttribute('data-collection-zoom', zoom!)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/globe-closeup-mobile.png' })
  await cdp.detach()
})

test('search clearing at close zoom restores color geography without changing distance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/globe.html')
  const grid = page.locator(gridSelector)
  await page.getByRole('button', { name: zoomIn, exact: true }).click()
  const before = (await grid.getAttribute('data-position'))!.split(',').map(Number)
  await page.getByRole('searchbox').fill('indigo.600')
  await expect(grid).toHaveAttribute('data-query', 'indigo.600')
  await page.getByRole('button', { name: zoomIn, exact: true }).click()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(grid).toHaveAttribute('data-collection-zoom', '1.5625')
  const after = (await grid.getAttribute('data-position'))!.split(',').map(Number)
  expect(after[0]).toBeCloseTo(before[0] * 1.25, 1)
  expect(after[1]).toBeCloseTo(before[1] * 1.25, 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(grid).toHaveAttribute('data-collection-zoom', '1.5625')
  await page.getByRole('button', { name: 'Relationships', exact: true }).click()
  await page.getByRole('button', { name: 'Back to collection', exact: true }).click()
  await expect(grid).toHaveAttribute('data-collection-zoom', '1.5625')
})

test('Safari-style gesture events zoom in place and context recovery keeps distance', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/globe.html')
  await page.locator('.surface-viewport').evaluate(surface => {
    for (const [name, scale] of [['gesturestart', 1], ['gesturechange', 2], ['gestureend', 2]] as const) {
      const event = new Event(name, { cancelable: true, bubbles: true })
      Object.assign(event, { scale, clientX: 650, clientY: 400 })
      surface.dispatchEvent(event)
    }
  })
  const grid = page.locator(gridSelector)
  await expect(grid).toHaveAttribute('data-collection-zoom', '2.0000')
  const before = await grid.getAttribute('data-position')
  await grid.evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })))
  await expect(page.locator('.token-surface')).toHaveAttribute('data-renderer', 'unavailable')
  await grid.evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextrestored')))
  await expect(page.locator('.token-surface')).toHaveAttribute('data-renderer', 'webgl')
  await expect(grid).toHaveAttribute('data-collection-zoom', '2.0000')
  await expect(grid).toHaveAttribute('data-position', before!)
  await page.getByRole('button', { name: 'Relationships', exact: true }).click()
  await expect(grid).toHaveAttribute('data-rearranging', 'false')
  await page.keyboard.press('Escape')
  await expect(grid).toHaveAttribute('data-rearranging', 'false')
  await expect(grid).toHaveAttribute('data-collection-zoom', '2.0000')
  await expect(grid).toHaveAttribute('data-position', before!)
  expect(errors).toEqual([])
})

for (const width of [320, 390, 480, 1440]) {
  test(`bottom controls share one row and remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/globe.html')

    const search = page.locator('.surface-toolbar')
    const modes = page.getByRole('group', { name: 'Visualization', exact: true })
    for (const name of ['Collection', 'Relationships']) {
      const button = modes.getByRole('button', { name, exact: true })
      await expect(button).toHaveAccessibleName(name)
      await expect(button).toHaveAttribute('title', name.toLowerCase())
      await expect(button.locator('svg')).toBeVisible()
      await expect(button.locator('span')).toHaveCSS('clip-path', 'inset(50%)')
      await expect(button).toHaveCSS('width', width <= 600 ? '36px' : '44px')
    }
    const checkLayout = async (zoomName: string) => {
      const zoom = page.getByRole('group', { name: zoomName, exact: true })
      const shadow = 'rgba(0, 0, 0, 0.35) 0px 4px 10px 0px, rgba(0, 0, 0, 0.6) 0px 16px 40px 0px'
      for (const control of [search, modes, zoom]) {
        await expect(control).toBeInViewport({ ratio: 1 })
        await expect(control).toHaveCSS('box-shadow', shadow)
        await expect(control).toHaveCSS('border-top-width', '0px')
        await expect(control).toHaveCSS('background-color', 'rgb(27, 29, 31)')
      }
      const searchBox = (await search.boundingBox())!
      const modeBox = (await modes.boundingBox())!
      const zoomBox = (await zoom.boundingBox())!
      expect(modeBox.y + modeBox.height / 2).toBeCloseTo(searchBox.y + searchBox.height / 2, 0)
      expect(zoomBox.y + zoomBox.height / 2).toBeCloseTo(searchBox.y + searchBox.height / 2, 0)
      expect(modeBox.x + modeBox.width).toBeLessThanOrEqual(searchBox.x)
      expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(zoomBox.x)
      const expectedGap = width <= 600 ? 6 : 12
      expect(searchBox.x - (modeBox.x + modeBox.width)).toBeCloseTo(expectedGap, 1)
      expect(zoomBox.x - (searchBox.x + searchBox.width)).toBeCloseTo(expectedGap, 1)
      await expect(page.locator('.collection-gesture-hint, .network-gesture-hint')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }

    await checkLayout('Zoom')
    const controls = page.getByRole('group', { name: 'Zoom', exact: true })
    const measureControls = async () => {
      await page.mouse.move(0, 0) // Compare the same resting state, not a hovered + button.
      return controls.evaluate(group => {
        const bounds = group.getBoundingClientRect()
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, buttons: [...group.querySelectorAll('button')].map(button => {
          const style = getComputedStyle(button)
          return { width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, background: style.backgroundColor, radius: style.borderRadius, font: style.font }
        }) }
      })
    }
    const collectionControls = await measureControls()
    await expect(controls.getByRole('button')).toHaveText(['−', '100%', '+'])
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(page.locator('.surface-grid')).toHaveAttribute('data-collection-zoom', '1.2500')
    await expect(controls.getByRole('button')).toHaveText(['−', '125%', '+'])
    await page.getByRole('button', { name: 'Relationships', exact: true }).click()
    await checkLayout('Zoom')
    await expect(controls.getByRole('button')).toHaveText(['−', '100%', '+'])
    expect(await measureControls()).toEqual(collectionControls)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(controls.getByRole('button')).toHaveText(['−', '125%', '+'])
    expect(await measureControls()).toEqual(collectionControls)
    const back = page.getByRole('button', { name: 'Back to collection', exact: true })
    await expect(back).toBeInViewport({ ratio: 1 })
    const backBox = (await back.boundingBox())!
    const searchBox = (await search.boundingBox())!
    expect(backBox.y + backBox.height).toBeLessThanOrEqual(searchBox.y)
    await back.click()
    await checkLayout('Zoom')
    await expect(controls.getByRole('button')).toHaveText(['−', '125%', '+'])
    expect(await measureControls()).toEqual(collectionControls)
  })
}

test('globe chrome and rendered card text use lowercase without changing token data', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const paintedText: string[] = []
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fillText>) {
      paintedText.push(args[0])
      return fillText.apply(this, args)
    }
    Object.assign(window, { paintedText })
  })
  await page.goto('/globe.html')
  await expect(page.locator('.token-surface')).toHaveCSS('text-transform', 'lowercase')
  await expect(page.getByRole('searchbox')).toHaveCSS('text-transform', 'lowercase')
  await expect(page.getByRole('button', { name: 'Collection', exact: true })).toHaveCSS('text-transform', 'lowercase')
  const paintedText = await page.evaluate(() => (window as unknown as { paintedText: string[] }).paintedText)
  expect(paintedText.length).toBeGreaterThan(0)
  expect(paintedText.every(text => text === text.toLowerCase())).toBe(true)
  await page.getByRole('searchbox').fill('#5D61CA')
  await expect(page.getByRole('searchbox')).toHaveValue('#5D61CA')
  await expect(page.locator('.surface-search-results code').first()).toHaveCSS('text-transform', 'lowercase')
})
