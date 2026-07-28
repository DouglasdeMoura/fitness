import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FOOD_LOG_SUMMARY_SQL, fetchFoodLogSummaryEntries } from "~/lib/api";
import {
  buildQuickAddDraft,
  QUICK_ADD_DEFAULT_NAME,
  sumFoodLogEntryTotals,
} from "~/lib/nutrition";

const USER_ID = 1;
const DATE = "2020-01-01";

const TEST_SCHEMA = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE foods (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  serving_size REAL NOT NULL,
  serving_unit TEXT NOT NULL,
  calories_per_serving REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'seed'
);
CREATE TABLE food_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  food_id INTEGER REFERENCES foods(id),
  custom_name TEXT,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  servings REAL NOT NULL,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(TEST_SCHEMA);
  db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(
    USER_ID,
    "Test User"
  );
  db.prepare(
    `INSERT INTO foods (id, name, serving_size, serving_unit, calories_per_serving, protein_g, carbs_g, fat_g)
     VALUES (1, 'Catalog Chicken', 100, 'g', 165, 31, 0, 3.6)`
  ).run();
  return db;
}

describe("buildQuickAddDraft (issue #57)", () => {
  it("requires calories and defaults optional macros to zero", () => {
    expect(buildQuickAddDraft({ calories: 500 }, DATE, "lunch")).toStrictEqual({
      calories: 500,
      carbs_g: 0,
      custom_name: QUICK_ADD_DEFAULT_NAME,
      date: DATE,
      fat_g: 0,
      meal_type: "lunch",
      protein_g: 0,
      servings: 1,
    });
  });

  it("uses trimmed custom_name when provided", () => {
    expect(
      buildQuickAddDraft(
        { calories: 320, name: "  Office lunch  ", protein_g: 20 },
        DATE,
        "breakfast"
      ).custom_name
    ).toBe("Office lunch");
  });

  it("rejects non-positive calories", () => {
    expect(() => buildQuickAddDraft({ calories: 0 }, DATE, "snack")).toThrow(
      RangeError
    );
  });
});

describe("nutrition summary read path (issue #57)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    db.prepare(
      `INSERT INTO food_log (
        user_id, food_id, custom_name, date, meal_type, servings,
        calories, protein_g, carbs_g, fat_g
      ) VALUES (?, 1, 'Catalog Chicken', ?, 'breakfast', 1, 165, 31, 0, 3.6)`
    ).run(USER_ID, DATE);
    db.prepare(
      `INSERT INTO food_log (
        user_id, food_id, custom_name, date, meal_type, servings,
        calories, protein_g, carbs_g, fat_g
      ) VALUES (?, NULL, 'Mystery burrito', ?, 'lunch', 1, 450, 18, 40, 20)`
    ).run(USER_ID, DATE);
  });

  afterEach(() => {
    db.close();
  });

  it("LEFT JOIN query keeps null food_id rows in the result set", () => {
    const entries = fetchFoodLogSummaryEntries(db, USER_ID, DATE);
    expect(entries).toHaveLength(2);
    expect(entries.some((entry) => entry.food_id === null)).toBeTruthy();
    expect(FOOD_LOG_SUMMARY_SQL).toContain("LEFT JOIN foods");
  });

  it("includes null food_id rows in daily calorie and macro totals", () => {
    const entries = fetchFoodLogSummaryEntries(db, USER_ID, DATE);
    expect(sumFoodLogEntryTotals(entries)).toStrictEqual({
      calories: 615,
      carbs_g: 40,
      fat_g: 23.6,
      fiber_g: 0,
      protein_g: 49,
    });
  });
});
