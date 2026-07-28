import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { ColorMode } from "./test-helpers";
import { getVisualMaskLocators } from "./visual-helpers";

export interface ThemeFlashCapture {
  colorSchemeAtDomContentLoaded: string;
  firstPaint: Buffer;
  settled: Buffer;
}

/**
 * Captures screenshots at domcontentloaded and after hydration settles.
 * Masks clock-derived UI so comparisons stay repeatable (AGENTS.md F.I.R.S.T).
 *
 * @example await captureThemeFlashFrames(page, "/dashboard", "dark")
 */
export async function captureThemeFlashFrames(
  page: Page,
  path: string,
  colorMode: ColorMode
): Promise<ThemeFlashCapture> {
  await page.goto(path, { waitUntil: "domcontentloaded" });

  const colorSchemeAtDomContentLoaded = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme
  );
  expect(
    colorSchemeAtDomContentLoaded,
    "color-scheme must be set on <html> before hydration"
  ).toBe(colorMode);

  const mask = getVisualMaskLocators(page);
  const firstPaint = await page.screenshot({
    animations: "disabled",
    fullPage: true,
    mask,
  });

  await page.waitForFunction(
    (expectedTheme) => {
      const provider = document.body.querySelector("[data-astryx-theme]");
      return provider?.dataset.theme === expectedTheme;
    },
    colorMode,
    { timeout: 15_000 }
  );
  await page.evaluate(() => document.fonts.ready);

  const settled = await page.screenshot({
    animations: "disabled",
    fullPage: true,
    mask,
  });

  return { colorSchemeAtDomContentLoaded, firstPaint, settled };
}
