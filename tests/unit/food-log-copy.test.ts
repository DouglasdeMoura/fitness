import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FoodLogEntry } from "~/lib/db";
import {
  canCopyDayFromDate,
  canCopyMealFromDate,
  copyDayEntriesInDb,
  copyMealEntriesInDb,
  deleteFoodLogEntriesInDb,
  entriesForMeal,
  previousDay,
} from "~/lib/food-log-copy";

const USER_ID = 1;
const FROM_DATE = "2020-01-01";
const TO_DATE = "2020-01-02";

function makeEntry(
  partial: Partial<FoodLogEntry> & Pick<FoodLogEntry, "id" | "meal_type">
): FoodLogEntry {
  return {
    calories: 165,
    carbs_g: 0,
    created_at: "2020-01-01T08:00:00Z",
    custom_name: null,
    date: FROM_DATE,
    fat_g: 3.6,
    food_id: 1,
    notes: null,
    protein_g: 31,
    servings: 1,
    user_id: USER_ID,
    ...partial,
  };
}

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
  db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(USER_ID, "Test");
  db.prepare(
    `INSERT INTO foods (id, name, serving_size, serving_unit, calories_per_serving, protein_g, carbs_g, fat_g, source)
     VALUES (1, 'Chicken Breast (raw)', 100, 'g', 165, 31, 0, 3.6, 'seed')`
  ).run();
  return db;
}

function seedEntry(db: Database.Database, entry: FoodLogEntry): void {
  db.prepare(
    `INSERT INTO food_log (
      id, user_id, food_id, custom_name, date, meal_type,
      servings, calories, protein_g, carbs_g, fat_g, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id,
    entry.user_id,
    entry.food_id,
    entry.custom_name,
    entry.date,
    entry.meal_type,
    entry.servings,
    entry.calories,
    entry.protein_g,
    entry.carbs_g,
    entry.fat_g,
    entry.notes,
    entry.created_at
  );
}

describe("copy visibility predicates (issue #55)", () => {
  const breakfast = [makeEntry({ id: 1, meal_type: "breakfast" })];

  it("shows meal copy only when the target meal is empty and the source meal is not", () => {
    expect(canCopyMealFromDate([], breakfast, "breakfast")).toBeTruthy();
    expect(canCopyMealFromDate([], breakfast, "lunch")).toBeFalsy();
    expect(canCopyMealFromDate(breakfast, breakfast, "breakfast")).toBeFalsy();
  });

  it("shows day copy only when the target day is empty and the source day is not", () => {
    expect(canCopyDayFromDate([], breakfast)).toBeTruthy();
    expect(canCopyDayFromDate(breakfast, breakfast)).toBeFalsy();
    expect(canCopyDayFromDate([], [])).toBeFalsy();
  });

  it("resolves the previous calendar day", () => {
    expect(previousDay("2020-01-02")).toBe("2020-01-01");
  });
});

describe("food log copy transactions (issue #55)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedEntry(db, makeEntry({ id: 1, meal_type: "breakfast" }));
    seedEntry(
      db,
      makeEntry({ calories: 78, id: 2, meal_type: "breakfast", protein_g: 6.3 })
    );
    seedEntry(
      db,
      makeEntry({ calories: 130, id: 3, meal_type: "lunch", protein_g: 2.7 })
    );
  });

  afterEach(() => {
    db.close();
  });

  it("copies every entry in a meal inside one transaction", () => {
    const result = copyMealEntriesInDb(
      db,
      USER_ID,
      FROM_DATE,
      TO_DATE,
      "breakfast"
    );
    expect(result.entries).toHaveLength(2);
    const copied = entriesForMeal(
      db
        .prepare("SELECT * FROM food_log WHERE date = ?")
        .all(TO_DATE) as FoodLogEntry[],
      "breakfast"
    );
    expect(copied).toHaveLength(2);
    expect(copied.every((entry) => entry.date === TO_DATE)).toBeTruthy();
  });

  it("writes nothing when a meal copy would be a no-op", () => {
    seedEntry(db, makeEntry({ date: TO_DATE, id: 4, meal_type: "breakfast" }));
    expect(() =>
      copyMealEntriesInDb(db, USER_ID, FROM_DATE, TO_DATE, "breakfast")
    ).toThrow();
    const targetBreakfast = entriesForMeal(
      db
        .prepare("SELECT * FROM food_log WHERE date = ?")
        .all(TO_DATE) as FoodLogEntry[],
      "breakfast"
    );
    expect(targetBreakfast).toHaveLength(1);
  });

  it("copies a full day and undo deletes exactly the created rows", () => {
    const result = copyDayEntriesInDb(db, USER_ID, FROM_DATE, TO_DATE);
    expect(result.entries).toHaveLength(3);
    const createdIds = result.entries.map((entry) => entry.id);

    const undo = deleteFoodLogEntriesInDb(db, USER_ID, createdIds);
    expect(undo.deleted_ids).toStrictEqual(createdIds);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM food_log WHERE date = ?")
          .get(TO_DATE) as {
          count: number;
        }
      ).count
    ).toBe(0);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM food_log WHERE date = ?")
          .get(FROM_DATE) as {
          count: number;
        }
      ).count
    ).toBe(3);
  });

  it("rolls back a day copy when the target day already has entries", () => {
    seedEntry(
      db,
      makeEntry({
        calories: 50,
        date: TO_DATE,
        id: 9,
        meal_type: "snack",
        protein_g: 1,
      })
    );
    expect(() => copyDayEntriesInDb(db, USER_ID, FROM_DATE, TO_DATE)).toThrow();
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM food_log WHERE date = ?")
          .get(TO_DATE) as {
          count: number;
        }
      ).count
    ).toBe(1);
  });
});
