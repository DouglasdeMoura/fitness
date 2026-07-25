import { test, expect, type Page } from '@playwright/test'

async function waitForAppReady(page: Page) {
  await page.goto('/')
  await expect(page.locator('.app-nav-brand')).toBeVisible({ timeout: 15000 })
}

test.describe('Dashboard - User Landing Experience', () => {
  test('shows app header with all navigation links', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.locator('.app-nav >> a:has-text("Dashboard")')).toBeVisible()
    await expect(page.locator('.app-nav >> a:has-text("Nutrition")')).toBeVisible()
    await expect(page.locator('.app-nav >> a:has-text("Workout")')).toBeVisible()
    await expect(page.locator('.app-nav >> a:has-text("Progress")')).toBeVisible()
    await expect(page.locator('.app-nav >> a:has-text("Settings")')).toBeVisible()
  })

  test('displays calorie target and consumed metrics on first visit', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.locator('.card-title:has-text("Today\'s Calories")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=/kcal/').first()).toBeVisible()
  })

  test('shows macro tracking section with protein, carbs, and fat', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.locator('.card-title:has-text("Macros")')).toBeVisible()
    await expect(page.locator('.stat-label:has-text("Protein")')).toBeVisible()
    await expect(page.locator('.stat-label:has-text("Carbs")')).toBeVisible()
    await expect(page.locator('.stat-label:has-text("Fat")')).toBeVisible()
  })

  test('displays quick action buttons', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.locator('.card-title:has-text("Quick Actions")')).toBeVisible()
    await expect(page.locator('a:has-text("Log Food")')).toBeVisible()
    await expect(page.locator('a:has-text("Start Workout")')).toBeVisible()
  })

  test('shows current goal type from user profile', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.locator('.card-title:has-text("Your Goal")')).toBeVisible()
    await expect(page.locator('.stat-label:has-text("Goal Type")')).toBeVisible()
  })
})

test.describe('Nutrition - Food Logging Flow', () => {
  test('user can navigate to nutrition page', async ({ page }) => {
    await waitForAppReady(page)
    await page.locator('.app-nav >> a:has-text("Nutrition")').click()
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
    await page.locator('.app-nav >> a:has-text("Workout")').click()
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
    await page.locator('.app-nav >> a:has-text("Settings")').click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.locator('.card-title:has-text("Profile")')).toBeVisible()
  })

  test('displays all BMR-relevant input fields', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('.label:has-text("Height")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.label:has-text("Sex")')).toBeVisible()
    await expect(page.locator('.label:has-text("Birth Date")')).toBeVisible()
  })

  test('displays goal options with science-based descriptions', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('.label:has-text("Primary Goal")')).toBeVisible({ timeout: 10000 })
    const goalSelect = page.locator('select').filter({ hasText: 'Build Muscle' })
    const options = await goalSelect.locator('option').allTextContents()
    expect(options.some(o => o.includes('Build Muscle') && o.includes('surplus'))).toBeTruthy()
    expect(options.some(o => o.includes('Lose Fat') && o.includes('deficit'))).toBeTruthy()
  })

  test('user can change activity level', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('.label:has-text("Activity Level")')).toBeVisible({ timeout: 10000 })
    const activitySelect = page.locator('select').filter({ hasText: 'Sedentary' })
    const options = await activitySelect.locator('option').allTextContents()
    expect(options.some(o => o.includes('Sedentary'))).toBeTruthy()
    expect(options.some(o => o.includes('Moderately active'))).toBeTruthy()
  })

  test('shows weight logging interface', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('.card-title:has-text("Log Today\'s Weight")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[placeholder="Weight in kg"]')).toBeVisible()
  })

  test('shows science references in About section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('.card-title:has-text("About")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Mifflin-St Jeor')).toBeVisible()
    await expect(page.locator('text=Morton')).toBeVisible()
    await expect(page.locator('text=Epley')).toBeVisible()
  })

  test('user can export data as JSON', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('.card-title:has-text("Export Data")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("Export as JSON")')).toBeVisible()
  })
})

test.describe('Progress - Analytics View', () => {
  test('user can navigate to progress page', async ({ page }) => {
    await waitForAppReady(page)
    await page.locator('.app-nav >> a:has-text("Progress")').click()
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

    await page.locator('.app-nav >> a:has-text("Nutrition")').click()
    await expect(page).toHaveURL(/\/nutrition/)

    await page.locator('.app-nav >> a:has-text("Workout")').click()
    await expect(page).toHaveURL(/\/workout/)

    await page.locator('.app-nav >> a:has-text("Progress")').click()
    await expect(page).toHaveURL(/\/progress/)

    await page.locator('.app-nav >> a:has-text("Settings")').click()
    await expect(page).toHaveURL(/\/settings/)

    await page.locator('.app-nav >> a:has-text("Dashboard")').click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('brand logo links back to dashboard', async ({ page }) => {
    await page.goto('/nutrition')
    await page.locator('.app-nav-brand').click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('Dark Mode Toggle', () => {
  test('dark mode toggle button is visible in header', async ({ page }) => {
    await waitForAppReady(page)
    await expect(page.locator('button[aria-label="Toggle dark mode"]')).toBeVisible()
  })

  test('clicking toggle changes theme attribute', async ({ page }) => {
    await waitForAppReady(page)
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
      localStorage.setItem('fittrack-theme', 'light')
    })
    await page.locator('button[aria-label="Toggle dark mode"]').click()
    await page.waitForTimeout(500)
    const newTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    )
    expect(newTheme).toBe('dark')
  })
})
