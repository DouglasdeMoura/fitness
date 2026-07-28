import { test, expect, type Page } from '@playwright/test'
import {
  finishActiveSessionIfNeeded,
  installDeterministicClock,
  routeWithStableQuery,
} from './test-helpers'

const MOBILE_VIEWPORT = { width: 390, height: 844 }
const BENCH_PRESS_OPTION = /^Barbell Bench Press \(chest\)$/i

async function startWorkout(page: Page) {
  await finishActiveSessionIfNeeded(page)
  await page.getByRole('button', { name: 'Start Workout' }).click()
  await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible({
    timeout: 15000,
  })
}

async function selectExercise(page: Page, optionPattern: RegExp) {
  const exerciseField = page.getByRole('combobox', { name: 'Exercise' })
  await exerciseField.click()
  await page.getByRole('option', { name: optionPattern }).first().click()
}

async function addAndSaveSet(page: Page, weight: number, reps: number, rpe: number) {
  await page.getByRole('button', { name: 'Add set' }).click()
  await page.locator('input[inputmode="decimal"]').first().fill(String(weight))
  await page.locator('input[inputmode="numeric"]').first().fill(String(reps))
  await page.locator('input[inputmode="numeric"]').nth(1).fill(String(rpe))
  await page.getByRole('button', { name: /Save set 1/ }).click()
}

test.describe('Focused session interface (issue #32)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await installDeterministicClock(page)
    await page.goto(routeWithStableQuery('/workout'))
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('navigation', { name: 'FitTrack navigation' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('hides page heading and date navigation during active session', async ({ page }) => {
    await startWorkout(page)

    // Page heading "Workout" should NOT be visible in focused mode
    await expect(page.getByRole('heading', { name: 'Workout', level: 1 })).not.toBeVisible()
    // Date navigation should NOT be visible in focused mode
    await expect(page.getByRole('button', { name: 'Previous day' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Next day' }).or(page.getByRole('button', { name: 'Next day', disabled: true }))).not.toBeVisible()
    // Exercise card IS visible
    await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible()
    // Finish workout button IS visible
    await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()
  })

  test('shows exercise name as display heading in focused view', async ({ page }) => {
    await startWorkout(page)
    await selectExercise(page, BENCH_PRESS_OPTION)

    // Exercise name should be rendered as a heading with display sizing
    const exerciseHeading = page.getByRole('heading', { name: /Barbell Bench Press/ })
    await expect(exerciseHeading).toBeVisible()

    // Verify it's a display heading — compute font size (display-2 should be noticeably large)
    const fontSize = await exerciseHeading.evaluate((el) =>
      window.getComputedStyle(el).fontSize,
    )
    const fontSizeNum = parseFloat(fontSize)
    // display-2 should be at least 20px; standard body text is much smaller
    expect(fontSizeNum).toBeGreaterThanOrEqual(20)
  })

  test('shows collapsible stats panel after logging a set', async ({ page }) => {
    await startWorkout(page)
    await selectExercise(page, BENCH_PRESS_OPTION)
    await addAndSaveSet(page, 80, 8, 8)

    // Stats panel trigger should be visible
    const statsTrigger = page.getByText('Session stats')
    await expect(statsTrigger).toBeVisible()

    // Stats panel should be collapsed by default
    await expect(page.getByText('Total volume')).not.toBeVisible()

    // Click to expand
    await statsTrigger.click()
    await expect(page.getByText('Total volume')).toBeVisible()
    await expect(page.getByText('Est. 1RM')).toBeVisible()
    await expect(page.getByText('Sets logged')).toBeVisible()

    // Should contain meaningful volume data — use first() to avoid strict mode (table also shows volume)
    await expect(page.getByText(/640 kg/).first()).toBeVisible()
  })

  test('finish workout shows summary in a dialog', async ({ page }) => {
    await startWorkout(page)
    await selectExercise(page, BENCH_PRESS_OPTION)
    await addAndSaveSet(page, 60, 8, 8)

    await page.getByRole('button', { name: 'Finish workout' }).click()

    // Summary should appear as a Dialog with heading
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await expect(dialog.getByRole('heading', { name: 'Session Summary' })).toBeVisible()

    // Should contain key stats
    await expect(dialog.getByText('Total volume')).toBeVisible()
    await expect(dialog.getByText('Sets logged')).toBeVisible()
    await expect(dialog.getByText('Exercises')).toBeVisible()
    await expect(dialog.getByText('Duration')).toBeVisible()
    await expect(dialog.getByText('Personal records')).toBeVisible()

    // Dismiss the dialog
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).not.toBeVisible()

    // Should return to idle state
    await expect(page.getByRole('heading', { name: 'Ready to train?' })).toBeVisible()
  })

  test('exercise selector is visible and functional', async ({ page }) => {
    await startWorkout(page)

    // Free-form session should show a Selector (combobox), not SegmentedControl
    const exerciseSelect = page.getByRole('combobox', { name: 'Exercise' })
    await expect(exerciseSelect).toBeVisible()

    // Click to open the dropdown and verify options appear
    await exerciseSelect.click()
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 5000 })
  })

  test('rest timer auto-starts after saving a set with RPE-based duration', async ({ page }) => {
    await startWorkout(page)
    await selectExercise(page, BENCH_PRESS_OPTION)
    await addAndSaveSet(page, 80, 8, 8)

    // Rest timer should be visible with RPE 8 → 2:30 duration
    const timer = page.getByRole('region', { name: 'Rest timer' })
    await expect(timer).toBeVisible()
    await expect(timer.getByText('2:30')).toBeVisible()
  })

  test('finish button is reachable at all times during active session', async ({ page }) => {
    await startWorkout(page)

    // Finish button visible immediately after starting
    await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()

    // After selecting exercise, still visible
    await selectExercise(page, BENCH_PRESS_OPTION)
    await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()

    // After adding sets, still visible
    await addAndSaveSet(page, 80, 8, 8)
    await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()
  })
})
