import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
