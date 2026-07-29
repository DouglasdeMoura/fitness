import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function extractObjectNameFromSqliteMessage(
  message: string
): string | undefined {
  const tableMatch = message.match(/table [`']?([^`']+)[`']? already exists/i);
  if (tableMatch) {
    return tableMatch[1];
  }
  const columnMatch = message.match(
    /duplicate column name: [`']?([^`']+)[`']?/i
  );
  return columnMatch?.[1];
}

function resolveFailingMigrationTag(
  error: unknown,
  migrationsFolder: string
): string {
  const journal = readMigrationJournal(migrationsFolder);
  const migrations = readMigrationFiles({ migrationsFolder });
  const querySnippet = extractQueryFromDrizzleError(error);
  const sqliteMessage = extractSqliteMessage(error);
  const objectName = extractObjectNameFromSqliteMessage(sqliteMessage);

  for (let index = 0; index < migrations.length; index++) {
    const tag = journal.entries[index]?.tag ?? "unknown";
    const migration = migrations[index];
    for (const statement of migration.sql) {
      const trimmedStatement = statement.trim();
      if (
        querySnippet &&
        trimmedStatement.startsWith(querySnippet.slice(0, 60).trim())
      ) {
        return tag;
      }
      if (objectName && statement.includes(objectName)) {
        return tag;
      }
    }
  }

  return journal.entries[0]?.tag ?? "unknown";
}

/**
 * Runs Drizzle migrations and throws `DatabaseMigrationError` with the database
 * path, migration tag, and SQLite message on failure.
 *
 * @example
 * runMigrations(drizzleDb, { dbPath: "/tmp/fittrack.db" });
 */
export function runMigrations(
  drizzleDb: BetterSQLite3Database<Record<string, unknown>>,
  options: { dbPath: string; migrationsFolder?: string }
): void {
  const migrationsFolder =
    options.migrationsFolder ?? join(process.cwd(), "drizzle");
  try {
    migrate(drizzleDb, { migrationsFolder });
  } catch (error) {
    const migrationTag = resolveFailingMigrationTag(error, migrationsFolder);
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
