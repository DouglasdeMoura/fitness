import { execSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findTopLevelNodeBuiltinImports,
  formatClientImportGraphViolation,
  scanClientImportGraphViolations,
} from "./client-import-graph-scan";

function expectNoGateViolations(
  violations: ReturnType<typeof scanClientImportGraphViolations>
): void {
  const failureDetails = violations
    .map(formatClientImportGraphViolation)
    .join("\n");
  expect(violations, failureDetails).toStrictEqual([]);
}

describe("client import graph scanner (issue #87)", () => {
  it("flags top-level node:fs imports in route-reachable modules", () => {
    const source = [
      'import { readdirSync } from "node:fs";',
      'import { createServerFn } from "@tanstack/react-start";',
      "",
      "export const listBlogPosts = createServerFn({ method: 'GET' }).handler(async () => []);",
    ].join("\n");

    const violations = findTopLevelNodeBuiltinImports(
      source,
      "src/lib/blog-api.ts"
    );

    expect(violations).toStrictEqual([
      {
        filePath: "src/lib/blog-api.ts",
        line: 1,
        specifier: "node:fs",
      },
    ]);
    expect(formatClientImportGraphViolation(violations[0]!)).toBe(
      "src/lib/blog-api.ts:1 imports node:fs into the client-reachable graph"
    );
  });

  it("allows node builtins in .server.ts modules", () => {
    const source = 'import { readFileSync } from "node:fs";';

    expect(
      findTopLevelNodeBuiltinImports(source, "src/lib/blog-api.server.ts")
    ).toStrictEqual([]);
  });

  it("allows dynamic imports inside server-function handlers", () => {
    const source = [
      'import { createServerFn } from "@tanstack/react-start";',
      "",
      "export const listBlogPosts = createServerFn({ method: 'GET' }).handler(async () => {",
      '  const { createDefaultBlogReader } = await import("./blog-api.server");',
      "  return createDefaultBlogReader();",
      "});",
    ].join("\n");

    expect(
      findTopLevelNodeBuiltinImports(source, "src/lib/blog-api.ts")
    ).toStrictEqual([]);
  });

  it("flags the pre-#86 blog-api.ts import graph regression", () => {
    const projectRoot = join(import.meta.dirname, "../..");
    const preFixSource = execSync("git show 2ae73a5:src/lib/blog-api.ts", {
      cwd: projectRoot,
      encoding: "utf-8",
    });

    const violations = findTopLevelNodeBuiltinImports(
      preFixSource,
      "src/lib/blog-api.ts"
    );

    expect(violations.map((violation) => violation.specifier)).toContain(
      "node:fs"
    );
    expect(violations[0]?.filePath).toBe("src/lib/blog-api.ts");
  });
});

describe("client import graph repository gate (issue #87)", () => {
  const projectRoot = join(import.meta.dirname, "../..");
  const allViolations = scanClientImportGraphViolations(projectRoot);

  it("has no Node builtin imports in the route-tree client graph", () => {
    expectNoGateViolations(allViolations);
  });

  it("fails when a route module adds a top-level node:fs import", () => {
    const source = [
      'import { readFileSync } from "node:fs";',
      'import { createFileRoute } from "@tanstack/react-router";',
      "",
      "export const Route = createFileRoute('/test')({ component: () => null });",
    ].join("\n");

    const violations = findTopLevelNodeBuiltinImports(
      source,
      "src/routes/test-route.tsx"
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.specifier).toBe("node:fs");
  });
});
