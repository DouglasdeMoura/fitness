import Database from "better-sqlite3";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { FitTrackDatabase } from "../../src/db";
import { templateMacroTotals } from "../../src/db/meal-plan-queries";
import { findProgramDayRecord } from "../../src/db/program-queries";
import { deletePushSubscriptionByEndpoint } from "../../src/db/push-queries";
import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import {
  programDays,
  programs,
  pushSubscriptions,
  syncQueue,
  workoutSessions,
  workoutSets,
} from "../../src/db/schema";
import { listAppliedClientIds } from "../../src/db/sync-queries";
import type { UserRecord } from "../../src/db/user-body-queries";
import {
  deleteWorkoutSetRecord,
  findWorkoutSessionWithSets,
  insertWorkoutSetRecord,
  listExerciseRecords,
  listSessionSetRows,
  updateWorkoutSessionDuration,
} from "../../src/db/workout-queries";
import { emptyTotals } from "../../src/lib/nutrition";
import { readAllMigrationSql } from "./migration-sql";

class TestUnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "TestUnauthorizedError";
  }
}

const fullSchema = { ...schema, ...relations };

const dbFixture = vi.hoisted(() => ({
  db: null as FitTrackDatabase | null,
  sqlite: null as Database.Database | null,
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

function ensureDb(): FitTrackDatabase {
  if (!dbFixture.db) {
    dbFixture.sqlite = new Database(":memory:");
    dbFixture.sqlite.exec(readAllMigrationSql());
    dbFixture.db = drizzle(dbFixture.sqlite, {
      schema: fullSchema,
    }) as unknown as FitTrackDatabase;
  }
  return dbFixture.db;
}

function closeDb(): void {
  dbFixture.sqlite?.close();
  dbFixture.sqlite = null;
  dbFixture.db = null;
}

vi.mock("~/db", () => ({
  get db() {
    return ensureDb();
  },
}));

vi.mock("../../src/lib/require-auth", () => ({
  UnauthorizedError: TestUnauthorizedError,
  requireAuth: requireAuthMock,
}));

interface TwoUserProgramFixture {
  exerciseId: number;
  foodId: number;
  other: UserRecord;
  otherClientId: string;
  otherEndpoint: string;
  otherProgramDayId: number;
  otherProgramId: number;
  otherSessionId: number;
  otherSetId: number;
  otherTemplateId: number;
  owner: UserRecord;
  ownerProgramDayId: number;
  ownerProgramId: number;
  ownerSessionId: number;
  ownerSetId: number;
  ownerTemplateId: number;
}

function seedTwoUsersWithPrograms(): TwoUserProgramFixture {
  const db = ensureDb();
  const ownerId = db.insert(schema.users).values({}).returning().get().id;
  const otherId = db.insert(schema.users).values({}).returning().get().id;
  const exerciseId = db
    .insert(schema.exercises)
    .values({ muscleGroup: "chest", name: "Bench Press" })
    .returning()
    .get().id;
  const foodId = db
    .insert(schema.foods)
    .values({
      caloriesPerServing: 200,
      carbsG: 10,
      fatG: 5,
      name: "Test Food",
      proteinG: 20,
    })
    .returning()
    .get().id;

  const ownerProgramId = db
    .insert(programs)
    .values({
      frequencyPerWeek: 3,
      isActive: 1,
      name: "Owner Program",
      periodizationType: "linear",
      userId: ownerId,
    })
    .returning()
    .get().id;
  const otherProgramId = db
    .insert(programs)
    .values({
      frequencyPerWeek: 3,
      isActive: 1,
      name: "Other Program",
      periodizationType: "linear",
      userId: otherId,
    })
    .returning()
    .get().id;

  const ownerProgramDayId = db
    .insert(programDays)
    .values({
      dayName: "Owner Push",
      programId: ownerProgramId,
      sortOrder: 1,
    })
    .returning()
    .get().id;
  const otherProgramDayId = db
    .insert(programDays)
    .values({
      dayName: "Other Push",
      programId: otherProgramId,
      sortOrder: 1,
    })
    .returning()
    .get().id;

  const ownerSessionId = db
    .insert(workoutSessions)
    .values({ date: "2026-07-28", name: "Owner Push", userId: ownerId })
    .returning()
    .get().id;
  const otherSessionId = db
    .insert(workoutSessions)
    .values({ date: "2026-07-28", name: "Other Push", userId: otherId })
    .returning()
    .get().id;

  const ownerSetId = db
    .insert(workoutSets)
    .values({
      exerciseId,
      reps: 8,
      rpe: 7,
      sessionId: ownerSessionId,
      setNumber: 1,
      weightKg: 60,
    })
    .returning()
    .get().id;
  const otherSetId = db
    .insert(workoutSets)
    .values({
      exerciseId,
      reps: 8,
      rpe: 7,
      sessionId: otherSessionId,
      setNumber: 1,
      weightKg: 60,
    })
    .returning()
    .get().id;

  const ownerTemplateId = db
    .insert(schema.mealTemplates)
    .values({ name: "Owner Template", userId: ownerId })
    .returning()
    .get().id;
  const otherTemplateId = db
    .insert(schema.mealTemplates)
    .values({ name: "Other Template", userId: otherId })
    .returning()
    .get().id;

  db.insert(schema.mealTemplateItems)
    .values({
      foodId,
      servings: 1,
      sortOrder: 1,
      templateId: ownerTemplateId,
    })
    .run();
  db.insert(schema.mealTemplateItems)
    .values({
      foodId,
      servings: 1,
      sortOrder: 1,
      templateId: otherTemplateId,
    })
    .run();

  const ownerClientId = "owner-sync-client";
  const otherClientId = "other-sync-client";
  db.insert(syncQueue)
    .values({
      clientId: ownerClientId,
      kind: "addFoodLogEntry",
      payload: "{}",
      queuedAt: "2026-07-28T12:00:00.000Z",
      status: "applied",
      userId: ownerId,
    })
    .run();
  db.insert(syncQueue)
    .values({
      clientId: otherClientId,
      kind: "addFoodLogEntry",
      payload: "{}",
      queuedAt: "2026-07-28T12:00:00.000Z",
      status: "applied",
      userId: otherId,
    })
    .run();

  const otherEndpoint = "https://push.example.test/other-user";
  db.insert(pushSubscriptions)
    .values({
      auth: "auth-key",
      createdAt: "2026-07-28T12:00:00.000Z",
      endpoint: otherEndpoint,
      p256dh: "p256dh-key",
      userId: otherId,
    })
    .run();

  const owner: UserRecord = {
    activityLevel: "moderate",
    authUserId: "auth-owner",
    birthDate: null,
    createdAt: "2026-01-01",
    email: "owner@example.com",
    goalType: "build_muscle",
    heightCm: 180,
    id: ownerId,
    name: "Owner",
    sex: "male",
    updatedAt: "2026-01-01",
  };
  const other: UserRecord = {
    activityLevel: "moderate",
    authUserId: "auth-other",
    birthDate: null,
    createdAt: "2026-01-01",
    email: "other@example.com",
    goalType: "build_muscle",
    heightCm: 175,
    id: otherId,
    name: "Other",
    sex: "female",
    updatedAt: "2026-01-01",
  };

  return {
    exerciseId,
    foodId,
    other,
    otherClientId,
    otherEndpoint,
    otherProgramDayId,
    otherProgramId,
    otherSessionId,
    otherSetId,
    otherTemplateId,
    owner,
    ownerProgramDayId,
    ownerProgramId,
    ownerSessionId,
    ownerSetId,
    ownerTemplateId,
  };
}

function mockAuthAs(user: UserRecord): void {
  requireAuthMock.mockResolvedValue({
    authUserId: user.authUserId ?? `auth-${user.id}`,
    session: { id: `session-${user.id}`, userId: user.authUserId } as never,
    user,
    userId: user.id,
  });
}

describe("auth enforcement batch 2 (issue #81)", () => {
  beforeEach(() => {
    closeDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
  });

  it("findProgramDayRecord returns null for a non-owner", async () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();

    const result = await findProgramDayRecord(
      db,
      fixture.otherProgramDayId,
      fixture.otherProgramId,
      fixture.owner.id
    );

    expect(result).toBeNull();
  });

  it("findWorkoutSessionWithSets returns null for a non-owner", async () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();

    const result = await findWorkoutSessionWithSets(
      db,
      fixture.otherSessionId,
      fixture.owner.id
    );

    expect(result).toBeNull();
  });

  it("listSessionSetRows returns nothing for a non-owner", async () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();

    const rows = await listSessionSetRows(
      db,
      fixture.otherSessionId,
      fixture.owner.id
    );

    expect(rows).toEqual([]);
  });

  it("updateWorkoutSessionDuration does not update another user's session", async () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();

    await updateWorkoutSessionDuration(
      db,
      fixture.otherSessionId,
      fixture.owner.id,
      45
    );

    const row = db
      .select({ durationMinutes: workoutSessions.durationMinutes })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, fixture.otherSessionId))
      .get();

    expect(row?.durationMinutes).toBeNull();
  });

  it("insertWorkoutSetRecord returns null for another user's session", async () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();
    const beforeCount = db
      .select({ count: count() })
      .from(workoutSets)
      .get()?.count;

    const result = await insertWorkoutSetRecord(db, fixture.owner.id, {
      exerciseId: fixture.exerciseId,
      reps: 5,
      sessionId: fixture.otherSessionId,
      setNumber: 1,
      weightKg: 50,
    });

    const afterCount = db
      .select({ count: count() })
      .from(workoutSets)
      .get()?.count;

    expect(result).toBeNull();
    expect(afterCount).toBe(beforeCount);
  });

  it("deleteWorkoutSetRecord does not delete another user's set", async () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();

    await deleteWorkoutSetRecord(db, fixture.otherSetId, fixture.owner.id);

    const remaining = db
      .select({ id: workoutSets.id })
      .from(workoutSets)
      .where(eq(workoutSets.id, fixture.otherSetId))
      .get();

    expect(remaining?.id).toBe(fixture.otherSetId);
  });

  it("templateMacroTotals returns empty totals for a non-owner", async () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();

    const totals = await templateMacroTotals(
      db,
      fixture.otherTemplateId,
      fixture.owner.id
    );

    expect(totals).toEqual(emptyTotals());
  });

  it("deletePushSubscriptionByEndpoint does not delete another user's subscription", () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();

    const deleted = deletePushSubscriptionByEndpoint(
      db,
      fixture.owner.id,
      fixture.otherEndpoint
    );

    const remaining = db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, fixture.otherEndpoint))
      .get();

    expect(deleted).toBe(false);
    expect(remaining?.endpoint).toBe(fixture.otherEndpoint);
  });

  it("listAppliedClientIds returns nothing for another user's client ids", () => {
    const fixture = seedTwoUsersWithPrograms();
    const db = ensureDb();

    const ids = listAppliedClientIds(db, fixture.owner.id, [
      fixture.otherClientId,
    ]);

    expect(ids).toEqual([]);
  });

  it("catalog exercise queries stay exempt from user scoping", async () => {
    seedTwoUsersWithPrograms();
    const db = ensureDb();

    const exercises = await listExerciseRecords(db);

    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises[0]).toEqual(
      expect.objectContaining({ name: "Bench Press" })
    );
  });
});

describe("executeStartWorkoutFromProgram ownership (issue #81)", () => {
  let executeStartWorkoutFromProgram: (data: {
    programDayId: number;
    programId: number;
  }) => Promise<unknown>;

  beforeAll(async () => {
    const { executeStartWorkoutFromProgram: startHandler } =
      await import("../../src/lib/auth-enforcement-handlers.server");
    executeStartWorkoutFromProgram = startHandler;
  });

  beforeEach(() => {
    closeDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
  });

  it("throws and creates no session when using another user's program day", async () => {
    const fixture = seedTwoUsersWithPrograms();
    mockAuthAs(fixture.owner);
    const db = ensureDb();
    const beforeCount = db
      .select({ count: count() })
      .from(workoutSessions)
      .get()?.count;

    await expect(
      executeStartWorkoutFromProgram({
        programDayId: fixture.otherProgramDayId,
        programId: fixture.otherProgramId,
      })
    ).rejects.toThrow("Program day not found");

    const afterCount = db
      .select({ count: count() })
      .from(workoutSessions)
      .get()?.count;

    expect(afterCount).toBe(beforeCount);
  });
});
