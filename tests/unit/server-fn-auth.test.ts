import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUTH_DELEGATED_EXECUTE_HANDLERS,
  findCreateServerFnExports,
  findServerFnAuthViolations,
  formatServerFnAuthViolation,
  PUBLIC_SERVER_FUNCTIONS,
  scanServerFnAuthViolations,
} from "./server-fn-auth-scan";

function expectNoGateViolations(
  violations: ReturnType<typeof scanServerFnAuthViolations>
): void {
  const failureDetails = violations.map(formatServerFnAuthViolation).join("\n");
  expect(violations, failureDetails).toStrictEqual([]);
}

describe("server function auth scanner (issue #84)", () => {
  it("accepts handlers that call requireAuth directly", () => {
    const source = [
      'import { createServerFn } from "@tanstack/react-start";',
      'import { requireAuth } from "./require-auth";',
      'export const getUser = createServerFn({ method: "GET" }).handler(async () => {',
      "  const { user } = await requireAuth();",
      "  return user;",
      "});",
    ].join("\n");

    expect(findServerFnAuthViolations(source, "src/lib/api.ts")).toStrictEqual(
      []
    );
  });

  it("accepts handlers that delegate to auth-enforcement execute helpers", () => {
    const source = [
      'import { createServerFn } from "@tanstack/react-start";',
      'import { executeAddWorkoutSet } from "./auth-enforcement-handlers.server";',
      'export const addWorkoutSet = createServerFn({ method: "POST" })',
      "  .handler(async (ctx) => executeAddWorkoutSet(ctx.data));",
    ].join("\n");

    expect(findServerFnAuthViolations(source, "src/lib/api.ts")).toStrictEqual(
      []
    );
  });

  it("accepts deliberate public server functions on the allowlist", () => {
    const source = [
      'import { createServerFn } from "@tanstack/react-start";',
      'export const listBlogPosts = createServerFn({ method: "GET" }).handler(',
      "  async () => []",
      ");",
    ].join("\n");

    expect(
      findServerFnAuthViolations(source, "src/lib/blog-api.ts")
    ).toStrictEqual([]);
  });

  it("flags createServerFn exports with neither requireAuth nor allowlist entry", () => {
    const source = [
      'import { createServerFn } from "@tanstack/react-start";',
      'export const leakRows = createServerFn({ method: "GET" }).handler(async () => {',
      "  return { ok: true };",
      "});",
    ].join("\n");

    const violations = findServerFnAuthViolations(source, "src/lib/api.ts");

    expect(violations).toStrictEqual([
      {
        filePath: "src/lib/api.ts",
        line: 2,
        name: "leakRows",
        rule: "missing-auth",
      },
    ]);
    expect(formatServerFnAuthViolation(violations[0]!)).toBe(
      "src/lib/api.ts:2 leakRows createServerFn export must call requireAuth() or appear in PUBLIC_SERVER_FUNCTIONS"
    );
  });
});

describe("server function auth repository gate (issue #84)", () => {
  const projectRoot = join(import.meta.dirname, "../..");
  const allViolations = scanServerFnAuthViolations(projectRoot);

  it("requires requireAuth() or an allowlist entry on every createServerFn export", () => {
    expectNoGateViolations(allViolations);
  });

  it("enumerates every createServerFn export under src/", () => {
    const names = new Set<string>();
    for (const relativePath of [
      "src/lib/api.ts",
      "src/lib/auth-form.ts",
      "src/lib/blog-api.ts",
      "src/lib/route-auth.ts",
    ]) {
      const source = readFileSync(join(projectRoot, relativePath), "utf-8");
      for (const serverFn of findCreateServerFnExports(source, relativePath)) {
        names.add(serverFn.name);
      }
    }

    expect(names.size).toBeGreaterThanOrEqual(60);
    expect(names.has("getUser")).toBe(true);
    expect(names.has("fetchServerSession")).toBe(true);
  });

  it("keeps PUBLIC_SERVER_FUNCTIONS aligned with real exports", () => {
    const names = new Set<string>();
    for (const relativePath of [
      "src/lib/api.ts",
      "src/lib/auth-form.ts",
      "src/lib/blog-api.ts",
      "src/lib/route-auth.ts",
    ]) {
      const source = readFileSync(join(projectRoot, relativePath), "utf-8");
      for (const serverFn of findCreateServerFnExports(source, relativePath)) {
        names.add(serverFn.name);
      }
    }

    for (const allowlistedName of Object.keys(PUBLIC_SERVER_FUNCTIONS)) {
      expect(names.has(allowlistedName)).toBe(true);
    }
  });

  it("documents every delegated execute helper used by thin server wrappers", () => {
    expect(AUTH_DELEGATED_EXECUTE_HANDLERS.size).toBeGreaterThan(0);
    expect(PUBLIC_SERVER_FUNCTIONS.fetchServerSession).toContain("session");
  });
});
