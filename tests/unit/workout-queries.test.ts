import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "../../src/db/schema";
import {
  deleteWorkoutSetRecord,
  findWorkoutSessionWithSets,
  insertWorkoutSessionRecord,
  insertWorkoutSetRecord,
  listExerciseRecords,
  listWeeklyVolumeRows,
  listWorkoutSessionRecords,
  toLegacyExercise,
} from "../../src/db/workout-queries";
import type { DrizzleTestDb } from "./drizzle-test-db";
import { createDrizzleTestDb } from "./drizzle-test-db";

let fixture: DrizzleTestDb;

beforeEach(() => {
  fixture = createDrizzleTestDb();
});

afterEach(() => fixture.close());

describe("Drizzle workout queries", () => {
  it("lists exercises and filters by muscle group", async () => {
    fixture.db
      .insert(schema.exercises)
      .values({ muscleGroup: "legs", name: "Squat" })
      .run();

    const all = await listExerciseRecords(fixture.db);
    expect(all).toHaveLength(2);

    const chest = await listExerciseRecords(fixture.db, "chest");
    expect(chest.map(toLegacyExercise)).toEqual([
      expect.objectContaining({ muscle_group: "chest", name: "Bench Press" }),
    ]);
  });

  it("creates sessions, adds sets, and loads them with exercise joins", async () => {
    const sessionId = await insertWorkoutSessionRecord(fixture.db, {
      date: "2026-07-28",
      name: "Push",
      userId: fixture.userId,
    });

    await insertWorkoutSetRecord(fixture.db, {
      exerciseId: fixture.exerciseId,
      reps: 8,
      sessionId,
      setNumber: 1,
      weightKg: 60,
    });

    const detail = await findWorkoutSessionWithSets(fixture.db, sessionId);
    expect(detail?.session.name).toBe("Push");
    expect(detail?.sets).toHaveLength(1);
    expect(detail?.sets[0]).toMatchObject({
      exercise_name: "Bench Press",
      muscle_group: "chest",
      reps: 8,
      weight_kg: 60,
    });

    const sessions = await listWorkoutSessionRecords(
      fixture.db,
      fixture.userId,
      { date: "2026-07-28" }
    );
    expect(sessions).toHaveLength(1);

    await deleteWorkoutSetRecord(fixture.db, detail!.sets[0].id);
    const afterDelete = await findWorkoutSessionWithSets(fixture.db, sessionId);
    expect(afterDelete?.sets).toHaveLength(0);
  });

  it("aggregates weekly volume by muscle group", async () => {
    const sessionId = await insertWorkoutSessionRecord(fixture.db, {
      date: "2026-07-28",
      name: "Push",
      userId: fixture.userId,
    });
    await insertWorkoutSetRecord(fixture.db, {
      exerciseId: fixture.exerciseId,
      reps: 10,
      sessionId,
      setNumber: 1,
      weightKg: 50,
    });
    await insertWorkoutSetRecord(fixture.db, {
      exerciseId: fixture.exerciseId,
      reps: 8,
      sessionId,
      setNumber: 2,
      weightKg: 52.5,
    });

    const rows = await listWeeklyVolumeRows(fixture.db, fixture.userId);
    expect(rows).toEqual([
      expect.objectContaining({
        muscle_group: "chest",
        total_sets: 2,
        total_volume: 10 * 50 + 8 * 52.5,
      }),
    ]);
  });
});
