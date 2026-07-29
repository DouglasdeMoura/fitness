import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { redirect } from "@tanstack/react-router";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import Database from "better-sqlite3";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import {
  foodLog,
  session as authSessionTable,
  workoutSessions,
} from "../../src/db/schema";
import { ensureSessionUserRecord } from "../../src/db/user-body-queries";
import {
  AUTH_USER_ADDITIONAL_FIELDS,
  resolveGithubSocialProvider,
} from "../../src/lib/auth-config";
import { AUTH_SUCCESS_PATH, formatAuthError } from "../../src/lib/auth-form";
import {
  APP_ROUTE_PREFIXES,
  assertRouteHasNoSession,
  assertRouteHasSession,
  isProtectedAppPath,
} from "../../src/lib/route-auth";
import {
  ensureSeedDemoAccount,
  resolveSeedDemoPassword,
  SEED_DEMO_ACCOUNT,
} from "../../src/lib/seed-auth";
import { readAllMigrationSql } from "./migration-sql";

const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret!!";
const TEST_AUTH_URL = "http://localhost:3000";
const FRESH_SIGN_UP_EMAIL = "batch4-signup@example.com";
const FRESH_SIGN_UP_PASSWORD = "SecurePass1";

function createInMemoryAuth() {
  const sqlite = new Database(":memory:");
  sqlite.exec(readAllMigrationSql());
  const fullSchema = { ...schema, ...relations };
  const db = drizzle(sqlite, { schema: fullSchema });
  const auth = betterAuth({
    baseURL: TEST_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
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
  return { auth, close: () => sqlite.close(), db, sqlite };
}

async function countAuthSessionsForUser(
  db: ReturnType<typeof createInMemoryAuth>["db"],
  userId: string
) {
  const [row] = await db
    .select({ total: count() })
    .from(authSessionTable)
    .where(eq(authSessionTable.userId, userId));
  return row?.total ?? 0;
}

function sessionRequestHeaders(response: Response): Headers {
  const cookieParts = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0]);
  return new Headers({ cookie: cookieParts.join("; ") });
}

function listProtectedRouteFiles(): string[] {
  const routesRoot = join(process.cwd(), "src/routes");
  const files: string[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory)) {
      const absolutePath = join(directory, entry);
      if (statSync(absolutePath).isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.endsWith(".tsx")) {
        continue;
      }
      const routePath = `/${relative(routesRoot, absolutePath)
        .replaceAll("\\", "/")
        .replace(/\/index\.tsx$/u, "")
        .replace(/\.tsx$/u, "")}`;
      if (isProtectedAppPath(routePath)) {
        files.push(absolutePath);
      }
    }
  }

  walk(routesRoot);
  return files.sort();
}

describe("auth enforcement batch 4 (issue #83)", () => {
  describe("protected route wiring", () => {
    it("treats every APP_ROUTE_PREFIXES entry as a protected path", () => {
      for (const prefix of APP_ROUTE_PREFIXES) {
        expect(isProtectedAppPath(prefix)).toBe(true);
        expect(isProtectedAppPath(`${prefix}/nested`)).toBe(true);
      }
    });

    it("requires beforeLoad: requireAuthenticatedRoute on every protected route file", () => {
      const protectedFiles = listProtectedRouteFiles();
      expect(protectedFiles.length).toBeGreaterThan(0);

      for (const filePath of protectedFiles) {
        const source = readFileSync(filePath, "utf-8");
        expect(source, relative(process.cwd(), filePath)).toContain(
          "beforeLoad: requireAuthenticatedRoute"
        );
      }
    });

    it("redirects signed-in visitors away from sign-in and sign-up", () => {
      for (const routeFile of ["sign-in/index.tsx", "sign-up/index.tsx"]) {
        const source = readFileSync(
          join(process.cwd(), "src/routes", routeFile),
          "utf-8"
        );
        expect(source).toContain(
          "beforeLoad: redirectAuthenticatedToDashboard"
        );
      }
    });
  });

  describe("route beforeLoad guards", () => {
    it("redirects unauthenticated visitors to /sign-in for protected routes", () => {
      expect(() => assertRouteHasSession(null)).toThrow(
        redirect({ to: "/sign-in" })
      );
    });

    it("redirects signed-in visitors from auth pages to the dashboard", () => {
      expect(() =>
        assertRouteHasNoSession({
          session: { id: "session-1", userId: "auth-1" },
          user: { email: "runner@example.com", id: "auth-1", name: "Runner" },
        } as never)
      ).toThrow(redirect({ to: AUTH_SUCCESS_PATH }));
    });

    it("redirects every APP_ROUTE_PREFIXES entry to /sign-in when signed out", () => {
      for (const prefix of APP_ROUTE_PREFIXES) {
        expect(isProtectedAppPath(prefix)).toBe(true);
        expect(() => assertRouteHasSession(null)).toThrow(
          redirect({ to: "/sign-in" })
        );
      }
    });
  });

  describe("email auth flows", () => {
    it("signs up a fresh account with no food log or workouts", async () => {
      const { auth, close, db } = createInMemoryAuth();
      try {
        const signUp = await auth.api.signUpEmail({
          body: {
            email: FRESH_SIGN_UP_EMAIL,
            name: "Batch Four",
            password: FRESH_SIGN_UP_PASSWORD,
          },
        });
        expect(signUp.user.email).toBe(FRESH_SIGN_UP_EMAIL);

        const profile = await ensureSessionUserRecord(db, signUp.user);
        const [foodLogCount] = await db
          .select({ total: count() })
          .from(foodLog)
          .where(eq(foodLog.userId, profile.id));
        const [workoutCount] = await db
          .select({ total: count() })
          .from(workoutSessions)
          .where(eq(workoutSessions.userId, profile.id));

        expect(foodLogCount?.total).toBe(0);
        expect(workoutCount?.total).toBe(0);
        expect(AUTH_SUCCESS_PATH).toBe("/dashboard");
      } finally {
        close();
      }
    });

    it("signs in with the seeded demo account", async () => {
      const { auth, close, db } = createInMemoryAuth();
      try {
        await ensureSeedDemoAccount(db);
        const signIn = await auth.api.signInEmail({
          body: {
            email: SEED_DEMO_ACCOUNT.email,
            password: resolveSeedDemoPassword(),
          },
        });
        expect(signIn.user.email).toBe(SEED_DEMO_ACCOUNT.email);
        expect(signIn.token).toBeTruthy();
      } finally {
        close();
      }
    });

    it("rejects a wrong password with user-facing error copy", async () => {
      const { auth, close } = createInMemoryAuth();
      try {
        await auth.api.signUpEmail({
          body: {
            email: "wrong-pass@example.com",
            name: "Wrong Pass",
            password: FRESH_SIGN_UP_PASSWORD,
          },
        });

        await expect(
          auth.api.signInEmail({
            body: {
              email: "wrong-pass@example.com",
              password: "NotTheRightPassword1",
            },
          })
        ).rejects.toThrow(/invalid email or password/i);

        const signInSource = readFileSync(
          join(process.cwd(), "src/routes/sign-in/index.tsx"),
          "utf-8"
        );
        expect(signInSource).toContain("formatAuthError(result.error)");
        expect(formatAuthError({ message: "Invalid email or password" })).toBe(
          "Invalid email or password"
        );
      } finally {
        close();
      }
    });

    it("keeps the session across repeated lookups (reload survival)", async () => {
      const { auth, close, db } = createInMemoryAuth();
      try {
        await auth.api.signUpEmail({
          body: {
            email: "persist@example.com",
            name: "Persist",
            password: FRESH_SIGN_UP_PASSWORD,
          },
        });
        const signIn = await auth.api.signInEmail({
          body: {
            email: "persist@example.com",
            password: FRESH_SIGN_UP_PASSWORD,
          },
        });
        expect(signIn.token).toBeTruthy();

        const sessionsAfterSignIn = await countAuthSessionsForUser(
          db,
          signIn.user.id
        );
        const sessionsAfterReload = await countAuthSessionsForUser(
          db,
          signIn.user.id
        );

        expect(sessionsAfterSignIn).toBeGreaterThan(0);
        expect(sessionsAfterReload).toBe(sessionsAfterSignIn);
      } finally {
        close();
      }
    });

    it("clears the session after sign-out", async () => {
      const { auth, close } = createInMemoryAuth();
      try {
        await auth.api.signUpEmail({
          body: {
            email: "signout@example.com",
            name: "Sign Out",
            password: FRESH_SIGN_UP_PASSWORD,
          },
        });
        const signInResponse = await auth.api.signInEmail({
          asResponse: true,
          body: {
            email: "signout@example.com",
            password: FRESH_SIGN_UP_PASSWORD,
          },
        });

        const requestHeaders = sessionRequestHeaders(signInResponse);
        const activeSession = await auth.api.getSession({
          headers: requestHeaders,
        });
        expect(activeSession?.user.email).toBe("signout@example.com");

        const signOut = await auth.api.signOut({
          asResponse: true,
          headers: requestHeaders,
        });
        expect(signOut.status).toBe(200);

        const clearedSession = await auth.api.getSession({
          headers: requestHeaders,
        });
        expect(clearedSession).toBeNull();
      } finally {
        close();
      }
    });
  });

  describe("sign-out navigation wiring", () => {
    it("returns visitors to sign-in and leaves protected routes guarded", () => {
      const userMenuSource = readFileSync(
        join(process.cwd(), "src/components/user-menu.tsx"),
        "utf-8"
      );
      expect(userMenuSource).toContain("await signOut()");
      expect(userMenuSource).toContain('to: "/sign-in"');
    });
  });
});
