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

interface SqliteForeignKeyRow {
  from: string;
  table: string;
}

/** Tables whose `user_id` (or equivalent) references `users.id`, via `PRAGMA foreign_key_list`. */
export function discoverTablesReferencingUsers(
  sqlite: Database.Database
): string[] {
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string }[];

  const childTables = new Set<string>();
  for (const { name } of tables) {
    const foreignKeys = sqlite.pragma(
      `foreign_key_list(${name})`
    ) as SqliteForeignKeyRow[];
    for (const foreignKey of foreignKeys) {
      if (foreignKey.table === "users") {
        childTables.add(name);
      }
    }
  }

  return [...childTables].sort();
}

export function countTableRows(
  sqlite: Database.Database,
  tableName: string
): number {
  return (
    sqlite.prepare(`SELECT COUNT(*) AS count FROM \`${tableName}\``).get() as {
      count: number;
    }
  ).count;
}

const MIGRATION_GATE_CHILD_SEED_ORDER = [
  "meal_templates",
  "meal_plans",
] as const;

function orderMigrationGateChildTables(childTables: string[]): string[] {
  return [...childTables].sort((left, right) => {
    const leftIndex = MIGRATION_GATE_CHILD_SEED_ORDER.indexOf(
      left as (typeof MIGRATION_GATE_CHILD_SEED_ORDER)[number]
    );
    const rightIndex = MIGRATION_GATE_CHILD_SEED_ORDER.indexOf(
      right as (typeof MIGRATION_GATE_CHILD_SEED_ORDER)[number]
    );

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

/**
 * Inserts one row per table that references `users.id` for migration gate tests.
 * Call after the user row exists; discovers child tables at runtime.
 */
export function seedMigrationGateChildRows(
  sqlite: Database.Database,
  userId: number
): string[] {
  const childTables = discoverTablesReferencingUsers(sqlite);
  const seededTables: string[] = [];

  const seedRow = (tableName: string, run: () => void): void => {
    run();
    seededTables.push(tableName);
  };

  for (const tableName of orderMigrationGateChildTables(childTables)) {
    switch (tableName) {
      case "body_logs": {
        seedRow(tableName, () => {
          sqlite
            .prepare("INSERT INTO body_logs (user_id, date) VALUES (?, ?)")
            .run(userId, "2026-07-29");
        });
        break;
      }
      case "food_log": {
        seedRow(tableName, () => {
          sqlite
            .prepare(
              "INSERT INTO food_log (user_id, date, calories, carbs_g, fat_g, protein_g) VALUES (?, ?, ?, ?, ?, ?)"
            )
            .run(userId, "2026-07-29", 100, 10, 5, 8);
        });
        break;
      }
      case "meal_templates": {
        seedRow(tableName, () => {
          sqlite
            .prepare("INSERT INTO meal_templates (user_id, name) VALUES (?, ?)")
            .run(userId, "Migration Gate Template");
        });
        break;
      }
      case "meal_plans": {
        const templateId = sqlite
          .prepare("SELECT id FROM meal_templates WHERE user_id = ? LIMIT 1")
          .get(userId) as { id: number } | undefined;
        if (!templateId) {
          throw new Error(
            "meal_plans seed requires a meal_templates row for the same user"
          );
        }
        seedRow(tableName, () => {
          sqlite
            .prepare(
              "INSERT INTO meal_plans (user_id, date, meal_type, template_id) VALUES (?, ?, ?, ?)"
            )
            .run(userId, "2026-07-29", "lunch", templateId.id);
        });
        break;
      }
      case "notification_deliveries": {
        seedRow(tableName, () => {
          sqlite
            .prepare(
              "INSERT INTO notification_deliveries (user_id, type, slot, delivered_at) VALUES (?, ?, ?, datetime('now'))"
            )
            .run(userId, "workout", "morning");
        });
        break;
      }
      case "notification_preferences": {
        seedRow(tableName, () => {
          sqlite
            .prepare(
              "INSERT INTO notification_preferences (user_id) VALUES (?)"
            )
            .run(userId);
        });
        break;
      }
      case "programs": {
        seedRow(tableName, () => {
          sqlite
            .prepare("INSERT INTO programs (user_id, name) VALUES (?, ?)")
            .run(userId, "Migration Gate Program");
        });
        break;
      }
      case "push_subscriptions": {
        seedRow(tableName, () => {
          sqlite
            .prepare(
              "INSERT INTO push_subscriptions (user_id, auth, endpoint, p256dh, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
            )
            .run(
              userId,
              "auth-token",
              `https://example.com/push/${userId}`,
              "p256dh-key"
            );
        });
        break;
      }
      case "sync_queue": {
        seedRow(tableName, () => {
          sqlite
            .prepare(
              "INSERT INTO sync_queue (client_id, kind, payload, queued_at, user_id) VALUES (?, ?, ?, datetime('now'), ?)"
            )
            .run(`migration-gate-${userId}`, "food_log", "{}", userId);
        });
        break;
      }
      case "workout_sessions": {
        seedRow(tableName, () => {
          sqlite
            .prepare(
              "INSERT INTO workout_sessions (user_id, date) VALUES (?, ?)"
            )
            .run(userId, "2026-07-29");
        });
        break;
      }
      default: {
        throw new Error(
          `No seed helper for child table "${tableName}" referencing users.id`
        );
      }
    }
  }

  return seededTables.sort();
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
