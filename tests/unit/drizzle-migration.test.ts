import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/db/migration-diagnostics";
import { foods } from "../../src/db/schema";
import { createDrizzleTestDb } from "./drizzle-test-db";
import type { DrizzleTestDb } from "./drizzle-test-db";

interface MigrationJournalEntry {
  idx: number;
  tag: string;
}

interface MigrationJournal {
  entries: MigrationJournalEntry[];
}

function getMigrationsFolder(): string {
  return join(process.cwd(), "drizzle");
}

function listMigrationSqlTags(): string[] {
  return readdirSync(getMigrationsFolder())
    .filter((fileName) => fileName.endsWith(".sql"))
    .map((fileName) => fileName.replace(/\.sql$/, ""))
    .sort();
}

function readMigrationJournal(): MigrationJournal {
  const journalPath = join(getMigrationsFolder(), "meta", "_journal.json");
  return JSON.parse(readFileSync(journalPath, "utf-8")) as MigrationJournal;
}

function assertMigrationJournalCompleteness(): void {
  const journal = readMigrationJournal();
  const sqlTags = listMigrationSqlTags();
  const journalTags = journal.entries.map((entry) => entry.tag);

  const missingFromJournal = sqlTags.filter(
    (tag) => !journalTags.includes(tag)
  );
  const missingFromDisk = journalTags.filter((tag) => !sqlTags.includes(tag));
  const idxValues = journal.entries.map((entry) => entry.idx);
  const expectedIdxValues = journal.entries.map((_, index) => index);
  const idxGaps = expectedIdxValues.filter(
    (expectedIdx) => !idxValues.includes(expectedIdx)
  );

  expect(
    missingFromJournal,
    `SQL files missing journal entries: ${missingFromJournal.join(", ")}`
  ).toEqual([]);
  expect(
    missingFromDisk,
    `Journal entries missing SQL files: ${missingFromDisk.join(", ")}`
  ).toEqual([]);
  expect(
    idxGaps,
    `Journal idx values must be contiguous from zero; missing: ${idxGaps.join(", ")}`
  ).toEqual([]);
  expect(idxValues).toEqual(expectedIdxValues);
}

function execMigrationSql(sqlite: Database.Database, fileName: string): void {
  const migrationSql = readFileSync(
    join(getMigrationsFolder(), fileName),
    "utf-8"
  );
  for (const statement of migrationSql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) {
      sqlite.exec(trimmed);
    }
  }
}

function recordAppliedMigrations(
  sqlite: Database.Database,
  migrationsFolder: string,
  count: number
): void {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)"
  );
  const migrations = readMigrationFiles({ migrationsFolder });
  const insertMigration = sqlite.prepare(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
  );
  for (const migration of migrations.slice(0, count)) {
    insertMigration.run(migration.hash, migration.folderMillis);
  }
}

function syncQueueColumnNames(sqlite: Database.Database): string[] {
  const columns = sqlite.pragma("table_info(sync_queue)") as {
    name: string;
  }[];
  return columns.map((column) => column.name);
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
}

/**
 * Regression guard for issue #41: the app data layer must use Drizzle only.
 */
describe("Drizzle-only data layer (issue #41)", () => {
  let fixture: DrizzleTestDb;

  beforeEach(() => {
    fixture = createDrizzleTestDb();
  });

  afterEach(() => {
    fixture.close();
  });

  it("has no db.prepare calls under src/", () => {
    const offenders = collectSourceFiles(join(process.cwd(), "src")).flatMap(
      (path) => {
        const text = readFileSync(path, "utf-8");
        return /\bdb\.prepare\b/.test(text) ? [path] : [];
      }
    );
    expect(offenders).toStrictEqual([]);
  });

  it("can query through Drizzle without raw SQL", () => {
    const count = fixture.db.select().from(foods).all().length;
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe("migration journal completeness (issue #89)", () => {
  it("maps every drizzle/*.sql file to a journal entry with contiguous idx", () => {
    assertMigrationJournalCompleteness();
  });
});

describe("migration 0003_sync_queue_user_id (issue #89)", () => {
  it("adds sync_queue.user_id when migrating a fresh database", () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-migrate-fresh-"));
    const dbPath = join(scratchRoot, "fittrack.db");
    const sqlite = new Database(dbPath);

    try {
      const db = drizzle(sqlite);
      runMigrations(db, { dbPath });
      expect(syncQueueColumnNames(sqlite)).toContain("user_id");
    } finally {
      sqlite.close();
      rmSync(scratchRoot, { force: true, recursive: true });
    }
  });

  it("applies migration 0003 cleanly to a database at 0002", () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-migrate-0002-"));
    const dbPath = join(scratchRoot, "fittrack.db");
    const sqlite = new Database(dbPath);
    const migrationsFolder = getMigrationsFolder();

    try {
      for (const fileName of [
        "0000_jazzy_zaran.sql",
        "0001_busy_misty_knight.sql",
        "0002_conscious_doomsday.sql",
      ]) {
        execMigrationSql(sqlite, fileName);
      }

      recordAppliedMigrations(sqlite, migrationsFolder, 3);

      expect(syncQueueColumnNames(sqlite)).not.toContain("user_id");

      const db = drizzle(sqlite);
      runMigrations(db, { dbPath, migrationsFolder });
      expect(syncQueueColumnNames(sqlite)).toContain("user_id");
    } finally {
      sqlite.close();
      rmSync(scratchRoot, { force: true, recursive: true });
    }
  });
});

describe("migration 0004_theme_preference (issue #100)", () => {
  it("defaults new users to system and rejects unsupported preferences", () => {
    const fixture = createDrizzleTestDb();

    try {
      const row = fixture.sqlite
        .prepare("SELECT theme_preference FROM users WHERE id = ?")
        .get(fixture.userId) as { theme_preference: string };

      expect(row.theme_preference).toBe("system");
      expect(() =>
        fixture.sqlite
          .prepare("UPDATE users SET theme_preference = ? WHERE id = ?")
          .run("sepia", fixture.userId)
      ).toThrow(/users_theme_preference_check/);
    } finally {
      fixture.close();
    }
  });

  it("migrates a 0003 user without losing profile data", () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-migrate-0003-"));
    const dbPath = join(scratchRoot, "fittrack.db");
    const sqlite = new Database(dbPath);
    const migrationsFolder = getMigrationsFolder();

    try {
      for (const fileName of [
        "0000_jazzy_zaran.sql",
        "0001_busy_misty_knight.sql",
        "0002_conscious_doomsday.sql",
        "0003_sync_queue_user_id.sql",
      ]) {
        execMigrationSql(sqlite, fileName);
      }
      sqlite
        .prepare(
          "INSERT INTO users (id, name, email, activity_level, goal_type, sex) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          42,
          "Migration Athlete",
          "migration@example.com",
          "active",
          "maintain",
          "other"
        );
      recordAppliedMigrations(sqlite, migrationsFolder, 4);

      runMigrations(drizzle(sqlite), { dbPath, migrationsFolder });

      const migratedUser = sqlite
        .prepare(
          "SELECT id, name, email, activity_level, goal_type, sex, theme_preference FROM users WHERE id = ?"
        )
        .get(42);
      expect(migratedUser).toStrictEqual({
        activity_level: "active",
        email: "migration@example.com",
        goal_type: "maintain",
        id: 42,
        name: "Migration Athlete",
        sex: "other",
        theme_preference: "system",
      });

      const authUserColumns = (
        sqlite.pragma("table_info(user)") as { name: string }[]
      ).map((column) => column.name);
      expect(authUserColumns).not.toContain("theme_preference");
    } finally {
      sqlite.close();
      rmSync(scratchRoot, { force: true, recursive: true });
    }
  });
});
