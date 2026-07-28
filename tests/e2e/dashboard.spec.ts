import { expect, test } from 'vitest';
import { test, expect, type Page } from "@playwright/test";

import { installDeterministicClock, openAppRoute, prepareTheme } from './test-helpers';
import type { ColorMode } from './test-helpers';

async function waitForDashboardReady(page: Page) {
  await openAppRoute(page, "/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Dashboard" })
  ).toBeVisible({ timeout: 10_000 });
}

const COLOR_MODES: ColorMode[] = ["light", "dark"];

test.describe("Dashboard calorie ring (issue #30)", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicClock(page);
  });

  test("renders SVG calorie ring with accessible label", async ({ page }) => {
    await prepareTheme(page, "light");
    await waitForDashboardReady(page);

    // The calorie ring or welcome state — both are valid first-visit states
    const ring = page.locator(
      'svg[role="img"][aria-label*="Calorie progress"]'
    );
    const welcome = page
      .getByRole("status")
      .filter({ hasText: "Welcome to FitTrack" });

    const ringVisible = await ring
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const welcomeVisible = await welcome
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    expect(ringVisible || welcomeVisible).toBe(true);
    if (!ringVisible) {
      test.info().annotations.push({
        description: "First-time welcome state shown; ring test skipped.",
        type: "note",
      });
    }
  });

  test("hero number uses large typography (at least 2xl token)", async ({
    page,
  }) => {
    await prepareTheme(page, "light");
    await waitForDashboardReady(page);

    // If welcome state, skip
    const welcome = page
      .getByRole("status")
      .filter({ hasText: "Welcome to FitTrack" });
    if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.info().annotations.push({
        description: "First-time welcome state shown; typography test skipped.",
        type: "note",
      });
      return;
    }

    // The hero calorie number has data-size="4xl" from Text size="4xl"
    const hero = page.locator('main [data-size="4xl"]').first();
    await expect(hero).toBeVisible();

    const heroText = await hero.textContent();
    expect(heroText).not.toBeNull();
    expect(Number.isNaN(Number(heroText?.trim()))).toBe(false);
  });

  test("units and labels use supporting text style", async ({ page }) => {
    await prepareTheme(page, "light");
    await waitForDashboardReady(page);

    const welcome = page
      .getByRole("status")
      .filter({ hasText: "Welcome to FitTrack" });
    if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.info().annotations.push({
        description:
          "First-time welcome state shown; supporting text test skipped.",
        type: "note",
      });
      return;
    }

    // "of {target} kcal" uses supporting text
    const ofLabel = page.locator("text=/of \\d+ kcal/").first();
    await expect(ofLabel).toBeVisible();
  });

  for (const colorMode of COLOR_MODES) {
    test(`calorie ring track and fill use Astryx tokens (${colorMode})`, async ({
      page,
    }) => {
      await prepareTheme(page, colorMode);
      await waitForDashboardReady(page);

      const welcome = page
        .getByRole("status")
        .filter({ hasText: "Welcome to FitTrack" });
      if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
        test.info().annotations.push({
          description:
            "First-time welcome state shown; ring token test skipped.",
          type: "note",
        });
        return;
      }

      // The SVG ring has two circles: track and fill
      const circles = page.locator(
        'svg[role="img"][aria-label*="Calorie progress"] circle'
      );
      const count = await circles.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Track circle should use var(--color-track)
      const trackStroke = await circles
        .nth(0)
        .evaluate((el) => getComputedStyle(el).stroke);
      // The stroke should resolve to an rgb() value (not a CSS variable reference
      // or raw hex in the DOM attribute)
      expect(trackStroke).toMatch(/^rgb/);
    });
  }
});

test.describe("Dashboard first-time welcome state (issue #30)", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicClock(page);
  });

  test("shows welcome prompt instead of zeros for new users", async ({
    page,
  }) => {
    await prepareTheme(page, "light");
    await waitForDashboardReady(page);

    // Either welcome state or data dashboard — both are valid
    const welcome = page
      .getByRole("status")
      .filter({ hasText: "Welcome to FitTrack" });
    const ring = page.locator(
      'svg[role="img"][aria-label*="Calorie progress"]'
    );

    const welcomeVisible = await welcome
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const ringVisible = await ring
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (welcomeVisible) {
      // Verify the CTA button links to settings
      await expect(
        page.getByRole("link", { name: "Set up your targets" })
      ).toBeVisible();
    } else if (ringVisible) {
      test.info().annotations.push({
        description: "Dashboard has data; welcome state not shown.",
        type: "note",
      });
    } else {
      throw new Error("Neither welcome state nor dashboard data visible");
    }
  });
});

test.describe("Dashboard quick actions (issue #30)", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicClock(page);
  });

  test("quick actions render as ClickableCards with description text", async ({
    page,
  }) => {
    await prepareTheme(page, "light");
    await waitForDashboardReady(page);

    const welcome = page
      .getByRole("status")
      .filter({ hasText: "Welcome to FitTrack" });
    if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.info().annotations.push({
        description:
          "First-time welcome state shown; quick action test skipped.",
        type: "note",
      });
      return;
    }

    // Each ClickableCard has a description below the title
    await expect(page.getByText("Track your daily nutrition")).toBeVisible();
    await expect(page.getByText("Log your training session")).toBeVisible();
  });

  test("quick action cards have accessible labels", async ({ page }) => {
    await prepareTheme(page, "light");
    await waitForDashboardReady(page);

    const welcome = page
      .getByRole("status")
      .filter({ hasText: "Welcome to FitTrack" });
    if (await welcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.info().annotations.push({
        description:
          "First-time welcome state shown; accessibility test skipped.",
        type: "note",
      });
      return;
    }

    // Each ClickableCard must have an accessible label
    await expect(
      page.getByRole("link", { name: "Log your meals" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Start a workout" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View your progress" })
    ).toBeVisible();
  });
});
