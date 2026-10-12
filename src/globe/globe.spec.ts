import { expect, test } from '@playwright/test'
import { gridMetrics } from './model.js'
import { sampleData } from '../data/color/globe-data.js'
import { buildRelationships, type RelationshipToken } from './relationships.js'
import { relationshipDescriptions } from './connectors.js'
import { colorSurround } from './selection.js'

test('uses noticeably softened curvature geometry', async ({ page }) => {
  await page.goto('/globe.html')
  const size = await page
    .locator('.surface-grid')
    .evaluate((canvas) => ({
      width: (canvas as HTMLCanvasElement).clientWidth,
      height: (canvas as HTMLCanvasElement).clientHeight,
    }))
  const radius = gridMetrics(size.width, size.height).radius
  expect(radius).toBeGreaterThanOrEqual(3000)
})

test('WebGL failure shows a usable token list rather than a blank screen', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null
      return Reflect.apply(original, this, [type, ...args])
    } as typeof original
  })
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  await expect(page.locator('.token-surface')).toHaveAttribute(
    'data-renderer',
    'unavailable'
  )
  await expect(page.locator('.surface-fallback')).toContainText(
    '3D rendering is unavailable'
  )
  await expect(page.locator('.surface-sr-only li')).toHaveCount(
    sampleData.tokens.length
  )
  await expect(page.locator('.surface-sr-only li').first()).toBeInViewport()
})

test('context loss falls back and restoration rebuilds the meshes', async ({
  page,
}) => {
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  await expect(page.locator('.token-surface')).toHaveAttribute(
    'data-renderer',
    'webgl'
  )
  const supported = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    const gl = canvas.getContext('webgl') ?? canvas.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    ;(
      window as unknown as { restoreTestContext: () => void }
    ).restoreTestContext = () => extension.restoreContext()
    extension.loseContext()
    return true
  })
  test.skip(!supported, 'Context loss extension unavailable')
  await expect(page.locator('.token-surface')).toHaveAttribute(
    'data-renderer',
    'unavailable'
  )
  await page.evaluate(() =>
    (
      window as unknown as { restoreTestContext: () => void }
    ).restoreTestContext()
  )
  await expect(page.locator('.token-surface')).toHaveAttribute(
    'data-renderer',
    'webgl'
  )
})

test('faster pans soften more, reverse direction, and sharpen at rest', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  await expect(page.locator('.token-surface')).toHaveAttribute(
    'data-renderer',
    'webgl'
  )
  // Freeze automatic wall-clock advancement before comparing input speeds.
  // Otherwise slow GPU frames can age the input between Playwright commands.
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  const grid = page.locator('.surface-grid')
  const pan = async (delta: number) => {
    for (let i = 0; i < 12; i++) {
      await page
        .getByRole('region')
        .dispatchEvent('wheel', { deltaX: delta, deltaY: 0, deltaMode: 0 })
      await page.clock.runFor(16)
    }
    return Number((await grid.getAttribute('data-blur'))!.split(',')[0])
  }
  const slow = await pan(2)
  await page.getByRole('region').press('Home')
  const ordinary = await pan(8)
  expect(Math.abs(ordinary)).toBeGreaterThan(5)
  await page.getByRole('region').press('Home')
  const fast = await pan(28)
  expect(Math.abs(fast)).toBeGreaterThan(Math.abs(slow) * 3)
  expect(fast).toBeLessThan(0)
  await page
    .getByRole('region')
    .dispatchEvent('wheel', { deltaX: -28, deltaY: 0, deltaMode: 0 })
  await page.clock.runFor(16)
  expect(await pan(-28)).toBeGreaterThan(0)
  const position = await grid.getAttribute('data-position')
  await page.clock.runFor(1800)
  await expect(grid).toHaveAttribute('data-blur', '0.00000,0.00000')
  // Wheel motion is not extended by the blur-clearing animation.
  await expect(grid).toHaveAttribute('data-position', position!)
  await pan(28)
  await page.getByRole('region').press('ArrowRight')
  await expect(grid).toHaveAttribute('data-blur', '0.00000,0.00000')
})

test('each page load brings full rows in from alternating sides and lands exactly home', async ({
  page,
}) => {
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.goto('/globe.html')
  const grid = page.locator('.surface-grid')
  await expect(grid).toHaveAttribute('data-intro', 'running')
  const home = await grid.getAttribute('data-position')
  const rowOffsets: [number, number][] = JSON.parse(
    (await grid.getAttribute('data-row-offsets'))!
  )
  expect(rowOffsets.length).toBeGreaterThan(3)
  const directions = rowOffsets.slice(0, 4).map(([, x]) => Math.sign(x))
  expect(new Set(directions).size).toBeGreaterThan(1)
  expect(Math.max(...rowOffsets.map(([, x]) => Math.abs(x)))).toBeGreaterThan(
    1200
  )
  const firstRow = rowOffsets[0]

  await page.clock.runFor(420)
  const midOffsets: [number, number][] = JSON.parse(
    (await grid.getAttribute('data-row-offsets'))!
  )
  const matchingMid = midOffsets.find(([row]) => row === firstRow[0])
  expect(matchingMid).toBeTruthy()
  expect(Math.abs(matchingMid![1])).toBeLessThan(Math.abs(firstRow[1]))
  expect(await grid.getAttribute('data-position')).toBe(home)

  await page.clock.runFor(700)
  await expect(grid).toHaveAttribute('data-intro', 'done')
  await expect(grid).toHaveAttribute('data-row-offsets', '[]')
  await expect(grid).toHaveAttribute('data-position', home!)

  // A marker left by the previous once-per-tab implementation cannot suppress refresh.
  await page.evaluate(() =>
    sessionStorage.setItem('visual-scales.globe.intro.v1', '1')
  )
  await page.reload()
  await expect(grid).toHaveAttribute('data-intro', 'running')
  await page.clock.runFor(1200)
  await page.getByRole('region').press('Enter')
  await expect(grid).toHaveAttribute('data-selected', 'palette.indigo.600')
})

for (const input of ['wheel', 'pointer', 'search', 'keyboard'] as const) {
  test(`${input} interrupts intro and settles the rows`, async ({ page }) => {
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    await page.goto('/globe.html')
    const grid = page.locator('.surface-grid')
    const surface = page.getByRole('region')
    await expect(grid).toHaveAttribute('data-intro', 'running')
    await page.clock.runFor(180)
    const before = (await grid.getAttribute('data-position'))!
      .split(',')
      .map(Number)
    if (input === 'wheel')
      await surface.dispatchEvent('wheel', {
        deltaX: 10,
        deltaY: 20,
        deltaMode: 0,
      })
    if (input === 'pointer') {
      await page.mouse.move(720, 500)
      await page.mouse.down()
    }
    if (input === 'search') await page.getByRole('searchbox').focus()
    if (input === 'keyboard')
      await surface.dispatchEvent('keydown', { key: 'ArrowRight' })
    await expect(grid).toHaveAttribute('data-intro', 'done')
    const after = (await grid.getAttribute('data-position'))!
      .split(',')
      .map(Number)
    expect(after[0]).toBeCloseTo(
      before[0] - (input === 'wheel' ? 10 : input === 'keyboard' ? 276 : 0),
      2
    )
    expect(after[1]).toBeCloseTo(before[1] - (input === 'wheel' ? 20 : 0), 2)
    await expect(grid).toHaveAttribute('data-row-offsets', '[]')
    await page.clock.runFor(900)
    await expect(grid).toHaveAttribute(
      'data-position',
      `${after[0].toFixed(2)},${after[1].toFixed(2)}`
    )
  })
}

for (const stop of ['blur', 'reduced-motion', 'context-loss'] as const) {
  test(`row entrance stops on ${stop}`, async ({ page }) => {
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    await page.goto('/globe.html')
    const grid = page.locator('.surface-grid')
    await expect(grid).toHaveAttribute('data-intro', 'running')
    await page.clock.runFor(160)
    if (stop === 'blur')
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    if (stop === 'reduced-motion')
      await page.emulateMedia({ reducedMotion: 'reduce' })
    if (stop === 'context-loss') await grid.dispatchEvent('webglcontextlost')
    await expect(grid).toHaveAttribute('data-intro', 'done')
    const position = await grid.getAttribute('data-position')
    await page.clock.runFor(1000)
    await expect(grid).toHaveAttribute('data-position', position!)
    await expect(grid).toHaveAttribute('data-blur', '0.00000,0.00000')
    if (stop === 'context-loss') {
      await grid.dispatchEvent('webglcontextrestored')
      await expect(grid).toHaveAttribute('data-intro', 'done')
    }
  })
}

test('reduced motion disables intro and softness throughout a pan', async ({
  page,
}) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  for (let i = 0; i < 10; i++) {
    await page
      .getByRole('region')
      .dispatchEvent('wheel', { deltaX: 40, deltaY: 30 })
    await page.clock.runFor(16)
    await expect(page.locator('.surface-grid')).toHaveAttribute(
      'data-blur',
      '0.00000,0.00000'
    )
  }
})

test('GPU blur affects the fringe along motion direction, not the reading center', async ({
  page,
}) => {
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  const result = await page.evaluate(async () => {
    const modulePath = '/src/globe/mesh-renderer.ts'
    const { createMeshRenderer } = await import(/* @vite-ignore */ modulePath)
    const canvas = document.createElement('canvas')
    const renderer = createMeshRenderer(canvas)
    renderer.resize(1000, 800)
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) throw new Error('WebGL not available')
    const token = {
      id: 'test.white',
      name: 'Readable.center',
      layer: 'base',
      light: '#FFFFFF',
    }
    const cards = [
      { token, x: 0, y: 0 },
      { token, x: 430, y: 0 },
    ]
    const capture = (x: number, y: number) => {
      renderer.render(cards, 1300, 1800, 1, x, y)
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
      return pixels
    }
    const sharp = capture(0, 0),
      horizontal = capture(10, 0),
      vertical = capture(0, 10)
    const dpr = canvas.width / 1000
    const difference = (
      a: Uint8Array,
      b: Uint8Array,
      x0: number,
      x1: number,
      y0: number,
      y1: number
    ) => {
      let total = 0
      for (let y = Math.floor(y0 * dpr); y < y1 * dpr; y++) {
        for (let x = Math.floor(x0 * dpr); x < x1 * dpr; x++) {
          const i = (y * canvas.width + x) * 4
          total += Math.abs(a[i] - b[i])
        }
      }
      return total
    }
    const output = {
      center: difference(sharp, horizontal, 410, 590, 345, 450),
      fringe: difference(sharp, horizontal, 740, 1000, 320, 480),
      direction: difference(horizontal, vertical, 740, 1000, 320, 480),
      restored: difference(sharp, capture(0, 0), 0, 1000, 0, 800),
    }
    renderer.dispose()
    return output
  })
  expect(result.center).toBeLessThan(100)
  expect(result.fringe).toBeGreaterThan(1000)
  expect(result.direction).toBeGreaterThan(1000)
  expect(result.restored).toBe(0)
})

test('dragging never selects; Enter selects center with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  await page.mouse.move(720, 500)
  await page.mouse.down()
  await page.mouse.move(900, 540, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('canvas')).toHaveAttribute('data-selected', '')
  await page.getByRole('region').press('Home')
  await page.keyboard.press('Enter')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-background',
    '#111213'
  )
})

test('transparent backing and alpha relationship descriptions are preserved for synthetic tokens', () => {
  expect(colorSurround('#3366CC80')).toEqual({
    rgb: expect.arrayContaining([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]),
    transparent: true,
  })
  const tokens: RelationshipToken[] = [
    {
      id: 'parent',
      name: 'parent',
      layer: 'test',
      light: '#3366CC',
      reference: null,
      sourceId: null,
    },
    {
      id: 'child',
      name: 'child',
      layer: 'test',
      light: '#3366CC80',
      reference: 'parent',
      sourceId: 'parent',
      alpha: 0.5,
    },
  ]
  expect(
    relationshipDescriptions(buildRelationships(tokens), 'parent')
  ).toEqual(['parent points to child, 50% alpha modifier.'])
})

test('GPU surround stays neutral, and selected card gains a contrast outline', async ({
  page,
}) => {
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  const result = await page.evaluate(async () => {
    const path = '/src/globe/mesh-renderer.ts'
    const { createMeshRenderer } = await import(/* @vite-ignore */ path)
    const canvas = document.createElement('canvas')
    const renderer = createMeshRenderer(canvas)
    renderer.resize(600, 400)
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) throw new Error('No WebGL')
    const token = {
      id: 'selected',
      name: 'Selected.color',
      layer: 'base',
      light: '#3366CC',
    }
    renderer.render([{ token, x: 0, y: 0 }], 1300, 1800, 1, 0, 0, {
      background: [17 / 255, 18 / 255, 19 / 255],
      selectedId: token.id,
    })
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
    const dpr = canvas.width / 600
    const sample = (x: number, y: number) => [
      ...pixels.slice(
        (Math.floor(y * dpr) * canvas.width + Math.floor(x * dpr)) * 4,
        (Math.floor(y * dpr) * canvas.width + Math.floor(x * dpr)) * 4 + 3
      ),
    ]
    const output = {
      background: sample(30, 200),
      face: sample(300, 200),
      outlined: [] as number[][],
      plain: [] as number[][],
    }
    for (let x = 166; x < 176; x++) output.outlined.push(sample(x, 200))
    renderer.render([{ token, x: 0, y: 0 }], 1300, 1800, 1, 0, 0, {
      background: [17 / 255, 18 / 255, 19 / 255],
    })
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    )
    for (let x = 166; x < 176; x++) output.plain.push(sample(x, 200))
    renderer.dispose()
    return output
  })
  expect(result.background).toEqual([17, 18, 19])
  expect(result.face).toEqual([51, 102, 204])
  expect(
    result.outlined.some(
      (pixel, i) =>
        Math.abs(
          pixel.reduce((sum, channel) => sum + channel, 0) -
            result.plain[i].reduce((sum, channel) => sum + channel, 0)
        ) > 50
    )
  ).toBe(true)
})

test('GPU neighborhood emphasis preserves relatives and recedes unrelated colors in place', async ({
  page,
}) => {
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  const result = await page.evaluate(async () => {
    const path = '/src/globe/mesh-renderer.ts'
    const { createMeshRenderer } = await import(/* @vite-ignore */ path)
    const canvas = document.createElement('canvas')
    const renderer = createMeshRenderer(canvas)
    renderer.resize(600, 400)
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) throw new Error('No WebGL')
    const token = {
      id: 'relative',
      name: 'relative',
      layer: 'base',
      light: '#FFFFFF',
    }
    const cards = [{ token, x: 0, y: 0 }]
    const capture = (ids: Set<string>) => {
      renderer.render(cards, 1300, 1800, 1, 0, 0, {
        background: [0, 0, 0],
        prominentIds: ids,
      })
      const pixel = new Uint8Array(4)
      gl.readPixels(
        canvas.width / 2,
        canvas.height / 2,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel
      )
      return pixel[0]
    }
    const output = {
      prominent: capture(new Set(['relative'])),
      unrelated: capture(new Set(['another'])),
    }
    renderer.dispose()
    return output
  })
  expect(result.prominent).toBe(255)
  expect(result.unrelated).toBeGreaterThan(0)
  expect(result.unrelated).toBeCloseTo(255 * 0.42, 0)
})

test('actual dataset layouts retain every token and every verified edge across modes and seeds', async ({
  page,
}) => {
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  const result = await page.evaluate(async (data) => {
    const paths = ['/src/globe/layout.ts', '/src/globe/navigation.ts']
    const { buildLayout } = await import(/* @vite-ignore */ paths[0])
    const { indexLayout, sampleLayout, nearestTokenOffset } = await import(
      /* @vite-ignore */ paths[1]
    )
    let checked = 0
    for (const mode of ['color', 'lineage'])
      for (const seed of [0, 19]) {
        const layout = buildLayout(data.tokens, { mode, order: 'color', seed })
        const slots = indexLayout(layout)
        if (
          slots.size !== data.tokens.length ||
          new Set(
            layout.placements.map((p: { token: { id: string } }) => p.token.id)
          ).size !== data.tokens.length
        )
          throw new Error('Lost or colliding tokens')
        const positions = new Map<string, { index: number; depth: number }>(
          layout.placements.map(
            (p: { token: { id: string }; index: number; depth: number }) => [
              p.token.id,
              p,
            ]
          )
        )
        for (const token of data.tokens) {
          const offset = nearestTokenOffset(layout, token.id, 0, 0, 1)
          const cards = sampleLayout(
            layout,
            slots,
            offset.x,
            offset.y,
            1,
            12,
            12
          )
          if (cards.length !== 144) throw new Error('Blank grid cell')
          if (
            !cards.some(
              (c: { token: { id: string }; x: number; y: number }) =>
                c.token.id === token.id &&
                Math.abs(c.x) < 0.01 &&
                Math.abs(c.y) < 0.01
            )
          )
            throw new Error('Unreachable token')
          if (
            mode === 'lineage' &&
            token.sourceId &&
            positions.has(token.sourceId)
          ) {
            if (
              positions.get(token.id)!.depth !==
                positions.get(token.sourceId)!.depth + 1 ||
              positions.get(token.id)!.index <=
                positions.get(token.sourceId)!.index
            )
              throw new Error('False reference order')
          }
          checked++
        }
      }
    return checked
  }, sampleData)
  expect(result).toBe(sampleData.tokens.length * 4)
})

test('reduced motion settles search and selection immediately after intent debounce', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  await page.getByRole('searchbox', { name: 'Search tokens' }).fill('#5D61CA')
  await expect(page.locator('canvas')).toHaveAttribute('data-query', '#5D61CA')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-rearranging',
    'false'
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('canvas')).toHaveAttribute('data-query', '')
  await page
    .getByRole('region', { name: 'Infinite curved token grid' })
    .press('Enter')
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-selected',
    'palette.indigo.600'
  )
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-rearranging',
    'false'
  )
})

test('crossing cards have stable whole-card occlusion, not interleaved triangles', async ({
  page,
}) => {
  await page.goto('/globe.html')
  await expect(page.locator('.surface-grid')).toHaveAttribute(
    'data-intro',
    'done'
  )
  const result = await page.evaluate(async () => {
    const path = '/src/globe/mesh-renderer.ts'
    const { createMeshRenderer } = await import(/* @vite-ignore */ path)
    const canvas = document.createElement('canvas')
    const renderer = createMeshRenderer(canvas)
    renderer.resize(1000, 800)
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) throw new Error('WebGL unavailable')
    // Lexically later identity is the top card, regardless of pool/flight order.
    const bottom = {
      token: {
        id: 'a-bottom',
        name: 'Bottom',
        layer: 'base',
        light: '#FF0000',
      },
      x: 0,
      y: 0,
    }
    const top = {
      token: { id: 'z-top', name: 'Top', layer: 'base', light: '#00FF00' },
      x: 0,
      y: 0,
    }
    let badPixels = 0,
      checked = 0
    const dpr = canvas.width / 1000
    for (const dx of [-37, -13, 0, 19, 41]) {
      top.x = dx
      top.y = dx * 0.31
      for (const reversed of [false, true])
        for (const blur of [0, 12]) {
          renderer.render(
            reversed ? [top, bottom] : [bottom, top],
            1300,
            1800,
            1,
            blur,
            0
          )
          // This central rectangle is inside both faces and away from text.
          const width = Math.floor(70 * dpr),
            height = Math.floor(20 * dpr)
          const pixels = new Uint8Array(width * height * 4)
          gl.readPixels(
            Math.floor(465 * dpr),
            Math.floor(400 * dpr),
            width,
            height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels
          )
          for (let i = 0; i < pixels.length; i += 4) {
            checked++
            if (pixels[i] > 2 || pixels[i + 1] < 253 || pixels[i + 2] > 2)
              badPixels++
          }
        }
    }
    renderer.dispose()
    return { badPixels, checked }
  })
  expect(result.checked).toBeGreaterThan(1000)
  expect(result.badPixels).toBe(0)
})
