import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import { user as authUserTable, users } from "../../src/db/schema";
import { linkLegacyUserToAuthAccount } from "../../src/db/user-body-queries";
import { SEED_DEMO_ACCOUNT } from "../../src/lib/seed-auth";
import { readAllMigrationSql } from "./migration-sql";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(readAllMigrationSql());
});

afterEach(() => {
  sqlite.close();
});

describe("seed demo account migration", () => {
  it("links the first legacy user row to a Better Auth user id", async () => {
    const fullSchema = { ...schema, ...relations };
    const db = drizzle(sqlite, { schema: fullSchema });

    const legacy = db
      .insert(users)
      .values({ heightCm: 178, name: "Athlete" })
      .returning()
      .get();

    db.insert(authUserTable)
      .values({
        email: SEED_DEMO_ACCOUNT.email,
        emailVerified: true,
        id: "demo-auth-user",
        name: SEED_DEMO_ACCOUNT.name,
      })
      .run();

    const linked = await linkLegacyUserToAuthAccount(
      db,
      legacy.id,
      "demo-auth-user",
      SEED_DEMO_ACCOUNT.email
    );

    expect(linked.authUserId).toBe("demo-auth-user");
    expect(linked.email).toBe(SEED_DEMO_ACCOUNT.email);

    const stored = db.query.users.findFirst({
      where: eq(users.id, legacy.id),
    });
    expect((await stored)?.authUserId).toBe("demo-auth-user");
  });
});
