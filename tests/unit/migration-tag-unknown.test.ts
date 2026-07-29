import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it, vi } from "vitest";

import {
  DatabaseMigrationError,
  runMigrations,
} from "../../src/db/migration-diagnostics";
import {
  execMigrationSql,
  getMigrationsFolder,
  recordAppliedMigrations,
} from "./db-migration-fixture";

vi.mock("drizzle-orm/better-sqlite3/migrator", () => ({
  migrate: vi.fn(),
}));

describe("resolveFailingMigrationTag unknown fallback (issue #110)", () => {
  it('reports "unknown" when every migration is already recorded as applied', () => {
    const scratchRoot = mkdtempSync(
      join(tmpdir(), "fittrack-migrate-unknown-")
    );
    const dbPath = join(scratchRoot, "fittrack.db");
    const sqlite = new Database(dbPath);
    const migrationsFolder = getMigrationsFolder();

    try {
      for (const fileName of [
        "0000_jazzy_zaran.sql",
        "0001_busy_misty_knight.sql",
        "0002_conscious_doomsday.sql",
        "0003_sync_queue_user_id.sql",
        "0004_theme_preference.sql",
      ]) {
        execMigrationSql(sqlite, fileName);
      }
      recordAppliedMigrations(sqlite, 5, migrationsFolder);

      vi.mocked(migrate).mockImplementation(() => {
        throw new Error("synthetic migration failure", {
          cause: new Error("synthetic sqlite failure"),
        });
      });

      try {
        runMigrations(drizzle(sqlite), { dbPath, migrationsFolder });
        expect.unreachable("runMigrations should have failed");
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseMigrationError);
        expect(error).toMatchObject({
          dbPath,
          migrationTag: "unknown",
          name: "DatabaseMigrationError",
          sqliteMessage: "synthetic sqlite failure",
        });
        expect((error as DatabaseMigrationError).message).toMatch(
          /^Database migration failed for .+ at migration .+: .+$/
        );
        expect((error as DatabaseMigrationError).cause).toBeDefined();
      }
    } finally {
      sqlite.close();
      rmSync(scratchRoot, { force: true, recursive: true });
    }
  });
});
