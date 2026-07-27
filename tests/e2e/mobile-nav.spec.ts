import { test, expect, type Page, type Locator } from '@playwright/test'
import {
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
  routeWithStableQuery,
} from './test-helpers'

const MOBILE_VIEWPORT = { width: 390, height: 844 }
const DESKTOP_VIEWPORT = { width: 768, height: 1024 }

const MAIN_ROUTES = [
  { label: 'Dashboard', path: '/', heading: 'Dashboard' },
  { label: 'Nutrition', path: '/nutrition', heading: 'Nutrition' },
  { label: 'Workout', path: '/workout', heading: 'Workout' },
  { label: 'Progress', path: '/progress', heading: 'Progress' },
  { label: 'Settings', path: '/settings', heading: 'Settings' },
] as const

function mobileNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'FitTrack mobile navigation' })
}

function topNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'FitTrack navigation' })
}

test.describe('Mobile bottom navigation (issue #52)', () => {
  test.beforeEach(async ({ page }) => {
    await prepareTheme(page, 'light')
    await installDeterministicClock(page)
  })

  test('shows bottom navigation below 768px and hides it at desktop width', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await openAppRoute(page, '/')
    await expect(mobileNav(page)).toBeVisible()
    await expect(topNav(page).getByRole('toolbar', { name: 'FitTrack primary routes' })).toBeHidden()

    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(mobileNav(page)).toBeHidden()
    await expect(topNav(page).getByRole('toolbar', { name: 'FitTrack primary routes' })).toBeVisible()
  })

  test('shows top navigation at 768px and above', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await openAppRoute(page, '/')
    await expect(topNav(page).getByRole('link', { name: 'Nutrition' })).toBeVisible()
    await expect(mobileNav(page)).toBeHidden()
  })

  for (const route of MAIN_ROUTES) {
    test(`reaches ${route.label} from the bottom bar at 390px`, async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT)
      await openAppRoute(page, '/')

      await mobileNav(page).getByRole('link', { name: route.label }).click()
      await expect(page).toHaveURL(new RegExp(`${route.path === '/' ? '/$' : route.path}`))
      await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible()
    })
  }

  test('marks the active route with aria-current in the bottom bar', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await openAppRoute(page, '/')
    await expect(mobileNav(page).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await mobileNav(page).getByRole('link', { name: 'Nutrition' }).click()
    await expect(page).toHaveURL(/\/nutrition/)
    await expect(mobileNav(page).getByRole('link', { name: 'Nutrition' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(mobileNav(page).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('bottom bar respects safe-area padding custom property', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await openAppRoute(page, '/')
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--app-safe-area-bottom', '20px')
    })

    await expect
      .poll(async () =>
        mobileNav(page).evaluate((element) => getComputedStyle(element).paddingBottom),
      )
      .toBe('20px')
  })

  test('last settings list row stays above the bottom bar at 390x844', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await page.goto(routeWithStableQuery('/settings'))
    await page.waitForLoadState('networkidle')

    const lastItem = page.getByRole('listitem').last()
    await lastItem.scrollIntoViewIfNeeded()

    const navBox = await mobileNav(page).boundingBox()
    const itemBox = await lastItem.boundingBox()
    expect(navBox).not.toBeNull()
    expect(itemBox).not.toBeNull()
    expect(itemBox!.y + itemBox!.height).toBeLessThanOrEqual(navBox!.y + 1)
  })
})
