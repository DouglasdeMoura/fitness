import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Applies every Drizzle SQL migration in lexical order (issue #42 auth tables). */
export function readAllMigrationSql(): string {
  const migrationDirectory = join(process.cwd(), "drizzle");
  const migrationFiles = readdirSync(migrationDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  return migrationFiles
    .map((fileName) =>
      readFileSync(join(migrationDirectory, fileName), "utf-8")
    )
    .join("\n");
}
