import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import {
  APP_ROUTES,
  formatAxeViolations,
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
  type ColorMode,
} from './test-helpers'

const COLOR_MODES: ColorMode[] = ['light', 'dark']

// axe's analysis of /workout in light mode measures ~53s — right on the 60s
// default, so these tests passed alone and failed under full-suite load, which
// intermittently blocked the dev loop's e2e gate for unrelated issues.
//
// The cost is the page, not the harness: /workout is still un-migrated (issue
// #13 — 21 `style={{}}`, 21 `className`, 19 layout `<div>`), and the
// color-contrast rule has to resolve computed backgrounds through all of it.
// Dark mode short-circuits far more of that work and finishes in ~7s.
//
// Budget generously rather than dropping the contrast rule; this should come
// back down on its own once #13 lands, at which point the timeout can go.
test.describe.configure({ timeout: 180_000 })

for (const route of APP_ROUTES) {
  for (const colorMode of COLOR_MODES) {
    test(`${route} has zero critical/serious axe violations (${colorMode})`, async ({ page }) => {
      await prepareTheme(page, colorMode)
      await installDeterministicClock(page)
      await openAppRoute(page, route)

      const results = await new AxeBuilder({ page }).analyze()
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      )

      expect(blocking, formatAxeViolations(blocking)).toEqual([])
    })
  }
}
