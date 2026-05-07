// tests/office-tv.spec.ts
import { test, expect } from '@playwright/test'

const TOKEN = process.env.MC_OFFICE_TV_TOKEN

test.describe('Office TV kiosk route', () => {
  test('returns 404 when token env unset', async ({ page }) => {
    test.skip(!!TOKEN, 'requires MC_OFFICE_TV_TOKEN to be unset')
    const res = await page.goto('/office/tv')
    expect(res?.status()).toBe(404)
  })

  test('redirects to login without token', async ({ page }) => {
    test.skip(!TOKEN, 'requires MC_OFFICE_TV_TOKEN to be set')
    await page.goto('/office/tv')
    await expect(page).toHaveURL(/\/login/)
  })

  test('rejects bad token', async ({ page }) => {
    test.skip(!TOKEN, 'requires MC_OFFICE_TV_TOKEN to be set')
    await page.goto('/office/tv?token=wrong-token-xxxxxxxxx')
    await expect(page).toHaveURL(/\/login/)
  })

  test('renders kiosk view with valid token', async ({ page }) => {
    test.skip(!TOKEN, 'requires MC_OFFICE_TV_TOKEN to be set')
    const consoleErrors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

    await page.goto(`/office/tv?token=${encodeURIComponent(TOKEN!)}`)
    // No nav rail or header should be visible
    await expect(page.locator('text=ROSTER')).toHaveCount(0)
    // The map should render (a room label visible)
    await expect(page.getByText('Main Office', { exact: false })).toBeVisible({ timeout: 6000 })

    expect(consoleErrors.filter(e => !e.includes('Hydration'))).toHaveLength(0)
  })
})
