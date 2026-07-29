import {
  existsSync,
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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/db/migration-diagnostics";
import { foods } from "../../src/db/schema";
import {
  countTableRows,
  createScratchMigrationDb,
  discoverTablesReferencingUsers,
  execMigrationSql,
  getMigrationsFolder,
  readJournalMigrationSqlFiles,
  recordAppliedMigrations,
  seedMigrationGateChildRows,
} from "./db-migration-fixture";
import { createDrizzleTestDb } from "./drizzle-test-db";
import type { DrizzleTestDb } from "./drizzle-test-db";

interface MigrationJournalEntry {
  idx: number;
  tag: string;
}

interface MigrationJournal {
  entries: MigrationJournalEntry[];
}

interface MigrationSnapshot {
  id: string;
  prevId: string;
}

const ZERO_SNAPSHOT_ID = "00000000-0000-0000-0000-000000000000";

function getMetaFolder(): string {
  return join(getMigrationsFolder(), "meta");
}

function formatSnapshotIndex(index: number): string {
  return String(index).padStart(4, "0");
}

function snapshotFileName(index: number): string {
  return `${formatSnapshotIndex(index)}_snapshot.json`;
}

function listSnapshotIndices(): number[] {
  return readdirSync(getMetaFolder())
    .filter((fileName) => /^\d{4}_snapshot\.json$/.test(fileName))
    .map((fileName) => Number.parseInt(fileName.slice(0, 4), 10))
    .sort((left, right) => left - right);
}

function readSnapshot(index: number): MigrationSnapshot {
  const snapshotPath = join(getMetaFolder(), snapshotFileName(index));
  return JSON.parse(readFileSync(snapshotPath, "utf-8")) as MigrationSnapshot;
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

function assertSnapshotCoverage(): void {
  const journal = readMigrationJournal();
  const expectedIndices = journal.entries.map((entry) => entry.idx);
  const snapshotIndices = listSnapshotIndices();

  const missingSnapshots = expectedIndices.filter(
    (index) => !snapshotIndices.includes(index)
  );
  const extraSnapshots = snapshotIndices.filter(
    (index) => !expectedIndices.includes(index)
  );

  expect(
    missingSnapshots.map((index) => formatSnapshotIndex(index)),
    `Journal entries missing snapshot files: ${missingSnapshots.map((index) => formatSnapshotIndex(index)).join(", ")}`
  ).toEqual([]);
  expect(
    extraSnapshots.map((index) => formatSnapshotIndex(index)),
    `Snapshot files without journal entries: ${extraSnapshots.map((index) => formatSnapshotIndex(index)).join(", ")}`
  ).toEqual([]);
}

function assertSnapshotPrevIdChain(): void {
  const journal = readMigrationJournal();
  const brokenLinks: string[] = [];
  const ids: string[] = [];

  for (const entry of journal.entries) {
    const snapshotPath = join(getMetaFolder(), snapshotFileName(entry.idx));
    if (!existsSync(snapshotPath)) {
      continue;
    }

    const snapshot = readSnapshot(entry.idx);
    ids.push(snapshot.id);

    if (entry.idx === 0) {
      if (snapshot.prevId !== ZERO_SNAPSHOT_ID) {
        brokenLinks.push(
          `${formatSnapshotIndex(entry.idx)}: prevId ${snapshot.prevId} !== ${ZERO_SNAPSHOT_ID}`
        );
      }
      continue;
    }

    const previousIndex = entry.idx - 1;
    const previousSnapshotPath = join(
      getMetaFolder(),
      snapshotFileName(previousIndex)
    );
    if (!existsSync(previousSnapshotPath)) {
      brokenLinks.push(
        `${formatSnapshotIndex(entry.idx)}: prevId ${snapshot.prevId} does not chain from missing ${formatSnapshotIndex(previousIndex)} snapshot`
      );
      continue;
    }

    const previousSnapshot = readSnapshot(previousIndex);
    if (snapshot.prevId !== previousSnapshot.id) {
      brokenLinks.push(
        `${formatSnapshotIndex(entry.idx)}: prevId ${snapshot.prevId} !== ${previousSnapshot.id} (${formatSnapshotIndex(previousIndex)} snapshot id)`
      );
    }
  }

  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  expect(
    [...new Set(duplicateIds)],
    `Snapshot ids must be distinct; duplicates: ${[...new Set(duplicateIds)].join(", ")}`
  ).toEqual([]);
  expect(
    brokenLinks,
    `Snapshot prevId chain broken: ${brokenLinks.join("; ")}`
  ).toEqual([]);
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

  it("maps every journal entry to a drizzle/meta snapshot with no extras (issue #113)", () => {
    assertSnapshotCoverage();
  });

  it("chains drizzle/meta snapshot prevId values without gaps or duplicates (issue #113)", () => {
    assertSnapshotPrevIdChain();
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

      recordAppliedMigrations(sqlite, 3, migrationsFolder);

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
      recordAppliedMigrations(sqlite, 4, migrationsFolder);

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

  it("adds users.theme_preference when migrating a fresh database", () => {
    const fixture = createScratchMigrationDb("fittrack-migrate-fresh-0004-");

    try {
      runMigrations(drizzle(fixture.sqlite), { dbPath: fixture.dbPath });

      const themeColumn = (
        fixture.sqlite.pragma("table_info(users)") as {
          dflt_value: string | null;
          name: string;
          notnull: number;
        }[]
      ).find((column) => column.name === "theme_preference");

      expect(themeColumn).toMatchObject({
        dflt_value: "'system'",
        name: "theme_preference",
        notnull: 1,
      });

      const insertResult = fixture.sqlite
        .prepare("INSERT INTO users DEFAULT VALUES")
        .run();
      const defaultPreference = fixture.sqlite
        .prepare("SELECT theme_preference FROM users WHERE id = ?")
        .get(insertResult.lastInsertRowid) as { theme_preference: string };

      expect(defaultPreference.theme_preference).toBe("system");
    } finally {
      fixture.cleanup();
    }
  });

  it("applies migration 0004 cleanly when users have dependent rows", () => {
    const fixture = createScratchMigrationDb(
      "fittrack-migrate-0004-dependent-rows-"
    );
    const userId = 7;

    try {
      for (const fileName of readJournalMigrationSqlFiles().slice(0, 4)) {
        execMigrationSql(fixture.sqlite, fileName, fixture.migrationsFolder);
      }

      fixture.sqlite
        .prepare(
          "INSERT INTO users (id, name, email, activity_level, goal_type, sex) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          userId,
          "Pre-migration Athlete",
          "pre-migration@example.com",
          "light",
          "lose_fat",
          "female"
        );

      const childTables = discoverTablesReferencingUsers(fixture.sqlite);
      expect(childTables.length).toBeGreaterThan(0);

      const seededTables = seedMigrationGateChildRows(fixture.sqlite, userId);
      expect(seededTables).toEqual(childTables);

      const rowCountsBefore = Object.fromEntries(
        childTables.map((tableName) => [
          tableName,
          countTableRows(fixture.sqlite, tableName),
        ])
      );
      for (const tableName of childTables) {
        expect(rowCountsBefore[tableName]).toBeGreaterThanOrEqual(1);
      }

      recordAppliedMigrations(fixture.sqlite, 4, fixture.migrationsFolder);
      runMigrations(drizzle(fixture.sqlite), {
        dbPath: fixture.dbPath,
        migrationsFolder: fixture.migrationsFolder,
      });

      for (const tableName of childTables) {
        expect(countTableRows(fixture.sqlite, tableName)).toBe(
          rowCountsBefore[tableName]
        );
      }

      expect(fixture.sqlite.pragma("foreign_key_check")).toEqual([]);

      const migratedUser = fixture.sqlite
        .prepare("SELECT theme_preference FROM users WHERE id = ?")
        .get(userId) as { theme_preference: string };
      expect(migratedUser.theme_preference).toBe("system");
    } finally {
      fixture.cleanup();
    }
  });

  it("applies migration 0004 cleanly to a database at 0003", () => {
    const fixture = createScratchMigrationDb("fittrack-migrate-0003-0004-");

    try {
      for (const fileName of readJournalMigrationSqlFiles().slice(0, 4)) {
        execMigrationSql(fixture.sqlite, fileName, fixture.migrationsFolder);
      }

      fixture.sqlite
        .prepare(
          "INSERT INTO users (id, name, email, activity_level, goal_type, sex) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          7,
          "Pre-migration Athlete",
          "pre-migration@example.com",
          "light",
          "lose_fat",
          "female"
        );
      fixture.sqlite
        .prepare(
          "INSERT INTO users (id, name, email, activity_level, goal_type, sex) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          8,
          "Second Pre-migration Athlete",
          "second-pre-migration@example.com",
          "sedentary",
          "recomp",
          "male"
        );

      const usersColumnsBefore = (
        fixture.sqlite.pragma("table_info(users)") as { name: string }[]
      ).map((column) => column.name);
      expect(usersColumnsBefore).not.toContain("theme_preference");

      recordAppliedMigrations(fixture.sqlite, 4, fixture.migrationsFolder);
      runMigrations(drizzle(fixture.sqlite), {
        dbPath: fixture.dbPath,
        migrationsFolder: fixture.migrationsFolder,
      });

      const preferences = fixture.sqlite
        .prepare("SELECT id, theme_preference FROM users ORDER BY id")
        .all() as { id: number; theme_preference: string }[];

      expect(preferences).toStrictEqual([
        { id: 7, theme_preference: "system" },
        { id: 8, theme_preference: "system" },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects invalid theme_preference values and accepts light, dark, and system", () => {
    const fixture = createScratchMigrationDb("fittrack-migrate-check-0004-");

    try {
      runMigrations(drizzle(fixture.sqlite), { dbPath: fixture.dbPath });
      const userId = fixture.sqlite
        .prepare("INSERT INTO users DEFAULT VALUES")
        .run().lastInsertRowid;

      for (const preference of ["light", "dark", "system"] as const) {
        expect(() =>
          fixture.sqlite
            .prepare("UPDATE users SET theme_preference = ? WHERE id = ?")
            .run(preference, userId)
        ).not.toThrow();
        const stored = fixture.sqlite
          .prepare("SELECT theme_preference FROM users WHERE id = ?")
          .get(userId) as { theme_preference: string };
        expect(stored.theme_preference).toBe(preference);
      }

      expect(() =>
        fixture.sqlite
          .prepare("UPDATE users SET theme_preference = ? WHERE id = ?")
          .run("purple", userId)
      ).toThrow(/users_theme_preference_check/);
    } finally {
      fixture.cleanup();
    }
  });

  it("requires theme_preference to be NOT NULL", () => {
    const fixture = createScratchMigrationDb("fittrack-migrate-notnull-0004-");

    try {
      runMigrations(drizzle(fixture.sqlite), { dbPath: fixture.dbPath });
      const themeColumn = (
        fixture.sqlite.pragma("table_info(users)") as {
          name: string;
          notnull: number;
        }[]
      ).find((column) => column.name === "theme_preference");

      expect(themeColumn?.notnull).toBe(1);

      const userId = fixture.sqlite
        .prepare("INSERT INTO users DEFAULT VALUES")
        .run().lastInsertRowid;
      expect(() =>
        fixture.sqlite
          .prepare("UPDATE users SET theme_preference = NULL WHERE id = ?")
          .run(userId)
      ).toThrow(/NOT NULL constraint failed: users.theme_preference/);
    } finally {
      fixture.cleanup();
    }
  });
});
