import { join } from "node:path";
import { expect, test } from "@playwright/test";

import Database from "better-sqlite3";

import { FIXED_E2E_DATE, installDeterministicClock } from "./test-helpers";

const SOURCE_DATE = "2019-12-31";
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

function seedYesterdayFoodLog(): void {
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
    throw new Error(
      "Expected seeded user and Chicken Breast food for nutrition copy e2e"
    );
  }

  db.prepare("DELETE FROM food_log WHERE user_id = ? AND date IN (?, ?)").run(
    user.id,
    SOURCE_DATE,
    TARGET_DATE
  );

  const insert = db.prepare(
    `INSERT INTO food_log (
      user_id, food_id, date, meal_type, servings, calories, protein_g, carbs_g, fat_g
    ) VALUES (?, ?, ?, 'breakfast', 1, 165, 31, 0, 3.6)`
  );
  insert.run(user.id, food.id, SOURCE_DATE);
  insert.run(user.id, food.id, SOURCE_DATE);
  db.prepare(
    `INSERT INTO food_log (
      user_id, food_id, date, meal_type, servings, calories, protein_g, carbs_g, fat_g
    ) VALUES (?, ?, ?, 'lunch', 1, 130, 2.7, 28, 0.3)`
  ).run(user.id, food.id, SOURCE_DATE);

  db.close();
}

async function openNutritionOn(page: Page, date: string) {
  await page.goto(`/nutrition?date=${date}`);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("navigation", { name: "FitTrack navigation" })
  ).toBeVisible({
    timeout: 15_000,
  });
}

function breakfastFoodRows(page: Page) {
  return page
    .getByRole("table", { name: "Breakfast food log" })
    .getByRole("row")
    .filter({ hasText: "Chicken Breast" });
}

test.describe("Copy yesterday (issue #55)", () => {
  test.beforeEach(() => {
    seedYesterdayFoodLog();
  });

  test("logs a full repeated day in one tap", async ({ page }) => {
    await installDeterministicClock(page);
    await openNutritionOn(page, TARGET_DATE);

    let taps = 0;
    const copyDay = page.getByRole("button", {
      exact: true,
      name: "Copy yesterday",
    });
    await expect(copyDay).toBeVisible();
    await clickHydratedButton(copyDay);
    taps += 1;

    await expect(
      page.getByRole("heading", { level: 3, name: "Breakfast" })
    ).toBeVisible();
    await expect(breakfastFoodRows(page)).toHaveCount(2);
    await expect(
      page.getByRole("heading", { level: 3, name: "Lunch" })
    ).toBeVisible();
    expect(taps).toBeLessThanOrEqual(2);
  });

  test("copy toast undo removes every copied entry", async ({ page }) => {
    await installDeterministicClock(page);
    await openNutritionOn(page, TARGET_DATE);

    await clickHydratedButton(
      page.getByRole("button", { exact: true, name: "Copy yesterday" })
    );
    const toast = page
      .getByRole("region", { name: "Notifications" })
      .getByRole("status")
      .filter({
        hasText: "Copied 3 entries",
      });
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(breakfastFoodRows(page)).toHaveCount(2);

    await clickHydratedButton(toast.getByRole("button", { name: "Undo" }));
    await expect(
      page.getByRole("button", { exact: true, name: "Copy yesterday" })
    ).toBeVisible();
    await expect(breakfastFoodRows(page)).toHaveCount(0);
  });

  test("meal copy action is hidden when it would be a no-op", async ({
    page,
  }) => {
    await installDeterministicClock(page);
    await openNutritionOn(page, TARGET_DATE);

    await expect(
      page.getByRole("button", {
        exact: true,
        name: "Copy breakfast from yesterday",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        exact: true,
        name: "Copy lunch from yesterday",
      })
    ).toBeVisible();

    await clickHydratedButton(
      page.getByRole("button", {
        exact: true,
        name: "Copy breakfast from yesterday",
      })
    );
    await expect(
      page.getByRole("button", {
        exact: true,
        name: "Copy breakfast from yesterday",
      })
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", {
        exact: true,
        name: "Copy lunch from yesterday",
      })
    ).toBeVisible();
  });
});
