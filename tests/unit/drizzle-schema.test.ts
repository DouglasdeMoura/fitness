import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import * as schema from "../../src/db/schema";
import { readAllMigrationSql } from "./migration-sql";

const EXPECTED_TABLES = [
  "account",
  "body_logs",
  "exercises",
  "food_log",
  "foods",
  "meal_plans",
  "meal_template_items",
  "meal_templates",
  "notification_deliveries",
  "notification_preferences",
  "program_days",
  "program_exercises",
  "programs",
  "push_subscriptions",
  "session",
  "sync_queue",
  "user",
  "users",
  "verification",
  "workout_sessions",
  "workout_sets",
];

describe("Drizzle schema", () => {
  it("migrates every FitTrack table and supports typed queries", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(readAllMigrationSql());

    const tableNames = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .pluck()
      .all();
    expect(tableNames).toStrictEqual(EXPECTED_TABLES);

    const db = drizzle(sqlite, { schema });
    const insertedUsers = await db
      .insert(schema.users)
      .values({ email: "athlete@example.com" })
      .returning();
    expect(insertedUsers[0]).toMatchObject({
      activityLevel: "moderate",
      email: "athlete@example.com",
      goalType: "build_muscle",
      name: "Athlete",
      sex: "male",
    });

    sqlite.close();
  });

  it("exposes the required constrained values as Drizzle enums", () => {
    const usersConfig = getTableConfig(schema.users);
    const foodLogConfig = getTableConfig(schema.foodLog);
    const enumValues = (columnName: string) =>
      [...usersConfig.columns, ...foodLogConfig.columns].find(
        (column) => column.name === columnName
      )?.enumValues;

    expect(enumValues("sex")).toStrictEqual(["male", "female", "other"]);
    expect(enumValues("activity_level")).toStrictEqual([
      "sedentary",
      "light",
      "moderate",
      "active",
      "very_active",
    ]);
    expect(enumValues("goal_type")).toStrictEqual([
      "lose_fat",
      "build_muscle",
      "maintain",
      "recomp",
    ]);
    expect(enumValues("meal_type")).toStrictEqual([
      "breakfast",
      "lunch",
      "dinner",
      "snack",
    ]);
  });

  it("stores fitness profile defaults on the Better Auth user table (issue #42)", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(readAllMigrationSql());
    const db = drizzle(sqlite, { schema });
    const inserted = await db
      .insert(schema.user)
      .values({
        email: "auth@example.com",
        id: "usr_test",
        name: "Auth Athlete",
      })
      .returning();
    expect(inserted[0]).toMatchObject({
      activityLevel: "moderate",
      goalType: "build_muscle",
      sex: "male",
    });
    sqlite.close();
  });
});
