import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Opens the Training Programs page (no SSR loader, so the client always
 * fetches — making route interception reliable for error-banner coverage).
 */
async function openPrograms(page: Page) {
  await page.goto('/workout/programs')
  await expect(page.getByRole('navigation', { name: 'FitTrack navigation' })).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByRole('heading', { name: 'Training Programs', level: 1 })).toBeVisible({
    timeout: 15000,
  })
}

async function clickHydratedButton(button: Locator) {
  await expect(button).toBeVisible()
  await expect
    .poll(() =>
      button.evaluate((element) =>
        Object.getOwnPropertyNames(element).some((property) =>
          property.startsWith('__reactProps$'),
        ),
      ),
    )
    .toBe(true)
  await button.click()
}

/**
 * Invalidates a React Query cache entry by key, forcing a client-side refetch
 * that page.route() can intercept (the SSR render already hydrated the cache,
 * so no client fetch happens without invalidation).
 */
async function forceRefetch(page: Page, queryKey: string) {
  await page.evaluate((key) => {
    const qc = (window as Record<string, unknown>).__fittrackQueryClient as {
      invalidateQueries: (opts: { queryKey: string[] }) => Promise<void>
    } | undefined
    if (!qc) throw new Error('QueryClient not exposed on window.__fittrackQueryClient')
    return qc.invalidateQueries({ queryKey: [key] })
  }, queryKey)
  // Let React Query process the invalidation and start the refetch.
  await page.waitForTimeout(500)
}

test.describe('Data load error banners (issue #29)', () => {
  test('shows an error banner with Retry when a client refetch fails, then recovers', async ({
    page,
  }) => {
    await openPrograms(page)

    // Intercept ALL server-function calls; fail the next one, then recover.
    let shouldFail = true
    await page.route('**/_serverFn/**', async (route) => {
      if (shouldFail) {
        shouldFail = false
        await route.fulfill({
          status: 500,
          contentType: 'text/plain',
          body: 'Simulated failure',
        })
        return
      }
      await route.continue()
    })

    // Force a client refetch that the route interception will 500.
    await forceRefetch(page, 'programs')

    const errorBanner = page.locator('.astryx-banner[data-status="error"]')
    await expect(errorBanner).toBeVisible({ timeout: 15000 })
    await expect(errorBanner).toContainText('Failed to load programs')

    // Retry — this time the interception lets the request through.
    await clickHydratedButton(page.getByRole('button', { name: 'Retry', exact: true }))

    await expect(page.getByRole('heading', { name: 'Training Programs', level: 1 })).toBeVisible()
    await expect(errorBanner).toBeHidden({ timeout: 15000 })
    // The seed has programs, so the table or empty state should render.
    await expect(page.getByRole('button', { name: 'New Program' })).toBeVisible()
  })

  test('offline status uses an Astryx warning banner (PRD 05 §5)', async ({
    page,
    context,
  }) => {
    await openPrograms(page)
    await context.setOffline(true)

    const offlineBanner = page.locator('.astryx-banner[data-status="warning"]')
    await expect(offlineBanner).toBeVisible({ timeout: 15000 })
    await expect(offlineBanner).toContainText(
      "You're offline — changes will sync when reconnected",
    )
  })
})
