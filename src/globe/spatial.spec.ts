import { expect, test } from '@playwright/test'

test('globe uses the spatial color map and preserves it through reload, resize, and relationship return', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/globe.html')
  const grid = page.locator('.surface-grid')
  await expect(grid).toHaveAttribute('data-layout', 'spatial')
  await expect(grid).toHaveAttribute('data-center-token', 'palette.indigo.600')
  const initial = await grid.getAttribute('data-collection-cards')
  const sheet = await grid.getAttribute('data-sheet')
  await page.reload()
  await expect(grid).toHaveAttribute('data-collection-cards', initial!)
  await page.getByRole('button', { name: 'Relationships', exact: true }).click()
  await expect(grid).toHaveAttribute('data-rearranging', 'false')
  const network: { id: string }[] = JSON.parse((await grid.getAttribute('data-network-cards'))!)
  expect(new Set(network.map(card => card.id)).size).toBe(218)
  await page.getByRole('button', { name: 'Back to collection', exact: true }).click()
  await expect(grid).toHaveAttribute('data-collection-cards', initial!)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(grid).toHaveAttribute('data-sheet', sheet!)
  await expect(grid).toHaveAttribute('data-layout', 'spatial')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const original: { id: string; x: number; y: number }[] = JSON.parse(initial!)
  // Camera rescaling introduces harmless floating-point rounding; compare the
  // actual arrangement at subpixel precision instead of serialized decimals.
  await expect.poll(async () => {
    const cards: { id: string; x: number; y: number }[] = JSON.parse((await grid.getAttribute('data-collection-cards'))!)
    return cards.length === original.length && cards.every((card, index) =>
      card.id === original[index].id && Math.abs(card.x - original[index].x) < 0.001 && Math.abs(card.y - original[index].y) < 0.001)
  }).toBe(true)
})
