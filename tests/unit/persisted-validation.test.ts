import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultNotificationPreferences,
  getNotificationPreferences,
} from "~/lib/notification-preferences";
import {
  getRestTimerSnapshot,
  resetRestTimerModule,
  restoreRestTimerFromSession,
} from "~/lib/rest-timer";
import { parseImportFile } from "~/lib/settings";
import { readQueuedMutations } from "~/lib/sync";

import type { FitTrackDatabase } from "../../src/db";
import { upsertNotificationPreferencesRow } from "../../src/db/notification-queries";
import * as relations from "../../src/db/relations";
import * as dbSchema from "../../src/db/schema";
import { readAllMigrationSql } from "./migration-sql";

const SESSION_KEY = "fittrack-rest-timer";

function createSessionStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function createTestDb(): FitTrackDatabase {
  const migrationSql = readAllMigrationSql();
  const sqlite = new Database(":memory:");
  sqlite.exec(migrationSql);
  const db = drizzle(sqlite, { schema: { ...dbSchema, ...relations } });
  db.insert(dbSchema.users)
    .values({
      activityLevel: "moderate",
      birthDate: "1990-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
      email: "test@example.com",
      goal: "maintain",
      heightCm: 175,
      id: 1,
      name: "Test User",
      sex: "male",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
    .run();
  return db;
}

function lastWarnPayload(warn: ReturnType<typeof vi.spyOn>) {
  const call = warn.mock.calls.at(-1)?.[0];
  expect(call).toBeDefined();
  return JSON.parse(String(call));
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", createSessionStorageMock());
});

afterEach(() => {
  resetRestTimerModule();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("persisted state rehydration (issue #72)", () => {
  it("returns the default rest timer snapshot when session storage is garbage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    sessionStorage.setItem(SESSION_KEY, "not-json");
    expect(() => restoreRestTimerFromSession()).not.toThrow();
    expect(getRestTimerSnapshot()).toEqual({
      durationMs: null,
      endAtMs: null,
      lastRpe: null,
    });

    const payload = lastWarnPayload(warn);
    expect(payload.event).toBe("persisted_validation_failed");
    expect(payload.context).toBe(SESSION_KEY);
  });

  it("returns empty meal reminder times when the stored JSON column is garbage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = createTestDb();

    upsertNotificationPreferencesRow(db, {
      meal_reminders: 1,
      meal_times: "not-json",
      quiet_end: null,
      quiet_start: null,
      rest_timer: 0,
      user_id: 1,
      weekly_review: 0,
      weekly_review_day: null,
      weekly_review_time: null,
      workout_days: "[]",
      workout_reminders: 0,
      workout_time: null,
    });

    const prefs = getNotificationPreferences(db, 1);
    expect(prefs.meal_times).toEqual([]);

    const payload = lastWarnPayload(warn);
    expect(payload.context).toBe("notification_preferences.meal_times");
  });

  it("returns empty workout days when the stored JSON column is garbage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = createTestDb();

    upsertNotificationPreferencesRow(db, {
      meal_reminders: 0,
      meal_times: "[]",
      quiet_end: null,
      quiet_start: null,
      rest_timer: 0,
      user_id: 1,
      weekly_review: 0,
      weekly_review_day: null,
      weekly_review_time: null,
      workout_days: '{"old":"shape"}',
      workout_reminders: 1,
      workout_time: "09:00",
    });

    const prefs = getNotificationPreferences(db, 1);
    expect(prefs.workout_days).toEqual([]);

    const payload = lastWarnPayload(warn);
    expect(payload.context).toBe("notification_preferences.workout_days");
  });

  it("rejects a corrupt import file without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = parseImportFile(JSON.stringify({ app: "OtherApp" }));
    expect("error" in result).toBe(true);

    const payload = lastWarnPayload(warn);
    expect(payload.context).toBe("settings.import_file");
  });

  it("still returns documented defaults for a fresh notification preferences row", () => {
    const db = createTestDb();
    expect(getNotificationPreferences(db, 1)).toEqual(
      defaultNotificationPreferences()
    );
  });
});

describe("offline outbox rehydration (issue #72)", () => {
  it("drops a stale outbox entry with a structured log instead of replaying it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const staleEntry = {
      attempts: 0,
      client_id: "stale-entry",
      kind: "addFoodLogEntry",
      payload: {
        food_id: 1,
        meal_type: "breakfast",
        servings: 1,
      },
      queued_at: "2026-01-01T00:00:00.000Z",
    };

    const queued = readQueuedMutations([staleEntry]);
    expect(queued).toEqual([]);

    const payload = lastWarnPayload(warn);
    expect(payload.event).toBe("persisted_validation_failed");
    expect(payload.context).toBe("offline-outbox-entry");
  });

  it("keeps valid outbox entries for replay", () => {
    const validEntry = {
      attempts: 0,
      client_id: "valid-entry",
      kind: "deleteFoodLogEntry",
      payload: { id: 42 },
      queued_at: "2026-01-01T00:00:00.000Z",
    };

    const queued = readQueuedMutations([validEntry]);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.client_id).toBe("valid-entry");
  });
});
