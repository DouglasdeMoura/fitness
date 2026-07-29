import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";

import { readJournalMigrationTags } from "../../src/db/migration-diagnostics";

const fixtureDirectory = import.meta.dirname;

export const PRE_COLLAPSE_MIGRATIONS_FOLDER = join(
  fixtureDirectory,
  "fixtures",
  "pre-collapse-migrations"
);

export const CURRENT_MIGRATIONS_FOLDER = join(process.cwd(), "drizzle");

export interface JournalCollapseDbFixture {
  cleanup: () => void;
  dbPath: string;
  workoutSessionCount: number;
}

export interface UnrecognizedJournalDbFixture {
  cleanup: () => void;
  dbPath: string;
}

function readPreCollapseMigrationSqlFiles(): string[] {
  return readJournalMigrationTags(PRE_COLLAPSE_MIGRATIONS_FOLDER).map(
    (tag) => `${tag}.sql`
  );
}

function execMigrationSql(
  sqlite: Database.Database,
  fileName: string,
  migrationsFolder: string
): void {
  const migrationSql = readFileSync(join(migrationsFolder, fileName), "utf-8");
  for (const statement of migrationSql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) {
      sqlite.exec(trimmed);
    }
  }
}

function recordAppliedMigrations(
  sqlite: Database.Database,
  appliedCount: number,
  migrationsFolder: string
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

function countTableRows(sqlite: Database.Database, tableName: string): number {
  return (
    sqlite.prepare(`SELECT COUNT(*) AS count FROM \`${tableName}\``).get() as {
      count: number;
    }
  ).count;
}

/**
 * Database whose live schema reflects the full pre-collapse migration history
 * while `__drizzle_migrations` still records only pre-collapse hashes.
 */
export function createJournalCollapseDbFixture(
  workoutSessionCount = 5
): JournalCollapseDbFixture {
  const scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-journal-collapse-"));
  const dbPath = join(scratchRoot, "fittrack.db");
  const sqlite = new Database(dbPath);
  const migrationFiles = readPreCollapseMigrationSqlFiles();

  for (const fileName of migrationFiles) {
    execMigrationSql(sqlite, fileName, PRE_COLLAPSE_MIGRATIONS_FOLDER);
  }

  recordAppliedMigrations(
    sqlite,
    migrationFiles.length - 1,
    PRE_COLLAPSE_MIGRATIONS_FOLDER
  );

  const userId = sqlite.prepare("INSERT INTO users DEFAULT VALUES").run()
    .lastInsertRowid as number;
  const insertWorkout = sqlite.prepare(
    "INSERT INTO workout_sessions (user_id, date) VALUES (?, ?)"
  );
  for (let index = 0; index < workoutSessionCount; index += 1) {
    insertWorkout.run(userId, "2026-07-29");
  }

  const recordedCount = countTableRows(sqlite, "workout_sessions");
  sqlite.close();

  return {
    cleanup: () => rmSync(scratchRoot, { force: true, recursive: true }),
    dbPath,
    workoutSessionCount: recordedCount,
  };
}

/**
 * Database that records only pre-collapse journal hashes with no application
 * schema, so recovery must refuse without `force`.
 */
export function createUnrecognizedJournalWithoutUsersFixture(): UnrecognizedJournalDbFixture {
  const scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-journal-refuse-"));
  const dbPath = join(scratchRoot, "fittrack.db");
  const sqlite = new Database(dbPath);

  recordAppliedMigrations(
    sqlite,
    readPreCollapseMigrationSqlFiles().length - 1,
    PRE_COLLAPSE_MIGRATIONS_FOLDER
  );
  sqlite.close();

  return {
    cleanup: () => rmSync(scratchRoot, { force: true, recursive: true }),
    dbPath,
  };
}

export function readWorkoutSessionCount(dbPath: string): number {
  const sqlite = new Database(dbPath, { readonly: true });
  const count = countTableRows(sqlite, "workout_sessions");
  sqlite.close();
  return count;
}

export function readMigrationJournalHashes(dbPath: string): string[] {
  const sqlite = new Database(dbPath, { readonly: true });
  const rows = sqlite
    .prepare("SELECT hash FROM __drizzle_migrations ORDER BY id")
    .all() as { hash: string }[];
  sqlite.close();
  return rows.map((row) => row.hash);
}

export function readCollapsedBaselineHash(): string {
  const [baselineMigration] = readMigrationFiles({
    migrationsFolder: CURRENT_MIGRATIONS_FOLDER,
  });
  if (!baselineMigration) {
    throw new Error("collapsed baseline migration folder is empty");
  }
  return baselineMigration.hash;
}
