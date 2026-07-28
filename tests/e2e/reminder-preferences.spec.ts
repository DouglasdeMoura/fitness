import { expect, test } from 'vitest';
import { test, expect, type Page } from "@playwright/test";

import { REMINDERS_CARD_TITLE } from "../../src/lib/push";

async function openSettings(page: Page) {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" })
  ).toBeVisible({
    timeout: 15_000,
  });
}

async function resetReminderPreferences(page: Page) {
  for (const name of [
    "Rest timer complete",
    "Meal reminders",
    "Workout reminders",
    "Weekly review",
  ]) {
    const toggle = page.getByRole("switch", { name });
    if (await toggle.isChecked()) {
      await toggle.click();
      await expect(toggle).not.toBeChecked();
    }
  }
}

test.describe.serial("Reminder preferences (issue #66)", () => {
  test("all reminder types default to off on first visit", async ({ page }) => {
    await openSettings(page);
    await resetReminderPreferences(page);

    await expect(
      page.getByRole("switch", { name: "Rest timer complete" })
    ).not.toBeChecked();
    await expect(
      page.getByRole("switch", { name: "Meal reminders" })
    ).not.toBeChecked();
    await expect(
      page.getByRole("switch", { name: "Workout reminders" })
    ).not.toBeChecked();
    await expect(
      page.getByRole("switch", { name: "Weekly review" })
    ).not.toBeChecked();
  });

  test("meal reminder toggle and schedule persist across reload", async ({
    page,
  }) => {
    await openSettings(page);
    await resetReminderPreferences(page);

    const mealSwitch = page.getByRole("switch", { name: "Meal reminders" });
    await mealSwitch.click();
    await expect(mealSwitch).toBeChecked();

    const mealTime = page.getByRole("textbox", { name: "Meal time 1" });
    await expect(mealTime).toBeVisible();
    await mealTime.fill("08:30");
    await mealTime.press("Tab");

    const quietStart = page.getByRole("textbox", { name: "Quiet hours start" });
    await quietStart.fill("22:00");
    await quietStart.press("Tab");

    const quietEnd = page.getByRole("textbox", { name: "Quiet hours end" });
    await quietEnd.fill("07:00");
    await quietEnd.press("Tab");

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { level: 2, name: REMINDERS_CARD_TITLE })
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "Meal reminders" })
    ).toBeChecked();
    await expect(
      page.getByRole("textbox", { name: "Meal time 1" })
    ).toHaveValue(/8:30\s*AM/i);
    await expect(
      page.getByRole("textbox", { name: "Quiet hours start" })
    ).toHaveValue(/10:00\s*PM/i);
    await expect(
      page.getByRole("textbox", { name: "Quiet hours end" })
    ).toHaveValue(/7:00\s*AM/i);
  });
});
