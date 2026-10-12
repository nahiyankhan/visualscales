import { expect, test, type Page } from '@playwright/test'

type TextureCounters = { uploads: number; paintedPixels: number; draws: number; liveBytes: number; peakBytes: number }
type InstrumentedWindow = Window & { textureCounters: TextureCounters }

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const state: TextureCounters = { uploads: 0, paintedPixels: 0, draws: 0, liveBytes: 0, peakBytes: 0 }
    ;(window as unknown as InstrumentedWindow).textureCounters = state
    const bound = new WeakMap<object, WebGLTexture | null>()
    const bytes = new Map<WebGLTexture, number>()
    for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      // Only wrap owned methods, avoiding double instrumentation of inherited ones.
      const proto = type.prototype
      if (Object.getOwnPropertyDescriptor(proto, 'bindTexture')) {
        const bind = proto.bindTexture
        proto.bindTexture = function (target, texture) { if (target === this.TEXTURE_2D) bound.set(this, texture); return bind.call(this, target, texture) }
      }
      if (Object.getOwnPropertyDescriptor(proto, 'texImage2D')) {
        const upload = proto.texImage2D
        // Retain native overloads while intercepting their common runtime call shape.
        proto.texImage2D = function (this: WebGLRenderingContext, ...args: unknown[]) {
          const source = args[5]
          if (source instanceof HTMLCanvasElement) {
            const texture = bound.get(this)
            state.uploads++
            state.paintedPixels += source.width * source.height
            if (texture) {
              state.liveBytes -= bytes.get(texture) ?? 0
              bytes.set(texture, source.width * source.height * 4)
              state.liveBytes += bytes.get(texture)!
              state.peakBytes = Math.max(state.peakBytes, state.liveBytes)
            }
          }
          return Reflect.apply(upload, this, args)
        } as typeof upload
      }
      if (Object.getOwnPropertyDescriptor(proto, 'deleteTexture')) {
        const remove = proto.deleteTexture
        proto.deleteTexture = function (texture) { if (texture) { state.liveBytes -= bytes.get(texture) ?? 0; bytes.delete(texture) } return remove.call(this, texture) }
      }
      if (Object.getOwnPropertyDescriptor(proto, 'drawElements')) {
        const draw = proto.drawElements
        proto.drawElements = function (...args) { state.draws++; return draw.apply(this, args) }
      }
    }
  })
}

async function panBatch(page: Page, steps = 25) {
  return page.evaluate(steps => {
    const state = (window as unknown as InstrumentedWindow).textureCounters
    state.uploads = 0; state.paintedPixels = 0; state.draws = 0
    const surface = document.querySelector('.surface-viewport')!
    const times: number[] = []
    for (let i = 0; i < steps; i++) {
      const start = performance.now()
      surface.dispatchEvent(new WheelEvent('wheel', { deltaX: i % 2 ? -3 : 3, cancelable: true, bubbles: true }))
      times.push(performance.now() - start)
    }
    return { ...state, meanMs: times.reduce((a, b) => a + b) / steps, maxMs: Math.max(...times) }
  }, steps)
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 2560, height: 1440 }]) {
  test(`${viewport.width}px warmed zoom-out frames reuse visible textures instead of repainting the working set`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await instrument(page)
    await page.goto('/globe.html')
    await expect(page.locator('.token-surface')).toHaveAttribute('data-renderer', 'webgl')
    for (const zoom of ['1.0000', '0.6500']) {
      if (zoom === '0.6500') {
        while (await page.getByRole('button', { name: 'Zoom out', exact: true }).isEnabled()) await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
      }
      await expect(page.locator('.surface-grid')).toHaveAttribute('data-collection-zoom', zoom)
      await panBatch(page, 2)
      const stats = await panBatch(page)
      expect(stats.draws).toBeGreaterThan(25 * 40)
      expect(stats.uploads, `at ${zoom}: ${JSON.stringify(stats)}`).toBe(0)
      expect(stats.peakBytes).toBeLessThanOrEqual(70 * 1024 * 1024)
      await test.info().attach(`zoom-${zoom}-counters`, { body: JSON.stringify(stats), contentType: 'application/json' })
    }
    const initial = await page.locator('.surface-grid').getAttribute('data-position')
    // A genuinely new region can upload newcomers, but cannot churn every visible key.
    await page.mouse.move(800, 400)
    await page.mouse.wheel(600, 250)
    await expect(page.locator('.surface-grid')).not.toHaveAttribute('data-position', initial!)
    await panBatch(page, 2)
    const warm = await panBatch(page)
    expect(warm.uploads).toBe(0)
    expect(warm.peakBytes).toBeLessThanOrEqual(70 * 1024 * 1024)
  })
}

test('relationship overview retains its whole texture working set and close-up mode still restores', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await instrument(page)
  await page.goto('/globe.html')
  await page.getByRole('button', { name: 'Relationships', exact: true }).click()
  await page.getByRole('button', { name: /^Fit graph/ }).click()
  await panBatch(page, 2)
  const stats = await panBatch(page)
  expect(stats.uploads).toBe(0)
  expect(stats.draws).toBe(218 * 25)
  expect(stats.peakBytes).toBeLessThanOrEqual(70 * 1024 * 1024)
  await page.getByRole('button', { name: 'Back to collection', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.locator('.surface-grid')).toHaveAttribute('data-collection-zoom', '1.9531')
  await panBatch(page, 2)
  const closeup = await panBatch(page)
  expect(closeup.uploads).toBe(0)
  expect(closeup.peakBytes).toBeLessThanOrEqual(70 * 1024 * 1024)
})

test('labels scale continuously through the former 160% breakpoint without new font textures', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 })
  await instrument(page)
  await page.goto('/globe.html')
  const result = await page.evaluate(async () => {
    const path = '/src/globe/mesh-renderer.ts'
    const { createMeshRenderer } = await import(/* @vite-ignore */ path)
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:fixed;inset:0;width:1000px;height:700px'
    document.body.append(canvas)
    const renderer = createMeshRenderer(canvas)
    renderer.resize(1000, 700)
    const original = CanvasRenderingContext2D.prototype.fillText
    const painted: { text: string; font: string }[] = []
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      painted.push({ text: args[0], font: this.font })
      return original.apply(this, args)
    }
    const state = (window as unknown as InstrumentedWindow).textureCounters
    state.uploads = 0
    const token = { id: 'palette.indigo.600', name: 'indigo.600', layer: 'primitive', light: '#E0E8FF', alpha: .5 }
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')!
    const widths: number[] = []
    try {
      for (const zoom of [1.59, 1.6, 1.61]) {
        renderer.render([{ token, x: 0, y: 0 }], 2600 * zoom, 1800 * zoom, zoom)
        const pixels = new Uint8Array(canvas.width * canvas.height * 4)
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        const dpr = canvas.width / 1000
        // Name-only band in card-local coordinates; excludes layer/alpha/hex.
        let minX = Infinity, maxX = -Infinity
        const left = 500 - 134 * zoom, top = 350 - 102 * zoom
        for (let y = Math.floor((top + 140 * zoom) * dpr); y < (top + 165 * zoom) * dpr; y++) {
          for (let x = Math.floor((left + 15 * zoom) * dpr); x < (left + 250 * zoom) * dpr; x++) {
            const offset = ((canvas.height - y - 1) * canvas.width + x) * 4
            if (pixels[offset] < 100 && pixels[offset + 1] < 100 && pixels[offset + 2] < 100) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x)
            }
          }
        }
        widths.push(maxX - minX + 1)
      }
      return { painted, widths, uploads: state.uploads }
    } finally {
      CanvasRenderingContext2D.prototype.fillText = original
      renderer.dispose(); canvas.remove()
    }
  })
  expect(result.uploads).toBe(1)
  expect(result.painted.find(line => line.text === 'indigo.600')?.font).toContain('25px')
  expect(result.painted.find(line => line.text === 'primitive')?.font).toContain('10px')
  expect(result.painted.find(line => line.text === '50% alpha')?.font).toContain('10px')
  expect(result.painted.find(line => line.text === '#e0e8ff')?.font).toContain('11px')
  expect(result.widths.every(width => Number.isFinite(width) && width > 50)).toBe(true)
  expect(result.widths[1]).toBeGreaterThanOrEqual(result.widths[0] - 1)
  expect(result.widths[2]).toBeGreaterThanOrEqual(result.widths[1] - 1)
  expect(Math.abs(result.widths[2] / result.widths[0] - 1.61 / 1.59)).toBeLessThan(.03)
})
