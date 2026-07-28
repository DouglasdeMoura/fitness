import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "~/lib/app-chrome";

const rootRouteSource = readFileSync(
  join(process.cwd(), "src/routes/__root.tsx"),
  "utf-8"
);
const appChromeSource = readFileSync(
  join(process.cwd(), "src/components/app-chrome.tsx"),
  "utf-8"
);

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
