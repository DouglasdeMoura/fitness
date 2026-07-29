/**
 * Theme flash gates (issue #79 / PRD 15 Batch 4).
 *
 * The first painted frame must equal the settled frame after hydration.
 * A pixel diff means the theme flashed. Clock-derived UI is masked.
 *
 * Coverage: dashboard x {light, dark} on chromium and pixel-7 projects.
 */

import { expect, test } from "@playwright/test";

import type { ColorMode, ThemePreference } from "./test-helpers";
import {
  clickThemeSegment,
  emulateColorScheme,
  installDeterministicClock,
  prepareTheme,
  resolveExpectedDataTheme,
  routeWithStableQuery,
  setDemoUserThemePreference,
  signInAsDemoUser,
} from "./test-helpers";
import {
  buildCookieHeader,
  captureServerPathFirstPaint,
  captureThemeFlashFrames,
  measureMedianTtfb,
  TTFB_BASELINES_MS,
  TTFB_BUDGET_MS,
} from "./theme-flash-helpers";

const COLOR_MODES: ColorMode[] = ["light", "dark"];
const THEME_FLASH_ROUTE = "/dashboard";
const SIGNED_IN_FIRST_PAINT_PREFERENCES: ThemePreference[] = [
  "light",
  "dark",
  "system",
];
const OS_SCHEMES: ColorMode[] = ["light", "dark"];

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

test.describe("server-path first paint (issue #105)", () => {
  for (const preference of SIGNED_IN_FIRST_PAINT_PREFERENCES) {
    if (preference === "system") {
      for (const osScheme of OS_SCHEMES) {
        test(`signed in system with OS ${osScheme}: no flash from server preference`, async ({
          page,
        }) => {
          await installDeterministicClock(page);
          await emulateColorScheme(page, osScheme);
          setDemoUserThemePreference("system");
          await signInAsDemoUser(page);

          const expectedColorMode = resolveExpectedDataTheme(
            "system",
            osScheme
          );
          await captureServerPathFirstPaint(
            page,
            routeWithStableQuery(THEME_FLASH_ROUTE),
            expectedColorMode
          );
        });
      }
      continue;
    }

    test(`signed in ${preference}: no flash from server preference`, async ({
      page,
    }) => {
      await installDeterministicClock(page);
      setDemoUserThemePreference(preference);
      await signInAsDemoUser(page);

      await captureServerPathFirstPaint(
        page,
        routeWithStableQuery(THEME_FLASH_ROUTE),
        preference
      );
    });
  }

  for (const osScheme of OS_SCHEMES) {
    test(`signed out system with OS ${osScheme}: no flash from server preference`, async ({
      page,
    }) => {
      await installDeterministicClock(page);
      await emulateColorScheme(page, osScheme);
      setDemoUserThemePreference("dark");

      await captureServerPathFirstPaint(page, "/", osScheme);
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme-preference",
        "system"
      );
    });
  }
});

test.describe("cross-device propagation (issue #105)", () => {
  test("preference reaches the second device on its next document load", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await installDeterministicClock(pageA);
    await installDeterministicClock(pageB);
    setDemoUserThemePreference("light");
    await signInAsDemoUser(pageA);
    await signInAsDemoUser(pageB);

    await pageB.goto(routeWithStableQuery("/dashboard"), {
      waitUntil: "domcontentloaded",
    });
    await expect(pageB.locator("html")).toHaveAttribute("data-theme", "light");

    await pageA.goto("/settings");
    await clickThemeSegment(pageA, "dark");
    await expect(pageA.locator("html")).toHaveAttribute("data-theme", "dark");

    await pageB.goto(routeWithStableQuery("/dashboard"), {
      waitUntil: "domcontentloaded",
    });
    await expect(pageB.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(pageB.locator("html")).toHaveAttribute(
      "data-theme-preference",
      "dark"
    );

    await contextA.close();
    await contextB.close();
  });
});

test.describe("signed-out document requests (issue #105)", () => {
  test("do not surface a stored account preference on the opening html tag", async ({
    page,
    request,
  }) => {
    setDemoUserThemePreference("dark");

    const response = await request.get("/");
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain('data-theme-preference="system"');
    expect(html).not.toContain('data-theme-preference="dark"');

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-preference",
      "system"
    );
  });
});

test.describe("live OS under system (issue #105)", () => {
  test("flips data-theme with no reload", async ({ page }) => {
    await installDeterministicClock(page);
    await emulateColorScheme(page, "light");
    setDemoUserThemePreference("system");
    await signInAsDemoUser(page);

    await page.goto(routeWithStableQuery("/dashboard"), {
      waitUntil: "domcontentloaded",
    });
    const urlAfterLoad = page.url();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await emulateColorScheme(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(page.url()).toBe(urlAfterLoad);
  });
});

test.describe("TTFB budget (issue #105)", () => {
  /**
   * Coarse guard against a structural regression in the root loader — not a benchmark.
   * Median of seven curl samples with the cold first discarded (PRD 20).
   */
  test("stays within +15ms of recorded baselines on /, /dashboard, /settings", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3000";
    const signedOutMedian = measureMedianTtfb(`${origin}/`);
    expect(
      signedOutMedian,
      `TTFB / measured ${signedOutMedian.toFixed(1)}ms (baseline ${TTFB_BASELINES_MS["/"]}ms + ${TTFB_BUDGET_MS}ms budget)`
    ).toBeLessThanOrEqual(TTFB_BASELINES_MS["/"] + TTFB_BUDGET_MS);

    await signInAsDemoUser(page);
    const cookieHeader = buildCookieHeader(await page.context().cookies());

    for (const route of ["/dashboard", "/settings"] as const) {
      const measured = measureMedianTtfb(`${origin}${route}`, cookieHeader);
      const baseline = TTFB_BASELINES_MS[route];
      expect(
        measured,
        `TTFB ${route} measured ${measured.toFixed(1)}ms (baseline ${baseline}ms + ${TTFB_BUDGET_MS}ms budget)`
      ).toBeLessThanOrEqual(baseline + TTFB_BUDGET_MS);
    }
  });
});
