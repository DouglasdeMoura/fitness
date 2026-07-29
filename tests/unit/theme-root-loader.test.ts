import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveTheme,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
} from "~/lib/app-chrome";
import type { ThemePreference } from "~/lib/app-chrome";

const projectRoot = process.cwd();
const srcRoot = join(projectRoot, "src");
const rootRouteSource = readFileSync(
  join(projectRoot, "src/routes/__root.tsx"),
  "utf-8"
);
const appChromeSource = readFileSync(
  join(projectRoot, "src/lib/app-chrome.ts"),
  "utf-8"
);

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = join(directory, entry);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(filePath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(filePath);
    }
  }

  return files;
}

function extractThemePreferenceHandlerBody(source: string): string {
  const handlerStart = source.indexOf("fetchRootThemePreference");
  const handlerEnd = source.indexOf("export const Route = createRootRoute");
  return source.slice(handlerStart, handlerEnd);
}

function extractBootstrapScript(source: string): string {
  const bootstrapStart = source.indexOf("const THEME_BOOTSTRAP_SCRIPT");
  const bootstrapEnd = source.indexOf("const THEME_PROVIDER_SYNC_SCRIPT");
  return source.slice(bootstrapStart, bootstrapEnd);
}

function resolveBootstrapTheme(
  preference: string | null,
  prefersDark: boolean
): { colorScheme: string; dataTheme: string; themeColor: string } {
  let normalized = preference;
  if (normalized !== "light" && normalized !== "dark") {
    normalized = "system";
  }
  const theme = resolveTheme(normalized as ThemePreference, prefersDark);
  return {
    colorScheme: theme,
    dataTheme: theme,
    themeColor: theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT,
  };
}

describe("root theme loader (issue #104)", () => {
  it("does not export THEME_STORAGE_KEY from app-chrome", () => {
    expect(appChromeSource).not.toContain("THEME_STORAGE_KEY");
  });

  it("removes THEME_STORAGE_KEY from every file under src/", () => {
    const offenders: string[] = [];

    for (const filePath of collectSourceFiles(srcRoot)) {
      const source = readFileSync(filePath, "utf-8");
      if (source.includes("THEME_STORAGE_KEY")) {
        offenders.push(relative(projectRoot, filePath));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("does not import ~/db modules at the module top level in __root.tsx", () => {
    const importLines = rootRouteSource
      .split("\n")
      .filter((line) => line.startsWith("import "));

    for (const line of importLines) {
      expect(line).not.toMatch(/import\s+(?!type\b).*from\s+["']~\/db/);
      expect(line).not.toContain("theme-preference-persistence");
      expect(line).not.toContain("user-body-queries");
    }
  });

  it("loads theme preference through a createServerFn handler", () => {
    expect(rootRouteSource).toMatch(
      /createServerFn\s*\(\s*\{\s*method:\s*["']GET["']\s*\}\s*\)\s*\.handler/
    );
    expect(rootRouteSource).toContain("fetchRootThemePreference");
    expect(rootRouteSource).toMatch(
      /themePreference:\s*await\s+fetchRootThemePreference\(\)/
    );
  });

  it("reads the session through fetchServerSession only", () => {
    const handlerBody = extractThemePreferenceHandlerBody(rootRouteSource);

    expect(handlerBody).toContain("fetchServerSession");
    expect(rootRouteSource).not.toMatch(
      /auth\.api\.getSession|requireAuth\s*\(/
    );
  });

  it("returns system without a theme database read when there is no session", () => {
    const handlerBody = extractThemePreferenceHandlerBody(rootRouteSource);
    const noSessionBranch = handlerBody.match(
      /if\s*\(\s*!session\s*\)\s*\{([^}]*)\}/
    )?.[1];

    expect(handlerBody).toMatch(/if\s*\(\s*!session\s*\)/);
    expect(handlerBody).toMatch(/return\s+"system"/);
    expect(noSessionBranch).toBeDefined();
    expect(noSessionBranch).not.toContain("getStoredThemePreference");
    expect(noSessionBranch).not.toContain("ensureSessionUserRecord");
  });

  it("reads the stored preference only after a session exists via dynamic imports", () => {
    const handlerBody = extractThemePreferenceHandlerBody(rootRouteSource);

    expect(handlerBody).toMatch(/await\s+import\s*\(\s*["']~\/db["']\s*\)/);
    expect(handlerBody).toMatch(
      /await\s+import\s*\(\s*["']~\/db\/user-body-queries["']\s*\)/
    );
    expect(handlerBody).toMatch(
      /await\s+import\s*\(\s*["']~\/lib\/theme-preference-persistence["']\s*\)/
    );
    expect(handlerBody).toContain("getStoredThemePreference");
    expect(handlerBody).toContain("ensureSessionUserRecord");
    expect(handlerBody.indexOf("getStoredThemePreference")).toBeGreaterThan(
      handlerBody.indexOf("if (!session)")
    );
  });

  it("renders the preference on the opening html tag", () => {
    expect(rootRouteSource).toContain(
      "data-theme-preference={themePreference}"
    );
    expect(rootRouteSource).toContain("Route.useLoaderData()");
    expect(rootRouteSource).toContain(
      "setClientThemePreference(themePreference)"
    );
  });

  it("drives the blocking bootstrap script from the server-rendered preference", () => {
    const bootstrapScript = extractBootstrapScript(rootRouteSource);

    expect(bootstrapScript).toContain('getAttribute("data-theme-preference")');
    expect(bootstrapScript).not.toContain("localStorage");
    expect(bootstrapScript).toContain("DARK_COLOR_SCHEME_QUERY");
    expect(bootstrapScript).toContain("root.dataset.theme = theme");
    expect(bootstrapScript).toContain("root.style.colorScheme = theme");
    expect(bootstrapScript).toContain("THEME_COLOR_DARK");
    expect(bootstrapScript).toContain("THEME_COLOR_LIGHT");
    expect(bootstrapScript).toContain("DEFAULT_COLOR_MODE");
  });

  it.each([
    { preference: "dark", prefersDark: false, resolved: "dark" },
    { preference: "light", prefersDark: true, resolved: "light" },
    { preference: "system", prefersDark: true, resolved: "dark" },
    { preference: "system", prefersDark: false, resolved: "light" },
    { preference: null, prefersDark: true, resolved: "dark" },
  ] as const)(
    "resolves bootstrap preference $preference with OS prefersDark=$prefersDark to $resolved",
    ({ preference, prefersDark, resolved }) => {
      const result = resolveBootstrapTheme(preference, prefersDark);
      expect(result).toEqual({
        colorScheme: resolved,
        dataTheme: resolved,
        themeColor: resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT,
      });
    }
  );
});
