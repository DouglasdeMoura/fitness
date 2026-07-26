import { expect, test, type Page } from '@playwright/test'
import { addDays, todayString } from '../../src/lib/nutrition'

async function openAppPage(page: Page, path: string) {
  await page.goto(path)
}

async function clickHydratedButton(button: ReturnType<Page['getByRole']>) {
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
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

const EMPTY_HISTORY_DATE = '2020-01-01'

test.describe('Date navigation on nutrition and workout pages', () => {
  test('nutrition prev/next, Today, and URL search param update food log date', async ({ page }) => {
    const today = todayString()
    const dayBeforeEmpty = addDays(EMPTY_HISTORY_DATE, -1)

    await openAppPage(page, `/nutrition?date=${EMPTY_HISTORY_DATE}`)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'Nutrition', exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`date=${EMPTY_HISTORY_DATE.replace(/-/g, '\\-')}`))
    await expect(main.getByText('No food logged yet', { exact: true })).toBeVisible()

    await clickHydratedButton(main.getByRole('button', { name: 'Previous day' }))
    await expect(page).toHaveURL(new RegExp(`date=${dayBeforeEmpty.replace(/-/g, '\\-')}`))

    await clickHydratedButton(main.getByRole('button', { name: 'Next day' }))
    await expect(page).toHaveURL(new RegExp(`date=${EMPTY_HISTORY_DATE.replace(/-/g, '\\-')}`))

    await clickHydratedButton(main.getByRole('button', { name: 'Today' }))
    await expect(page).toHaveURL(new RegExp(`date=${today.replace(/-/g, '\\-')}`))
    await expect(main.getByRole('button', { name: 'Next day' })).toBeDisabled()
    await expect(main.getByRole('button', { name: 'Today' })).toBeDisabled()
  })

  test('workout sessions reflect the selected date in the URL', async ({ page }) => {
    const today = todayString()

    await openAppPage(page, `/workout?date=${EMPTY_HISTORY_DATE}`)
    await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`date=${EMPTY_HISTORY_DATE.replace(/-/g, '\\-')}`))
    await expect(page.getByRole('heading', { name: 'No workouts yet', exact: true })).toBeVisible()

    await openAppPage(page, `/workout?date=${today}`)
    const todayRows = page.locator('table tbody tr')
    const todayCount = await todayRows.count()
    if (todayCount > 0) {
      await expect(todayRows.first()).toContainText(today)
    }

    await openAppPage(page, `/workout?date=${EMPTY_HISTORY_DATE}`)
    await expect(page.getByRole('heading', { name: 'No workouts yet', exact: true })).toBeVisible()

    await clickHydratedButton(page.getByRole('button', { name: 'Today' }))
    await expect(page).toHaveURL(new RegExp(`date=${today.replace(/-/g, '\\-')}`))
    await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })
})
