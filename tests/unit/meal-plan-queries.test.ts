import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteMealPlanRecord,
  deleteMealTemplateRecord,
  findMealPlanRecord,
  findMealTemplateDetail,
  listMealPlansForWeek,
  listMealTemplateSummaries,
  saveMealTemplateRecord,
  templateMacroTotals,
  upsertMealPlanRecord,
} from "../../src/db/meal-plan-queries";
import type { DrizzleTestDb } from "./drizzle-test-db";
import { createDrizzleTestDb } from "./drizzle-test-db";

let fixture: DrizzleTestDb;

beforeEach(() => {
  fixture = createDrizzleTestDb();
});

afterEach(() => fixture.close());

describe("Drizzle meal plan queries", () => {
  it("saves templates, assigns weekly plans, and computes macros", async () => {
    const templateId = await saveMealTemplateRecord(
      fixture.db,
      fixture.userId,
      {
        default_meal_type: "lunch",
        items: [{ food_id: fixture.foodId, servings: 2, sort_order: 1 }],
        name: "High Protein Lunch",
      }
    );

    const summaries = await listMealTemplateSummaries(
      fixture.db,
      fixture.userId
    );
    expect(summaries[0]).toMatchObject({
      item_count: 1,
      name: "High Protein Lunch",
      totals: {
        calories: 200,
        carbs_g: 20,
        fat_g: 4,
        fiber_g: 0,
        protein_g: 16,
      },
    });

    const detail = await findMealTemplateDetail(
      fixture.db,
      templateId,
      fixture.userId
    );
    expect(detail?.items[0].food_name).toBe("Test Food");

    await upsertMealPlanRecord(fixture.db, fixture.userId, {
      date: "2026-07-28",
      meal_type: "lunch",
      template_id: templateId,
    });

    const plan = await findMealPlanRecord(
      fixture.db,
      fixture.userId,
      "2026-07-28",
      "lunch"
    );
    expect(plan?.template_id).toBe(templateId);

    const weekPlans = await listMealPlansForWeek(
      fixture.db,
      fixture.userId,
      "2026-07-28",
      "2026-07-28"
    );
    expect(weekPlans[0].template_name).toBe("High Protein Lunch");

    const totals = await templateMacroTotals(
      fixture.db,
      templateId,
      fixture.userId
    );
    expect(totals.calories).toBe(200);

    await deleteMealPlanRecord(
      fixture.db,
      fixture.userId,
      "2026-07-28",
      "lunch"
    );
    expect(
      await findMealPlanRecord(
        fixture.db,
        fixture.userId,
        "2026-07-28",
        "lunch"
      )
    ).toBeNull();

    await deleteMealTemplateRecord(fixture.db, templateId, fixture.userId);
    expect(
      await findMealTemplateDetail(fixture.db, templateId, fixture.userId)
    ).toBeNull();
  });
});
