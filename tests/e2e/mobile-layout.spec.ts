import { expect, test } from 'vitest';
import { test, expect } from "@playwright/test";

import {
  APP_ROUTES,
  assertNoHorizontalDocumentScroll,
  findUndersizedInteractiveElements,
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
} from "./test-helpers";

const MOBILE_VIEWPORT = { height: 844, width: 390 };

test.describe("Mobile layout at 390px (issue #49)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await prepareTheme(page, "light");
    await installDeterministicClock(page);
  });

  for (const route of APP_ROUTES) {
    test(`${route} has no horizontal document scroll`, async ({ page }) => {
      await openAppRoute(page, route);
      await assertNoHorizontalDocumentScroll(page);
    });

    test(`${route} interactive elements are at least 44×44px`, async ({
      page,
    }) => {
      await openAppRoute(page, route);
      const undersized = await findUndersizedInteractiveElements(page);
      expect(undersized, undersized.join("\n")).toEqual([]);
    });
  }
});
