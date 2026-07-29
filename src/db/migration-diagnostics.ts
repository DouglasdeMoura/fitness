import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

interface JournalEntry {
  tag: string;
  when: number;
}

interface MigrationJournal {
  entries: JournalEntry[];
}

type MigratingDatabase = BetterSQLite3Database<Record<string, unknown>> & {
  $client: InstanceType<typeof Database>;
};

export class DatabaseMigrationError extends Error {
  readonly dbPath: string;
  readonly migrationTag: string;
  readonly sqliteMessage: string;

  constructor(
    dbPath: string,
    migrationTag: string,
    sqliteMessage: string,
    cause: unknown
  ) {
    super(
      `Database migration failed for ${dbPath} at migration ${migrationTag}: ${sqliteMessage}`
    );
    this.name = "DatabaseMigrationError";
    this.dbPath = dbPath;
    this.migrationTag = migrationTag;
    this.sqliteMessage = sqliteMessage;
    this.cause = cause;
  }
}

function readMigrationJournal(migrationsFolder: string): MigrationJournal {
  const journalPath = join(migrationsFolder, "meta", "_journal.json");
  return JSON.parse(readFileSync(journalPath, "utf-8")) as MigrationJournal;
}

function extractQueryFromDrizzleError(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const match = error.message.match(/Failed to run the query '([\s\S]*?)'\s*$/);
  return match?.[1];
}

function extractSqliteMessage(error: unknown): string {
  if (error instanceof Error && error.cause instanceof Error) {
    return error.cause.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function readLastAppliedMigrationCreatedAt(
  drizzleDb: MigratingDatabase
): number | undefined {
  try {
    const row = drizzleDb.$client
      .prepare(
        "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1"
      )
      .get() as { created_at: number | string } | undefined;
    if (!row) {
      return undefined;
    }
    return Number(row.created_at);
  } catch {
    return undefined;
  }
}

function resolveFirstPendingMigrationTag(
  migrationsFolder: string,
  lastAppliedCreatedAt: number | undefined
): string {
  const journal = readMigrationJournal(migrationsFolder);
  const migrations = readMigrationFiles({ migrationsFolder });

  for (let index = 0; index < migrations.length; index++) {
    const migration = migrations[index];
    if (
      lastAppliedCreatedAt === undefined ||
      lastAppliedCreatedAt < migration.folderMillis
    ) {
      return journal.entries[index]?.tag ?? "unknown";
    }
  }

  return "unknown";
}

function migrationContainsQuerySnippet(
  migration: { sql: string[] },
  querySnippet: string
): boolean {
  const prefix = querySnippet.slice(0, 60).trim();
  return migration.sql.some((statement) => statement.trim().startsWith(prefix));
}

function resolveFailingMigrationTag(
  error: unknown,
  migrationsFolder: string,
  drizzleDb: MigratingDatabase
): string {
  const lastAppliedCreatedAt = readLastAppliedMigrationCreatedAt(drizzleDb);
  const pendingTag = resolveFirstPendingMigrationTag(
    migrationsFolder,
    lastAppliedCreatedAt
  );

  const querySnippet = extractQueryFromDrizzleError(error);
  if (!querySnippet || pendingTag === "unknown") {
    return pendingTag;
  }

  const journal = readMigrationJournal(migrationsFolder);
  const migrations = readMigrationFiles({ migrationsFolder });
  const pendingIndex = journal.entries.findIndex(
    (entry) => entry.tag === pendingTag
  );
  const pendingMigration = migrations[pendingIndex];
  if (
    pendingMigration &&
    migrationContainsQuerySnippet(pendingMigration, querySnippet)
  ) {
    return pendingTag;
  }

  return pendingTag;
}

/**
 * Runs Drizzle migrations and throws `DatabaseMigrationError` with the database
 * path, migration tag, and SQLite message on failure.
 *
 * @example
 * runMigrations(drizzleDb, { dbPath: "/tmp/fittrack.db" });
 */
export function runMigrations(
  drizzleDb: MigratingDatabase,
  options: { dbPath: string; migrationsFolder?: string }
): void {
  const migrationsFolder =
    options.migrationsFolder ?? join(process.cwd(), "drizzle");
  try {
    migrate(drizzleDb, { migrationsFolder });
  } catch (error) {
    const migrationTag = resolveFailingMigrationTag(
      error,
      migrationsFolder,
      drizzleDb
    );
    const sqliteMessage = extractSqliteMessage(error);
    throw new DatabaseMigrationError(
      options.dbPath,
      migrationTag,
      sqliteMessage,
      error
    );
  }
}

export function getMigrationsFolder(): string {
  return join(process.cwd(), "drizzle");
}

export function readJournalMigrationTags(migrationsFolder: string): string[] {
  return readMigrationJournal(migrationsFolder).entries.map(
    (entry) => entry.tag
  );
}
