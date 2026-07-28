import { join } from "node:path";

import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";

import {
  FIXED_E2E_DATE,
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
} from "./test-helpers";

const REVIEW_WEEK_START = "2019-12-23";
const REVIEW_WEEK_ACTIVITY_DATE = "2019-12-25";

function seedReviewWeekActivity(): void {
  const dbPath = join(process.cwd(), "data", "fittrack.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const user = db.prepare("SELECT id FROM users LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (!user) {
    db.close();
    throw new Error("Expected seeded user for weekly review e2e test");
  }

  db.prepare("DELETE FROM food_log WHERE user_id = ? AND date = ?").run(
    user.id,
    REVIEW_WEEK_ACTIVITY_DATE
  );

  db.prepare(
    `INSERT INTO food_log (
      user_id, food_id, custom_name, date, meal_type, servings,
      calories, protein_g, carbs_g, fat_g, created_at
    ) VALUES (?, NULL, ?, ?, 'lunch', 1, 500, 20, 40, 15, ?)`
  ).run(
    user.id,
    "E2E review seed",
    REVIEW_WEEK_ACTIVITY_DATE,
    `${REVIEW_WEEK_ACTIVITY_DATE}T12:00:00.000Z`
  );

  db.close();
}

function clearReviewWeekActivity(): void {
  const dbPath = join(process.cwd(), "data", "fittrack.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  const user = db.prepare("SELECT id FROM users LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (user) {
    db.prepare("DELETE FROM food_log WHERE user_id = ? AND date = ?").run(
      user.id,
      REVIEW_WEEK_ACTIVITY_DATE
    );
  }
  db.close();
}

test.describe("Weekly review (issue #64)", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicClock(page);
    await prepareTheme(page, "light");
  });

  test("dashboard entry appears only when a complete review week has activity", async ({
    page,
  }) => {
    clearReviewWeekActivity();
    await openAppRoute(page, `/?date=${FIXED_E2E_DATE}`);
    await expect(page.getByRole("link", { name: "Weekly Review" })).toHaveCount(
      0
    );

    seedReviewWeekActivity();
    await openAppRoute(page, `/?date=${FIXED_E2E_DATE}`);
    await expect(
      page.getByRole("link", { name: "Weekly Review" })
    ).toBeVisible();
  });

  test("review page renders adherence, volume delta, weight trend, and PRs", async ({
    page,
  }) => {
    seedReviewWeekActivity();
    await openAppRoute(page, `/review?date=${FIXED_E2E_DATE}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Weekly Review" })
    ).toBeVisible();
    await expect(page.getByText(REVIEW_WEEK_START)).toBeVisible();
    await expect(page.getByText("Food log adherence")).toBeVisible();
    await expect(page.getByText("Vs prior week")).toBeVisible();
    await expect(page.getByText("7-day average change")).toBeVisible();
    await expect(page.getByText("PRs this week")).toBeVisible();
    await expect(page.getByLabel("Weekly review")).toBeVisible();
  });

  test.afterAll(() => {
    clearReviewWeekActivity();
  });
});
