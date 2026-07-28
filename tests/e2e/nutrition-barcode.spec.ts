import { expect, test } from 'vitest';
import { join } from "node:path";

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import Database from "better-sqlite3";

import { FIXED_E2E_DATE, installDeterministicClock } from "./test-helpers";

const TARGET_DATE = FIXED_E2E_DATE;
const KNOWN_BARCODE = "012345678905";
const KNOWN_FOOD_NAME = "E2E Barcode Yogurt";
const UNKNOWN_BARCODE = "4006381333931";

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

function ensureBarcodeColumn(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(foods)").all() as {
    name: string;
  }[];
  if (!columns.some((column) => column.name === "barcode")) {
    db.exec("ALTER TABLE foods ADD COLUMN barcode TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode)");
  }
}

function seedBarcodeFood(): void {
  const dbPath = join(process.cwd(), "data", "fittrack.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  ensureBarcodeColumn(db);

  const user = db.prepare("SELECT id FROM users LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (!user) {
    db.close();
    throw new Error("Expected seeded user for barcode e2e test");
  }

  db.prepare("DELETE FROM food_log WHERE user_id = ? AND date = ?").run(
    user.id,
    TARGET_DATE
  );
  db.prepare("DELETE FROM foods WHERE barcode IN (?, ?)").run(
    KNOWN_BARCODE,
    UNKNOWN_BARCODE
  );

  const insert = db.prepare(
    `INSERT INTO foods (name, brand, serving_size, serving_unit, calories_per_serving, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, barcode, source)
     VALUES (?, NULL, 170, 'g', 130, 18, 9, 0, 0, 0, 0, ?, 'user')`
  );
  const result = insert.run(KNOWN_FOOD_NAME, KNOWN_BARCODE);
  const foodId = Number(result.lastInsertRowid);

  db.prepare(
    `INSERT INTO food_log (user_id, food_id, date, meal_type, servings, calories, protein_g, carbs_g, fat_g)
     VALUES (?, ?, ?, 'breakfast', 1.5, 195, 27, 13.5, 0)`
  ).run(user.id, foodId, TARGET_DATE);

  db.close();
}

async function openNutritionOn(page: Page, date: string) {
  await installDeterministicClock(page);
  await page.goto(`/nutrition?date=${date}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Nutrition" })
  ).toBeVisible();
}

async function installManualBarcodeFallback(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "BarcodeDetector");
  });
}

async function installCameraTracking(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls =
      0;
    const media = navigator.mediaDevices;
    const original = media.getUserMedia.bind(media);
    media.getUserMedia = async (
      ...args: Parameters<typeof media.getUserMedia>
    ) => {
      (
        window as unknown as { __getUserMediaCalls: number }
      ).__getUserMediaCalls += 1;
      return original(...args);
    };
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector =
      class {
        async detect() {
          return [];
        }
      };
  });
}

test.describe("Barcode scanning (issue #58)", () => {
  test.beforeEach(() => {
    seedBarcodeFood();
  });

  test("manual fallback logs a known barcode in three taps", async ({
    page,
  }) => {
    await installManualBarcodeFallback(page);
    await openNutritionOn(page, TARGET_DATE);

    await clickHydratedButton(
      page.getByRole("button", { name: "Scan barcode" })
    );
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: "Barcode" })
    ).toBeVisible();

    await dialog.getByRole("textbox", { name: "Barcode" }).fill(KNOWN_BARCODE);
    await clickHydratedButton(
      dialog.getByRole("button", { name: "Look up barcode" })
    );
    await clickHydratedButton(dialog.getByRole("button", { name: "Log food" }));

    await expect(page.getByText("Food logged", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: KNOWN_FOOD_NAME }).first()
    ).toBeVisible();
  });

  test("unknown barcode offers creation prefilled with the code", async ({
    page,
  }) => {
    await installManualBarcodeFallback(page);
    await openNutritionOn(page, TARGET_DATE);

    await clickHydratedButton(
      page.getByRole("button", { name: "Scan barcode" })
    );
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Barcode" })
      .fill(UNKNOWN_BARCODE);
    await clickHydratedButton(
      dialog.getByRole("button", { name: "Look up barcode" })
    );
    await clickHydratedButton(
      dialog.getByRole("button", { name: "Add this food" })
    );

    await expect(
      page.getByRole("heading", { level: 3, name: "New Custom Food" })
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Barcode" })).toHaveValue(
      UNKNOWN_BARCODE
    );
  });

  test("requests camera permission only after Scan is tapped", async ({
    page,
  }) => {
    await installCameraTracking(page);
    await openNutritionOn(page, TARGET_DATE);

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __getUserMediaCalls?: number })
              .__getUserMediaCalls ?? 0
        )
      )
      .toBe(0);

    await clickHydratedButton(
      page.getByRole("button", { name: "Scan barcode" })
    );

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __getUserMediaCalls?: number })
              .__getUserMediaCalls ?? 0
        )
      )
      .toBe(1);
  });
});
