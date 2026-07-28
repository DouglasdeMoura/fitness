import { eq } from "drizzle-orm";
import { vi, afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FoodLogEntry } from "~/db/types";
import {
  canCopyDayFromDate,
  canCopyMealFromDate,
  copyDayEntriesInDb,
  copyMealEntriesInDb,
  deleteFoodLogEntriesInDb,
  entriesForMeal,
  previousDay,
} from "~/lib/food-log-copy";

import { foodLog } from "../../src/db/schema";
import { createDrizzleTestDb } from "./drizzle-test-db";
import type { DrizzleTestDb } from "./drizzle-test-db";

const FROM_DATE = "2020-01-01";
const TO_DATE = "2020-01-02";

function makeEntry(
  partial: Partial<FoodLogEntry> & Pick<FoodLogEntry, "id" | "meal_type">
): FoodLogEntry {
  return {
    calories: 165,
    carbs_g: 0,
    created_at: "2020-01-01T00:00:00.000Z",
    custom_name: null,
    date: FROM_DATE,
    fat_g: 3.6,
    food_id: 1,
    notes: null,
    protein_g: 31,
    servings: 1,
    user_id: 1,
    ...partial,
  };
}

function seedEntry(fixture: DrizzleTestDb, entry: FoodLogEntry): void {
  fixture.db
    .insert(foodLog)
    .values({
      calories: entry.calories,
      carbsG: entry.carbs_g,
      createdAt: entry.created_at,
      customName: entry.custom_name,
      date: entry.date,
      fatG: entry.fat_g,
      foodId: entry.food_id,
      id: entry.id,
      mealType: entry.meal_type,
      notes: entry.notes,
      proteinG: entry.protein_g,
      servings: entry.servings,
      userId: fixture.userId,
    })
    .run();
}

function entriesOnDate(fixture: DrizzleTestDb, date: string): FoodLogEntry[] {
  return fixture.db
    .select()
    .from(foodLog)
    .where(eq(foodLog.date, date))
    .all()
    .map((row) => ({
      calories: row.calories,
      carbs_g: row.carbsG,
      created_at: row.createdAt,
      custom_name: row.customName,
      date: row.date,
      fat_g: row.fatG,
      food_id: row.foodId,
      id: row.id,
      meal_type: row.mealType,
      notes: row.notes,
      protein_g: row.proteinG,
      servings: row.servings,
      user_id: row.userId,
    }));
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
  let fixture: DrizzleTestDb;

  beforeEach(() => {
    fixture = createDrizzleTestDb();
    seedEntry(fixture, makeEntry({ id: 1, meal_type: "breakfast" }));
    seedEntry(
      fixture,
      makeEntry({ calories: 78, id: 2, meal_type: "breakfast", protein_g: 6.3 })
    );
    seedEntry(
      fixture,
      makeEntry({ calories: 130, id: 3, meal_type: "lunch", protein_g: 2.7 })
    );
  });

  afterEach(() => {
    fixture.close();
  });

  it("copies every entry in a meal inside one transaction", () => {
    const result = copyMealEntriesInDb(
      fixture.db,
      fixture.userId,
      FROM_DATE,
      TO_DATE,
      "breakfast",
      canCopyMealFromDate,
      entriesForMeal
    );
    expect(result.entries).toHaveLength(2);
    const copied = entriesForMeal(entriesOnDate(fixture, TO_DATE), "breakfast");
    expect(copied).toHaveLength(2);
    expect(copied.every((entry) => entry.date === TO_DATE)).toBeTruthy();
  });

  it("writes nothing when a meal copy would be a no-op", () => {
    seedEntry(
      fixture,
      makeEntry({ date: TO_DATE, id: 4, meal_type: "breakfast" })
    );
    expect(() =>
      copyMealEntriesInDb(
        fixture.db,
        fixture.userId,
        FROM_DATE,
        TO_DATE,
        "breakfast",
        canCopyMealFromDate,
        entriesForMeal
      )
    ).toThrow();
    const targetBreakfast = entriesForMeal(
      entriesOnDate(fixture, TO_DATE),
      "breakfast"
    );
    expect(targetBreakfast).toHaveLength(1);
  });

  it("copies a full day and undo deletes exactly the created rows", () => {
    const result = copyDayEntriesInDb(
      fixture.db,
      fixture.userId,
      FROM_DATE,
      TO_DATE,
      canCopyDayFromDate
    );
    expect(result.entries).toHaveLength(3);
    const createdIds = result.entries.map((entry) => entry.id);

    const undo = deleteFoodLogEntriesInDb(
      fixture.db,
      fixture.userId,
      createdIds
    );
    expect(undo.deleted_ids).toStrictEqual(createdIds);
    expect(entriesOnDate(fixture, TO_DATE)).toHaveLength(0);
    expect(entriesOnDate(fixture, FROM_DATE)).toHaveLength(3);
  });

  it("rolls back a day copy when the target day already has entries", () => {
    seedEntry(
      fixture,
      makeEntry({
        calories: 50,
        date: TO_DATE,
        id: 9,
        meal_type: "snack",
        protein_g: 1,
      })
    );
    expect(() =>
      copyDayEntriesInDb(
        fixture.db,
        fixture.userId,
        FROM_DATE,
        TO_DATE,
        canCopyDayFromDate
      )
    ).toThrow();
    expect(entriesOnDate(fixture, TO_DATE)).toHaveLength(1);
  });

  it("rolls back mid-copy with no partial rows on failure", () => {
    let callCount = 0;
    const originalInsert = fixture.db.insert;

    vi.spyOn(fixture.db, "insert").mockImplementation(
      (...args: Parameters<typeof fixture.db.insert>) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Simulated mid-copy crash");
        }
        return originalInsert.apply(fixture.db, args);
      }
    );

    expect(() =>
      copyDayEntriesInDb(
        fixture.db,
        fixture.userId,
        FROM_DATE,
        TO_DATE,
        canCopyDayFromDate
      )
    ).toThrow("Simulated mid-copy crash");

    expect(entriesOnDate(fixture, TO_DATE)).toHaveLength(0);
  });
});
