import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { foods } from "../../src/db/schema";
import { createDrizzleTestDb } from "./drizzle-test-db";
import type { DrizzleTestDb } from "./drizzle-test-db";

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
}

/**
 * Regression guard for issue #41: the app data layer must use Drizzle only.
 */
describe("Drizzle-only data layer (issue #41)", () => {
  let fixture: DrizzleTestDb;

  beforeEach(() => {
    fixture = createDrizzleTestDb();
  });

  afterEach(() => {
    fixture.close();
  });

  it("has no db.prepare calls under src/", () => {
    const offenders = collectSourceFiles(join(process.cwd(), "src")).flatMap(
      (path) => {
        const text = readFileSync(path, "utf-8");
        return /\bdb\.prepare\b/.test(text) ? [path] : [];
      }
    );
    expect(offenders).toStrictEqual([]);
  });

  it("can query through Drizzle without raw SQL", () => {
    const count = fixture.db.select().from(foods).all().length;
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
