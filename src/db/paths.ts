import { join } from "node:path";

/** SQLite file used by the app unless `DATABASE_PATH` overrides it. */
export function resolveDbPath(): string {
  return (
    process.env.DATABASE_PATH || join(process.cwd(), "data", "fittrack.db")
  );
}
