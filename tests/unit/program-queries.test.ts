import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteProgramRecord,
  findProgramDetail,
  listProgramSummaries,
  saveProgramRecord,
} from "../../src/db/program-queries";
import type { DrizzleTestDb } from "./drizzle-test-db";
import { createDrizzleTestDb } from "./drizzle-test-db";

let fixture: DrizzleTestDb;

beforeEach(() => {
  fixture = createDrizzleTestDb();
});

afterEach(() => fixture.close());

describe("Drizzle program queries", () => {
  it("saves, lists, and deletes programs with nested days", async () => {
    const programId = await saveProgramRecord(fixture.db, fixture.userId, {
      days: [
        {
          day_name: "Day A",
          exercises: [
            {
              exercise_id: fixture.exerciseId,
              sort_order: 1,
              target_reps: "8-12",
              target_rpe: 8,
              target_sets: 3,
            },
          ],
          sort_order: 1,
        },
      ],
      frequency_per_week: 3,
      is_active: true,
      name: "Strength Block",
      periodization_type: "linear",
    });

    const summaries = await listProgramSummaries(fixture.db, fixture.userId);
    expect(summaries).toEqual([
      expect.objectContaining({
        day_count: 1,
        is_active: 1,
        name: "Strength Block",
      }),
    ]);

    const detail = await findProgramDetail(
      fixture.db,
      programId,
      fixture.userId
    );
    expect(detail?.days[0].exercises[0]).toMatchObject({
      exercise_name: "Bench Press",
      target_sets: 3,
    });

    await deleteProgramRecord(fixture.db, programId, fixture.userId);
    expect(
      await findProgramDetail(fixture.db, programId, fixture.userId)
    ).toBeNull();
  });
});
