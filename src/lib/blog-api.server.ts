import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { BlogContentReader } from "./blog";

/** Resolves `content/blog` relative to the project root. */
export function resolveBlogContentDir(cwd = process.cwd()): string {
  return join(cwd, "content", "blog");
}

export function createDefaultBlogReader(
  cwd = process.cwd()
): BlogContentReader {
  const contentDir = resolveBlogContentDir(cwd);

  return {
    listFilenames: () =>
      readdirSync(contentDir).filter((name) => name.endsWith(".md")),
    readFile: (filename) => readFileSync(join(contentDir, filename), "utf-8"),
  };
}
