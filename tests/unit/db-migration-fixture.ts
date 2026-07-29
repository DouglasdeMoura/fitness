import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";

/** Lexically ordered Drizzle SQL migrations through 0004 (issue #101). */
export const MIGRATION_SQL_FILES = [
  "0000_jazzy_zaran.sql",
  "0001_busy_misty_knight.sql",
  "0002_conscious_doomsday.sql",
  "0003_sync_queue_user_id.sql",
  "0004_theme_preference.sql",
] as const;

export interface UnmigratableDbFixture {
  cleanup: () => void;
  dbPath: string;
}

export interface ScratchMigrationDbFixture {
  cleanup: () => void;
  dbPath: string;
  migrationsFolder: string;
  sqlite: Database.Database;
}

export function getMigrationsFolder(): string {
  return join(process.cwd(), "drizzle");
}

export function execMigrationSql(
  sqlite: Database.Database,
  fileName: string,
  migrationsFolder = getMigrationsFolder()
): void {
  const migrationSql = readFileSync(join(migrationsFolder, fileName), "utf-8");
  for (const statement of migrationSql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) {
      sqlite.exec(trimmed);
    }
  }
}

export function recordAppliedMigrations(
  sqlite: Database.Database,
  appliedCount: number,
  migrationsFolder = getMigrationsFolder()
): void {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)"
  );
  const migrations = readMigrationFiles({ migrationsFolder });
  const insertMigration = sqlite.prepare(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
  );
  for (const migration of migrations.slice(0, appliedCount)) {
    insertMigration.run(migration.hash, migration.folderMillis);
  }
}

/**
 * Empty on-disk database for incremental migration tests (issues #89, #101).
 *
 * @example
 * const fixture = createScratchMigrationDb();
 * execMigrationSql(fixture.sqlite, MIGRATION_SQL_FILES[0]);
 * fixture.cleanup();
 */
export function createScratchMigrationDb(
  prefix = "fittrack-migrate-"
): ScratchMigrationDbFixture {
  const scratchRoot = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(scratchRoot, "fittrack.db");
  const migrationsFolder = getMigrationsFolder();
  const sqlite = new Database(dbPath);

  return {
    cleanup: () => {
      sqlite.close();
      rmSync(scratchRoot, { force: true, recursive: true });
    },
    dbPath,
    migrationsFolder,
    sqlite,
  };
}

/**
 * Builds the unmigratable state from PRD 17: 0000 schema present, empty journal.
 *
 * @example
 * const fixture = createUnmigratableDbFixture();
 * recoverDevDatabase({ dbPath: fixture.dbPath });
 * fixture.cleanup();
 */
export function createUnmigratableDbFixture(): UnmigratableDbFixture {
  const scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-unmigratable-"));
  const dbPath = join(scratchRoot, "fittrack.db");
  const migrationSql = readFileSync(
    join(process.cwd(), "drizzle", "0000_jazzy_zaran.sql"),
    "utf-8"
  );

  const sqlite = new Database(dbPath);
  for (const statement of migrationSql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) {
      sqlite.exec(trimmed);
    }
  }

  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)"
  );
  sqlite.close();

  return {
    cleanup: () => rmSync(scratchRoot, { force: true, recursive: true }),
    dbPath,
  };
}
