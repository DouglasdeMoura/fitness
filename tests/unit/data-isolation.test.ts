import { and, count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  exportNutritionRecords,
  exportTrainingRecords,
} from "../../src/db/export-queries";
import {
  deleteFoodLogRecord,
  listFoodLogRecords,
} from "../../src/db/food-nutrition-queries";
import {
  deleteMealPlanRecord,
  deleteMealTemplateRecord,
  findMealPlanRecord,
  findMealTemplateDetail,
  listMealTemplateSummaries,
  templateMacroTotals,
} from "../../src/db/meal-plan-queries";
import { getNotificationPreferencesRow } from "../../src/db/notification-queries";
import {
  findProgramDayContext,
  findProgramDayRecord,
  findProgramDetail,
  listProgramSummaries,
} from "../../src/db/program-queries";
import { listDistinctFoodLogDates } from "../../src/db/progress-queries";
import { deletePushSubscriptionByEndpoint } from "../../src/db/push-queries";
import {
  bodyLogs,
  foodLog,
  mealPlans,
  mealTemplates,
  programDays,
  programs,
  pushSubscriptions,
  users,
  workoutSessions,
  workoutSets,
} from "../../src/db/schema";
import { listAppliedClientIds } from "../../src/db/sync-queries";
import {
  deleteWorkoutSetRecord,
  findWorkoutSessionWithSets,
  insertWorkoutSetRecord,
  listSessionSetRows,
  updateWorkoutSessionDuration,
} from "../../src/db/workout-queries";
import { emptyTotals } from "../../src/lib/nutrition";
import {
  getStoredThemePreference,
  updateStoredThemePreference,
} from "../../src/lib/theme-preference-persistence";
import type { DataIsolationFixture } from "./data-isolation-fixture";
import { seedDataIsolationFixture } from "./data-isolation-fixture";

let fixture: DataIsolationFixture;

beforeEach(() => {
  fixture = seedDataIsolationFixture();
});

afterEach(() => fixture.close());

describe("data isolation read gates (issue #84)", () => {
  it("listFoodLogRecords hides another user's entries", async () => {
    const rows = await listFoodLogRecords(
      fixture.db,
      fixture.other.id,
      fixture.ownerMealPlanDate
    );

    expect(rows).toEqual([]);
  });

  it("findProgramDetail returns null for another user's program", async () => {
    const detail = await findProgramDetail(
      fixture.db,
      fixture.ownerProgramId,
      fixture.other.id
    );

    expect(detail).toBeNull();
  });

  it("listProgramSummaries excludes another user's programs", async () => {
    const summaries = await listProgramSummaries(fixture.db, fixture.other.id);

    expect(summaries.map((program) => program.id)).not.toContain(
      fixture.ownerProgramId
    );
  });

  it("findProgramDayContext returns null for another user's program day", async () => {
    const context = await findProgramDayContext(
      fixture.db,
      fixture.ownerProgramId,
      fixture.ownerProgramDayId,
      fixture.other.id
    );

    expect(context).toBeNull();
  });

  it("findProgramDayRecord returns null for another user's program day", async () => {
    const day = await findProgramDayRecord(
      fixture.db,
      fixture.ownerProgramDayId,
      fixture.ownerProgramId,
      fixture.other.id
    );

    expect(day).toBeNull();
  });

  it("findWorkoutSessionWithSets returns null for another user's session", async () => {
    const session = await findWorkoutSessionWithSets(
      fixture.db,
      fixture.ownerSessionId,
      fixture.other.id
    );

    expect(session).toBeNull();
  });

  it("listSessionSetRows returns nothing for another user's session", async () => {
    const rows = await listSessionSetRows(
      fixture.db,
      fixture.ownerSessionId,
      fixture.other.id
    );

    expect(rows).toEqual([]);
  });

  it("findMealTemplateDetail returns null for another user's template", async () => {
    const detail = await findMealTemplateDetail(
      fixture.db,
      fixture.ownerTemplateId,
      fixture.other.id
    );

    expect(detail).toBeNull();
  });

  it("listMealTemplateSummaries excludes another user's templates", async () => {
    const summaries = await listMealTemplateSummaries(
      fixture.db,
      fixture.other.id
    );

    expect(summaries.map((template) => template.id)).not.toContain(
      fixture.ownerTemplateId
    );
  });

  it("templateMacroTotals returns empty totals for another user's template", async () => {
    const totals = await templateMacroTotals(
      fixture.db,
      fixture.ownerTemplateId,
      fixture.other.id
    );

    expect(totals).toEqual(emptyTotals());
  });

  it("findMealPlanRecord returns null for another user's plan slot", async () => {
    const plan = await findMealPlanRecord(
      fixture.db,
      fixture.other.id,
      fixture.ownerMealPlanDate,
      fixture.ownerMealPlanMealType
    );

    expect(plan).toBeNull();
  });

  it("exportNutritionRecords excludes another user's body and food logs", async () => {
    const exported = await exportNutritionRecords(fixture.db, fixture.other.id);

    expect(exported.body_logs).toEqual([]);
    expect(exported.food_log).toEqual([]);
  });

  it("exportTrainingRecords excludes another user's workouts and programs", async () => {
    const exported = await exportTrainingRecords(fixture.db, fixture.other.id);

    expect(exported.programs.map((program) => program.id)).not.toContain(
      fixture.ownerProgramId
    );
    expect(exported.workouts.map((session) => session.id)).not.toContain(
      fixture.ownerSessionId
    );
    expect(exported.workout_sets.map((set) => set.id)).not.toContain(
      fixture.ownerSetId
    );
  });

  it("listDistinctFoodLogDates excludes another user's logged days", () => {
    const dates = listDistinctFoodLogDates(fixture.db, fixture.other.id);

    expect(dates).toEqual([]);
  });

  it("listAppliedClientIds hides another user's sync client ids", () => {
    const ids = listAppliedClientIds(fixture.db, fixture.other.id, [
      fixture.ownerClientId,
    ]);

    expect(ids).toEqual([]);
  });

  it("getNotificationPreferencesRow reads only the caller's preferences", () => {
    const prefs = getNotificationPreferencesRow(fixture.db, fixture.other.id);

    expect(prefs?.meal_reminders).toBe(0);
    expect(prefs?.workout_reminders).toBe(1);
    expect(prefs?.user_id).toBe(fixture.other.id);
  });

  it("getStoredThemePreference returns the caller's value, not another user's write (issue #103)", async () => {
    await updateStoredThemePreference(fixture.db, fixture.owner.id, "dark");

    expect(await getStoredThemePreference(fixture.db, fixture.other.id)).toBe(
      "system"
    );
  });
});

describe("data isolation write gates (issue #84)", () => {
  it("deleteFoodLogRecord does not delete another user's entry", async () => {
    await deleteFoodLogRecord(
      fixture.db,
      fixture.other.id,
      fixture.ownerFoodLogId
    );

    const remaining = fixture.db
      .select({ id: foodLog.id })
      .from(foodLog)
      .where(eq(foodLog.id, fixture.ownerFoodLogId))
      .get();

    expect(remaining?.id).toBe(fixture.ownerFoodLogId);
  });

  it("deleteWorkoutSetRecord does not delete another user's set", async () => {
    await deleteWorkoutSetRecord(
      fixture.db,
      fixture.ownerSetId,
      fixture.other.id
    );

    const remaining = fixture.db
      .select({ id: workoutSets.id })
      .from(workoutSets)
      .where(eq(workoutSets.id, fixture.ownerSetId))
      .get();

    expect(remaining?.id).toBe(fixture.ownerSetId);
  });

  it("insertWorkoutSetRecord does not write into another user's session", async () => {
    const beforeCount = fixture.db
      .select({ count: count() })
      .from(workoutSets)
      .get()?.count;

    const inserted = await insertWorkoutSetRecord(
      fixture.db,
      fixture.other.id,
      {
        exerciseId: fixture.exerciseId,
        reps: 5,
        sessionId: fixture.ownerSessionId,
        setNumber: 2,
        weightKg: 40,
      }
    );

    const afterCount = fixture.db
      .select({ count: count() })
      .from(workoutSets)
      .get()?.count;

    expect(inserted).toBeNull();
    expect(afterCount).toBe(beforeCount);
  });

  it("updateWorkoutSessionDuration does not update another user's session", async () => {
    await updateWorkoutSessionDuration(
      fixture.db,
      fixture.ownerSessionId,
      fixture.other.id,
      45
    );

    const row = fixture.db
      .select({ durationMinutes: workoutSessions.durationMinutes })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, fixture.ownerSessionId))
      .get();

    expect(row?.durationMinutes).toBeNull();
  });

  it("deleteMealTemplateRecord does not delete another user's template", async () => {
    await deleteMealTemplateRecord(
      fixture.db,
      fixture.ownerTemplateId,
      fixture.other.id
    );

    const remaining = fixture.db
      .select({ id: mealTemplates.id })
      .from(mealTemplates)
      .where(eq(mealTemplates.id, fixture.ownerTemplateId))
      .get();

    expect(remaining?.id).toBe(fixture.ownerTemplateId);
  });

  it("deleteMealPlanRecord does not delete another user's plan", async () => {
    await deleteMealPlanRecord(
      fixture.db,
      fixture.other.id,
      fixture.ownerMealPlanDate,
      fixture.ownerMealPlanMealType
    );

    const remaining = fixture.db
      .select({ id: mealPlans.id })
      .from(mealPlans)
      .where(
        and(
          eq(mealPlans.userId, fixture.owner.id),
          eq(mealPlans.date, fixture.ownerMealPlanDate),
          eq(mealPlans.mealType, fixture.ownerMealPlanMealType)
        )
      )
      .get();

    expect(remaining?.id).toBeDefined();
  });

  it("deletePushSubscriptionByEndpoint does not delete another user's subscription", () => {
    const deleted = deletePushSubscriptionByEndpoint(
      fixture.db,
      fixture.other.id,
      fixture.ownerEndpoint
    );

    const remaining = fixture.db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, fixture.ownerEndpoint))
      .get();

    expect(deleted).toBe(false);
    expect(remaining?.endpoint).toBe(fixture.ownerEndpoint);
  });

  it("updateStoredThemePreference does not modify another user's theme_preference row (issue #103)", async () => {
    await updateStoredThemePreference(fixture.db, fixture.other.id, "light");
    await updateStoredThemePreference(fixture.db, fixture.owner.id, "dark");

    const otherRow = fixture.db
      .select({ themePreference: users.themePreference })
      .from(users)
      .where(eq(users.id, fixture.other.id))
      .get();

    expect(otherRow?.themePreference).toBe("light");
    expect(await getStoredThemePreference(fixture.db, fixture.other.id)).toBe(
      "light"
    );
    expect(await getStoredThemePreference(fixture.db, fixture.owner.id)).toBe(
      "dark"
    );
  });
});

describe("data isolation mutation proofs (issue #84)", () => {
  it("findProgramDayRecord would leak without a userId filter", async () => {
    const unscoped = fixture.db
      .select({ dayName: programDays.dayName })
      .from(programDays)
      .where(
        and(
          eq(programDays.id, fixture.ownerProgramDayId),
          eq(programDays.programId, fixture.ownerProgramId)
        )
      )
      .get();

    expect(unscoped?.dayName).toBe("Owner Push");

    const scoped = await findProgramDayRecord(
      fixture.db,
      fixture.ownerProgramDayId,
      fixture.ownerProgramId,
      fixture.other.id
    );

    expect(scoped).toBeNull();
  });

  it("listFoodLogRecords would leak without a userId filter", async () => {
    const unscoped = fixture.db
      .select({ id: foodLog.id })
      .from(foodLog)
      .where(eq(foodLog.date, fixture.ownerMealPlanDate))
      .all();

    expect(unscoped.map((row) => row.id)).toContain(fixture.ownerFoodLogId);

    const scoped = await listFoodLogRecords(
      fixture.db,
      fixture.other.id,
      fixture.ownerMealPlanDate
    );

    expect(scoped).toEqual([]);
  });

  it("findProgramDetail would leak without a userId filter", async () => {
    const unscoped = fixture.db
      .select({ name: programs.name })
      .from(programs)
      .where(eq(programs.id, fixture.ownerProgramId))
      .get();

    expect(unscoped?.name).toBe("Owner Program");

    const scoped = await findProgramDetail(
      fixture.db,
      fixture.ownerProgramId,
      fixture.other.id
    );

    expect(scoped).toBeNull();
  });

  it("exportNutritionRecords would leak body logs without a userId filter", async () => {
    const unscopedCount = fixture.db
      .select({ count: count() })
      .from(bodyLogs)
      .get()?.count;

    expect(unscopedCount).toBeGreaterThan(0);

    const scoped = await exportNutritionRecords(fixture.db, fixture.other.id);

    expect(scoped.body_logs).toEqual([]);
  });
});
