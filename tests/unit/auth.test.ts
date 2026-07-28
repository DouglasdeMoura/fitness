import { readFileSync } from "node:fs";
import { join } from "node:path";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import Database from "better-sqlite3";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import {
  AUTH_USER_ADDITIONAL_FIELDS,
  resolveGithubSocialProvider,
} from "../../src/lib/auth-config";
import { readAllMigrationSql } from "./migration-sql";

const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret!!";

function createInMemoryAuth() {
  const sqlite = new Database(":memory:");
  sqlite.exec(readAllMigrationSql());
  const fullSchema = { ...schema, ...relations };
  const db = drizzle(sqlite, { schema: fullSchema });
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: fullSchema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    secret: TEST_AUTH_SECRET,
    user: {
      additionalFields: AUTH_USER_ADDITIONAL_FIELDS,
    },
  });
  return { auth, close: () => sqlite.close(), db };
}

describe(resolveGithubSocialProvider, () => {
  it("returns an empty object when GitHub credentials are missing", () => {
    expect(resolveGithubSocialProvider({})).toStrictEqual({});
    expect(
      resolveGithubSocialProvider({ GITHUB_CLIENT_ID: "id-only" })
    ).toStrictEqual({});
  });

  it("enables GitHub OAuth when both env vars are set", () => {
    expect(
      resolveGithubSocialProvider({
        GITHUB_CLIENT_ID: "gh-id",
        GITHUB_CLIENT_SECRET: "gh-secret",
      })
    ).toStrictEqual({
      github: {
        clientId: "gh-id",
        clientSecret: "gh-secret",
      },
    });
  });
});

describe("Better Auth setup (issue #42)", () => {
  it("documents BETTER_AUTH env vars in .env.example", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf-8");
    expect(example).toContain("BETTER_AUTH_SECRET=");
    expect(example).toContain("BETTER_AUTH_URL=");
    expect(example).toContain("GITHUB_CLIENT_ID=");
    expect(example).toContain("GITHUB_CLIENT_SECRET=");
  });

  it("exposes fitness profile columns on the auth user table", () => {
    const columns = getTableColumns(schema.user);
    expect(columns.activityLevel).toBeDefined();
    expect(columns.birthDate).toBeDefined();
    expect(columns.goalType).toBeDefined();
    expect(columns.heightCm).toBeDefined();
    expect(columns.sex).toBeDefined();
  });

  it("registers email/password sign-up against the Drizzle sqlite adapter", async () => {
    const { auth, close } = createInMemoryAuth();
    try {
      const result = await auth.api.signUpEmail({
        body: {
          email: "runner@example.com",
          name: "Runner",
          password: "secure-password-1",
          sex: "female",
        },
      });
      expect(result.user.email).toBe("runner@example.com");
      expect(result.user.sex).toBe("female");
      expect(result.token).toBeTruthy();
    } finally {
      close();
    }
  });

  it("creates a session on email sign-in", async () => {
    const { auth, close } = createInMemoryAuth();
    try {
      await auth.api.signUpEmail({
        body: {
          email: "lifter@example.com",
          name: "Lifter",
          password: "secure-password-2",
        },
      });
      const signIn = await auth.api.signInEmail({
        body: {
          email: "lifter@example.com",
          password: "secure-password-2",
        },
      });
      expect(signIn.token).toBeTruthy();
      expect(signIn.user.email).toBe("lifter@example.com");
    } finally {
      close();
    }
  });

  it("mounts the /api/auth catch-all route handler", () => {
    const routeSource = readFileSync(
      join(process.cwd(), "src/routes/api/auth/$.ts"),
      "utf-8"
    );
    expect(routeSource).toContain('createFileRoute("/api/auth/$")');
    expect(routeSource).toContain("auth.handler(request)");
  });
});
