import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "~/lib/app-chrome";

const projectRoot = process.cwd();
const srcRoot = join(projectRoot, "src");

const rootRouteSource = readFileSync(
  join(projectRoot, "src/routes/__root.tsx"),
  "utf-8"
);
const appChromeSource = readFileSync(
  join(projectRoot, "src/components/app-chrome.tsx"),
  "utf-8"
);
const appChromeLibSource = readFileSync(
  join(projectRoot, "src/lib/app-chrome.ts"),
  "utf-8"
);

const THEME_DEFAULT_DEFINITION =
  /export const DEFAULT_COLOR_MODE:\s*ColorMode\s*=\s*["']light["']/g;

const HARDCODED_THEME_STATE_DEFAULT =
  /useState<["']light["']\s*\|\s*["']dark["']>\(["']light["']\)/;

const HARDCODED_THEME_RESOLVE_FALLBACK =
  /prefersDark\s*\?\s*["']dark["']\s*:\s*["']light["']/;

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (entry === "generated") {
        continue;
      }
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if (absolutePath.endsWith(".ts") || absolutePath.endsWith(".tsx")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

describe("pre-paint theme bootstrap (issue #76)", () => {
  it("sets data-theme and color-scheme from the same resolved value", () => {
    expect(rootRouteSource).toContain("dataset.theme = theme");
    expect(rootRouteSource).toContain("style.colorScheme = theme");
  });

  it("prevents React from hoisting stylesheets ahead of the script", () => {
    const scriptPosition = rootRouteSource.indexOf("THEME_BOOTSTRAP_SCRIPT");
    const headContentPosition = rootRouteSource.indexOf(
      "<ThemeFirstHeadContent />"
    );

    expect(rootRouteSource).toContain("onLoad: PRESERVE_STYLESHEET_ORDER");
    expect(scriptPosition).toBeGreaterThan(-1);
    expect(scriptPosition).toBeLessThan(headContentPosition);
  });

  it("synchronizes the Astryx provider before the client bundle runs", () => {
    const providerScriptPosition = rootRouteSource.indexOf(
      "<script>{THEME_PROVIDER_SYNC_SCRIPT}</script>"
    );
    const clientScriptsPosition = rootRouteSource.indexOf("<Scripts />");

    expect(rootRouteSource).toContain("provider.style.colorScheme = theme");
    expect(providerScriptPosition).toBeGreaterThan(-1);
    expect(providerScriptPosition).toBeLessThan(clientScriptsPosition);
  });

  it("initializes React theme state lazily from the root attribute", () => {
    expect(appChromeSource).toContain("document.documentElement.dataset.theme");
    expect(appChromeSource).not.toContain(
      'useState<"light" | "dark">("light")'
    );
  });
});

describe("system preference and browser chrome (issue #78)", () => {
  it("resolves prefers-color-scheme before the first paint", () => {
    expect(rootRouteSource).toContain("DARK_COLOR_SCHEME_QUERY");
    expect(rootRouteSource).toContain("prefersDark");
  });

  it("drives theme-color from the resolved theme before paint", () => {
    expect(rootRouteSource).toContain('meta[name="theme-color"]');
    expect(rootRouteSource).toContain("THEME_COLOR_DARK");
    expect(rootRouteSource).toContain("THEME_COLOR_LIGHT");
    expect(rootRouteSource).toContain(
      `content: THEME_COLOR_LIGHT, name: "theme-color"`
    );
    expect(THEME_COLOR_LIGHT).not.toBe(THEME_COLOR_DARK);
  });

  it("keeps following the OS theme until the user makes an explicit choice", () => {
    expect(appChromeSource).toContain("subscribeToSystemTheme");
  });
});

describe("theme flash gates (issue #79)", () => {
  it("defines the light theme default literal exactly once in src/", () => {
    const offenders: string[] = [];

    for (const filePath of collectSourceFiles(srcRoot)) {
      const source = readFileSync(filePath, "utf-8");
      const matches = countMatches(source, THEME_DEFAULT_DEFINITION);
      if (matches > 0) {
        offenders.push(`${relative(projectRoot, filePath)} (${matches})`);
      }
    }

    expect(
      offenders,
      "DEFAULT_COLOR_MODE must be declared in exactly one file"
    ).toEqual(["src/lib/app-chrome.ts (1)"]);
  });

  it("rejects a second hardcoded theme fallback default", () => {
    expect(appChromeSource).not.toMatch(HARDCODED_THEME_STATE_DEFAULT);
    expect(appChromeLibSource).toMatch(
      /return prefersDark \? "dark" : DEFAULT_COLOR_MODE/
    );
    expect(rootRouteSource).toMatch(/\$\{DEFAULT_COLOR_MODE\}/);
    expect(rootRouteSource).not.toMatch(HARDCODED_THEME_RESOLVE_FALLBACK);
  });

  it("documents the domcontentloaded-vs-settled screenshot gate in e2e", () => {
    const spec = readFileSync(
      join(projectRoot, "tests/e2e/theme-flash.spec.ts"),
      "utf-8"
    );
    const helpers = readFileSync(
      join(projectRoot, "tests/e2e/theme-flash-helpers.ts"),
      "utf-8"
    );
    const config = readFileSync(
      join(projectRoot, "playwright.config.ts"),
      "utf-8"
    );

    expect(spec).toMatch(/first paint equals settled frame/i);
    expect(spec).toContain('"light"');
    expect(spec).toContain('"dark"');
    expect(helpers).toContain('waitUntil: "domcontentloaded"');
    expect(helpers).toContain("getVisualMaskLocators");
    expect(helpers).toContain(
      "color-scheme must be set on <html> before hydration"
    );
    expect(config).toContain("theme-flash");
    expect(config).toContain("chromium");
    expect(config).toContain("pixel-7");
  });

  it("keeps color-scheme on <html> in the pre-paint bootstrap script", () => {
    const bootstrapStart = rootRouteSource.indexOf(
      "const THEME_BOOTSTRAP_SCRIPT"
    );
    const bootstrapEnd = rootRouteSource.indexOf(
      "const THEME_PROVIDER_SYNC_SCRIPT"
    );
    const bootstrapScript = rootRouteSource.slice(bootstrapStart, bootstrapEnd);

    expect(bootstrapScript).toContain("root.style.colorScheme = theme");
    expect(bootstrapScript).not.toContain("<Scripts");
  });
});
