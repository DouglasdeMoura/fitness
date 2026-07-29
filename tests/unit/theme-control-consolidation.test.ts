import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findThemeControlMarkers,
  formatThemeControlMarker,
  formatThemeControlScanFailure,
  scanThemeControlModules,
  THEME_CONTROL_OWNER,
} from "./theme-control-scan";

const projectRoot = process.cwd();
const appChromeSource = readFileSync(
  join(projectRoot, "src/components/app-chrome.tsx"),
  "utf-8"
);
const appSpecSource = readFileSync(
  join(projectRoot, "tests/e2e/app.spec.ts"),
  "utf-8"
);
const settingsSource = readFileSync(
  join(projectRoot, THEME_CONTROL_OWNER),
  "utf-8"
);
const appChromeLibSource = readFileSync(
  join(projectRoot, "src/lib/app-chrome.ts"),
  "utf-8"
);

function expectSingleThemeControlOwner(
  modules: ReturnType<typeof scanThemeControlModules>
): void {
  const failureDetails = formatThemeControlScanFailure(modules);
  expect(modules, failureDetails).toHaveLength(1);
  expect(modules[0]?.filePath, failureDetails).toBe(THEME_CONTROL_OWNER);
}

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

describe("theme control single-owner scan (issue #95)", () => {
  const repositoryModules = scanThemeControlModules(projectRoot);

  it("finds exactly one theme control module in src/, owned by Settings", () => {
    expectSingleThemeControlOwner(repositoryModules);
  });

  it("keeps AppChrome subscribe-only with no persistTheme writes", () => {
    expect(appChromeSource).not.toContain("persistTheme");
  });

  it("flags persistTheme handler calls outside the definition module", () => {
    const markers = findThemeControlMarkers(
      [
        'import { persistTheme } from "~/lib/app-chrome";',
        "const onToggle = () => {",
        '  persistTheme("dark");',
        "};",
      ].join("\n"),
      "src/components/experimental-toggle.tsx"
    );

    expect(markers).toStrictEqual([
      {
        filePath: "src/components/experimental-toggle.tsx",
        kind: "persistTheme-handler",
        line: 3,
        lineContent: 'persistTheme("dark");',
      },
    ]);
    expect(formatThemeControlMarker(markers[0]!)).toBe(
      'src/components/experimental-toggle.tsx:3 persistTheme("dark");'
    );
  });

  it("does not treat the persistTheme definition or Settings import as a control", () => {
    expect(findThemeControlMarkers(appChromeLibSource, "src/lib/app-chrome.ts")).toStrictEqual(
      []
    );
    expect(
      findThemeControlMarkers(settingsSource, THEME_CONTROL_OWNER).some(
        (marker) => marker.kind === "toggle-dark-mode-label"
      )
    ).toBe(false);
    expect(
      findThemeControlMarkers(settingsSource, THEME_CONTROL_OWNER).some(
        (marker) => marker.kind === "persistTheme-handler"
      )
    ).toBe(true);
  });

  it("flags the pre-#94 header toggle regression from commit 9f20e08^", () => {
    const preBatchFourAppChrome = execSync(
      "git show 9f20e08^:src/components/app-chrome.tsx",
      { cwd: projectRoot, encoding: "utf-8" }
    );
    const headerMarkers = findThemeControlMarkers(
      preBatchFourAppChrome,
      "src/components/app-chrome.tsx"
    );

    expect(headerMarkers.map(formatThemeControlMarker)).toEqual(
      expect.arrayContaining([
        'src/components/app-chrome.tsx:198 label="Toggle dark mode"',
        "src/components/app-chrome.tsx:202 persistTheme(nextMode);",
      ])
    );

    const regressionModules = [
      {
        filePath: "src/components/app-chrome.tsx",
        markers: headerMarkers,
      },
      {
        filePath: THEME_CONTROL_OWNER,
        markers: findThemeControlMarkers(settingsSource, THEME_CONTROL_OWNER),
      },
    ];
    const failureDetails = formatThemeControlScanFailure(regressionModules);
    expect(failureDetails).toContain(
      "expected exactly one theme control module, found 2"
    );
    expect(failureDetails).toContain(
      'src/components/app-chrome.tsx:198 label="Toggle dark mode"'
    );
    expect(failureDetails).toContain(
      "src/components/app-chrome.tsx:202 persistTheme(nextMode);"
    );
  });
});
