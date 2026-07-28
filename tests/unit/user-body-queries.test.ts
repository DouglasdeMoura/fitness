import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FitTrackDatabase } from "../../src/db";
import * as schema from "../../src/db/schema";
import {
  ensureDefaultUserRecord,
  findLatestBodyweightRecord,
  listBodyLogRecords,
  updateUserRecord,
  upsertBodyweightRecord,
} from "../../src/db/user-body-queries";

let sqlite: Database.Database;
let testDb: FitTrackDatabase;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(
    readFileSync(
      join(process.cwd(), "drizzle", "0000_jazzy_zaran.sql"),
      "utf-8"
    )
  );
  testDb = drizzle(sqlite, { schema });
});

afterEach(() => sqlite.close());

describe("Drizzle user queries", () => {
  it("creates the default user once and returns the existing record", async () => {
    const createdUser = await ensureDefaultUserRecord(testDb);
    const existingUser = await ensureDefaultUserRecord(testDb);

    expect(createdUser).toMatchObject({
      activityLevel: "moderate",
      goalType: "build_muscle",
      heightCm: 178,
      name: "Athlete",
      sex: "male",
    });
    expect(existingUser.id).toBe(createdUser.id);
    expect(await testDb.query.users.findMany()).toHaveLength(1);
  });

  it("updates only the supplied profile fields", async () => {
    const user = await ensureDefaultUserRecord(testDb);

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

describe("Drizzle body-log queries", () => {
  it("lists newest records first and applies the requested limit", async () => {
    const user = await ensureDefaultUserRecord(testDb);
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
    const user = await ensureDefaultUserRecord(testDb);
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
    const user = await ensureDefaultUserRecord(testDb);
    await testDb.insert(schema.bodyLogs).values([
      { date: "2026-07-27", userId: user.id, weightKg: 80 },
      { date: "2026-07-28", userId: user.id, waistCm: 82 },
    ]);

    const latestRecord = await findLatestBodyweightRecord(testDb, user.id);

    expect(latestRecord?.date).toBe("2026-07-27");
    expect(latestRecord?.weightKg).toBe(80);
  });
});
