#!/usr/bin/env node
/**
 * One-shot regression proof for issue #87: gates must fail on pre-#86 blog-api.ts.
 * Run after implementing the gates: `node scripts/verify-dev-runtime-gates.mjs`
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const blogApiPath = join(projectRoot, "src/lib/blog-api.ts");
const parentCommit = "2ae73a5";
const currentSource = readFileSync(blogApiPath, "utf-8");
const preFixSource = execSync(`git show ${parentCommit}:src/lib/blog-api.ts`, {
  cwd: projectRoot,
  encoding: "utf-8",
});

function restoreBlogApi() {
  writeFileSync(blogApiPath, currentSource, "utf-8");
}

function assertScanFailsOnPreFixBlogApi() {
  writeFileSync(blogApiPath, preFixSource, "utf-8");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(projectRoot, "scripts/verify-dev-runtime-scan-child.mjs"),
    ],
    { cwd: projectRoot, encoding: "utf-8" }
  );
  restoreBlogApi();
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error("import-graph scan did not fail on pre-#86 blog-api.ts");
  }
  console.log("✓ import-graph scan fails on pre-#86 blog-api.ts");
}

function assertDevSmokeFailsOnPreFixBlogApi() {
  writeFileSync(blogApiPath, preFixSource, "utf-8");
  const result = spawnSync(
    "npm",
    ["run", "test:e2e:dev-smoke", "--", "--grep", "loads /sign-in in vite dev"],
    {
      cwd: projectRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        E2E_REUSE_SERVER: "false",
        E2E_WEB_SERVER_COMMAND: "npm run dev",
      },
    }
  );
  restoreBlogApi();
  if (result.status === 0) {
    console.error(result.stdout);
    throw new Error(
      "dev smoke spec passed on pre-#86 blog-api.ts (expected failure)"
    );
  }
  console.log("✓ dev smoke spec fails on pre-#86 blog-api.ts");
}

try {
  assertScanFailsOnPreFixBlogApi();
  assertDevSmokeFailsOnPreFixBlogApi();
  console.log("Pre-#86 regression checks passed.");
} catch (error) {
  restoreBlogApi();
  throw error;
}
