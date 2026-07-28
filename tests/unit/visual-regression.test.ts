import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_ROUTES } from "../e2e/test-helpers";
import { VISUAL_MASK_SELECTOR } from "../e2e/visual-helpers";

describe("visual regression gate (issue #51)", () => {
  it("documents that screenshots detect change, not quality", () => {
    const spec = readFileSync(
      join(import.meta.dirname, "../e2e/visual.spec.ts"),
      "utf-8"
    );
    expect(spec).toMatch(/detects unintended \*change\*, not design quality/i);
  });

  it("iterates APP_ROUTES at mobile and desktop widths in light and dark", () => {
    const spec = readFileSync(
      join(import.meta.dirname, "../e2e/visual.spec.ts"),
      "utf-8"
    );
    expect(spec).toMatch(/for \(const route of APP_ROUTES\)/);
    expect(spec).toContain("mobile");
    expect(spec).toContain("desktop");
    expect(spec).toContain('"light"');
    expect(spec).toContain('"dark"');
    expect(APP_ROUTES.length).toBeGreaterThan(0);
  });

  it("configures strict screenshot diff — any pixel change fails", () => {
    const config = readFileSync(
      join(process.cwd(), "playwright.config.ts"),
      "utf-8"
    );
    expect(config).toMatch(/maxDiffPixels:\s*0/);
  });

  it("exports a shared mask selector for clock-derived UI", () => {
    expect(VISUAL_MASK_SELECTOR).toBe("[data-visual-mask]");
  });
});
