import { existsSync } from "node:fs";
import { join } from "node:path";

import type { FullConfig } from "@playwright/test";

const E2E_DB = join(process.cwd(), "data", "e2e-fittrack.db");

/**
 * Prepare an isolated SQLite file with migrations, seed data, and the demo
 * auth account so authenticated routes render in Playwright (issue #51).
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  process.env.DATABASE_PATH = E2E_DB;
  if (!existsSync(E2E_DB)) {
    const { execSync } = await import("node:child_process");
    execSync("npx tsx scripts/seed.ts", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: E2E_DB },
      stdio: "inherit",
    });
  }
}
