import { test, expect, type Page } from '@playwright/test'
import {
  assertFoodLogEntryScrollsInHost,
  assertTableScrollsInHost,
  findDestructiveSpacingViolations,
  installDeterministicClock,
  NAMED_TABLE_SCROLL_LABELS,
  openAppRoute,
  prepareTheme,
  routeWithStableQuery,
} from './test-helpers'

const MOBILE_VIEWPORT = { width: 390, height: 844 }

async function ensureActiveWorkoutWithExercise(page: Page) {
  await page.goto(routeWithStableQuery('/workout'))
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('navigation', { name: 'FitTrack navigation' })).toBeVisible({
    timeout: 15000,
  })

  const finish = page.getByRole('button', { name: 'Finish workout' })
  if (await finish.isVisible({ timeout: 3000 }).catch(() => false)) {
    await finish.click()
    await expect(page.getByRole('heading', { name: 'Session Summary' })).toBeVisible({
      timeout: 10000,
    })
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('heading', { name: 'Ready to train?' })).toBeVisible({
      timeout: 10000,
    })
  }

  const start = page.getByRole('button', { name: 'Start Workout' })
  await expect(start).toBeVisible({ timeout: 10000 })
  await start.click()
  await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible({
    timeout: 15000,
  })

  const exerciseField = page.getByRole('combobox', { name: 'Exercise' })
  await exerciseField.click()
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 10000 })
  await page.getByRole('option').first().click()
  await page.getByRole('button', { name: 'Add set' }).click()
}

test.describe('Gym-grade mobile ergonomics (issue #53)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await prepareTheme(page, 'light')
    await installDeterministicClock(page)
  })

  test('programs list scrolls inside its host without document overflow', async ({ page }) => {
    await openAppRoute(page, '/workout/programs')
    await assertTableScrollsInHost(page, NAMED_TABLE_SCROLL_LABELS.programsList)
  })

  test('templates list scrolls inside its host without document overflow', async ({ page }) => {
    await openAppRoute(page, '/nutrition/templates')
    await assertTableScrollsInHost(page, NAMED_TABLE_SCROLL_LABELS.templatesList)
  })

  test('food log scrolls inside its host after logging food', async ({ page }) => {
    const foodName = `Scroll Table Food ${Date.now()}`
    await openAppRoute(page, '/nutrition')
    await page.getByRole('button', { name: 'Create Custom Food' }).click()
    await page.getByLabel('Name').fill(foodName)
    await page.getByLabel('Calories per serving').fill('220')
    await page.getByLabel('Protein (g)').fill('20')
    await page.getByRole('button', { name: 'Save Food' }).click()
    await expect(page.getByText(foodName)).toBeVisible()
    await page.getByRole('button', { name: 'Add to Log' }).click()
    await expect(page.getByRole('row').filter({ hasText: foodName })).toBeVisible({ timeout: 10000 })
    await assertFoodLogEntryScrollsInHost(page, foodName)
  })

  test('workout sets use decimal/numeric input modes and 2.5 kg / 1 rep steppers', async ({ page }) => {
    await ensureActiveWorkoutWithExercise(page)

    const weightInput = page.locator('input[inputmode="decimal"]').first()
    const repsInput = page.locator('input[inputmode="numeric"]').first()
    await expect(weightInput).toBeVisible()
    await expect(repsInput).toBeVisible()

    const weightBefore = Number(await weightInput.inputValue())
    await page.getByRole('button', { name: /Increase Weight for set 1/ }).click()
    const weightAfter = Number(await weightInput.inputValue())
    expect(weightAfter - weightBefore).toBe(2.5)

    const repsBefore = Number(await repsInput.inputValue())
    await page.getByRole('button', { name: /Increase Reps for set 1/ }).click()
    const repsAfter = Number(await repsInput.inputValue())
    expect(repsAfter - repsBefore).toBe(1)

    await assertTableScrollsInHost(page, NAMED_TABLE_SCROLL_LABELS.workoutSets)
  })

  test('destructive controls keep at least 8px from neighbors on workout sets', async ({ page }) => {
    await ensureActiveWorkoutWithExercise(page)

    const violations = await findDestructiveSpacingViolations(page)
    expect(violations, violations.join('\n')).toEqual([])
  })
})
