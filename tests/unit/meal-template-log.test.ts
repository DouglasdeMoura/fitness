import { and, count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { logMealTemplateInDb } from "~/db/food-log-copy-queries";
import { sortTemplatesForMealSection } from "~/lib/meal-template-log";
import type { MealType } from "~/lib/nutrition";

import { foodLog, mealTemplateItems, mealTemplates } from "../../src/db/schema";
import { createDrizzleTestDb } from "./drizzle-test-db";
import type { DrizzleTestDb } from "./drizzle-test-db";

const DATE = "2020-01-01";

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
  let fixture: DrizzleTestDb;

  beforeEach(() => {
    fixture = createDrizzleTestDb();
    fixture.db
      .insert(mealTemplates)
      .values({
        defaultMealType: "breakfast",
        id: 10,
        name: "Morning",
        userId: fixture.userId,
      })
      .run();
    fixture.db
      .insert(mealTemplateItems)
      .values({
        foodId: fixture.foodId,
        servings: 1,
        sortOrder: 1,
        templateId: 10,
      })
      .run();
  });

  afterEach(() => {
    fixture.close();
  });

  it("expands template items into food_log rows in one transaction", () => {
    const result = logMealTemplateInDb(
      fixture.db,
      fixture.userId,
      10,
      DATE,
      "breakfast"
    );
    expect(result.template_name).toBe("Morning");
    expect(result.total_calories).toBe(100);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].meal_type).toBe("breakfast");
    expect(result.entries[0].calories).toBe(100);

    const rows = fixture.db
      .select({ count: count() })
      .from(foodLog)
      .where(and(eq(foodLog.userId, fixture.userId), eq(foodLog.date, DATE)))
      .get();
    expect(rows?.count).toBe(1);
  });

  it("logs to the requested meal type even when default differs", () => {
    const result = logMealTemplateInDb(
      fixture.db,
      fixture.userId,
      10,
      DATE,
      "lunch"
    );
    expect(result.entries[0].meal_type).toBe("lunch");
  });

  it("throws when the template has no items", () => {
    fixture.db
      .delete(mealTemplateItems)
      .where(eq(mealTemplateItems.templateId, 10))
      .run();
    expect(() =>
      logMealTemplateInDb(fixture.db, fixture.userId, 10, DATE, "breakfast")
    ).toThrow(/has no items to log/u);
  });
});
