import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import type { NotificationPreferences } from "~/lib/push";
import {
  defaultNotificationPreferences,
  getNotificationPreferences,
  isInQuietHours,
  shouldDeliver,
} from "~/lib/push";

import type { FitTrackDatabase } from "../../src/db";
import * as relations from "../../src/db/relations";
import * as dbSchema from "../../src/db/schema";

function createTestDb(): FitTrackDatabase {
  const migrationSql = readFileSync(
    join(process.cwd(), "drizzle", "0000_jazzy_zaran.sql"),
    "utf-8"
  );
  const sqlite = new Database(":memory:");
  sqlite.exec(migrationSql);
  const db = drizzle(sqlite, { schema: { ...dbSchema, ...relations } });
  db.insert(dbSchema.users)
    .values({
      activityLevel: "moderate",
      goalType: "build_muscle",
      heightCm: 178,
      name: "Athlete",
      sex: "male",
    })
    .run();
  return db;
}

function enabledMealPrefs(
  overrides: Partial<NotificationPreferences> = {}
): NotificationPreferences {
  return {
    ...defaultNotificationPreferences(),
    meal_reminders: true,
    meal_times: ["12:00"],
    quiet_end: null,
    quiet_start: null,
    ...overrides,
  };
}

describe("getNotificationPreferences for a fresh user", () => {
  it("defaults every reminder type to off with no schedule", () => {
    const db = createTestDb();
    const prefs = getNotificationPreferences(db, 1);

    expect(prefs).toStrictEqual(defaultNotificationPreferences());
  });
});

describe(isInQuietHours, () => {
  const start = "22:00";
  const end = "07:00";

  it("suppresses inside a midnight-crossing window including start boundary", () => {
    expect(
      isInQuietHours(new Date("2026-01-01T22:00:00"), start, end)
    ).toBeTruthy();
    expect(
      isInQuietHours(new Date("2026-01-01T03:00:00"), start, end)
    ).toBeTruthy();
    expect(
      isInQuietHours(new Date("2026-01-01T06:59:00"), start, end)
    ).toBeTruthy();
  });

  it("allows immediately before start and at end boundary", () => {
    expect(
      isInQuietHours(new Date("2026-01-01T21:59:00"), start, end)
    ).toBeFalsy();
    expect(
      isInQuietHours(new Date("2026-01-01T07:00:00"), start, end)
    ).toBeFalsy();
  });

  it("handles same-day windows with inclusive start and exclusive end", () => {
    expect(
      isInQuietHours(new Date("2026-01-01T12:00:00"), "12:00", "13:00")
    ).toBeTruthy();
    expect(
      isInQuietHours(new Date("2026-01-01T13:00:00"), "12:00", "13:00")
    ).toBeFalsy();
    expect(
      isInQuietHours(new Date("2026-01-01T11:59:00"), "12:00", "13:00")
    ).toBeFalsy();
  });
});

describe(shouldDeliver, () => {
  it("delivers on schedule when type is enabled and outside quiet hours", () => {
    const prefs = enabledMealPrefs();
    const now = new Date("2026-01-05T12:00:00");

    expect(shouldDeliver(now, prefs, "meal_reminder")).toBeTruthy();
  });

  it("suppresses delivery during quiet hours including midnight-crossing windows", () => {
    const prefs = enabledMealPrefs({
      meal_times: ["03:00", "07:00"],
      quiet_end: "07:00",
      quiet_start: "22:00",
    });

    expect(
      shouldDeliver(new Date("2026-01-05T03:00:00"), prefs, "meal_reminder")
    ).toBeFalsy();
    expect(
      shouldDeliver(new Date("2026-01-05T22:00:00"), prefs, "meal_reminder")
    ).toBeFalsy();
    expect(
      shouldDeliver(new Date("2026-01-05T21:59:00"), prefs, "meal_reminder")
    ).toBeFalsy();
    expect(
      shouldDeliver(new Date("2026-01-05T06:59:00"), prefs, "meal_reminder")
    ).toBeFalsy();
    expect(
      shouldDeliver(new Date("2026-01-05T07:00:00"), prefs, "meal_reminder")
    ).toBeTruthy();
  });

  it("never delivers when the reminder type is disabled", () => {
    const prefs = enabledMealPrefs({ meal_reminders: false });
    const now = new Date("2026-01-05T12:00:00");

    expect(shouldDeliver(now, prefs, "meal_reminder")).toBeFalsy();
  });
});
