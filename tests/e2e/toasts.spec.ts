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

function toastRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'Notifications' })
}

function infoToast(page: Page, body: string | RegExp): Locator {
  return toastRegion(page).getByRole('status').filter({ hasText: body })
}

test.describe('Toast notifications for mutations', () => {
  test('saving profile shows a Profile saved toast', async ({ page }) => {
    await openAppPage(page, '/settings')
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({
      timeout: 10000,
    })
    await clickHydratedButton(page.getByRole('button', { name: 'Save Profile' }))
    await expect(infoToast(page, 'Profile saved')).toBeVisible({ timeout: 10000 })
  })

  test('logging weight shows Weight logged toast with kg', async ({ page }) => {
    await openAppPage(page, '/settings')
    const weight = page.getByLabel('Weight in kg', { exact: true })
    await expect(weight).toBeVisible({ timeout: 10000 })
    await weight.fill('76.2')
    await clickHydratedButton(page.getByRole('button', { name: 'Log' }))
    await expect(infoToast(page, 'Weight logged — 76.2kg')).toBeVisible({
      timeout: 10000,
    })
  })

  test('exporting data shows Data exported toast', async ({ page }) => {
    await openAppPage(page, '/settings')
    await expect(page.getByRole('heading', { name: 'Export Data' })).toBeVisible({
      timeout: 10000,
    })
    const downloadPromise = page.waitForEvent('download')
    await clickHydratedButton(page.getByRole('button', { name: 'Export as JSON' }))
    await downloadPromise
    await expect(infoToast(page, 'Data exported')).toBeVisible({ timeout: 10000 })
  })

  test('logging and deleting food shows toasts, Undo restores the entry', async ({
    page,
  }) => {
    const foodName = `Toast Food ${Date.now()}`
    await openAppPage(page, '/nutrition')
    await clickHydratedButton(page.getByRole('button', { name: 'Create Custom Food' }))
    await page.getByLabel('Name').fill(foodName)
    await page.getByLabel('Calories per serving').fill('180')
    await page.getByLabel('Protein (g)').fill('18')
    await clickHydratedButton(page.getByRole('button', { name: 'Save Food' }))
    await expect(page.getByText(foodName)).toBeVisible()

    await clickHydratedButton(page.getByRole('button', { name: 'Add to Log' }))
    await expect(infoToast(page, 'Food logged')).toBeVisible({ timeout: 10000 })

    const foodRow = page.getByRole('row').filter({ hasText: foodName })
    await expect(foodRow).toBeVisible({ timeout: 10000 })
    page.once('dialog', (dialog) => dialog.accept())
    await clickHydratedButton(foodRow.getByRole('button', { name: `Delete ${foodName}` }))

    const deletedToast = infoToast(page, 'Entry deleted')
    await expect(deletedToast).toBeVisible({ timeout: 10000 })
    await expect(foodRow).not.toBeVisible()

    await clickHydratedButton(deletedToast.getByRole('button', { name: 'Undo' }))
    await expect(page.getByRole('row').filter({ hasText: foodName })).toBeVisible({
      timeout: 10000,
    })
  })

  test('saving and deleting a workout set shows toasts with Undo', async ({ page }) => {
    await openAppPage(page, '/workout')
    const startBtn = page.locator('button:has-text("Start Workout")')
    const finishBtn = page.locator('button:has-text("Finish")')
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click()
      await page.waitForTimeout(500)
    }
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click()
    }

    await expect(page.locator('.card-title:has-text("Select Exercise")')).toBeVisible({
      timeout: 10000,
    })
    const exerciseSelect = page.locator('select').first()
    const options = await exerciseSelect.locator('option').count()
    test.skip(options <= 1, 'No exercises seeded for set logging')

    await exerciseSelect.selectOption({ index: 1 })
    await clickHydratedButton(page.locator('button:has-text("Add Set")'))
    await clickHydratedButton(page.getByRole('button', { name: /Save set 1/ }))
    await expect(infoToast(page, 'Set saved')).toBeVisible({ timeout: 10000 })

    await clickHydratedButton(page.getByRole('button', { name: /Delete set 1/ }))
    const deletedToast = infoToast(page, 'Set deleted')
    await expect(deletedToast).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /Save set 1/ })).toHaveCount(0)

    await clickHydratedButton(deletedToast.getByRole('button', { name: 'Undo' }))
    await expect(page.getByRole('button', { name: /Save set 1/ })).toBeVisible({
      timeout: 10000,
    })
  })
})
