import { expect, test } from '@playwright/test'

for (const [route, title] of [
  ['/', 'Visual Scales'],
  ['/globe.html', 'Color — Visual Scales'],
  ['/space.html', 'Space — Visual Scales'],
]) {
  test(`production build serves ${route} without source URLs or script errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const response = await page.goto(route)
    expect(response?.status()).toBe(200)
    expect(await response!.text()).not.toMatch(/(?:src|href)="\/src\//)
    await expect(page).toHaveTitle(title)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Visual Scales/)
    const home = page.getByRole('link', { name: 'visual scales home' })
    await expect(home).toHaveText(/✳\s*visual scales/)
    await expect(home).toHaveAttribute('href', '/')
    if (route === '/') {
      await expect(page.locator('.split-app')).toHaveAttribute('data-renderer', 'poster')
      await expect(page.locator('.split-poster img')).toBeVisible()
      await page.getByRole('link', { name: 'color', exact: true }).click()
      await expect(page).toHaveURL('/globe.html?token=palette.indigo.600')
      await expect(page.locator('.surface-grid')).toHaveAttribute('data-center-token', 'palette.indigo.600')
    } else if (route === '/globe.html') {
      await expect(page.getByRole('searchbox', { name: 'Search tokens', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Relationships', exact: true }).click()
      await expect(page.locator('.token-surface')).toHaveAttribute('data-view', 'relationships')
    } else {
      await expect(page.getByRole('searchbox', { name: 'Search space tokens' })).toBeVisible()
      await expect(page.locator('.space-value-mark')).not.toHaveCount(0)
    }
    await home.click()
    await expect(page).toHaveURL('/')
    await expect(page.locator('.split-app')).toBeVisible()
    await expect(page.locator('#atlas-app')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('split alias and old collection bookmarks reach canonical routes', async ({ page }) => {
  await page.goto('/split.html')
  await expect(page).toHaveURL('/')
  await expect(page.locator('.split-app')).toBeVisible()
  await page.goto('/?view=collection&token=palette.violet.400')
  await expect(page).toHaveURL('/globe.html?token=palette.violet.400')
  await expect(page.locator('.surface-grid')).toHaveAttribute('data-center-token', 'palette.violet.400')
})

test('discarded pages are absent, not homepage aliases', async ({ request }) => {
  for (const route of ['/atlas.html', '/palette.html', '/materials.html', '/prototypes.html', '/not-a-page']) {
    const response = await request.get(route)
    expect(response.status(), route).toBe(404)
    expect(await response.text()).not.toContain('class="split-app"')
  }
})
