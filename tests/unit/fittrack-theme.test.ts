import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fittrackNeutralTheme } from "~/lib/generated/fittrack-neutral/fittrack-neutral";

import { contrastRatio } from "../e2e/design-gate-helpers";

const ROOT = process.cwd();
const APP_CSS = readFileSync(join(ROOT, "src/styles/app.css"), "utf-8");
const BUILT_CSS = readFileSync(
  join(ROOT, "src/lib/generated/fittrack-neutral/theme.css"),
  "utf-8"
);
const APP_CHROME = readFileSync(
  join(ROOT, "src/components/app-chrome.tsx"),
  "utf-8"
);
const THEME_SOURCE = readFileSync(
  join(ROOT, "src/lib/fittrack-theme.ts"),
  "utf-8"
);

/** Parse #rrggbb to RGB channels for contrast math. */
function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

describe("pre-built fittrack-neutral theme (issue #77)", () => {
  it("ships a built theme object that skips runtime style injection", () => {
    expect(fittrackNeutralTheme.__built).toBe(true);
    expect(fittrackNeutralTheme.name).toBe("fittrack-neutral");
  });

  it("loads tuned tokens from static CSS before hydration", () => {
    expect(APP_CSS).toContain(
      '@import "../lib/generated/fittrack-neutral/theme.css";'
    );
    expect(BUILT_CSS).toContain(
      "--color-text-secondary: light-dark(#525252, #a3a3a3)"
    );
    expect(BUILT_CSS).toContain(
      "background-color: light-dark(#c92a37, #ff705d)"
    );
  });

  it("keeps contrast-tuned secondary text on muted surfaces (issue #49)", () => {
    const lightSecondary = hexToRgb("#525252");
    const lightSurface = hexToRgb("#f1f1f1");
    const darkSecondary = hexToRgb("#a3a3a3");
    const darkSurface = hexToRgb("#1b1b1b");

    expect(contrastRatio(lightSecondary, lightSurface)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(contrastRatio(darkSecondary, darkSurface)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("wires AppChrome to the built theme, not runtime defineTheme", () => {
    expect(APP_CHROME).toContain(
      'import { fittrackNeutralTheme } from "~/lib/generated/fittrack-neutral/fittrack-neutral"'
    );
    expect(APP_CHROME).toContain("theme={fittrackNeutralTheme}");
    expect(APP_CHROME).not.toContain('from "~/lib/fittrack-theme"');
  });

  it("keeps fittrack-theme.ts as the build source with light-dark badge colours", () => {
    expect(THEME_SOURCE).toContain('name: "fittrack-neutral"');
    expect(THEME_SOURCE).toContain(
      '"--color-text-secondary": ["#525252", "#a3a3a3"]'
    );
    expect(THEME_SOURCE).toContain(
      'backgroundColor: "light-dark(#c92a37, #ff705d)"'
    );
    expect(fittrackNeutralTheme.tokens["--color-text-secondary"]).toBe(
      "light-dark(#525252, #a3a3a3)"
    );
  });
});
