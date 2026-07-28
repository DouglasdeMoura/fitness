/**
 * Theme flash gates (issue #79 / PRD 15 Batch 4).
 *
 * The first painted frame must equal the settled frame after hydration.
 * A pixel diff means the theme flashed. Clock-derived UI is masked.
 *
 * Coverage: dashboard x {light, dark} on chromium and pixel-7 projects.
 */

import { expect, test } from "@playwright/test";

import type { ColorMode } from "./test-helpers";
import {
  installDeterministicClock,
  prepareTheme,
  routeWithStableQuery,
  signInAsDemoUser,
} from "./test-helpers";
import { captureThemeFlashFrames } from "./theme-flash-helpers";

const COLOR_MODES: ColorMode[] = ["light", "dark"];
const THEME_FLASH_ROUTE = "/dashboard";

for (const colorMode of COLOR_MODES) {
  test(`dashboard ${colorMode}: first paint equals settled frame`, async ({
    page,
  }) => {
    await installDeterministicClock(page);
    await prepareTheme(page, colorMode);
    await signInAsDemoUser(page);

    const { firstPaint, settled } = await captureThemeFlashFrames(
      page,
      routeWithStableQuery(THEME_FLASH_ROUTE),
      colorMode
    );

    expect(
      firstPaint,
      "theme flash detected: domcontentloaded screenshot differs from post-hydration"
    ).toEqual(settled);
  });
}
