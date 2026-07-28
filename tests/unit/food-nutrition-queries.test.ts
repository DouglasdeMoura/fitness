import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FitTrackDatabase } from "../../src/db";
import {
  exportNutritionRecords,
  exportTrainingRecords,
} from "../../src/db/export-queries";
import {
  deleteFoodLogRecord,
  insertFoodLogRecord,
  insertFoodRecord,
  listFoodLogRecords,
  listFoodLogStatsRecords,
  listFoodLogSummaryRecords,
  listFoodRecords,
  listFrequentFoodRecords,
  listRecentFoodRecords,
  listWeeklyNutritionRows,
  searchFoodRecords,
} from "../../src/db/food-nutrition-queries";
import * as schema from "../../src/db/schema";

let sqlite: Database.Database;
let testDb: FitTrackDatabase;
let userId: number;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(
    readFileSync(
      join(process.cwd(), "drizzle", "0000_jazzy_zaran.sql"),
      "utf-8"
    )
  );
  testDb = drizzle(sqlite, { schema });
  userId = testDb.insert(schema.users).values({}).returning().get().id;
});

afterEach(() => sqlite.close());

async function seedSearchFoods(): Promise<void> {
  await testDb.insert(schema.foods).values([
    { caloriesPerServing: 57, name: "Blueberry", source: "seed" },
    {
      brand: "Berry Farm",
      caloriesPerServing: 95,
      name: "Granola",
      source: "seed",
    },
    { caloriesPerServing: 52, name: "Apple", source: "seed" },
  ]);
}

function logInput(date: string, mealType: "breakfast" | "dinner") {
  return {
    calories: 200,
    carbsG: 20,
    date,
    fatG: 5,
    mealType,
    proteinG: 10,
    servings: 1,
    userId,
  } as const;
}

describe("Drizzle food queries", () => {
  it("searches names and brands with LIKE in name order", async () => {
    await seedSearchFoods();

    const matches = await searchFoodRecords(testDb, "berry", 20);

    expect(matches.map((food) => food.name)).toStrictEqual([
      "Blueberry",
      "Granola",
    ]);
  });

  it("inserts foods and lists them in name order", async () => {
    await insertFoodRecord(testDb, {
      caloriesPerServing: 120,
      name: "Yogurt",
      proteinG: 12,
      source: "user",
    });
    await insertFoodRecord(testDb, {
      caloriesPerServing: 52,
      name: "Apple",
      source: "seed",
    });

    const foods = await listFoodRecords(testDb, 10);

    expect(foods.map((food) => food.name)).toStrictEqual(["Apple", "Yogurt"]);
    expect(foods[1]).toMatchObject({ proteinG: 12, source: "user" });
  });
});

describe("Drizzle food-log queries", () => {
  it("inserts, lists, and deletes one user's dated entries", async () => {
    const dinner = await insertFoodLogRecord(
      testDb,
      logInput("2026-07-28", "dinner")
    );
    const breakfast = await insertFoodLogRecord(
      testDb,
      logInput("2026-07-28", "breakfast")
    );

    const listed = await listFoodLogRecords(testDb, userId, "2026-07-28");
    expect(listed.map((entry) => entry.id)).toStrictEqual([
      breakfast.id,
      dinner.id,
    ]);

    await deleteFoodLogRecord(testDb, userId, breakfast.id);
    expect(
      await listFoodLogRecords(testDb, userId, "2026-07-28")
    ).toStrictEqual([dinner]);
  });

  it("keeps quick-add rows and resolves catalog food names in summaries", async () => {
    const food = await insertFoodRecord(testDb, {
      caloriesPerServing: 57,
      name: "Blueberry",
      source: "seed",
    });
    await insertFoodLogRecord(testDb, {
      ...logInput("2026-07-28", "breakfast"),
      foodId: food.id,
    });
    await insertFoodLogRecord(testDb, {
      ...logInput("2026-07-28", "dinner"),
      customName: "Cafe meal",
    });

    const summary = await listFoodLogSummaryRecords(
      testDb,
      userId,
      "2026-07-28"
    );

    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({ foodName: "Blueberry" });
    expect(summary[1]).toMatchObject({
      customName: "Cafe meal",
      foodName: null,
    });
  });

  it("aggregates each date in the trailing nutrition window", async () => {
    await testDb
      .insert(schema.foodLog)
      .values([
        logInput("2026-07-28", "breakfast"),
        { ...logInput("2026-07-28", "dinner"), calories: 350, proteinG: 25 },
        logInput("2026-07-27", "breakfast"),
        logInput("2026-07-20", "breakfast"),
      ]);

    const rows = await listWeeklyNutritionRows(testDb, userId, "2026-07-21");

    expect(rows).toStrictEqual([
      {
        calories: 550,
        carbsG: 40,
        date: "2026-07-28",
        entries: 2,
        fatG: 10,
        proteinG: 35,
      },
      {
        calories: 200,
        carbsG: 20,
        date: "2026-07-27",
        entries: 1,
        fatG: 5,
        proteinG: 10,
      },
    ]);
  });
});

describe("Drizzle data export queries", () => {
  it("exports the user's nutrition and linked training records", async () => {
    const exercise = await testDb
      .insert(schema.exercises)
      .values({ category: "compound", muscleGroup: "legs", name: "Squat" })
      .returning()
      .get();
    const program = await testDb
      .insert(schema.programs)
      .values({ name: "Strength", userId })
      .returning()
      .get();
    const programDay = await testDb
      .insert(schema.programDays)
      .values({ dayName: "Day 1", programId: program.id, sortOrder: 1 })
      .returning()
      .get();
    await testDb.insert(schema.programExercises).values({
      exerciseId: exercise.id,
      programDayId: programDay.id,
      sortOrder: 1,
      targetSets: 3,
    });
    const session = await testDb
      .insert(schema.workoutSessions)
      .values({ date: "2026-07-28", userId })
      .returning()
      .get();
    await testDb.insert(schema.workoutSets).values({
      exerciseId: exercise.id,
      sessionId: session.id,
      setNumber: 1,
    });
    await testDb
      .insert(schema.foodLog)
      .values(logInput("2026-07-28", "breakfast"));

    const nutrition = await exportNutritionRecords(testDb, userId);
    const training = await exportTrainingRecords(testDb, userId);

    expect(nutrition.food_log[0]).toMatchObject({
      carbs_g: 20,
      meal_type: "breakfast",
      user_id: userId,
    });
    expect(training).toMatchObject({
      program_days: [{ day_name: "Day 1", program_id: program.id }],
      program_exercises: [
        { exercise_id: exercise.id, program_day_id: programDay.id },
      ],
      programs: [{ id: program.id, user_id: userId }],
      workout_sets: [{ exercise_id: exercise.id, session_id: session.id }],
      workouts: [{ id: session.id, user_id: userId }],
    });
  });
});

describe("Drizzle logged-food shortlists", () => {
  /** Two foods; oats logged twice so "latest wins" is observable. */
  async function seedLoggedFoods(): Promise<{ oats: number; eggs: number }> {
    const oats = (
      await testDb
        .insert(schema.foods)
        .values({ caloriesPerServing: 150, name: "Oats", source: "seed" })
        .returning()
        .get()
    ).id;
    const eggs = (
      await testDb
        .insert(schema.foods)
        .values({ caloriesPerServing: 78, name: "Eggs", source: "seed" })
        .returning()
        .get()
    ).id;
    await testDb.insert(schema.foodLog).values([
      // Older oats entry — 3 servings at dinner. Must NOT be the one reported.
      { ...logInput("2026-07-01", "dinner"), foodId: oats, servings: 3 },
      // Newer oats entry — 1 serving at breakfast. This is "last".
      { ...logInput("2026-07-20", "breakfast"), foodId: oats, servings: 1 },
      { ...logInput("2026-07-25", "dinner"), foodId: eggs, servings: 2 },
    ]);
    return { eggs, oats };
  }

  it("reports one row per food using the most recent entry's portion", async () => {
    const { eggs, oats } = await seedLoggedFoods();

    const recent = await listRecentFoodRecords(testDb, userId, 20);

    // Eggs (07-25) outrank oats (07-20), and oats appears once, not twice.
    expect(recent.map((row) => row.id)).toEqual([eggs, oats]);
    // The window function must pull from the 07-20 row, not the 07-01 one.
    // A bare-column GROUP BY would be free to return 3 / "dinner" here.
    expect(recent[1]).toMatchObject({
      lastMealType: "breakfast",
      lastServings: 1,
      name: "Oats",
    });
  });

  it("excludes quick-add rows that carry no food id", async () => {
    const { oats } = await seedLoggedFoods();
    await testDb
      .insert(schema.foodLog)
      .values({ ...logInput("2026-07-27", "dinner"), customName: "Quick add" });

    const recent = await listRecentFoodRecords(testDb, userId, 20);

    expect(recent.map((row) => row.id)).toContain(oats);
    expect(recent).toHaveLength(2);
  });

  it("honours the shortlist limit", async () => {
    await seedLoggedFoods();
    expect(await listRecentFoodRecords(testDb, userId, 1)).toHaveLength(1);
  });

  it("ranks frequent foods by log count within the window", async () => {
    const { eggs, oats } = await seedLoggedFoods();

    const frequent = await listFrequentFoodRecords(
      testDb,
      userId,
      "2026-06-01",
      20
    );

    // Oats logged twice, eggs once.
    expect(frequent.map((row) => row.id)).toEqual([oats, eggs]);
    expect(frequent[0]).toMatchObject({ logCount: 2 });
  });

  it("drops entries older than the window from the frequent count", async () => {
    const { eggs, oats } = await seedLoggedFoods();

    // 2026-07-15 excludes the 07-01 oats entry, leaving one log each. Eggs
    // then sorts first on its later id, so assert counts rather than order.
    const frequent = await listFrequentFoodRecords(
      testDb,
      userId,
      "2026-07-15",
      20
    );

    expect(
      Object.fromEntries(frequent.map((row) => [row.id, row.logCount]))
    ).toEqual({ [eggs]: 1, [oats]: 1 });
  });

  it("returns all-time stats with the last-used portion", async () => {
    const { eggs, oats } = await seedLoggedFoods();

    const stats = await listFoodLogStatsRecords(testDb, userId);

    expect(
      Object.fromEntries(stats.map((row) => [row.foodId, row.logCount]))
    ).toEqual({ [eggs]: 1, [oats]: 2 });
    expect(stats.find((row) => row.foodId === oats)).toMatchObject({
      lastMealType: "breakfast",
      lastServings: 1,
    });
  });

  it("returns nothing for a user with no log", async () => {
    await seedLoggedFoods();
    const other = testDb.insert(schema.users).values({}).returning().get().id;

    expect(await listRecentFoodRecords(testDb, other, 20)).toEqual([]);
    expect(await listFoodLogStatsRecords(testDb, other)).toEqual([]);
  });
});
