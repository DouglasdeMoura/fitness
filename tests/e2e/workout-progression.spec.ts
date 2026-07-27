import { test, expect, type Page } from '@playwright/test'
import {
  installDeterministicClock,
  routeWithStableQuery,
} from './test-helpers'

const MOBILE_VIEWPORT = { width: 390, height: 844 }
const BENCH_PRESS_OPTION = /^Barbell Bench Press \(chest\)$/i

async function finishActiveSessionIfNeeded(page: Page) {
  const finish = page.getByRole('button', { name: 'Finish workout' })
  if (await finish.isVisible({ timeout: 2000 }).catch(() => false)) {
    await finish.click()
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({
      timeout: 10000,
    })
  }
}

async function startWorkout(page: Page) {
  await finishActiveSessionIfNeeded(page)
  await page.getByRole('button', { name: 'Start Workout' }).click()
  await expect(page.getByRole('heading', { name: 'Select Exercise' })).toBeVisible({
    timeout: 15000,
  })
}

async function selectExercise(page: Page, optionPattern: RegExp) {
  const exerciseField = page.getByRole('combobox', { name: 'Exercise' })
  await exerciseField.click()
  await page.getByRole('option', { name: optionPattern }).first().click()
}

async function setSetValues(page: Page, weight: number, reps: number, rpe: number) {
  await page.locator('input[inputmode="decimal"]').first().fill(String(weight))
  await page.locator('input[inputmode="numeric"]').first().fill(String(reps))
  await page.locator('input[inputmode="numeric"]').nth(1).fill(String(rpe))
}

test.describe('Free-form last-time context and progression (issue #59)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await installDeterministicClock(page)
    await page.goto(routeWithStableQuery('/workout'))
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('navigation', { name: 'FitTrack navigation' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('shows no-history guidance before any logged sets', async ({ page }) => {
    await startWorkout(page)
    await selectExercise(page, /^Farmer Carry \(full_body\)$/i)
    await expect(
      page.getByText('Select a weight that reaches the target RPE for all prescribed sets.'),
    ).toBeVisible()
  })

  test('shows last performance, reason, and pre-fills suggested load', async ({ page }) => {
    await startWorkout(page)
    await selectExercise(page, BENCH_PRESS_OPTION)
    await page.getByRole('button', { name: 'Add set' }).click()

    await setSetValues(page, 100, 12, 6)
    await page.getByRole('button', { name: /Save set 1/ }).click()
    await expect(page.getByText('Set saved')).toBeVisible({ timeout: 10000 })

    await finishActiveSessionIfNeeded(page)
    await startWorkout(page)
    await selectExercise(page, BENCH_PRESS_OPTION)

    await expect(page.getByText(/Last time: 100 kg × 12 @ RPE 6/)).toBeVisible()
    await expect(page.getByText(/\+2\.5% — last set felt easy at RPE 6/)).toBeVisible()

    await page.getByRole('button', { name: 'Add set' }).click()
    await expect(page.locator('input[inputmode="decimal"]').first()).toHaveValue('102.5')
    await expect(page.locator('input[inputmode="numeric"]').first()).toHaveValue('8')
  })
})
