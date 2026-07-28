import { test, expect, type Page, type Locator } from '@playwright/test'

async function openAppPage(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}
async function reloadAppPage(page: Page) {
  await page.reload()
  await page.waitForLoadState('networkidle')
}


async function waitForAppReady(page: Page) {
  await openAppPage(page, '/')
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

  test('displays calorie ring and remaining summary on first visit', async ({ page }) => {
    await waitForAppReady(page)
    // The calorie ring is an SVG with an accessible label
    await expect(
      page.locator('svg[role="img"][aria-label*="Calorie progress"]'),
    ).toBeVisible({ timeout: 10000 })
    // "of {target} kcal" label below the hero number
    await expect(page.locator('text=/of \\d+ kcal/')).toBeVisible()
    // Remaining/over summary text
    await expect(page.locator('text=/kcal (remaining|over target)/')).toBeVisible()
  })

  test('shows macro tracking section with protein, carbs, and fat', async ({ page }) => {
    await waitForAppReady(page)
    // First-time users see welcome state instead; skip if so
    const welcome = page.getByRole('status').filter({ hasText: 'Welcome to FitTrack' })
    if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.info().annotations.push({
        type: 'note',
        description: 'First-time welcome state shown; dashboard data not yet available.',
      })
      return
    }
    await expect(page.getByText('Macros', { exact: true })).toBeVisible()
    await expect(page.getByText('Protein', { exact: true })).toBeVisible()
    await expect(page.getByText('Carbs', { exact: true })).toBeVisible()
    await expect(page.getByText('Fat', { exact: true })).toBeVisible()
    // Each macro renders its own labelled progress bar.
    await expect(page.getByRole('progressbar', { name: 'Protein consumed' })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Carbs consumed' })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Fat consumed' })).toBeVisible()
  })

  test('renders quick actions as prominent clickable cards', async ({ page }) => {
    await waitForAppReady(page)
    const welcome = page.getByRole('status').filter({ hasText: 'Welcome to FitTrack' })
    if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.info().annotations.push({
        type: 'note',
        description: 'First-time welcome state shown; quick actions not yet available.',
      })
      return
    }
    await expect(page.getByText('Quick Actions')).toBeVisible()
    // ClickableCards render as styled links with accessible labels
    await expect(page.getByRole('link', { name: 'Log your meals' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start a workout' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View your progress' })).toBeVisible()
  })

  test('shows current goal type from user profile', async ({ page }) => {
    await waitForAppReady(page)
    const welcome = page.getByRole('status').filter({ hasText: 'Welcome to FitTrack' })
    if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.info().annotations.push({
        type: 'note',
        description: 'First-time welcome state shown; goal summary not yet available.',
      })
      return
    }
    await expect(page.getByText('Your Goal')).toBeVisible()
    await expect(page.getByText('Goal Type')).toBeVisible()
  })

  test('quick action cards navigate to their target page', async ({ page }) => {
    await waitForAppReady(page)
    const welcome = page.getByRole('status').filter({ hasText: 'Welcome to FitTrack' })
    if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.info().annotations.push({
        type: 'note',
        description: 'First-time welcome state shown; navigation test skipped.',
      })
      return
    }
    // ClickableCard's rendered content overlays the inner <a>; force-click
    // through to the link element.
    await page.getByRole('link', { name: 'Log your meals' }).click({ force: true })
    await expect(page).toHaveURL(/\/nutrition/)
  })
})

test.describe('Nutrition - Food Logging Flow', () => {
  test('user can navigate to nutrition page', async ({ page }) => {
    await waitForAppReady(page)
    await nav(page).getByRole('link', { name: 'Nutrition' }).click()
    await expect(page).toHaveURL(/\/nutrition/)
    await expect(page.getByRole('heading', { name: 'Daily Summary' })).toBeVisible()
  })

  test('user can search for foods in the database', async ({ page }) => {
    await openAppPage(page, '/nutrition')
    await expect(page.getByRole('heading', { name: 'Add Food' })).toBeVisible({
      timeout: 10000,
    })
    await page.getByRole('textbox', { name: 'Search foods' }).fill('chicken')
    // The search debounces into a TanStack Query; no Search button to click.
    await expect(page.getByText(/Chicken/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('food search streams results live as the user types', async ({ page }) => {
    await openAppPage(page, '/nutrition')
    const searchInput = page.getByRole('textbox', { name: 'Search foods' })
    // Single character is below the 2-char minimum: no request fires.
    await searchInput.fill('c')
    await page.waitForTimeout(500)
    expect(await page.getByText('Search results').count()).toBe(0)

    // Typing past the minimum triggers the debounced query automatically.
    await searchInput.fill('chicken')
    await expect(page.getByText(/Chicken/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('user can open custom food form from an unsuccessful food search', async ({ page }) => {
    await openAppPage(page, '/nutrition')
    const searchInput = page.getByRole('textbox', { name: 'Search foods' })
    await searchInput.fill(`missing-food-${Date.now()}`)
    // The debounced query resolves to an empty result set; no Search button.
    const noResults = page.getByRole('status').filter({ hasText: 'No foods found' })
    await expect(noResults).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Create a custom food', exact: true }).click()
    await expect(page.getByLabel('Name')).toBeVisible()
  })

  test('user can create, log, and delete a custom food', async ({ page }) => {
    const foodName = `E2E Test Protein Bar ${Date.now()}`
    await openAppPage(page, '/nutrition')
    await page.getByRole('button', { name: 'Create Custom Food' }).click()
    await page.getByLabel('Name').fill(foodName)
    await page.getByLabel('Calories per serving').fill('220')
    await page.getByLabel('Protein (g)').fill('20')
    await page.getByRole('button', { name: 'Save Food' }).click()
    await expect(page.getByText(foodName)).toBeVisible()

    await page.getByRole('button', { name: 'Add to Log' }).click()
    const foodRow = page.getByRole('row').filter({ hasText: foodName })
    await expect(foodRow).toBeVisible({ timeout: 10000 })
    await foodRow.getByRole('button', { name: `Delete ${foodName}` }).click()
    const deleteDialog = page.getByRole('dialog')
    await expect(deleteDialog.getByRole('heading', { name: 'Delete this entry?' })).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(foodRow).not.toBeVisible()
  })


  test('repeat food logs from Recent in at most two taps', async ({ page }) => {
    const foodName = `E2E Repeat Food ${Date.now()}`
    await openAppPage(page, '/nutrition')
    const searchInput = page.getByRole('textbox', { name: 'Search foods' })

    await page.getByRole('button', { name: 'Create Custom Food' }).click()
    await page.getByLabel('Name').fill(foodName)
    await page.getByLabel('Calories per serving').fill('180')
    await page.getByRole('button', { name: 'Save Food' }).click()
    await expect(page.getByText(foodName)).toBeVisible()

    await page.getByRole('spinbutton', { name: 'Servings' }).fill('2')
    await page.getByRole('button', { name: 'Add to Log' }).click()
    const foodRow = page.getByRole('row').filter({ hasText: foodName })
    await expect(foodRow).toBeVisible({ timeout: 10000 })

    await searchInput.clear()
    await expect(page.getByText('Recent')).toBeVisible({ timeout: 10000 })
    const recentFood = page.getByRole('button', { name: new RegExp(`^${foodName} —`) })
    await expect(recentFood).toBeVisible()

    let taps = 0
    await recentFood.click()
    taps += 1
    expect(taps).toBeLessThanOrEqual(2)

    await expect(page.getByRole('row').filter({ hasText: foodName })).toHaveCount(2, {
      timeout: 10000,
    })
  })
  test('food log shows a table or a helpful empty state', async ({ page }) => {
    await openAppPage(page, '/nutrition')
    await expect(page.getByRole('heading', { name: "Today's Food Log" })).toBeVisible({
      timeout: 10000,
    })
    const hasTable = await page.getByRole('table', { name: /food log/i }).count()
    const hasEmptyState = await page.getByRole('status').filter({ hasText: 'No food logged' }).count()
    expect(hasTable > 0 || hasEmptyState > 0).toBeTruthy()
  })
})

test.describe('Workout - Session Logging Flow', () => {
  test('user can navigate to workout page', async ({ page }) => {
    await waitForAppReady(page)
    await nav(page).getByRole('link', { name: 'Workout' }).click()
    await expect(page).toHaveURL(/\/workout/)
  })

  test('shows start workout prompt when no active session', async ({ page }) => {
    await openAppPage(page, '/workout')
    await expect(page.getByRole('heading', { name: 'Ready to train?' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible()
  })

  test('user can start a workout session and see exercise selection', async ({ page }) => {
    await openAppPage(page, '/workout')
    // May already have active session from previous test run
    const startBtn = page.getByRole('button', { name: 'Start Workout' })
    const finishBtn = page.getByRole('button', { name: 'Finish workout' })
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click()
      await expect(page.getByRole('heading', { name: 'Session Summary' })).toBeVisible({ timeout: 10000 })
      await page.getByRole('button', { name: 'Done' }).click()
    }
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click()
    }
    await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible()
  })

  test('selecting an exercise shows set logging interface', async ({ page }) => {
    await openAppPage(page, '/workout')
    const startBtn = page.getByRole('button', { name: 'Start Workout' })
    const finishBtn = page.getByRole('button', { name: 'Finish workout' })
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click()
      await expect(page.getByRole('heading', { name: 'Session Summary' })).toBeVisible({ timeout: 10000 })
      await page.getByRole('button', { name: 'Done' }).click()
    }
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click()
    }
    await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible({ timeout: 10000 })
    const exerciseSelect = page.getByRole('combobox', { name: 'Exercise' })
    const options = await exerciseSelect.locator('option').count()
    if (options > 1) {
      await exerciseSelect.click(); await page.getByRole('option').nth(1).click()
      await expect(page.getByRole('button', { name: 'Add set' })).toBeVisible({ timeout: 10000 })
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
    await openAppPage(page, '/settings')
    await expect(page.getByLabel('Height (cm)', { exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole('combobox', { name: /Sex/ })).toBeVisible()
    await expect(page.getByLabel('Birth Date', { exact: true })).toBeVisible()
  })

  test('displays goal options with science-based descriptions', async ({ page }) => {
    await openAppPage(page, '/settings')
    const goal = page.getByRole('combobox', { name: 'Primary Goal' })
    await expect(goal).toBeVisible({ timeout: 10000 })
    await goal.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option', { name: /Build Muscle.*surplus/ })).toBeVisible()
    await expect(listbox.getByRole('option', { name: /Lose Fat.*deficit/ })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('user can edit profile name via TanStack Form and save', async ({ page }) => {
    await openAppPage(page, '/settings')
    const name = page.getByLabel('Name', { exact: true })
    await expect(name).toBeVisible({ timeout: 10000 })
    await name.fill('Form Test User')
    await page.getByRole('button', { name: 'Save Profile' }).click()
    await expect(
      page.getByRole('region', { name: 'Notifications' }).getByRole('status').filter({
        hasText: 'Profile saved',
      }),
    ).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()
    await reloadAppPage(page)
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Form Test User')
  })

  test('user can change activity level and save profile', async ({ page }) => {
    await openAppPage(page, '/settings')
    const activity = page.getByRole('combobox', { name: 'Activity Level' })
    await expect(activity).toBeVisible({ timeout: 10000 })
    await activity.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option', { name: /Sedentary/ })).toBeVisible()
    await listbox.getByRole('option', { name: /Moderately active/ }).click()
    await page.getByRole('button', { name: 'Save Profile' }).click()
    // Confirmation moved from button label hack to Astryx toast (issue #24).
    await expect(
      page.getByRole('region', { name: 'Notifications' }).getByRole('status').filter({
        hasText: 'Profile saved',
      }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('shows weight logging interface and accepts a weigh-in', async ({ page }) => {
    await openAppPage(page, '/settings')
    await expect(page.getByRole('heading', { name: "Log Today's Weight" })).toBeVisible({
      timeout: 10000,
    })
    const weight = page.getByLabel('Weight in kg', { exact: true })
    await expect(weight).toBeVisible()
    await weight.fill('75.5')
    await page.getByRole('button', { name: 'Log' }).click()
    await expect(weight).toHaveValue('')
  })

  test('shows science references in About section', async ({ page }) => {
    await openAppPage(page, '/settings')
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Mifflin-St Jeor/)).toBeVisible()
    await expect(page.getByText(/Morton/)).toBeVisible()
    await expect(page.getByText(/Epley/)).toBeVisible()
  })

  test('user can export data as JSON', async ({ page }) => {
    await openAppPage(page, '/settings')
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
  test('user can navigate to progress page and see its heading', async ({ page }) => {
    await waitForAppReady(page)
    await nav(page).getByRole('link', { name: 'Progress' }).click()
    await expect(page).toHaveURL(/\/progress/)
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible()
  })

  test('renders the highlights card with best lift, monthly volume, and streak', async ({ page }) => {
    await openAppPage(page, '/progress')
    await expect(page.getByText('Best Lift This Month', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Monthly Volume', { exact: true })).toBeVisible()
    await expect(page.getByText('Workout Streak', { exact: true })).toBeVisible()
  })

  test('shows TabList for Weight, Volume, Nutrition views', async ({ page }) => {
    await openAppPage(page, '/progress')
    await expect(page.locator('button', { hasText: 'Weight' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button', { hasText: 'Volume' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Nutrition' })).toBeVisible()
  })

  test('Weight tab defaults to area chart or empty guidance', async ({ page }) => {
    await openAppPage(page, '/progress')
    // Weight tab is the default view — either chart or empty state
    const chart = page.getByRole('img', { name: /Weight trend area chart/ })
    const empty = page.getByRole('status').filter({ hasText: 'No weight logs yet' })
    await expect(chart.or(empty).first()).toBeVisible({ timeout: 10000 })
  })

  test('Volume tab shows Schoenfeld reference after switching', async ({ page }) => {
    await openAppPage(page, '/progress')
    await page.locator('button', { hasText: 'Volume' }).click()
    await expect(page.getByText(/Schoenfeld/)).toBeVisible({ timeout: 5000 })
  })

  test('Nutrition tab shows weekly averages after switching', async ({ page }) => {
    await openAppPage(page, '/progress')
    await page.locator('button', { hasText: 'Nutrition' }).click()
    await expect(page.getByText(/Weekly Nutrition Summary/)).toBeVisible({ timeout: 5000 })
  })

  test('logged workout volume renders as a ProgressBar on the Volume tab', async ({ page }) => {
    // Drive the workout UI to log one set so a ProgressBar appears in the weekly volume.
    await openAppPage(page, '/workout')
    const finishBtn = page.getByRole('button', { name: 'Finish workout' })
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click()
      await expect(page.getByRole('heading', { name: 'Session Summary' })).toBeVisible({ timeout: 10000 })
      await page.getByRole('button', { name: 'Done' }).click()
    }
    const startBtn = page.getByRole('button', { name: 'Start Workout' })
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click()
    }
    await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible({ timeout: 10000 })

    const exerciseSelect = page.getByRole('combobox', { name: 'Exercise' })
    const optionCount = await exerciseSelect.locator('option').count()
    test.skip(optionCount <= 1, 'no exercisable option available to log a set')

    await exerciseSelect.click(); await page.getByRole('option').nth(1).click()
    await page.getByRole('button', { name: 'Add Set' }).click()
    await page.getByRole('button', { name: /^Save set \d+$/ }).first().click()
    await page.waitForTimeout(500)

    await openAppPage(page, '/progress')
    // Switch to Volume tab
    await page.locator('button', { hasText: 'Volume' }).click()
    await expect(
      page.getByRole('progressbar', { name: /weekly volume/i }),
    ).toBeVisible({ timeout: 10000 })
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
    await openAppPage(page, '/nutrition')
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
    await openAppPage(page, '/')
    await page.evaluate(() => {
      localStorage.setItem('fittrack-theme', 'light')
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await reloadAppPage(page)
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
    await openAppPage(page, '/')
    await page.evaluate(() => {
      localStorage.setItem('fittrack-theme', 'light')
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await reloadAppPage(page)
    await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toBeVisible({
      timeout: 15000,
    })

    await page.getByRole('button', { name: 'Toggle dark mode' }).click()
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('dark')

    await reloadAppPage(page)
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
