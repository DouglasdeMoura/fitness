import { test, expect, type Page, type Locator } from '@playwright/test'

async function waitForAppReady(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'FitTrack navigation' })).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByRole('link', { name: /FitTrack/ })).toBeVisible()
}

function nav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'FitTrack navigation' })
}

test.describe('Dashboard - User Landing Experience', () => {
  test('shows app header with all navigation links', async ({ page }) => {
    await waitForAppReady(page)
    const topNav = nav(page)
    await expect(topNav.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(topNav.getByRole('link', { name: 'Nutrition' })).toBeVisible()
    await expect(topNav.getByRole('link', { name: 'Workout' })).toBeVisible()
    await expect(topNav.getByRole('link', { name: 'Progress' })).toBeVisible()
    await expect(topNav.getByRole('link', { name: 'Settings' })).toBeVisible()
  })

  test('displays calorie target and consumed metrics on first visit', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.getByText("Today's Calories")).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=/kcal/').first()).toBeVisible()
    // Calorie ProgressBar exposes a descriptive accessible label even though
    // the visible label is hidden.
    await expect(
      page.getByRole('progressbar', { name: /calories consumed today/i }),
    ).toBeVisible()
  })

  test('shows macro tracking section with protein, carbs, and fat', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.getByText('Macros', { exact: true })).toBeVisible()
    await expect(page.getByText('Protein', { exact: true })).toBeVisible()
    await expect(page.getByText('Carbs', { exact: true })).toBeVisible()
    await expect(page.getByText('Fat', { exact: true })).toBeVisible()
    // Each macro renders its own labelled progress bar.
    await expect(page.getByRole('progressbar', { name: 'Protein consumed' })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Carbs consumed' })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Fat consumed' })).toBeVisible()
  })

  test('renders quick actions as styled navigation links', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.getByText('Quick Actions')).toBeVisible()
    // Button with href renders a styled <a>, preserving link semantics and
    // client-side routing.
    await expect(page.getByRole('link', { name: 'Log Food' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start Workout' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Progress' })).toBeVisible()
  })

  test('shows current goal type from user profile', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.getByText('Your Goal')).toBeVisible()
    await expect(page.getByText('Goal Type')).toBeVisible()
  })

  test('quick action links navigate to their target page', async ({ page }) => {
    await waitForAppReady(page)
    await page.getByRole('link', { name: 'Log Food' }).click()
    await expect(page).toHaveURL(/\/nutrition/)
  })
})

test.describe('Nutrition - Food Logging Flow', () => {
  test('user can navigate to nutrition page', async ({ page }) => {
    await waitForAppReady(page)
    await nav(page).getByRole('link', { name: 'Nutrition' }).click()
    await expect(page).toHaveURL(/\/nutrition/)
    await expect(page.locator('.card-title:has-text("Daily Summary")')).toBeVisible()
  })

  test('user can search for foods in the database', async ({ page }) => {
    await page.goto('/nutrition')
    await expect(page.locator('.card-title:has-text("Add Food")')).toBeVisible({ timeout: 10000 })
    const searchInput = page.locator('input[placeholder*="chicken"]')
    await searchInput.waitFor({ state: 'visible', timeout: 10000 })
    await searchInput.fill('chicken')
    await page.locator('button:has-text("Search")').click()
    await expect(page.locator('div >> text=/Chicken/i').first()).toBeVisible({ timeout: 10000 })
  })

  test('user can create a custom food', async ({ page }) => {
    await page.goto('/nutrition')
    await expect(page.locator('.card-title:has-text("Add Food")')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("Create Custom Food")').click()
    await expect(page.locator('input[placeholder="Food name"]')).toBeVisible({ timeout: 5000 })
    await page.locator('input[placeholder="Food name"]').fill('E2E Test Protein Bar')
    const numberInputs = page.locator('.card input[type="number"]')
    await numberInputs.nth(0).fill('50')
    await numberInputs.nth(1).fill('220')
    await page.locator('button:has-text("Save Food")').click()
    await expect(page.locator('text=E2E Test Protein Bar')).toBeVisible({ timeout: 10000 })
  })

  test('empty food log shows helpful message or entries', async ({ page }) => {
    await page.goto('/nutrition')
    await expect(page.locator('.card-title:has-text("Today\'s Food Log")')).toBeVisible({ timeout: 10000 })
    const hasEntries = await page.locator('table tbody tr').count()
    const hasEmptyState = await page.locator('text=No food logged').count()
    expect(hasEntries > 0 || hasEmptyState > 0).toBeTruthy()
  })
})

test.describe('Workout - Session Logging Flow', () => {
  test('user can navigate to workout page', async ({ page }) => {
    await waitForAppReady(page)
    await nav(page).getByRole('link', { name: 'Workout' }).click()
    await expect(page).toHaveURL(/\/workout/)
  })

  test('shows start workout prompt when no active session', async ({ page }) => {
    await page.goto('/workout')
    await expect(page.locator('text=Ready to train')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("Start Workout")')).toBeVisible()
  })

  test('user can start a workout session and see exercise selection', async ({ page }) => {
    await page.goto('/workout')
    // May already have active session from previous test run
    const startBtn = page.locator('button:has-text("Start Workout")')
    const finishBtn = page.locator('button:has-text("Finish")')
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click()
      await page.waitForTimeout(500)
    }
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click()
    }
    await expect(page.locator('.card-title:has-text("Active Session")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.card-title:has-text("Select Exercise")')).toBeVisible()
  })

  test('selecting an exercise shows set logging interface', async ({ page }) => {
    await page.goto('/workout')
    const startBtn = page.locator('button:has-text("Start Workout")')
    const finishBtn = page.locator('button:has-text("Finish")')
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click()
      await page.waitForTimeout(500)
    }
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click()
    }
    await expect(page.locator('.card-title:has-text("Select Exercise")')).toBeVisible({ timeout: 10000 })
    const exerciseSelect = page.locator('select').first()
    const options = await exerciseSelect.locator('option').count()
    if (options > 1) {
      await exerciseSelect.selectOption({ index: 1 })
      await expect(page.locator('button:has-text("Add Set")')).toBeVisible({ timeout: 10000 })
    }
  })
})

test.describe('Settings - Profile Configuration', () => {
  test('user can navigate to settings', async ({ page }) => {
    await waitForAppReady(page)
    await nav(page).getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  })

  test('displays all BMR-relevant input fields', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByLabel('Height (cm)')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('combobox', { name: /Sex/ })).toBeVisible()
    await expect(page.getByLabel('Birth Date')).toBeVisible()
  })

  test('displays goal options with science-based descriptions', async ({ page }) => {
    await page.goto('/settings')
    const goal = page.getByRole('combobox', { name: 'Primary Goal' })
    await expect(goal).toBeVisible({ timeout: 10000 })
    await goal.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option', { name: /Build Muscle.*surplus/ })).toBeVisible()
    await expect(listbox.getByRole('option', { name: /Lose Fat.*deficit/ })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('user can change activity level and save profile', async ({ page }) => {
    await page.goto('/settings')
    const activity = page.getByRole('combobox', { name: 'Activity Level' })
    await expect(activity).toBeVisible({ timeout: 10000 })
    await activity.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option', { name: /Sedentary/ })).toBeVisible()
    await listbox.getByRole('option', { name: /Moderately active/ }).click()
    await page.getByRole('button', { name: 'Save Profile' }).click()
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible({ timeout: 10000 })
  })

  test('shows weight logging interface and accepts a weigh-in', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: "Log Today's Weight" })).toBeVisible({
      timeout: 10000,
    })
    const weight = page.getByLabel('Weight in kg')
    await expect(weight).toBeVisible()
    await weight.fill('75.5')
    await page.getByRole('button', { name: 'Log' }).click()
    await expect(weight).toHaveValue('')
  })

  test('shows science references in About section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Mifflin-St Jeor/)).toBeVisible()
    await expect(page.getByText(/Morton/)).toBeVisible()
    await expect(page.getByText(/Epley/)).toBeVisible()
  })

  test('user can export data as JSON', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Export Data' })).toBeVisible({
      timeout: 10000,
    })
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export as JSON' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^fittrack-export-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

test.describe('Progress - Analytics View', () => {
  test('user can navigate to progress page', async ({ page }) => {
    await waitForAppReady(page)
    await nav(page).getByRole('link', { name: 'Progress' }).click()
    await expect(page).toHaveURL(/\/progress/)
  })

  test('shows weekly volume analysis section with Schoenfeld reference', async ({ page }) => {
    await page.goto('/progress')
    await expect(page.locator('.card-title:has-text("Weekly Volume")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Schoenfeld')).toBeVisible()
  })

  test('shows weekly nutrition summary section', async ({ page }) => {
    await page.goto('/progress')
    await expect(page.locator('.card-title:has-text("Weekly Nutrition")')).toBeVisible({ timeout: 10000 })
  })

  test('shows weight history section', async ({ page }) => {
    await page.goto('/progress')
    await expect(page.locator('.card-title:has-text("Weight History")')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Navigation - Cross-page Flow', () => {
  test('user can navigate between all pages via header', async ({ page }) => {
    await waitForAppReady(page)

    await nav(page).getByRole('link', { name: 'Nutrition' }).click()
    await expect(page).toHaveURL(/\/nutrition/)

    await nav(page).getByRole('link', { name: 'Workout' }).click()
    await expect(page).toHaveURL(/\/workout/)

    await nav(page).getByRole('link', { name: 'Progress' }).click()
    await expect(page).toHaveURL(/\/progress/)

    await nav(page).getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings/)

    await nav(page).getByRole('link', { name: 'Dashboard' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('brand logo links back to dashboard', async ({ page }) => {
    await page.goto('/nutrition')
    await page.getByRole('link', { name: /FitTrack/ }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('Dark Mode Toggle', () => {
  test('dark mode toggle button is visible in TopNav endContent', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toBeVisible()
  })

  test('clicking toggle changes theme attribute via Astryx Theme', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('fittrack-theme', 'light')
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toBeVisible({
      timeout: 15000,
    })

    await page.getByRole('button', { name: 'Toggle dark mode' }).click()
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('dark')
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('fittrack-theme')))
      .toBe('dark')
  })

  test('persists dark mode across reload', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('fittrack-theme', 'light')
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toBeVisible({
      timeout: 15000,
    })

    await page.getByRole('button', { name: 'Toggle dark mode' }).click()
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('dark')

    await page.reload()
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('dark')
  })
})

test.describe('AppShell TopNav selection', () => {
  test('marks the current section as selected for screen readers', async ({ page }) => {
    await waitForAppReady(page)

    await expect(nav(page).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await nav(page).getByRole('link', { name: 'Nutrition' }).click()
    await expect(page).toHaveURL(/\/nutrition/)
    await expect(nav(page).getByRole('link', { name: 'Nutrition' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(nav(page).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
