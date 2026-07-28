import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as foodNutritionQueries from "../../src/db/food-nutrition-queries";
import { foodLog, users } from "../../src/db/schema";
import * as userBodyQueries from "../../src/db/user-body-queries";
import {
  parseServerInput,
  serverInputValidator,
} from "../../src/lib/schemas/common";
import {
  addFoodLogEntryInputSchema,
  deleteFoodLogEntryInputSchema,
} from "../../src/lib/schemas/nutrition";
import {
  logBodyweightInputSchema,
  userProfileUpdateSchema,
} from "../../src/lib/schemas/user";
import { addWorkoutSetInputSchema } from "../../src/lib/schemas/workout";
import { createDrizzleTestDb } from "./drizzle-test-db";
import type { DrizzleTestDb } from "./drizzle-test-db";

let fixture: DrizzleTestDb;

afterEach(() => {
  fixture?.close();
  vi.restoreAllMocks();
});

function countFoodLogRows(): number {
  return fixture.db.select().from(foodLog).all().length;
}

function seedFoodLog(): number {
  return fixture.db
    .insert(foodLog)
    .values({
      calories: 100,
      carbsG: 10,
      date: "2026-01-15",
      fatG: 2,
      foodId: fixture.foodId,
      mealType: "lunch",
      proteinG: 8,
      servings: 1,
      userId: fixture.userId,
    })
    .returning({ id: foodLog.id })
    .get().id;
}

async function readUserName(): Promise<string> {
  const row = await fixture.db.query.users.findFirst({
    where: eq(users.id, fixture.userId),
  });
  return row?.name ?? "";
}

describe("server-function Zod validators (issue #71)", () => {
  describe("nutrition domain", () => {
    it("rejects a malformed delete payload before the food log table changes", () => {
      fixture = createDrizzleTestDb();
      seedFoodLog();
      const deleteSpy = vi.spyOn(foodNutritionQueries, "deleteFoodLogRecord");
      const validate = serverInputValidator(deleteFoodLogEntryInputSchema);

      expect(() => validate({ id: "not-a-number" })).toThrow();
      expect(countFoodLogRows()).toBe(1);
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("rejects negative macro grams on addFoodLogEntry", () => {
      expect(() =>
        parseServerInput(addFoodLogEntryInputSchema, {
          calories: 100,
          carbs_g: 10,
          fat_g: 2,
          meal_type: "breakfast",
          protein_g: -1,
          servings: 1,
        })
      ).toThrow();
    });
  });

  describe("workout domain", () => {
    it("rejects negative reps before a set insert would run", () => {
      fixture = createDrizzleTestDb();

      expect(() =>
        parseServerInput(addWorkoutSetInputSchema, {
          exercise_id: fixture.exerciseId,
          reps: -3,
          session_id: 1,
          set_number: 1,
          weight_kg: 50,
        })
      ).toThrow();
    });
  });

  describe("user domain", () => {
    it("rejects negative bodyweight before body log upsert", () => {
      fixture = createDrizzleTestDb();
      const upsertSpy = vi.spyOn(userBodyQueries, "upsertBodyweightRecord");

      expect(() =>
        parseServerInput(logBodyweightInputSchema, { weight_kg: -5 })
      ).toThrow();
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it("rejects an invalid activity level before profile update runs", async () => {
      fixture = createDrizzleTestDb();
      const beforeName = await readUserName();
      const updateSpy = vi.spyOn(userBodyQueries, "updateUserRecord");

      expect(() =>
        parseServerInput(userProfileUpdateSchema, {
          activityLevel: "ultra_active",
        })
      ).toThrow();

      expect(await readUserName()).toBe(beforeName);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
