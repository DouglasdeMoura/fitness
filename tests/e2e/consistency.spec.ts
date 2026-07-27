import { expect, test } from '@playwright/test'
import {
  FIXED_E2E_DATE,
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
} from './test-helpers'

async function errorTokenRgb(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('span')
    probe.className = 'astryx-statusdot'
    probe.setAttribute('data-variant', 'error')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  })
}

test.describe('Dashboard consistency tracking', () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicClock(page)
    await prepareTheme(page, 'light')
    await openAppRoute(page, `/?date=${FIXED_E2E_DATE}`)
  })

  test('shows rolling adherence and streak metrics', async ({ page }) => {
    const card = page.getByLabel('Consistency tracking')
    await expect(card.getByText('7-day adherence')).toBeVisible()
    await expect(card.getByText('28-day adherence')).toBeVisible()
    await expect(card.getByText('Current streak')).toBeVisible()
    await expect(card.getByText('Longest streak')).toBeVisible()
    await expect(card.locator('dd').filter({ hasText: /%$/ })).toHaveCount(2)
    await expect(card.locator('dd').filter({ hasText: /days$/ })).toHaveCount(2)
  })

  test('missed days use neutral status, not the error colour token', async ({ page }) => {
    const card = page.getByLabel('Consistency tracking')
    const errorRgb = await errorTokenRgb(page)
    const missedDots = card.locator('.astryx-statusdot[data-variant="neutral"]')
    const missedCount = await missedDots.count()

    expect(missedCount).toBeGreaterThan(0)

    for (let index = 0; index < missedCount; index++) {
      const dot = missedDots.nth(index)
      await expect(dot).toHaveAttribute('data-variant', 'neutral')
      const dotRgb = await dot.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(dotRgb).not.toBe(errorRgb)
    }

    await expect(card.locator('.astryx-statusdot[data-variant="error"]')).toHaveCount(0)
  })
})
