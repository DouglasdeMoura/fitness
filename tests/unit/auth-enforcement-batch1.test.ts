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
import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import { pushSubscriptions, syncQueue, workoutSets } from "../../src/db/schema";
import type { UserRecord } from "../../src/db/user-body-queries";
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

type ApiHandlers =
  typeof import("../../src/lib/auth-enforcement-handlers.server");

let apiHandlers: Pick<
  ApiHandlers,
  | "executeAddWorkoutSet"
  | "executeDeleteWorkoutSet"
  | "executeGetSyncedClientIds"
  | "executeUnsubscribePush"
>;

interface TwoUserFixture {
  exerciseId: number;
  owner: UserRecord;
  other: UserRecord;
  ownerSessionId: number;
  otherSessionId: number;
  otherSetId: number;
  ownerClientId: string;
  otherClientId: string;
  otherEndpoint: string;
}

function seedTwoUsers(): TwoUserFixture {
  const db = ensureDb();
  const ownerId = db.insert(schema.users).values({}).returning().get().id;
  const otherId = db.insert(schema.users).values({}).returning().get().id;
  const exerciseId = db
    .insert(schema.exercises)
    .values({ muscleGroup: "chest", name: "Bench Press" })
    .returning()
    .get().id;

  const ownerSessionId = db
    .insert(schema.workoutSessions)
    .values({ date: "2026-07-28", name: "Owner Push", userId: ownerId })
    .returning()
    .get().id;
  const otherSessionId = db
    .insert(schema.workoutSessions)
    .values({ date: "2026-07-28", name: "Other Push", userId: otherId })
    .returning()
    .get().id;

  const otherSetId = db
    .insert(schema.workoutSets)
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
    other,
    otherClientId,
    otherEndpoint,
    otherSessionId,
    otherSetId,
    owner,
    ownerClientId,
    ownerSessionId,
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

function snapshotDatabase(): Buffer {
  return dbFixture.sqlite!.serialize();
}

describe("auth enforcement batch 1 (issue #80)", () => {
  beforeAll(async () => {
    apiHandlers =
      await import("../../src/lib/auth-enforcement-handlers.server");
  });

  beforeEach(() => {
    closeDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
  });

  describe("executeAddWorkoutSet", () => {
    it("throws UnauthorizedError without a session and leaves the database unchanged", async () => {
      seedTwoUsers();
      const before = snapshotDatabase();
      requireAuthMock.mockRejectedValue(new TestUnauthorizedError());
      await expect(
        apiHandlers.executeAddWorkoutSet({
          exercise_id: 1,
          reps: 5,
          session_id: 1,
          set_number: 1,
          weight_kg: 50,
        })
      ).rejects.toBeInstanceOf(TestUnauthorizedError);
      expect(snapshotDatabase().equals(before)).toBe(true);
    });

    it("does not insert a set for another user's session", async () => {
      const fixture = seedTwoUsers();
      mockAuthAs(fixture.owner);
      const beforeCount = ensureDb()
        .select({ count: count() })
        .from(workoutSets)
        .get()?.count;

      const missingShape = await apiHandlers.executeAddWorkoutSet({
        exercise_id: fixture.exerciseId,
        reps: 5,
        session_id: 9_999_999,
        set_number: 1,
        weight_kg: 50,
      });
      const result = await apiHandlers.executeAddWorkoutSet({
        exercise_id: fixture.exerciseId,
        reps: 5,
        session_id: fixture.otherSessionId,
        set_number: 1,
        weight_kg: 50,
      });

      const afterCount = ensureDb()
        .select({ count: count() })
        .from(workoutSets)
        .get()?.count;

      expect(result).toEqual(missingShape);
      expect(result).toBeNull();
      expect(afterCount).toBe(beforeCount);
    });

    it("inserts a set when the session belongs to the caller", async () => {
      const fixture = seedTwoUsers();
      mockAuthAs(fixture.owner);

      const result = await apiHandlers.executeAddWorkoutSet({
        exercise_id: fixture.exerciseId,
        reps: 5,
        session_id: fixture.ownerSessionId,
        set_number: 1,
        weight_kg: 50,
      });

      expect(result).not.toBeNull();
      expect(result?.session_id).toBe(fixture.ownerSessionId);
      expect(result?.exercise_id).toBe(fixture.exerciseId);
      expect(result?.reps).toBe(5);
      expect(result?.weight_kg).toBe(50);

      const stored = ensureDb()
        .select({ id: workoutSets.id, sessionId: workoutSets.sessionId })
        .from(workoutSets)
        .where(eq(workoutSets.id, result!.id))
        .get();
      expect(stored?.sessionId).toBe(fixture.ownerSessionId);
    });
  });

  describe("executeDeleteWorkoutSet", () => {
    it("throws UnauthorizedError without a session and leaves the database unchanged", async () => {
      const fixture = seedTwoUsers();
      const before = snapshotDatabase();
      requireAuthMock.mockRejectedValue(new TestUnauthorizedError());
      await expect(
        apiHandlers.executeDeleteWorkoutSet({ id: fixture.otherSetId })
      ).rejects.toBeInstanceOf(TestUnauthorizedError);
      expect(snapshotDatabase().equals(before)).toBe(true);
    });

    it("does not delete another user's set", async () => {
      const fixture = seedTwoUsers();
      mockAuthAs(fixture.owner);

      const missingShape = await apiHandlers.executeDeleteWorkoutSet({
        id: 9_999_999,
      });
      const result = await apiHandlers.executeDeleteWorkoutSet({
        id: fixture.otherSetId,
      });

      const remaining = ensureDb()
        .select({ id: workoutSets.id })
        .from(workoutSets)
        .where(eq(workoutSets.id, fixture.otherSetId))
        .get();

      expect(result).toEqual(missingShape);
      expect(result).toEqual({ success: true });
      expect(remaining?.id).toBe(fixture.otherSetId);
    });

    it("deletes a set owned by the caller", async () => {
      const fixture = seedTwoUsers();
      mockAuthAs(fixture.owner);
      const ownSetId = ensureDb()
        .insert(workoutSets)
        .values({
          exerciseId: fixture.exerciseId,
          reps: 5,
          rpe: 8,
          sessionId: fixture.ownerSessionId,
          setNumber: 1,
          weightKg: 70,
        })
        .returning()
        .get().id;

      const result = await apiHandlers.executeDeleteWorkoutSet({
        id: ownSetId,
      });

      const remaining = ensureDb()
        .select({ id: workoutSets.id })
        .from(workoutSets)
        .where(eq(workoutSets.id, ownSetId))
        .get();

      expect(result).toEqual({ success: true });
      expect(remaining).toBeUndefined();
    });
  });

  describe("executeGetSyncedClientIds", () => {
    it("throws UnauthorizedError without a session and leaves the database unchanged", async () => {
      seedTwoUsers();
      const before = snapshotDatabase();
      requireAuthMock.mockRejectedValue(new TestUnauthorizedError());
      await expect(
        apiHandlers.executeGetSyncedClientIds({
          client_ids: ["owner-sync-client"],
        })
      ).rejects.toBeInstanceOf(TestUnauthorizedError);
      expect(snapshotDatabase().equals(before)).toBe(true);
    });

    it("returns only the caller's applied client ids", async () => {
      const fixture = seedTwoUsers();
      mockAuthAs(fixture.owner);

      const result = await apiHandlers.executeGetSyncedClientIds({
        client_ids: [fixture.ownerClientId, fixture.otherClientId],
      });

      expect(result).toEqual({ client_ids: [fixture.ownerClientId] });
    });
  });

  describe("executeUnsubscribePush", () => {
    it("throws UnauthorizedError without a session and leaves the database unchanged", async () => {
      const fixture = seedTwoUsers();
      const before = snapshotDatabase();
      requireAuthMock.mockRejectedValue(new TestUnauthorizedError());
      await expect(
        apiHandlers.executeUnsubscribePush({ endpoint: fixture.otherEndpoint })
      ).rejects.toBeInstanceOf(TestUnauthorizedError);
      expect(snapshotDatabase().equals(before)).toBe(true);
    });

    it("does not delete another user's push subscription", async () => {
      const fixture = seedTwoUsers();
      mockAuthAs(fixture.owner);

      const result = await apiHandlers.executeUnsubscribePush({
        endpoint: fixture.otherEndpoint,
      });

      const remaining = ensureDb()
        .select({ endpoint: pushSubscriptions.endpoint })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, fixture.otherEndpoint))
        .get();

      expect(result).toEqual({ ok: true });
      expect(remaining?.endpoint).toBe(fixture.otherEndpoint);
    });

    it("deletes the caller's own push subscription by endpoint", async () => {
      const fixture = seedTwoUsers();
      mockAuthAs(fixture.owner);
      const ownEndpoint = "https://push.example.test/owner-user";
      ensureDb()
        .insert(pushSubscriptions)
        .values({
          auth: "auth-key",
          createdAt: "2026-07-28T12:00:00.000Z",
          endpoint: ownEndpoint,
          p256dh: "p256dh-key",
          userId: fixture.owner.id,
        })
        .run();

      const result = await apiHandlers.executeUnsubscribePush({
        endpoint: ownEndpoint,
      });

      const remaining = ensureDb()
        .select({ endpoint: pushSubscriptions.endpoint })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, ownEndpoint))
        .get();

      expect(result).toEqual({ ok: true });
      expect(remaining).toBeUndefined();
    });
  });
});
