import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Source gate for the always-visible bottom navigation bar.
 *
 * The behaviour itself is covered by tests/e2e/bottom-nav.spec.ts; this keeps a
 * fast signal on the three parts that silently regress: the fixed positioning,
 * the visible labels, and the bar living outside the animated page section.
 */
const BOTTOM_NAV_CSS = readFileSync(
  join(process.cwd(), "src/styles/bottom-nav.css"),
  "utf-8"
);

const APP_CHROME_SOURCE = readFileSync(
  join(process.cwd(), "src/components/app-chrome.tsx"),
  "utf-8"
);

const ROOT_ROUTE_SOURCE = readFileSync(
  join(process.cwd(), "src/routes/__root.tsx"),
  "utf-8"
);

describe("bottom-nav.css", () => {
  it("pins the bar to the viewport bottom", () => {
    expect(BOTTOM_NAV_CSS).toMatch(
      /\[data-fittrack-bottom-nav\]\s*\{[^}]*position:\s*fixed/
    );
    expect(BOTTOM_NAV_CSS).toMatch(
      /\[data-fittrack-bottom-nav\]\s*\{[^}]*bottom:\s*0/
    );
  });

  it("pads the bar for the home-indicator safe area", () => {
    expect(BOTTOM_NAV_CSS).toMatch(
      /--app-safe-area-bottom:\s*env\(safe-area-inset-bottom/
    );
    expect(BOTTOM_NAV_CSS).toMatch(
      /padding-bottom:\s*var\(--app-safe-area-bottom\)/
    );
  });

  it("reserves content space equal to the bar height", () => {
    expect(BOTTOM_NAV_CSS).toMatch(
      /\[data-fittrack-app-content\]\s*\{[^}]*padding-bottom:\s*var\(--app-bottom-nav-height\)/
    );
  });

  it("uses tokens rather than raw lengths or colours", () => {
    const declarations = BOTTOM_NAV_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // 0px is only allowed inside the env() safe-area fallback.
    expect(declarations.replaceAll(/env\([^)]*\)/g, "")).not.toMatch(
      /\b[1-9]\d*px\b/
    );
  });

  it("is loaded as a stylesheet from the root route", () => {
    expect(ROOT_ROUTE_SOURCE).toMatch(
      /import bottomNavCss from "~\/styles\/bottom-nav\.css\?url"/
    );
    expect(ROOT_ROUTE_SOURCE).toMatch(
      /\{\s*href:\s*bottomNavCss,\s*rel:\s*"stylesheet"\s*\}/
    );
  });
});

describe("BottomNavBar markup", () => {
  it("tags the tab list so bottom-nav.css can reach it", () => {
    expect(APP_CHROME_SOURCE).toMatch(/data-fittrack-bottom-nav=""/);
    expect(APP_CHROME_SOURCE).toMatch(
      /aria-label="FitTrack primary navigation"/
    );
  });

  it("shows every item label instead of hiding it", () => {
    expect(APP_CHROME_SOURCE).not.toMatch(/isLabelHidden/);
  });

  it("renders outside the transformed page section", () => {
    const section = APP_CHROME_SOURCE.slice(
      APP_CHROME_SOURCE.indexOf("<section data-fittrack-app-content"),
      APP_CHROME_SOURCE.indexOf("</section>")
    );
    expect(section).not.toBe("");
    expect(section).not.toMatch(/<BottomNavBar/);
    expect(APP_CHROME_SOURCE).toMatch(/<BottomNavBar \/>/);
  });
});
