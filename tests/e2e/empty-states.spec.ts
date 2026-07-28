import { expect, test, type Locator, type Page } from '@playwright/test'

async function openAppPage(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
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

test.describe('Empty states with call-to-action buttons', () => {
  test('food log empty state focuses the search input', async ({ page }) => {
    await openAppPage(page, '/nutrition')
    const emptyState = page.getByRole('status').filter({ hasText: 'No food logged yet' })
    const addMealButton = page.getByRole('button', { name: 'Add your first meal', exact: true })
    const searchInput = page.getByRole('textbox', { name: 'Search foods' })

    if (await emptyState.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clickHydratedButton(addMealButton)
      await expect(searchInput).toBeFocused()
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Food log already has entries; empty-state CTA not shown.',
      })
    }
  })

  test('food search empty state opens the custom food editor', async ({ page }) => {
    await openAppPage(page, '/nutrition')
    const searchInput = page.getByRole('textbox', { name: 'Search foods' })
    await searchInput.fill(`missing-food-${Date.now()}`)

    const noResults = page.getByRole('status').filter({ hasText: 'No foods found' })
    await expect(noResults).toBeVisible({ timeout: 10000 })

    await clickHydratedButton(
      page.getByRole('button', { name: 'Create a custom food', exact: true }),
    )
    await expect(page.getByLabel('Name')).toBeVisible()
  })

  test('progress weight empty state navigates to settings', async ({ page }) => {
    await openAppPage(page, '/progress')
    const emptyState = page.getByRole('status').filter({ hasText: 'No weight logs yet' })
    const logWeightButton = page.getByRole('link', { name: 'Log your weight', exact: true })

    if (await emptyState.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clickHydratedButton(logWeightButton)
      await expect(page).toHaveURL(/\/settings/)
      await expect(page.getByRole('heading', { name: /Log Today/ })).toBeVisible()
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Weight history already has data; empty-state CTA not shown.',
      })
    }
  })

  test('workout sessions empty state starts a session', async ({ page }) => {
    await openAppPage(page, '/workout')
    const finishBtn = page.locator('button:has-text("Finish")')
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click()
      await expect(page.getByRole('heading', { name: 'Session Summary' })).toBeVisible({ timeout: 10000 })
      await page.getByRole('button', { name: 'Done' }).click()
    }

    const emptyState = page.getByRole('status').filter({ hasText: 'No workouts yet' })
    const startButton = page.getByRole('button', { name: 'Start your first workout', exact: true })

    if (await emptyState.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clickHydratedButton(startButton)
      await expect(page.locator('.card-title:has-text("Exercise")')).toBeVisible({
        timeout: 10000,
      })
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Workout sessions already exist; empty-state CTA not shown.',
      })
    }
  })
})
