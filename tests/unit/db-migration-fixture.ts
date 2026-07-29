import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";

export interface UnmigratableDbFixture {
  cleanup: () => void;
  dbPath: string;
}

/**
 * Builds the unmigratable state from PRD 17: 0000 schema present, empty journal.
 *
 * @example
 * const fixture = createUnmigratableDbFixture();
 * recoverDevDatabase({ dbPath: fixture.dbPath });
 * fixture.cleanup();
 */
export function createUnmigratableDbFixture(): UnmigratableDbFixture {
  const scratchRoot = mkdtempSync(join(tmpdir(), "fittrack-unmigratable-"));
  const dbPath = join(scratchRoot, "fittrack.db");
  const migrationSql = readFileSync(
    join(process.cwd(), "drizzle", "0000_jazzy_zaran.sql"),
    "utf-8"
  );

  const sqlite = new Database(dbPath);
  for (const statement of migrationSql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) {
      sqlite.exec(trimmed);
    }
  }

  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)"
  );
  sqlite.close();

  return {
    cleanup: () => rmSync(scratchRoot, { force: true, recursive: true }),
    dbPath,
  };
}
