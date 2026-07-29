import { unlinkSync } from "node:fs";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";

import {
  getMigrationsFolder,
  readJournalMigrationTags,
  runMigrations,
} from "./migration-diagnostics";
import * as relations from "./relations";
import * as schema from "./schema";

const AUTH_TABLES = ["user", "session", "account", "verification"] as const;

const APPLIED_MIGRATION_MARKERS: {
  tag: string;
  isApplied: (sqlite: Database.Database) => boolean;
}[] = [
  {
    isApplied: (sqlite) =>
      tableExists(sqlite, "users") &&
      tableExists(sqlite, "user") &&
      columnExists(sqlite, "users", "theme_preference"),
    tag: "0000_real_the_renegades",
  },
];

export class DevDatabaseRecoveryError extends Error {
  readonly recoveryHint: string;

  constructor(message: string, recoveryHint: string) {
    super(message);
    this.name = "DevDatabaseRecoveryError";
    this.recoveryHint = recoveryHint;
  }
}

export interface RecoverDevDatabaseOptions {
  dbPath: string;
  force?: boolean;
  migrationsFolder?: string;
}

type RecoveryAction =
  | "repair"
  | "clear-unrecognized-journal"
  | "destructive-reset";

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return row !== undefined;
}

function columnExists(
  sqlite: Database.Database,
  tableName: string,
  columnName: string
): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as {
    name: string;
  }[];
  return columns.some((column) => column.name === columnName);
}

function readMigrationHashes(migrationsFolder: string): Set<string> {
  return new Set(
    readMigrationFiles({ migrationsFolder }).map((migration) => migration.hash)
  );
}

function readRecordedMigrationHashes(sqlite: Database.Database): string[] {
  if (!tableExists(sqlite, "__drizzle_migrations")) {
    return [];
  }
  const rows = sqlite
    .prepare("SELECT hash FROM __drizzle_migrations")
    .all() as { hash: string }[];
  return rows.map((row) => row.hash);
}

function countApplicationRows(sqlite: Database.Database): number {
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'"
    )
    .all() as { name: string }[];

  let total = 0;
  for (const { name } of tables) {
    const row = sqlite
      .prepare(`SELECT COUNT(*) AS count FROM "${name}"`)
      .get() as { count: number };
    total += row.count;
  }
  return total;
}

function backfillAppliedMigrationJournal(sqlite: Database.Database): void {
  const migrationsFolder = getMigrationsFolder();
  const migrations = readMigrationFiles({ migrationsFolder });
  const tags = readJournalMigrationTags(migrationsFolder);
  const recordedHashes = new Set(readRecordedMigrationHashes(sqlite));

  for (const marker of APPLIED_MIGRATION_MARKERS) {
    if (!marker.isApplied(sqlite)) {
      continue;
    }

    const migrationIndex = tags.indexOf(marker.tag);
    if (migrationIndex === -1) {
      continue;
    }

    const migration = migrations[migrationIndex];
    if (recordedHashes.has(migration.hash)) {
      continue;
    }

    sqlite
      .prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
      )
      .run(migration.hash, migration.folderMillis);
    recordedHashes.add(migration.hash);
  }
}

function resolveRecoveryAction(
  sqlite: Database.Database,
  force: boolean,
  migrationsFolder: string
): RecoveryAction {
  const knownHashes = readMigrationHashes(migrationsFolder);
  const unrecognizedHashes = readRecordedMigrationHashes(sqlite).filter(
    (hash) => !knownHashes.has(hash)
  );

  if (unrecognizedHashes.length > 0 && !force) {
    throw new DevDatabaseRecoveryError(
      `Refusing to recover ${sqlite.name}: __drizzle_migrations has ${unrecognizedHashes.length} unrecognized row(s).`,
      "Re-run with --force only if you accept deleting the database file and re-migrating from scratch."
    );
  }

  if (
    unrecognizedHashes.length > 0 &&
    force &&
    countApplicationRows(sqlite) > 0
  ) {
    return "destructive-reset";
  }

  if (unrecognizedHashes.length > 0 && force) {
    return "clear-unrecognized-journal";
  }

  return "repair";
}

function runPendingMigrations(
  sqlite: Database.Database,
  dbPath: string,
  migrationsFolder: string
): void {
  const fullSchema = { ...schema, ...relations };
  const drizzleDb = drizzle(sqlite, { schema: fullSchema });
  runMigrations(drizzleDb, {
    dbPath,
    migrationsFolder,
  });
}

function assertAuthTablesExist(sqlite: Database.Database): void {
  const missingTables = AUTH_TABLES.filter(
    (tableName) => !tableExists(sqlite, tableName)
  );
  if (missingTables.length > 0) {
    throw new DevDatabaseRecoveryError(
      `Recovery finished but auth tables are still missing: ${missingTables.join(", ")}`,
      "Inspect drizzle migrations and rerun npm run db:reset-dev."
    );
  }
}

function assertMigrationJournalPopulated(sqlite: Database.Database): void {
  const row = sqlite
    .prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations")
    .get() as { count: number };
  if (row.count === 0) {
    throw new DevDatabaseRecoveryError(
      `Recovery finished but __drizzle_migrations is still empty for ${sqlite.name}.`,
      "Inspect drizzle migrations and rerun npm run db:reset-dev."
    );
  }
}

/**
 * Repairs a development database whose schema and migration journal are out of
 * sync. Backfills journal rows for migrations already reflected in the schema,
 * then runs pending migrations. Refuses destructive recovery when the database
 * holds unrecognized migration rows unless `force` is true.
 *
 * @example
 * recoverDevDatabase({ dbPath: "data/fittrack.db" });
 */
/** Journal tags with schema-detection markers used during dev recovery backfill. */
export function readAppliedMigrationMarkerTags(): string[] {
  return APPLIED_MIGRATION_MARKERS.map((marker) => marker.tag);
}

export function recoverDevDatabase(options: RecoverDevDatabaseOptions): void {
  const migrationsFolder = options.migrationsFolder ?? getMigrationsFolder();
  const force = options.force ?? false;
  let sqlite = new Database(options.dbPath);
  const recoveryAction = resolveRecoveryAction(sqlite, force, migrationsFolder);

  if (recoveryAction === "destructive-reset") {
    sqlite.close();
    unlinkSync(options.dbPath);
    sqlite = new Database(options.dbPath);
  } else {
    if (recoveryAction === "clear-unrecognized-journal") {
      sqlite.exec("DELETE FROM __drizzle_migrations");
    }
    backfillAppliedMigrationJournal(sqlite);
  }

  runPendingMigrations(sqlite, options.dbPath, migrationsFolder);

  assertAuthTablesExist(sqlite);
  assertMigrationJournalPopulated(sqlite);
  sqlite.close();
}
