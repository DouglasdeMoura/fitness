import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyThemePreference,
  getClientThemePreference,
  normalizeThemePreference,
  THEME_CHANGE_EVENT,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
} from "~/lib/app-chrome";
import type { ThemePreference } from "~/lib/app-chrome";

const projectRoot = process.cwd();
const settingsSource = readFileSync(
  join(projectRoot, "src/routes/settings/index.tsx"),
  "utf-8"
);

describe("settings appearance control (issue #98)", () => {
  it("renders a three-way Appearance radiogroup instead of a Dark Mode switch", () => {
    expect(settingsSource).toContain('label="Appearance"');
    expect(settingsSource).toContain('<SegmentedControlItem label="Light"');
    expect(settingsSource).toContain('<SegmentedControlItem label="System"');
    expect(settingsSource).toContain('<SegmentedControlItem label="Dark"');
    expect(settingsSource).not.toContain('label="Dark Mode"');
    expect(settingsSource).not.toContain("<Switch");
  });

  it("binds the control to ThemePreference and writes through the server function", () => {
    expect(settingsSource).toContain("ThemePreference");
    expect(settingsSource).toContain("themePreference");
    expect(settingsSource).toContain("updateThemePreference");
    expect(settingsSource).toContain('"updateThemePreference"');
    expect(settingsSource).toContain("applyThemePreference");
    expect(settingsSource).not.toContain("persistTheme");
    expect(settingsSource).not.toContain("getStoredTheme");
    expect(settingsSource).not.toContain("localStorage");
  });

  it("sources the selected segment from server loader data", () => {
    expect(settingsSource).toContain("loaderData.user?.themePreference");
    expect(settingsSource).toContain("userQuery.data?.themePreference");
    expect(settingsSource).not.toContain('getStoredTheme() === "dark"');
  });

  it("describes what System does", () => {
    expect(settingsSource).toMatch(/follows your device/i);
  });
});

describe(applyThemePreference, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { preference: "light", prefersDark: true, resolved: "light" },
    { preference: "system", prefersDark: true, resolved: "dark" },
    { preference: "system", prefersDark: false, resolved: "light" },
    { preference: "dark", prefersDark: false, resolved: "dark" },
  ] as const)(
    "stores $preference and resolves the document to $resolved",
    ({ preference, prefersDark, resolved }) => {
      const root = {
        dataset: { theme: "light" },
        style: { colorScheme: "light" },
      };
      const provider = {
        dataset: { theme: "light" },
        style: { colorScheme: "light" },
      };
      const themeMeta = { content: THEME_COLOR_LIGHT };
      const dispatchEvent = vi.fn();

      vi.stubGlobal("matchMedia", () => ({ matches: prefersDark }));
      vi.stubGlobal("window", { dispatchEvent });
      vi.stubGlobal("document", {
        body: {
          querySelector: (selector: string) =>
            selector === "[data-astryx-theme]" ? provider : null,
        },
        documentElement: root,
        querySelector: (selector: string) =>
          selector === 'meta[name="theme-color"]' ? themeMeta : null,
      } as unknown as Document);

      applyThemePreference(preference);

      expect(getClientThemePreference()).toBe(preference);
      expect(root.dataset.theme).toBe(resolved);
      expect(dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: resolved,
          type: THEME_CHANGE_EVENT,
        })
      );
      expect(themeMeta.content).toBe(
        resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
      );
    }
  );

  it("defaults absent server values to system", () => {
    expect(normalizeThemePreference(null)).toBe("system");
    expect(normalizeThemePreference()).toBe("system");
  });

  it("never writes ThemePreference through ColorMode-only APIs in settings", () => {
    expect(/persistTheme\s*\(/.test(settingsSource)).toBe(false);
    const themePreferenceValues: ThemePreference[] = [
      "light",
      "dark",
      "system",
    ];
    for (const value of themePreferenceValues) {
      expect(settingsSource).toContain(`"${value}"`);
    }
  });
});
