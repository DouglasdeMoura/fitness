import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const tsconfigSource = readFileSync(
  join(projectRoot, "tsconfig.json"),
  "utf-8"
);
const typeGateSource = readFileSync(
  join(projectRoot, "scripts/theme-color-mode-typecheck.ts"),
  "utf-8"
);
const appChromeSource = readFileSync(
  join(projectRoot, "src/lib/app-chrome.ts"),
  "utf-8"
);

/**
 * Issue #106 was filed when iteration 5 on #97 failed `npm run typecheck` after
 * widening ColorMode to include "system". The dev-loop gate only typechecks
 * `src/` and `scripts/`, so these source gates keep that script on the path.
 */
describe("typecheck regression gate (issue #106)", () => {
  it("includes scripts/ in tsconfig so compile-time theme gates run under typecheck", () => {
    expect(tsconfigSource).toMatch(/"include"\s*:\s*\[[^\]]*"scripts"/);
  });

  it("keeps the ColorMode binary type gate in scripts/", () => {
    expect(typeGateSource).toContain('Equal<ColorMode, "light" | "dark">');
    expect(typeGateSource).toContain(
      'Equal<ThemePreference, "light" | "dark" | "system">'
    );
    expect(typeGateSource).toContain("@ts-expect-error");
    expect(typeGateSource).toContain(
      'const _systemIsNotColorMode: ColorMode = "system"'
    );
  });

  it("maps browser chrome colours by resolved ColorMode only, not ThemePreference", () => {
    expect(appChromeSource).toMatch(
      /const THEME_COLOR_BY_MODE:\s*Record<ColorMode,\s*string>\s*=\s*\{/
    );
    expect(appChromeSource).not.toMatch(
      /const THEME_COLOR_BY_MODE:[\s\S]*\bsystem\s*:/
    );
  });
});
