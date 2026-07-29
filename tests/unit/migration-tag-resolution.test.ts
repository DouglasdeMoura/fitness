import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  DatabaseMigrationError,
  runMigrations,
} from "../../src/db/migration-diagnostics";
import {
  createScratchMigrationDb,
  createUnmigratableDbFixture,
  execMigrationSql,
  recordAppliedMigrations,
} from "./db-migration-fixture";

const MIGRATION_TAG_MESSAGE =
  /^Database migration failed for .+ at migration .+: .+$/;

function expectMigrationFailure(
  run: () => void,
  expected: {
    dbPath: string;
    migrationTag: string;
    sqliteMessage?: RegExp | string;
  }
): DatabaseMigrationError {
  try {
    run();
    expect.unreachable("runMigrations should have failed");
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseMigrationError);
    const migrationError = error as DatabaseMigrationError;
    expect(migrationError).toMatchObject({
      dbPath: expected.dbPath,
      migrationTag: expected.migrationTag,
      name: "DatabaseMigrationError",
    });
    expect(migrationError.message).toMatch(MIGRATION_TAG_MESSAGE);
    expect(migrationError.cause).toBeDefined();
    if (expected.sqliteMessage !== undefined) {
      if (expected.sqliteMessage instanceof RegExp) {
        expect(migrationError.sqliteMessage).toMatch(expected.sqliteMessage);
      } else {
        expect(migrationError.sqliteMessage).toBe(expected.sqliteMessage);
      }
    }
    return migrationError;
  }

  throw new Error("unreachable");
}

describe("resolveFailingMigrationTag by execution order (issue #110)", () => {
  it("reports 0000_jazzy_zaran when the first migration fails on an existing schema", () => {
    const fixture = createUnmigratableDbFixture();
    const sqlite = new Database(fixture.dbPath);

    try {
      expectMigrationFailure(
        () => runMigrations(drizzle(sqlite), { dbPath: fixture.dbPath }),
        {
          dbPath: fixture.dbPath,
          migrationTag: "0000_jazzy_zaran",
          sqliteMessage: /table [`']?body_logs[`']? already exists/i,
        }
      );
    } finally {
      sqlite.close();
      fixture.cleanup();
    }
  });

  it("reports 0003_sync_queue_user_id when replaying that migration onto an existing column", () => {
    const fixture = createScratchMigrationDb("fittrack-migrate-tag-0003-");
    const { migrationsFolder } = fixture;

    try {
      for (const fileName of [
        "0000_jazzy_zaran.sql",
        "0001_busy_misty_knight.sql",
        "0002_conscious_doomsday.sql",
        "0003_sync_queue_user_id.sql",
      ]) {
        execMigrationSql(fixture.sqlite, fileName, migrationsFolder);
      }
      recordAppliedMigrations(fixture.sqlite, 3, migrationsFolder);

      expectMigrationFailure(
        () =>
          runMigrations(drizzle(fixture.sqlite), {
            dbPath: fixture.dbPath,
            migrationsFolder,
          }),
        {
          dbPath: fixture.dbPath,
          migrationTag: "0003_sync_queue_user_id",
          sqliteMessage: /duplicate column name: [`']?user_id[`']?/i,
        }
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("reports 0004_theme_preference when replaying that migration onto an existing column", () => {
    const fixture = createScratchMigrationDb("fittrack-migrate-tag-0004-");
    const { migrationsFolder } = fixture;

    try {
      for (const fileName of [
        "0000_jazzy_zaran.sql",
        "0001_busy_misty_knight.sql",
        "0002_conscious_doomsday.sql",
        "0003_sync_queue_user_id.sql",
        "0004_theme_preference.sql",
      ]) {
        execMigrationSql(fixture.sqlite, fileName, migrationsFolder);
      }
      recordAppliedMigrations(fixture.sqlite, 4, migrationsFolder);

      expectMigrationFailure(
        () =>
          runMigrations(drizzle(fixture.sqlite), {
            dbPath: fixture.dbPath,
            migrationsFolder,
          }),
        {
          dbPath: fixture.dbPath,
          migrationTag: "0004_theme_preference",
          sqliteMessage: /duplicate column name: [`']?theme_preference[`']?/i,
        }
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("does not identify failing migrations via object-name substring scans", () => {
    const source = readFileSync(
      join(process.cwd(), "src/db/migration-diagnostics.ts"),
      "utf-8"
    );
    expect(source).not.toContain("statement.includes(objectName)");
    expect(source).not.toContain("extractObjectNameFromSqliteMessage");
  });
});
