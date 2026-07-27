import { expect, test, type Page } from '@playwright/test'

async function openAppPage(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('navigation', { name: 'FitTrack navigation' })).toBeVisible({
    timeout: 15000,
  })
}

/**
 * Waits until React has attached props to the element, i.e. the island is
 * hydrated and its onChange/onClick handlers are live.
 *
 * `openAppPage` above only waits for the navigation to be *visible*, and the
 * nav is server-rendered — so it becomes visible before React hydrates. Typing
 * into a control before then writes to plain HTML: no onChange fires, the form
 * store never updates, and any state derived from it (spinners, result lists)
 * never appears. That is a lost-input race, not an app bug.
 */
async function waitForHydration(locator: ReturnType<Page['getByRole']>) {
  await expect(locator).toBeVisible()
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.getOwnPropertyNames(element).some((property) =>
            property.startsWith('__reactProps$'),
          ),
        ),
      { timeout: 15000 },
    )
    .toBe(true)
}

async function clickHydratedButton(button: ReturnType<Page['getByRole']>) {
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

test.describe('Loading states', () => {
  test('nutrition page shows a skeleton while data for a new date is loading', async ({ page }) => {
    let delayFetches = false
    await page.route('**/*', async (route) => {
      const type = route.request().resourceType()
      if (delayFetches && (type === 'fetch' || type === 'xhr')) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      await route.continue()
    })

    await openAppPage(page, '/nutrition')
    delayFetches = true
    await clickHydratedButton(page.getByRole('main').getByRole('button', { name: 'Previous day' }))
    await expect(page.getByLabel('Loading nutrition')).toBeVisible()
    await expect(page.getByLabel('Loading nutrition')).toHaveCount(0, {
      timeout: 15000,
    })
  })

  test('food search shows a spinner while the debounced query is pending', async ({ page }) => {
    await openAppPage(page, '/nutrition')
    const search = page.getByRole('textbox', { name: 'Search foods' })
    // Must be hydrated before typing, or the keystrokes never reach the form
    // store and the pending spinner is never rendered.
    await waitForHydration(search)
    await search.click()
    await search.pressSequentially('chicken', { delay: 120 })
    await expect(page.getByRole('status', { name: 'Searching foods' })).toBeVisible()
  })

  test('profile save button shows a loading state while submitting', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    await page.route('**/*', async (route) => {
      const request = route.request()
      if (request.method() === 'POST' && request.postData()?.includes('updateUser')) {
        await gate
      }
      await route.continue()
    })

    await openAppPage(page, '/settings')
    const saveButton = page.getByRole('button', { name: /^(Save Profile|Saved)$/ })
    await clickHydratedButton(saveButton)
    await expect(saveButton).toHaveAttribute('aria-busy', 'true')
    release()
    await expect(saveButton).not.toHaveAttribute('aria-busy', 'true', {
      timeout: 15000,
    })
  })
})
