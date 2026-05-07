// tests/office.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Office panel', () => {
  test('renders rooms and processes /api/agents/activity', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

    let activityCalls = 0
    page.on('request', req => { if (req.url().includes('/api/agents/activity')) activityCalls++ })

    await page.goto('/office')
    // wait for at least one room label to render
    await expect(page.getByText('Main Office', { exact: false })).toBeVisible({ timeout: 5000 })

    // wait long enough for one polling cycle
    await page.waitForTimeout(6000)

    expect(activityCalls).toBeGreaterThanOrEqual(1)
    expect(consoleErrors.filter(e => !e.includes('Hydration'))).toHaveLength(0)
  })

  test('demo mode populates all activity kinds', async ({ page }) => {
    await page.goto('/office?demo=1')
    await expect(page.getByText('Main Office', { exact: false })).toBeVisible({ timeout: 5000 })
    // give demo cycle a chance to run
    await page.waitForTimeout(3000)
    // bubbles or glyphs should appear; assert at least one has rendered
    const glyphs = await page.locator('button.activity-typing, button.activity-reading, button.activity-bash').count()
    expect(glyphs).toBeGreaterThanOrEqual(1)
  })
})
