import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDatabasePath = process.env.DATABASE_PATH;
let scratchRoot = "";

/**
 * getDb() memoises its connection in module scope, so every case has to reset
 * the module registry to exercise the first-call path that creates the file.
 */
async function openDatabaseAt(dbPath: string) {
  process.env.DATABASE_PATH = dbPath;
  vi.resetModules();
  const { getDb } = await import("~/lib/db");
  return getDb();
}

describe("getDb database path", () => {
  beforeEach(() => {
    scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-db-path-"));
  });

  afterEach(() => {
    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
    rmSync(scratchRoot, { force: true, recursive: true });
  });

  // Regression: the mkdir used to run in a `.then()` callback, so it landed a
  // microtask AFTER `new Database()` had already tried to open the file. The
  // first run in any tree without data/ failed, and the late mkdir made the
  // retry pass — which read as an intermittent fault rather than a bug.
  it("creates missing parent directories before opening the file", async () => {
    const dbPath = join(scratchRoot, "nested", "deeper", "fittrack.db");

    const db = await openDatabaseAt(dbPath);

    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });

  it("opens DATABASE_PATH rather than the default data/fittrack.db", async () => {
    const dbPath = join(scratchRoot, "custom-name.db");

    const db = await openDatabaseAt(dbPath);

    expect(db.name).toBe(dbPath);
    expect(existsSync(join(process.cwd(), "data", "custom-name.db"))).toBe(
      false
    );
    db.close();
  });
});
