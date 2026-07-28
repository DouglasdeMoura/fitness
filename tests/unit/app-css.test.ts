import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP_CSS_PATH = join(process.cwd(), "src/styles/app.css");

const ALLOWED_IMPORTS = [
  '@import "@astryxdesign/core/reset.css";',
  '@import "@astryxdesign/core/astryx.css";',
  '@import "../lib/generated/fittrack-neutral/theme.css";',
] as const;

/** Non-empty lines that are not @import statements (issue #16 / PRD 03 Batch 8). */
function findCustomCssLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("@import "));
}

describe("app.css Astryx-only imports (issue #16)", () => {
  const content = readFileSync(APP_CSS_PATH, "utf-8");

  it("contains only the three Astryx theme imports", () => {
    const imports = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("@import "));

    expect(imports).toStrictEqual([...ALLOWED_IMPORTS]);
  });

  it("has no custom selectors, media queries, or declarations", () => {
    const custom = findCustomCssLines(content);
    expect(custom, custom.join("\n")).toStrictEqual([]);
  });
});
