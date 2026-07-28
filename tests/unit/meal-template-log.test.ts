import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  logMealTemplateInDb,
  sortTemplatesForMealSection,
} from "~/lib/meal-template-log";
import type { MealType } from "~/lib/nutrition";

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
  fiber_g REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'seed'
);
CREATE TABLE meal_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  default_meal_type TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE meal_template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  servings REAL NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL
);
CREATE TABLE food_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  food_id INTEGER REFERENCES foods(id),
  custom_name TEXT,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
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
  db.exec(TEST_SCHEMA);
  db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(USER_ID, "Test");
  db.prepare(
    `INSERT INTO foods (id, name, serving_size, serving_unit, calories_per_serving, protein_g, carbs_g, fat_g)
     VALUES (1, 'Chicken', 100, 'g', 165, 31, 0, 3.6)`
  ).run();
  return db;
}

describe("sortTemplatesForMealSection (issue #56)", () => {
  it("lists matching default meal type before others", () => {
    const templates = [
      {
        default_meal_type: "lunch" as MealType,
        id: 1,
        item_count: 2,
        name: "Lunch",
      },
      {
        default_meal_type: "breakfast" as MealType,
        id: 2,
        item_count: 1,
        name: "Breakfast",
      },
      {
        default_meal_type: "dinner" as MealType,
        id: 3,
        item_count: 1,
        name: "Dinner",
      },
    ];
    const sorted = sortTemplatesForMealSection(templates, "breakfast");
    expect(sorted.map((t) => t.id)).toStrictEqual([2, 1, 3]);
  });

  it("skips templates with zero items", () => {
    const templates = [
      {
        default_meal_type: "breakfast" as MealType,
        id: 1,
        item_count: 0,
        name: "Empty",
      },
      {
        default_meal_type: "breakfast" as MealType,
        id: 2,
        item_count: 1,
        name: "Ready",
      },
    ];
    expect(
      sortTemplatesForMealSection(templates, "breakfast").map((t) => t.id)
    ).toStrictEqual([2]);
  });
});

describe("logMealTemplateInDb (issue #56)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    db.prepare(
      `INSERT INTO meal_templates (id, user_id, name, default_meal_type)
       VALUES (10, ?, 'Morning', 'breakfast')`
    ).run(USER_ID);
    db.prepare(
      `INSERT INTO meal_template_items (template_id, food_id, servings, sort_order)
       VALUES (10, 1, 1, 1)`
    ).run();
  });

  afterEach(() => {
    db.close();
  });

  it("expands template items into food_log rows in one transaction", () => {
    const result = logMealTemplateInDb(db, USER_ID, 10, DATE, "breakfast");
    expect(result.template_name).toBe("Morning");
    expect(result.total_calories).toBe(165);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].meal_type).toBe("breakfast");
    expect(result.entries[0].calories).toBe(165);

    const rows = db
      .prepare(
        "SELECT COUNT(*) as count FROM food_log WHERE user_id = ? AND date = ?"
      )
      .get(USER_ID, DATE) as { count: number };
    expect(rows.count).toBe(1);
  });

  it("logs to the requested meal type even when default differs", () => {
    const result = logMealTemplateInDb(db, USER_ID, 10, DATE, "lunch");
    expect(result.entries[0].meal_type).toBe("lunch");
  });

  it("throws when the template has no items", () => {
    db.prepare("DELETE FROM meal_template_items WHERE template_id = 10").run();
    expect(() =>
      logMealTemplateInDb(db, USER_ID, 10, DATE, "breakfast")
    ).toThrow(/has no items to log/);
  });
});
