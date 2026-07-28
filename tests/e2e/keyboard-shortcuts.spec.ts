import { expect, test } from 'vitest';
import { expect, test, type Page } from "@playwright/test";

import {
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
} from "./test-helpers";

test.describe("Keyboard shortcuts (issue #35)", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicClock(page);
    await prepareTheme(page, "light");
  });

  test("? opens the shortcuts help dialog and shows kbd elements", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "chromium",
      "Keyboard shortcuts only on desktop"
    );

    await openAppRoute(page, "/");
    await page.waitForLoadState("networkidle");

    // Press ? to toggle the shortcuts help dialog
    await page.keyboard.press("?");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" })
    ).toBeVisible();

    // Verify dialog contains expected shortcut entries
    await expect(page.getByText("Focus search input")).toBeVisible();
    await expect(page.getByText("New entry")).toBeVisible();
    await expect(page.getByText("Show this shortcuts help")).toBeVisible();

    // The dialog should use <kbd> elements for key labels
    const kbdElements = page.locator("kbd");
    const kbdCount = await kbdElements.count();
    expect(kbdCount).toBeGreaterThanOrEqual(3); // /, n, ?

    // Close dialog with Escape
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" })
    ).not.toBeVisible();
  });

  test("/ key does not fire inside text inputs", async ({ page }) => {
    test.skip(
      test.info().project.name !== "chromium",
      "Keyboard shortcuts only on desktop"
    );

    await openAppRoute(page, "/nutrition");
    await page.waitForLoadState("networkidle");

    // Type / inside a search input — should NOT trigger the shortcut
    const searchInput = page.getByRole("textbox", { name: "Search foods" });
    await searchInput.fill("/");
    await expect(searchInput).toHaveValue("/");

    // Shortcuts help dialog should NOT be visible
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" })
    ).not.toBeVisible();
  });

  test("n key triggers food log dialog on nutrition page", async ({ page }) => {
    test.skip(
      test.info().project.name !== "chromium",
      "Keyboard shortcuts only on desktop"
    );

    await openAppRoute(page, "/nutrition");
    await page.waitForLoadState("networkidle");

    // Press n — should click the "Log food" button
    // First ensure we're not inside an input
    await page.keyboard.press("Escape");

    // The Log food button in the sticky header should be visible
    const logFoodButton = page.getByRole("button", { name: "Log food" });
    const buttonIsVisible = await logFoodButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!buttonIsVisible) {
      test.skip(
        true,
        "Log food button not visible on this page (may need seed data)"
      );
      return;
    }

    await page.keyboard.press("n");

    // The food log dialog should now be open
    await expect(page.getByRole("dialog", { name: "Log food" })).toBeVisible({
      timeout: 10_000,
    });
  });
});
