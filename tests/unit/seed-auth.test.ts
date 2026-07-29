import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import Database from "better-sqlite3";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import { programs, user as authUserTable, users } from "../../src/db/schema";
import {
  AUTH_USER_ADDITIONAL_FIELDS,
  resolveGithubSocialProvider,
} from "../../src/lib/auth-config";
import {
  assertSeedDemoPasswordForProduction,
  DEFAULT_SEED_DEMO_PASSWORD,
  ensureSeedDemoAccount,
  resolveSeedDemoPassword,
  SEED_DEMO_EMAIL,
  signInSeedDemoAccount,
} from "../../src/lib/seed-auth";
import { readAllMigrationSql } from "./migration-sql";

const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret!!";
const TEST_AUTH_URL = "http://localhost:3000";

function createInMemoryDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(readAllMigrationSql());
  const fullSchema = { ...schema, ...relations };
  const db = drizzle(sqlite, { schema: fullSchema });
  return { close: () => sqlite.close(), db, sqlite };
}

function configureAuthEnv() {
  process.env.BETTER_AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = TEST_AUTH_URL;
}

function snapshotSeedTables(dbPath: string) {
  const sqlite = new Database(dbPath, { readonly: true });
  const rows = (table: string) =>
    sqlite.prepare(`select * from ${table} order by id`).all();
  const snapshot = {
    account: rows("account"),
    programs: rows("programs"),
    user: rows("user"),
    users: rows("users"),
  };
  sqlite.close();
  return snapshot;
}

function runSeedScript(
  dbPath: string,
  extraEnv: Record<string, string> = {}
): { stderr: string; stdout: string } {
  const result = execSync("npx tsx scripts/seed.ts", {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      BETTER_AUTH_URL: TEST_AUTH_URL,
      DATABASE_PATH: dbPath,
      // CI runs vitest with NODE_ENV=production; isolate the child so
      // determinism tests exercise seeding, not the production guard.
      NODE_ENV: "test",
      ...extraEnv,
    },
  });
  return { stderr: "", stdout: result };
}

describe("resolveSeedDemoPassword", () => {
  const originalPassword = process.env.SEED_DEMO_PASSWORD;

  afterEach(() => {
    if (originalPassword === undefined) {
      delete process.env.SEED_DEMO_PASSWORD;
    } else {
      process.env.SEED_DEMO_PASSWORD = originalPassword;
    }
  });

  it("defaults to the legacy local password when unset", () => {
    delete process.env.SEED_DEMO_PASSWORD;
    expect(resolveSeedDemoPassword()).toBe(DEFAULT_SEED_DEMO_PASSWORD);
  });

  it("reads SEED_DEMO_PASSWORD when set", () => {
    process.env.SEED_DEMO_PASSWORD = "custom-seed-password";
    expect(resolveSeedDemoPassword()).toBe("custom-seed-password");
  });
});

describe("assertSeedDemoPasswordForProduction", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPassword = process.env.SEED_DEMO_PASSWORD;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalPassword === undefined) {
      delete process.env.SEED_DEMO_PASSWORD;
    } else {
      process.env.SEED_DEMO_PASSWORD = originalPassword;
    }
    vi.restoreAllMocks();
  });

  it("exits non-zero in production when SEED_DEMO_PASSWORD is unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SEED_DEMO_PASSWORD;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as typeof process.exit);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => assertSeedDemoPasswordForProduction()).toThrow("process.exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "SEED_DEMO_PASSWORD must be set when NODE_ENV=production. Refusing to seed the demo account."
    );
  });
});

describe("ensureSeedDemoAccount", () => {
  let fixture: ReturnType<typeof createInMemoryDb>;

  beforeEach(() => {
    configureAuthEnv();
    delete process.env.SEED_DEMO_PASSWORD;
    fixture = createInMemoryDb();
  });

  afterEach(() => {
    fixture.close();
    delete process.env.SEED_DEMO_PASSWORD;
  });

  it("creates the auth user and linked profile row", async () => {
    const demo = await ensureSeedDemoAccount(fixture.db);

    const authUser = await fixture.db.query.user.findFirst({
      where: eq(authUserTable.email, SEED_DEMO_EMAIL),
    });
    const profile = await fixture.db.query.users.findFirst({
      where: eq(users.id, demo.profileUserId),
    });

    expect(authUser?.id).toBe(demo.authUserId);
    expect(profile?.authUserId).toBe(demo.authUserId);
    expect(profile?.email).toBe(SEED_DEMO_EMAIL);
  });

  it("returns the same ids when called twice", async () => {
    const first = await ensureSeedDemoAccount(fixture.db);
    const second = await ensureSeedDemoAccount(fixture.db);

    expect(second).toEqual(first);
    expect(
      fixture.db.select({ total: count() }).from(authUserTable).get()?.total
    ).toBe(1);
    expect(fixture.db.select({ total: count() }).from(users).get()?.total).toBe(
      1
    );
  });

  it("does not modify another signed-up profile row", async () => {
    const fullSchema = { ...schema, ...relations };
    const otherAuth = betterAuth({
      baseURL: TEST_AUTH_URL,
      database: drizzleAdapter(fixture.db, {
        provider: "sqlite",
        schema: fullSchema,
      }),
      emailAndPassword: { enabled: true },
      secret: TEST_AUTH_SECRET,
      socialProviders: resolveGithubSocialProvider(),
      user: { additionalFields: AUTH_USER_ADDITIONAL_FIELDS },
    });

    const signUp = await otherAuth.api.signUpEmail({
      body: {
        email: "real@fittrack.app",
        name: "Real Athlete",
        password: "RealAthlete123!",
      },
    });

    const realProfile = fixture.db
      .insert(users)
      .values({
        authUserId: signUp.user.id,
        email: "real@fittrack.app",
        name: "Real Athlete",
      })
      .returning()
      .get();

    fixture.db
      .insert(programs)
      .values({
        frequencyPerWeek: 3,
        name: "Real Program",
        userId: realProfile.id,
      })
      .run();

    const beforeRealProfile = fixture.db.query.users.findFirst({
      where: eq(users.id, realProfile.id),
    });
    const beforeProgramCount = fixture.db
      .select({ total: count() })
      .from(programs)
      .where(eq(programs.userId, realProfile.id))
      .get()?.total;

    const demo = await ensureSeedDemoAccount(fixture.db);

    const afterRealProfile = await fixture.db.query.users.findFirst({
      where: eq(users.id, realProfile.id),
    });
    const afterProgramCount = fixture.db
      .select({ total: count() })
      .from(programs)
      .where(eq(programs.userId, realProfile.id))
      .get()?.total;

    expect(afterRealProfile).toEqual(await beforeRealProfile);
    expect(afterProgramCount).toBe(beforeProgramCount);
    expect(demo.profileUserId).not.toBe(realProfile.id);
  });

  it("lets the demo user sign in and own seeded programs", async () => {
    const demo = await ensureSeedDemoAccount(fixture.db);

    fixture.db
      .insert(programs)
      .values({
        frequencyPerWeek: 3,
        name: "Demo Linear Progression",
        userId: demo.profileUserId,
      })
      .run();

    const session = await signInSeedDemoAccount(fixture.db);
    expect(session.userId).toBe(demo.authUserId);

    const ownedPrograms = fixture.db
      .select()
      .from(programs)
      .where(eq(programs.userId, demo.profileUserId))
      .all();
    expect(ownedPrograms.length).toBe(1);
  });
});

describe("scripts/seed.ts determinism (issue #82)", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    configureAuthEnv();
    delete process.env.SEED_DEMO_PASSWORD;
    tempDir = mkdtempSync(join(tmpdir(), "fittrack-seed-"));
    dbPath = join(tempDir, "seed-test.db");
  });

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true });
    delete process.env.SEED_DEMO_PASSWORD;
    delete process.env.NODE_ENV;
  });

  it(
    "produces identical user tables when seeded twice",
    { timeout: 90_000 },
    () => {
      runSeedScript(dbPath);
      const first = snapshotSeedTables(dbPath);
      runSeedScript(dbPath);
      const second = snapshotSeedTables(dbPath);

      expect(second).toEqual(first);
      expect(first.user.length).toBe(1);
      expect(first.users.length).toBe(1);
      expect(first.account.length).toBe(1);
      expect(first.programs.length).toBe(2);
    }
  );

  it("leaves an existing signed-up account unchanged", async () => {
    const sqlite = new Database(dbPath);
    const fullSchema = { ...schema, ...relations };
    const preseedDb = drizzle(sqlite, { schema: fullSchema });
    migrate(preseedDb, {
      migrationsFolder: join(process.cwd(), "drizzle"),
    });
    const preseedAuth = betterAuth({
      baseURL: TEST_AUTH_URL,
      database: drizzleAdapter(preseedDb, {
        provider: "sqlite",
        schema: fullSchema,
      }),
      emailAndPassword: { enabled: true },
      secret: TEST_AUTH_SECRET,
      socialProviders: resolveGithubSocialProvider(),
      user: { additionalFields: AUTH_USER_ADDITIONAL_FIELDS },
    });

    const signUp = await preseedAuth.api.signUpEmail({
      body: {
        email: "existing@fittrack.app",
        name: "Existing Athlete",
        password: "ExistingAthlete123!",
      },
    });

    const realProfile = preseedDb
      .insert(users)
      .values({
        authUserId: signUp.user.id,
        email: "existing@fittrack.app",
        name: "Existing Athlete",
      })
      .returning()
      .get();

    preseedDb
      .insert(programs)
      .values({
        frequencyPerWeek: 4,
        name: "Existing Program",
        userId: realProfile.id,
      })
      .run();

    sqlite.close();

    const before = snapshotSeedTables(dbPath);
    const realProgramsBefore = before.programs.filter(
      (row) => row.user_id === realProfile.id
    ).length;

    runSeedScript(dbPath);
    const after = snapshotSeedTables(dbPath);

    const realUserAfter = after.user.find(
      (row) => row.email === "existing@fittrack.app"
    );
    const realProfileAfter = after.users.find(
      (row) => row.id === realProfile.id
    );
    const realProgramsAfter = after.programs.filter(
      (row) => row.user_id === realProfile.id
    ).length;

    expect(realUserAfter?.email).toBe("existing@fittrack.app");
    expect(realProfileAfter).toEqual(
      before.users.find((row) => row.id === realProfile.id)
    );
    expect(realProgramsAfter).toBe(realProgramsBefore);
    expect(after.user.some((row) => row.email === SEED_DEMO_EMAIL)).toBe(true);
  });

  it("emits no Better Auth base URL warnings", () => {
    const output = runSeedScript(dbPath);
    expect(output.stdout + output.stderr).not.toMatch(/Base URL is not set/i);
  });

  it("seeds successfully when parent NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SEED_DEMO_PASSWORD;

    runSeedScript(dbPath);
    const snapshot = snapshotSeedTables(dbPath);

    expect(snapshot.user.length).toBe(1);
    expect(snapshot.programs.length).toBe(2);
  });

  it("refuses to write rows in production without SEED_DEMO_PASSWORD", () => {
    expect(existsSync(dbPath)).toBe(false);

    expect(() =>
      runSeedScript(dbPath, {
        NODE_ENV: "production",
      })
    ).toThrow();

    expect(existsSync(dbPath)).toBe(false);
  });
});
