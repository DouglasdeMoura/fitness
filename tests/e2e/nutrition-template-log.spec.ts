import { expect, test } from 'vitest';
import { join } from "node:path";

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import Database from "better-sqlite3";

import { FIXED_E2E_DATE, installDeterministicClock } from "./test-helpers";

const TARGET_DATE = FIXED_E2E_DATE;
const BREAKFAST_TEMPLATE = "E2E Breakfast Bowl";
const LUNCH_TEMPLATE = "E2E Lunch Bowl";

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

function seedMealTemplates(): void {
  const dbPath = join(process.cwd(), "data", "fittrack.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const user = db.prepare("SELECT id FROM users LIMIT 1").get() as
    | { id: number }
    | undefined;
  const food = db
    .prepare("SELECT id FROM foods WHERE name = 'Chicken Breast (raw)' LIMIT 1")
    .get() as { id: number } | undefined;
  if (!user || !food) {
    db.close();
    throw new Error(
      "Seed user or Chicken Breast food missing from fittrack.db"
    );
  }

  db.prepare("DELETE FROM food_log WHERE user_id = ? AND date = ?").run(
    user.id,
    TARGET_DATE
  );
  db.prepare(
    "DELETE FROM meal_template_items WHERE template_id IN (SELECT id FROM meal_templates WHERE name IN (?, ?))"
  ).run(BREAKFAST_TEMPLATE, LUNCH_TEMPLATE);
  db.prepare(
    "DELETE FROM meal_templates WHERE user_id = ? AND name IN (?, ?)"
  ).run(user.id, BREAKFAST_TEMPLATE, LUNCH_TEMPLATE);

  const insertTemplate = db.prepare(
    `INSERT INTO meal_templates (user_id, name, default_meal_type)
     VALUES (?, ?, ?)`
  );
  const breakfastId = insertTemplate.run(
    user.id,
    BREAKFAST_TEMPLATE,
    "breakfast"
  ).lastInsertRowid;
  const lunchId = insertTemplate.run(
    user.id,
    LUNCH_TEMPLATE,
    "lunch"
  ).lastInsertRowid;

  const insertItem = db.prepare(
    `INSERT INTO meal_template_items (template_id, food_id, servings, sort_order)
     VALUES (?, ?, 1, 1)`
  );
  insertItem.run(breakfastId, food.id);
  insertItem.run(lunchId, food.id);

  db.close();
}

function mealSection(page: Page, mealLabel: string) {
  return page
    .getByRole("heading", { level: 3, name: mealLabel })
    .locator("xpath=ancestor::*[2]");
}

function mealTemplateButton(
  page: Page,
  mealLabel: string,
  templateName: string
) {
  return mealSection(page, mealLabel)
    .getByRole("button", {
      name: new RegExp(templateName),
    })
    .first();
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

test.describe("Log saved meal template (issue #56)", () => {
  test.beforeEach(() => {
    seedMealTemplates();
  });

  test("logs a template from the nutrition page in one tap", async ({
    page,
  }) => {
    await installDeterministicClock(page);
    await openNutritionOn(page, TARGET_DATE);

    const breakfastSection = page.getByRole("heading", {
      level: 3,
      name: "Breakfast",
    });
    await expect(breakfastSection).toBeVisible();

    const templateItem = mealTemplateButton(
      page,
      "Breakfast",
      BREAKFAST_TEMPLATE
    );
    await expect(templateItem).toBeVisible();
    await clickHydratedButton(templateItem);

    const toast = page
      .getByRole("region", { name: "Notifications" })
      .getByRole("status")
      .filter({
        hasText: "Logged 165 kcal",
      });
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(breakfastFoodRows(page)).toHaveCount(1);
  });

  test("lists matching meal templates before others in each section", async ({
    page,
  }) => {
    await installDeterministicClock(page);
    await openNutritionOn(page, TARGET_DATE);

    const breakfastSection = mealSection(page, "Breakfast");
    const lunchSection = mealSection(page, "Lunch");
    await expect(
      breakfastSection.getByRole("button", {
        name: new RegExp(BREAKFAST_TEMPLATE),
      })
    ).toBeVisible();
    await expect(
      breakfastSection.getByRole("button", { name: new RegExp(LUNCH_TEMPLATE) })
    ).toBeVisible();
    await expect(
      breakfastSection.getByRole("button", { name: /E2E .* Bowl/ }).first()
    ).toContainText(BREAKFAST_TEMPLATE);
    await expect(
      lunchSection.getByRole("button", { name: /E2E .* Bowl/ }).first()
    ).toContainText(LUNCH_TEMPLATE);
  });

  test("template log toast undo removes exactly those entries", async ({
    page,
  }) => {
    await installDeterministicClock(page);
    await openNutritionOn(page, TARGET_DATE);

    await clickHydratedButton(
      mealTemplateButton(page, "Breakfast", BREAKFAST_TEMPLATE)
    );
    const toast = page
      .getByRole("region", { name: "Notifications" })
      .getByRole("status")
      .filter({
        hasText: "Logged 165 kcal",
      });
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(breakfastFoodRows(page)).toHaveCount(1);

    await clickHydratedButton(toast.getByRole("button", { name: "Undo" }));
    await expect(breakfastFoodRows(page)).toHaveCount(0);
  });

  test("logs a template from the template list without opening the editor", async ({
    page,
  }) => {
    await installDeterministicClock(page);
    await page.goto("/nutrition/templates");
    await page.waitForLoadState("networkidle");

    await clickHydratedButton(
      page.getByRole("button", {
        exact: true,
        name: `Log ${BREAKFAST_TEMPLATE}`,
      })
    );

    await openNutritionOn(page, TARGET_DATE);
    await expect(breakfastFoodRows(page)).toHaveCount(1);
  });
});
