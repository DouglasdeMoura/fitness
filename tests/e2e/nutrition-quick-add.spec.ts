import { join } from "node:path";

import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";

import { FIXED_E2E_DATE, installDeterministicClock } from "./test-helpers";

const TARGET_DATE = FIXED_E2E_DATE;
const QUICK_ADD_NAME = "E2E Mystery Meal";
const QUICK_ADD_CALORIES = 420;

async function clickHydratedButton(button: Locator) {
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await expect
    .poll(() =>
      button.evaluate((element) =>
        Object.getOwnPropertyNames(element).some((property) =>
          property.startsWith("__reactProps$")
        )
      )
    )
    .toBe(true);
  await button.click();
}

function clearTargetDayFoodLog(): void {
  const dbPath = join(process.cwd(), "data", "fittrack.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const user = db.prepare("SELECT id FROM users LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (!user) {
    db.close();
    throw new Error("Expected seeded user for quick-add e2e test");
  }

  db.prepare("DELETE FROM food_log WHERE user_id = ? AND date = ?").run(
    user.id,
    TARGET_DATE
  );
  db.close();
}

async function openNutritionOn(page: Page, date: string) {
  await installDeterministicClock(page);
  await page.goto(`/nutrition?date=${date}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Nutrition" })
  ).toBeVisible();
}

function breakfastSection(page: Page) {
  return page
    .getByRole("heading", { level: 3, name: "Breakfast" })
    .locator("xpath=ancestor::*[2]");
}

test.describe("Quick add calories (issue #57)", () => {
  test.beforeEach(() => {
    clearTargetDayFoodLog();
  });

  test("quick add is reachable in one tap from the nutrition page", async ({
    page,
  }) => {
    await openNutritionOn(page, TARGET_DATE);
    const quickAddButton = breakfastSection(page).getByRole("button", {
      name: "Quick add",
    });
    await clickHydratedButton(quickAddButton);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Quick add — Breakfast")).toBeVisible();
  });

  test("logs approximate calories with badge and updates daily summary", async ({
    page,
  }) => {
    await openNutritionOn(page, TARGET_DATE);

    await clickHydratedButton(
      breakfastSection(page).getByRole("button", { name: "Quick add" })
    );
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(QUICK_ADD_NAME);
    await dialog
      .getByRole("spinbutton", { name: "Calories Required" })
      .fill(String(QUICK_ADD_CALORIES));
    await dialog
      .getByRole("spinbutton", { name: "Protein (g) Optional" })
      .fill("25");
    await clickHydratedButton(
      dialog.getByRole("button", { name: "Log quick add" })
    );

    await expect(page.getByText("Food logged", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: `${QUICK_ADD_NAME} Approximate` })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: String(QUICK_ADD_CALORIES) })
    ).toBeVisible();
    await expect(
      page
        .getByRole("heading", { level: 2, name: "Daily Summary" })
        .locator("xpath=ancestor::*[1]")
    ).toContainText(String(QUICK_ADD_CALORIES));
    await expect(
      page.getByRole("cell", { name: /25 \/ 0 \/ 0 g/ })
    ).toBeVisible();
  });
});
