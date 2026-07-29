import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DevDatabaseRecoveryError,
  recoverDevDatabase,
} from "../../src/db/recover-dev-database";
import {
  CURRENT_MIGRATIONS_FOLDER,
  createJournalCollapseDbFixture,
  createUnrecognizedJournalWithoutUsersFixture,
  readCollapsedBaselineHash,
  readMigrationJournalHashes,
  readWorkoutSessionCount,
} from "./db-recovery-journal-collapse-fixture";
import type {
  JournalCollapseDbFixture,
  UnrecognizedJournalDbFixture,
} from "./db-recovery-journal-collapse-fixture";

describe("recoverDevDatabase journal collapse recovery (issue #117)", () => {
  let fixture: JournalCollapseDbFixture;

  beforeEach(() => {
    fixture = createJournalCollapseDbFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("repairs a pre-collapse journal without force while preserving workout_sessions", () => {
    const workoutsBefore = readWorkoutSessionCount(fixture.dbPath);
    const baselineHash = readCollapsedBaselineHash();

    recoverDevDatabase({
      dbPath: fixture.dbPath,
      migrationsFolder: CURRENT_MIGRATIONS_FOLDER,
    });

    expect(readWorkoutSessionCount(fixture.dbPath)).toBe(workoutsBefore);
    expect(readMigrationJournalHashes(fixture.dbPath)).toEqual([baselineHash]);
  });

  it("is idempotent on a second recoverDevDatabase call", () => {
    const baselineHash = readCollapsedBaselineHash();

    recoverDevDatabase({
      dbPath: fixture.dbPath,
      migrationsFolder: CURRENT_MIGRATIONS_FOLDER,
    });
    const workoutsAfterFirst = readWorkoutSessionCount(fixture.dbPath);
    const journalAfterFirst = readMigrationJournalHashes(fixture.dbPath);

    recoverDevDatabase({
      dbPath: fixture.dbPath,
      migrationsFolder: CURRENT_MIGRATIONS_FOLDER,
    });

    expect(readWorkoutSessionCount(fixture.dbPath)).toBe(workoutsAfterFirst);
    expect(readMigrationJournalHashes(fixture.dbPath)).toEqual(
      journalAfterFirst
    );
    expect(readMigrationJournalHashes(fixture.dbPath)).toEqual([baselineHash]);
  });
});

describe("recoverDevDatabase journal collapse refusal (issue #117)", () => {
  let fixture: UnrecognizedJournalDbFixture;

  beforeEach(() => {
    fixture = createUnrecognizedJournalWithoutUsersFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("throws DevDatabaseRecoveryError when unrecognized hashes have no users table", () => {
    expect(() =>
      recoverDevDatabase({
        dbPath: fixture.dbPath,
        migrationsFolder: CURRENT_MIGRATIONS_FOLDER,
      })
    ).toThrow(DevDatabaseRecoveryError);

    const sqlite = new Database(fixture.dbPath, { readonly: true });
    const usersTable = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
      )
      .get() as { name: string } | undefined;
    expect(usersTable).toBeUndefined();
    expect(readMigrationJournalHashes(fixture.dbPath).length).toBeGreaterThan(
      0
    );
    sqlite.close();
  });
});
