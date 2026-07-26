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
