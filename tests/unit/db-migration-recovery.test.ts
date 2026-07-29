import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runMigrations } from "../../src/db/migration-diagnostics";
import { recoverDevDatabase } from "../../src/db/recover-dev-database";
import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import {
  AUTH_USER_ADDITIONAL_FIELDS,
  resolveGithubSocialProvider,
} from "../../src/lib/auth-config";
import { createUnmigratableDbFixture } from "./db-migration-fixture";

const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret!!";
const AUTH_TABLES = ["user", "session", "account", "verification"] as const;

const originalDatabasePath = process.env.DATABASE_PATH;

async function openDatabaseAt(dbPath: string) {
  process.env.DATABASE_PATH = dbPath;
  vi.resetModules();
  const { getSqlite } = await import("~/db");
  return getSqlite();
}

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return row !== undefined;
}

describe("database migration boot failure (issue #88)", () => {
  let fixture: ReturnType<typeof createUnmigratableDbFixture>;

  beforeEach(() => {
    fixture = createUnmigratableDbFixture();
  });

  afterEach(() => {
    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
    fixture.cleanup();
    vi.resetModules();
  });

  it("throws one diagnostic naming the database path and failing migration tag", async () => {
    await expect(openDatabaseAt(fixture.dbPath)).rejects.toMatchObject({
      dbPath: fixture.dbPath,
      migrationTag: "0000_jazzy_zaran",
      sqliteMessage: "table `body_logs` already exists",
    });

    const secondFailure = await openDatabaseAt(fixture.dbPath).catch(
      (error: unknown) => error
    );
    expect(secondFailure).toMatchObject({
      dbPath: fixture.dbPath,
      migrationTag: "0000_jazzy_zaran",
      name: "DatabaseMigrationError",
    });
  });

  it("rethrows the same boot failure on later database access", async () => {
    const firstFailure = await openDatabaseAt(fixture.dbPath).catch(
      (error: unknown) => error
    );
    expect(firstFailure).toMatchObject({ name: "DatabaseMigrationError" });

    await expect(openDatabaseAt(fixture.dbPath)).rejects.toThrow(
      fixture.dbPath
    );
  });
});

describe("recoverDevDatabase (issue #88)", () => {
  let fixture: ReturnType<typeof createUnmigratableDbFixture>;

  beforeEach(() => {
    fixture = createUnmigratableDbFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("creates auth tables and populates __drizzle_migrations after recovery", () => {
    recoverDevDatabase({ dbPath: fixture.dbPath });

    const sqlite = new Database(fixture.dbPath, { readonly: true });
    for (const tableName of AUTH_TABLES) {
      expect(tableExists(sqlite, tableName)).toBe(true);
    }

    const migrationCount = sqlite
      .prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations")
      .get() as { count: number };
    expect(migrationCount.count).toBeGreaterThan(0);
    sqlite.close();
  });

  it("returns 200-equivalent sign-up against the repaired development database", async () => {
    recoverDevDatabase({ dbPath: fixture.dbPath });

    const sqlite = new Database(fixture.dbPath);
    const fullSchema = { ...schema, ...relations };
    const db = drizzle(sqlite, { schema: fullSchema });
    const auth = betterAuth({
      baseURL: "http://localhost:3000",
      database: drizzleAdapter(db, {
        provider: "sqlite",
        schema,
      }),
      emailAndPassword: {
        enabled: true,
      },
      secret: TEST_AUTH_SECRET,
      socialProviders: resolveGithubSocialProvider(),
      user: {
        additionalFields: AUTH_USER_ADDITIONAL_FIELDS,
      },
    });

    const result = await auth.api.signUpEmail({
      body: {
        email: "dev-recovery@example.com",
        name: "Dev Recovery",
        password: "secure-password-1",
        sex: "female",
      },
    });

    expect(result.user.email).toBe("dev-recovery@example.com");
    expect(result.token).toBeTruthy();
    sqlite.close();
  });

  it("leaves unrecognized migration rows untouched unless forced", () => {
    const sqlite = new Database(fixture.dbPath);
    sqlite
      .prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
      )
      .run("bogus-migration-hash-not-in-journal", 1);
    sqlite.close();

    expect(() => recoverDevDatabase({ dbPath: fixture.dbPath })).toThrow(
      /unrecognized row/
    );

    const after = new Database(fixture.dbPath, { readonly: true });
    const rows = after
      .prepare("SELECT hash FROM __drizzle_migrations")
      .all() as { hash: string }[];
    expect(
      rows.some((row) => row.hash === "bogus-migration-hash-not-in-journal")
    ).toBe(true);
    after.close();
  });

  it("can force destructive recovery when unrecognized rows hold application data", () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-force-reset-"));
    const dbPath = join(scratchRoot, "fittrack.db");
    const sqlite = new Database(dbPath);
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)"
    );
    sqlite
      .prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
      )
      .run("bogus-migration-hash-not-in-journal", 1);
    sqlite.exec(
      "CREATE TABLE foods (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
    );
    sqlite.prepare("INSERT INTO foods (name) VALUES (?)").run("Custom food");
    sqlite.close();

    recoverDevDatabase({ dbPath, force: true });

    const after = new Database(dbPath, { readonly: true });
    expect(tableExists(after, "user")).toBe(true);
    const customFood = after
      .prepare("SELECT name FROM foods WHERE name = ?")
      .get("Custom food") as { name: string } | undefined;
    expect(customFood).toBeUndefined();
    after.close();
    rmSync(scratchRoot, { force: true, recursive: true });
  });
});

describe("runMigrations diagnostics", () => {
  it("wraps Drizzle failures with migration metadata", () => {
    const fixture = createUnmigratableDbFixture();
    const sqlite = new Database(fixture.dbPath);
    const db = drizzle(sqlite);

    try {
      runMigrations(db, { dbPath: fixture.dbPath });
      expect.unreachable("runMigrations should fail on unmigratable state");
    } catch (error) {
      expect(error).toMatchObject({
        dbPath: fixture.dbPath,
        migrationTag: "0000_jazzy_zaran",
        name: "DatabaseMigrationError",
      });
    }

    sqlite.close();
    fixture.cleanup();
  });
});
