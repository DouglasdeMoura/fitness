/**
 * Visual regression baselines (issue #51 / PRD 13 Batch 3).
 *
 * This gate detects unintended *change*, not design quality. A pixel diff
 * fails the suite, forcing either a regression fix or a deliberate baseline
 * update in the same commit as an intended redesign (say so in the commit body).
 *
 * Coverage: every APP_ROUTES entry x {mobile 390px, desktop} x {light, dark}.
 * Clock-derived UI is masked via [data-visual-mask] and the rest-timer slot.
 */

import { expect, test } from "@playwright/test";

import type { ColorMode } from "./test-helpers";
import {
  APP_ROUTES,
  dismissWorkoutSummaryIfVisible,
  finishActiveSessionIfNeeded,
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
} from "./test-helpers";
import { getVisualMaskLocators, visualSnapshotSlug } from "./visual-helpers";

const COLOR_MODES: ColorMode[] = ["light", "dark"];

const VIEWPORTS = {
  desktop: { height: 720, width: 1280 },
  mobile: { height: 844, width: 390 },
} as const;

type ViewportName = keyof typeof VIEWPORTS;

test.describe("Visual regression baselines (issue #51)", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicClock(page);
  });

  for (const route of APP_ROUTES) {
    for (const colorMode of COLOR_MODES) {
      for (const [viewportName, viewport] of Object.entries(VIEWPORTS) as [
        ViewportName,
        (typeof VIEWPORTS)[ViewportName],
      ][]) {
        test(`${route} ${viewportName} ${colorMode}`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await prepareTheme(page, colorMode);
          await openAppRoute(page, route);
          await finishActiveSessionIfNeeded(page);
          await dismissWorkoutSummaryIfVisible(page);
          await page.evaluate(() => document.fonts.ready);
          await expect(page).toHaveScreenshot(
            `${visualSnapshotSlug(route)}--${viewportName}--${colorMode}.png`,
            {
              animations: "disabled",
              fullPage: true,
              mask: getVisualMaskLocators(page),
            }
          );
        });
      }
    }
  }
});
