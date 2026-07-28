import { join } from "node:path";
import { expect, test } from "@playwright/test";

import Database from "better-sqlite3";

import { FIXED_E2E_DATE, installDeterministicClock } from "./test-helpers";

const TARGET_DATE = FIXED_E2E_DATE;

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
    throw new Error("Expected seeded user for e2e test");
  }

  db.prepare("DELETE FROM food_log WHERE user_id = ? AND date = ?").run(
    user.id,
    TARGET_DATE
  );
  db.close();
}

function seedBreakfastEntries(): void {
  const dbPath = join(process.cwd(), "data", "fittrack.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const user = db.prepare("SELECT id FROM users LIMIT 1").get() as
    | { id: number }
    | undefined;
  const food = db
    .prepare("SELECT id FROM foods WHERE name = 'Chicken Breast (raw)' LIMIT 1")
    .get() as { id: number } | undefined;
  if (!(user && food)) {
    db.close();
    throw new Error("Expected seeded user/food for e2e test");
  }

  db.prepare(
    `INSERT INTO food_log (
      user_id, food_id, date, meal_type, servings, calories, protein_g, carbs_g, fat_g
    ) VALUES (?, ?, ?, 'breakfast', 2, 330, 62, 0, 7.2)`
  ).run(user.id, food.id, TARGET_DATE);

  db.close();
}

async function openNutritionOn(page: Page, date: string) {
  await installDeterministicClock(page);
  await page.goto(`/nutrition?date=${date}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Nutrition" })
  ).toBeVisible();
}

function breakfastCollapsible(page: Page) {
  return page.getByRole("button", { name: /Breakfast/ });
}

function lunchCollapsible(page: Page) {
  return page.getByRole("button", { name: /Lunch/ });
}

test.describe("Meal-based nutrition layout (issue #31)", () => {
  test.beforeEach(() => {
    clearTargetDayFoodLog();
  });

  test("renders collapsible meal sections: Breakfast, Lunch, Dinner, Snack", async ({
    page,
  }) => {
    await openNutritionOn(page, TARGET_DATE);

    await expect(breakfastCollapsible(page)).toBeVisible();
    await expect(lunchCollapsible(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /Dinner/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Snack/ })).toBeVisible();
  });

  test("each meal section shows its calorie subtotal when entries exist", async ({
    page,
  }) => {
    seedBreakfastEntries();
    await openNutritionOn(page, TARGET_DATE);

    const breakfastTrigger = breakfastCollapsible(page);
    await expect(breakfastTrigger).toBeVisible();
    // With 2 servings of Chicken Breast at 165 kcal each → 330 kcal
    await expect(breakfastTrigger).toContainText("330 kcal");
  });

  test("empty meal sections show 0 kcal in trigger", async ({ page }) => {
    await openNutritionOn(page, TARGET_DATE);

    const lunchTrigger = lunchCollapsible(page);
    await expect(lunchTrigger).toContainText("0 kcal");
  });

  test("collapsible sections expand to show entry table and macros", async ({
    page,
  }) => {
    seedBreakfastEntries();
    await openNutritionOn(page, TARGET_DATE);

    const breakfastTrigger = breakfastCollapsible(page);
    await clickHydratedButton(breakfastTrigger);

    // After expanding, the macro MetadataList should be visible
    await expect(page.getByText("330 kcal")).toBeVisible();
    // The table should show the food entry
    await expect(
      page.getByRole("cell", { name: "Chicken Breast (raw)" })
    ).toBeVisible();
  });

  test("sticky daily summary header shows totals and log food button", async ({
    page,
  }) => {
    await openNutritionOn(page, TARGET_DATE);

    const dailySummary = page.getByRole("heading", {
      level: 2,
      name: "Daily Summary",
    });
    await expect(dailySummary).toBeVisible();

    // Log food button should be present
    const logFoodButton = page.getByRole("button", { name: "Log food" });
    await expect(logFoodButton).toBeVisible();
  });

  test("log food button opens a dialog for searching and logging food", async ({
    page,
  }) => {
    await openNutritionOn(page, TARGET_DATE);

    const logFoodButton = page.getByRole("button", { name: "Log food" });
    await clickHydratedButton(logFoodButton);

    // A dialog should appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Log food")).toBeVisible();
  });

  test("quick add button per meal section is reachable", async ({ page }) => {
    await openNutritionOn(page, TARGET_DATE);

    // Expand the breakfast section first
    const breakfastTrigger = breakfastCollapsible(page);
    await clickHydratedButton(breakfastTrigger);

    // Quick add button should be visible inside the expanded section
    const quickAddButton = page
      .getByRole("button", { name: "Quick add" })
      .first();
    await expect(quickAddButton).toBeVisible();
  });
});
