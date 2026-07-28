import { readFileSync } from "node:fs";
import { join } from "node:path";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import { isAuthRoute } from "../../src/lib/app-chrome";
import { AUTH_USER_ADDITIONAL_FIELDS } from "../../src/lib/auth-config";
import {
  AUTH_SUCCESS_PATH,
  fieldErrorMessage,
  formatAuthError,
  readGithubProviderConfig,
  SIGN_IN_FORM_DEFAULTS,
  SIGN_UP_FORM_DEFAULTS,
  textInputStatus,
  validateAuthEmail,
  validateAuthName,
  validateSignInPassword,
  validateSignUpPassword,
} from "../../src/lib/auth-form";
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
  return { auth, close: () => sqlite.close() };
}

describe("auth form validation (issue #43)", () => {
  it("requires a valid email format", () => {
    expect(validateAuthEmail("")).toBe("Email is required");
    expect(validateAuthEmail("not-an-email")).toBe(
      "Enter a valid email address"
    );
    expect(validateAuthEmail("runner@example.com")).toBeUndefined();
  });

  it("enforces sign-up password strength", () => {
    expect(validateSignUpPassword("")).toBe("Password is required");
    expect(validateSignUpPassword("short")).toBe(
      "Password must be at least 8 characters"
    );
    expect(validateSignUpPassword("alllowercase1")).toBe(
      "Include uppercase, lowercase, and a number"
    );
    expect(validateSignUpPassword("SecurePass1")).toBeUndefined();
  });

  it("requires sign-in password without strength rules", () => {
    expect(validateSignInPassword("")).toBe("Password is required");
    expect(validateSignInPassword("any")).toBeUndefined();
  });

  it("requires a non-empty name on sign-up", () => {
    expect(validateAuthName("   ")).toBe("Name is required");
    expect(validateAuthName("Runner")).toBeUndefined();
  });

  it("maps auth API errors to banner copy", () => {
    expect(formatAuthError({ code: "INVALID_EMAIL" })).toBe(
      "Enter a valid email address"
    );
    expect(formatAuthError({ message: "Invalid credentials" })).toBe(
      "Invalid credentials"
    );
  });

  it("exposes field helpers for TextInput status", () => {
    expect(fieldErrorMessage(["Email is required"])).toBe("Email is required");
    expect(textInputStatus("Email is required")).toStrictEqual({
      message: "Email is required",
      type: "error",
    });
  });

  it("documents default form values and post-auth path", () => {
    expect(SIGN_IN_FORM_DEFAULTS).toStrictEqual({
      email: "",
      password: "",
    });
    expect(SIGN_UP_FORM_DEFAULTS).toStrictEqual({
      email: "",
      name: "",
      password: "",
    });
    expect(AUTH_SUCCESS_PATH).toBe("/dashboard");
  });
});

describe("auth route helpers (issue #43)", () => {
  it("detects auth-only routes for chrome shell bypass", () => {
    expect(isAuthRoute("/sign-in")).toBeTruthy();
    expect(isAuthRoute("/sign-up")).toBeTruthy();
    expect(isAuthRoute("/nutrition")).toBeFalsy();
  });

  it("enables GitHub buttons only when credentials exist", () => {
    expect(readGithubProviderConfig({})).toStrictEqual({ github: false });
    expect(
      readGithubProviderConfig({
        GITHUB_CLIENT_ID: "id",
        GITHUB_CLIENT_SECRET: "secret",
      })
    ).toStrictEqual({ github: true });
  });
});

describe("auth pages wiring (issue #43)", () => {
  const signInSource = readFileSync(
    join(process.cwd(), "src/routes/sign-in/index.tsx"),
    "utf-8"
  );
  const signUpSource = readFileSync(
    join(process.cwd(), "src/routes/sign-up/index.tsx"),
    "utf-8"
  );
  const shellSource = readFileSync(
    join(process.cwd(), "src/components/auth/auth-page-shell.tsx"),
    "utf-8"
  );

  it("sign-in uses TanStack Form, TextInput, and Banner for API errors", () => {
    expect(signInSource).toContain("useForm");
    expect(signInSource).toContain("signIn.email");
    expect(signInSource).toContain("validateAuthEmail");
    expect(shellSource).toContain('<Banner status="error"');
    expect(signInSource).toContain('alternateHref="/sign-up"');
    expect(signInSource).toContain("Sign in with GitHub");
  });

  it("sign-up validates email and password inline", () => {
    expect(signUpSource).toContain("validateSignUpPassword");
    expect(signUpSource).toContain("signUp.email");
    expect(signUpSource).toContain('alternateHref="/sign-in"');
  });

  it("centers the auth card with Astryx layout primitives only", () => {
    expect(shellSource).toContain("<Center");
    expect(shellSource).toContain("<Card");
    expect(shellSource).not.toContain("style={{");
    expect(shellSource).not.toContain("<motion.div");
  });
});

describe("email auth session flow (issue #43)", () => {
  it("signs up and signs in with a persistent session token", async () => {
    const { auth, close } = createInMemoryAuth();
    try {
      const signUp = await auth.api.signUpEmail({
        body: {
          email: "auth-ui@example.com",
          name: "Auth UI",
          password: "SecurePass1",
        },
      });
      expect(signUp.user.email).toBe("auth-ui@example.com");
      expect(signUp.token).toBeTruthy();

      const signIn = await auth.api.signInEmail({
        body: {
          email: "auth-ui@example.com",
          password: "SecurePass1",
        },
      });
      expect(signIn.token).toBeTruthy();
      expect(signIn.user.name).toBe("Auth UI");
    } finally {
      close();
    }
  });
});
