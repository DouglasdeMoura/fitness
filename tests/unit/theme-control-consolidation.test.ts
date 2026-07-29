import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const appChromeSource = readFileSync(
  join(projectRoot, "src/components/app-chrome.tsx"),
  "utf-8"
);
const appSpecSource = readFileSync(
  join(projectRoot, "tests/e2e/app.spec.ts"),
  "utf-8"
);

describe("theme control consolidation (issue #94)", () => {
  it("removes the header theme toggle from AppChrome", () => {
    expect(appChromeSource).not.toContain("ThemeToggleIcon");
    expect(appChromeSource).not.toContain("toggleColorMode");
    expect(appChromeSource).not.toContain("persistTheme");
    expect(appChromeSource).not.toContain("Toggle dark mode");
    expect(appChromeSource).not.toContain("IconButton");
  });

  it("keeps AppChrome subscribed to Settings-driven theme changes", () => {
    expect(appChromeSource).toContain("THEME_CHANGE_EVENT");
    expect(appChromeSource).toContain("subscribeToSystemTheme");
  });

  it("retargets the three dark-mode e2e tests at the Settings switch", () => {
    expect(appSpecSource).toContain('test.describe("Dark Mode Toggle"');
    expect(appSpecSource).toContain(
      "theme control lives on Settings, not in TopNav"
    );
    expect(appSpecSource).toContain(
      'page.getByRole("switch", { name: "Dark Mode" })'
    );
    expect(appSpecSource).not.toMatch(
      /getByRole\("button", \{ name: "Toggle dark mode" \}\)\.click\(\)/
    );
  });
});
