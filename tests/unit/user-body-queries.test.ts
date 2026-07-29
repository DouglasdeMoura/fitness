import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FitTrackDatabase } from "../../src/db";
import * as schema from "../../src/db/schema";
import {
  ensureSessionUserRecord,
  findLatestBodyweightRecord,
  getThemePreferenceRecord,
  listBodyLogRecords,
  updateThemePreferenceRecord,
  updateUserRecord,
  upsertBodyweightRecord,
} from "../../src/db/user-body-queries";
import { readAllMigrationSql } from "./migration-sql";

let sqlite: Database.Database;
let testDb: FitTrackDatabase;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(readAllMigrationSql());
  testDb = drizzle(sqlite, { schema });
});

afterEach(() => sqlite.close());

describe("Drizzle user queries", () => {
  it("creates one legacy profile per auth user id", async () => {
    const authUser = {
      email: "runner@example.com",
      id: "auth-user-1",
      name: "Runner",
    };
    const createdUser = await ensureSessionUserRecord(testDb, authUser);
    const existingUser = await ensureSessionUserRecord(testDb, authUser);

    expect(createdUser.id).toBe(existingUser.id);
    expect(createdUser.authUserId).toBe("auth-user-1");
    expect(createdUser.email).toBe("runner@example.com");
    expect(await testDb.query.users.findMany()).toHaveLength(1);
  });

  it("updates only the supplied profile fields", async () => {
    const user = await ensureSessionUserRecord(testDb, {
      email: "athlete@example.com",
      id: "auth-athlete",
      name: "Athlete",
    });

    const updatedUser = await updateUserRecord(testDb, user.id, {
      activityLevel: "active",
      birthDate: "1990-05-20",
      heightCm: 181,
      name: "Updated Athlete",
    });

    expect(updatedUser).toMatchObject({
      activityLevel: "active",
      birthDate: "1990-05-20",
      heightCm: 181,
      id: user.id,
      name: "Updated Athlete",
    });
  });
});

describe("Drizzle theme-preference queries", () => {
  it("returns the system default for a new user", async () => {
    const user = await ensureSessionUserRecord(testDb, {
      email: "system@example.com",
      id: "auth-system",
      name: "System Athlete",
    });

    expect(schema.THEME_PREFERENCE_VALUES).toStrictEqual([
      "light",
      "dark",
      "system",
    ]);
    expect(await getThemePreferenceRecord(testDb, user.id)).toBe("system");
  });

  it("updates only the requested user's preference", async () => {
    const darkUser = await ensureSessionUserRecord(testDb, {
      email: "dark@example.com",
      id: "auth-dark",
      name: "Dark Athlete",
    });
    const systemUser = await ensureSessionUserRecord(testDb, {
      email: "unchanged@example.com",
      id: "auth-unchanged",
      name: "Unchanged Athlete",
    });

    const updatedUser = await updateThemePreferenceRecord(
      testDb,
      darkUser.id,
      "dark"
    );

    expect(updatedUser.themePreference).toBe("dark");
    expect(await getThemePreferenceRecord(testDb, darkUser.id)).toBe("dark");
    expect(await getThemePreferenceRecord(testDb, systemUser.id)).toBe(
      "system"
    );
  });
});

describe("Drizzle body-log queries", () => {
  it("lists newest records first and applies the requested limit", async () => {
    const user = await ensureSessionUserRecord(testDb, {
      email: "athlete@example.com",
      id: "auth-athlete",
      name: "Athlete",
    });
    await testDb.insert(schema.bodyLogs).values([
      { date: "2026-07-26", userId: user.id, weightKg: 81 },
      { date: "2026-07-28", userId: user.id, weightKg: 79 },
      { date: "2026-07-27", userId: user.id, weightKg: 80 },
    ]);

    const records = await listBodyLogRecords(testDb, user.id, 2);

    expect(records.map((record) => record.date)).toStrictEqual([
      "2026-07-28",
      "2026-07-27",
    ]);
  });

  it("upserts a daily weight while retaining an omitted body-fat value", async () => {
    const user = await ensureSessionUserRecord(testDb, {
      email: "athlete@example.com",
      id: "auth-athlete",
      name: "Athlete",
    });
    await upsertBodyweightRecord(testDb, user.id, {
      bodyFatPct: 18,
      date: "2026-07-28",
      notes: "Morning",
      weightKg: 80,
    });

    const updatedRecord = await upsertBodyweightRecord(testDb, user.id, {
      date: "2026-07-28",
      weightKg: 79.5,
    });

    expect(updatedRecord).toMatchObject({
      bodyFatPct: 18,
      date: "2026-07-28",
      notes: null,
      weightKg: 79.5,
    });
    expect(await testDb.query.bodyLogs.findMany()).toHaveLength(1);
  });

  it("returns the latest record that contains a weight", async () => {
    const user = await ensureSessionUserRecord(testDb, {
      email: "athlete@example.com",
      id: "auth-athlete",
      name: "Athlete",
    });
    await testDb.insert(schema.bodyLogs).values([
      { date: "2026-07-27", userId: user.id, weightKg: 80 },
      { date: "2026-07-28", userId: user.id, waistCm: 82 },
    ]);

    const latestRecord = await findLatestBodyweightRecord(testDb, user.id);

    expect(latestRecord?.date).toBe("2026-07-27");
    expect(latestRecord?.weightKg).toBe(80);
  });
});
