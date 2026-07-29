import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyResolvedTheme, getStoredTheme, getThemeColor, hasFixedThemeChoice, isAuthRoute, isBlogRoute, isMinimalChromeRoute, isNavSelected, isPublicMarketingRoute, isWorkoutRoute, navValueFromPath, normalizeThemePreference, persistTheme, resolveTheme, subscribeToSystemTheme, THEME_COLOR_DARK, THEME_COLOR_LIGHT, THEME_STORAGE_KEY } from '~/lib/app-chrome';
import type { ThemePreference } from '~/lib/app-chrome';

function createThemeDocument({
  root,
  provider,
  themeMeta,
}: {
  root: { dataset: { theme: string }; style: { colorScheme: string } };
  provider?: {
    dataset: { theme: string };
    style: { colorScheme: string };
  };
  themeMeta: { content: string };
}) {
  const querySelector = (selector: string) => {
    if (selector === "[data-astryx-theme]") {
      return provider ?? null;
    }
    if (selector === 'meta[name="theme-color"]') {
      return themeMeta;
    }
    return null;
  };
  return {
    body: { querySelector },
    documentElement: root,
    querySelector,
  };
}

const NAV_ITEMS = [
  { href: "/dashboard" },
  { href: "/nutrition" },
  { href: "/workout" },
  { href: "/progress" },
  { href: "/settings" },
] as const;

describe(isNavSelected, () => {
  it("selects Dashboard only on the exact home path", () => {
    expect(isNavSelected("/", "/", true)).toBeTruthy();
    expect(isNavSelected("/nutrition", "/", true)).toBeFalsy();
    expect(isNavSelected("/workout/programs", "/", true)).toBeFalsy();
  });

  it("selects section routes including nested paths", () => {
    expect(isNavSelected("/nutrition", "/nutrition")).toBeTruthy();
    expect(isNavSelected("/nutrition/templates", "/nutrition")).toBeTruthy();
    expect(isNavSelected("/nutrition/planning", "/nutrition")).toBeTruthy();
    expect(isNavSelected("/workout", "/nutrition")).toBeFalsy();
  });

  it("does not treat sibling prefixes as selected", () => {
    expect(isNavSelected("/workout-extra", "/workout")).toBeFalsy();
    expect(isNavSelected("/progress", "/workout")).toBeFalsy();
  });
});

describe(navValueFromPath, () => {
  it("maps nested routes to their primary section", () => {
    expect(navValueFromPath("/nutrition/templates", NAV_ITEMS)).toBe(
      "/nutrition"
    );
    expect(navValueFromPath("/workout/programs", NAV_ITEMS)).toBe("/workout");
  });

  it("defaults unknown paths to dashboard", () => {
    expect(navValueFromPath("/unknown", NAV_ITEMS)).toBe("/dashboard");
  });
});

describe(isAuthRoute, () => {
  it("matches sign-in and sign-up only", () => {
    expect(isAuthRoute("/sign-in")).toBeTruthy();
    expect(isAuthRoute("/sign-up")).toBeTruthy();
    expect(isAuthRoute("/")).toBeFalsy();
  });
});

describe(isWorkoutRoute, () => {
  it("matches workout index and nested workout pages", () => {
    expect(isWorkoutRoute("/workout")).toBeTruthy();
    expect(isWorkoutRoute("/workout/programs")).toBeTruthy();
    expect(isWorkoutRoute("/nutrition")).toBeFalsy();
  });
});

describe(resolveTheme, () => {
  it("prefers an explicit stored choice over the operating system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the operating system when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe(normalizeThemePreference, () => {
  it("returns system for absent and unrecognised values", () => {
    expect(normalizeThemePreference(null)).toBe("system");
    expect(normalizeThemePreference()).toBe("system");
    expect(normalizeThemePreference("purple")).toBe("system");
  });

  it("preserves recognised preference values", () => {
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("system")).toBe("system");
  });
});

describe(getThemeColor, () => {
  it("returns different browser chrome colours for light and dark", () => {
    expect(getThemeColor("light")).toBe(THEME_COLOR_LIGHT);
    expect(getThemeColor("dark")).toBe(THEME_COLOR_DARK);
    expect(THEME_COLOR_LIGHT).not.toBe(THEME_COLOR_DARK);
  });
});

describe(hasFixedThemeChoice, () => {
  it("is false for system", () => {
    expect(hasFixedThemeChoice("system")).toBe(false);
  });

  it("is false when the stored preference is absent", () => {
    expect(hasFixedThemeChoice(normalizeThemePreference(null))).toBe(false);
  });

  it("is true for light and dark", () => {
    expect(hasFixedThemeChoice("dark")).toBe(true);
    expect(hasFixedThemeChoice("light")).toBe(true);
  });
});

describe(getStoredTheme, () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      removeItem: (key: string) => {
        store[key] = undefined as unknown as string;
      },
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to light when nothing is stored", () => {
    expect(getStoredTheme()).toBe("light");
  });

  it("returns dark when fittrack-theme is dark", () => {
    localStorage.setItem("fittrack-theme", "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("uses the operating-system dark preference when nothing is stored", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(getStoredTheme()).toBe("dark");
  });

  it("follows the operating system for unknown stored values", () => {
    localStorage.setItem("fittrack-theme", "sepia");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(getStoredTheme()).toBe("dark");
  });

  it("resolves stored system preference against the operating system", () => {
    localStorage.setItem("fittrack-theme", "system");
    expect(
      normalizeThemePreference(localStorage.getItem("fittrack-theme"))
    ).toBe("system");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(getStoredTheme()).toBe("dark");

    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(getStoredTheme()).toBe("light");
  });
});

describe(applyResolvedTheme, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates the root, provider, and theme-color meta tag", () => {
    const root = {
      dataset: { theme: "light" },
      style: { colorScheme: "light" },
    };
    const provider = {
      dataset: { theme: "light" },
      style: { colorScheme: "light" },
    };
    const themeMeta = { content: THEME_COLOR_LIGHT };
    vi.stubGlobal(
      "document",
      createThemeDocument({ provider, root, themeMeta })
    );

    applyResolvedTheme("dark");

    expect(root).toEqual({
      dataset: { theme: "dark" },
      style: { colorScheme: "dark" },
    });
    expect(provider).toEqual(root);
    expect(themeMeta.content).toBe(THEME_COLOR_DARK);
  });
});

describe(persistTheme, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates storage, the root, and the rendered Astryx provider", () => {
    const root = {
      dataset: { theme: "dark" },
      style: { colorScheme: "dark" },
    };
    const provider = {
      dataset: { theme: "dark" },
      style: { colorScheme: "dark" },
    };
    const themeMeta = { content: THEME_COLOR_DARK };
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal(
      "document",
      createThemeDocument({ provider, root, themeMeta })
    );

    persistTheme("light");

    expect(setItem).toHaveBeenCalledWith("fittrack-theme", "light");
    expect(root).toEqual({
      dataset: { theme: "light" },
      style: { colorScheme: "light" },
    });
    expect(provider).toEqual(root);
    expect(themeMeta.content).toBe(THEME_COLOR_LIGHT);
  });
});

describe(subscribeToSystemTheme, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows OS changes only while no fixed choice is stored", () => {
    const store: Record<string, string> = {};
    const listeners = new Set<() => void>();
    const onChange = vi.fn();
    const root = {
      dataset: { theme: "light" },
      style: { colorScheme: "light" },
    };
    const themeMeta = { content: THEME_COLOR_LIGHT };
    let prefersDark = true;

    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
    vi.stubGlobal("document", createThemeDocument({ root, themeMeta }));
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: (_event: string, listener: () => void) => {
        listeners.add(listener);
      },
      get matches() {
        return prefersDark;
      },
      removeEventListener: (_event: string, listener: () => void) => {
        listeners.delete(listener);
      },
    }));

    const unsubscribe = subscribeToSystemTheme(onChange);
    listeners.forEach((listener) => listener());
    expect(onChange).toHaveBeenCalledWith("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(themeMeta.content).toBe(THEME_COLOR_DARK);

    localStorage.setItem("fittrack-theme", "light");
    onChange.mockClear();
    prefersDark = true;
    listeners.forEach((listener) => listener());
    expect(onChange).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("keeps following the OS after writing a system preference", () => {
    const store: Record<string, string> = {};
    const listeners = new Set<() => void>();
    const onChange = vi.fn();
    const root = {
      dataset: { theme: "light" },
      style: { colorScheme: "light" },
    };
    const themeMeta = { content: THEME_COLOR_LIGHT };
    let prefersDark = false;

    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
    vi.stubGlobal("document", createThemeDocument({ root, themeMeta }));
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: (_event: string, listener: () => void) => {
        listeners.add(listener);
      },
      get matches() {
        return prefersDark;
      },
      removeEventListener: (_event: string, listener: () => void) => {
        listeners.delete(listener);
      },
    }));

    const unsubscribe = subscribeToSystemTheme(onChange);
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    expect(hasFixedThemeChoice(normalizeThemePreference("system"))).toBe(false);

    onChange.mockClear();
    prefersDark = true;
    listeners.forEach((listener) => listener());
    expect(onChange).toHaveBeenCalledWith("dark");
    expect(root.dataset.theme).toBe("dark");

    unsubscribe();
  });
});

function setupThemeWriterHarness(prefersDark: boolean) {
  const store: Record<string, string> = {};
  const root = {
    dataset: { theme: "light" },
    style: { colorScheme: "light" },
  };
  const provider = {
    dataset: { theme: "light" },
    style: { colorScheme: "light" },
  };
  const themeMeta = { content: THEME_COLOR_LIGHT };
  const setItem = vi.fn((key: string, value: string) => {
    store[key] = value;
  });

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem,
  });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("matchMedia", () => ({ matches: prefersDark }));
  vi.stubGlobal("document", createThemeDocument({ provider, root, themeMeta }));

  return { provider, root, setItem, store, themeMeta };
}

function writeThemePreference(
  preference: ThemePreference,
  prefersDark: boolean
): void {
  if (preference === "light" || preference === "dark") {
    persistTheme(preference);
    return;
  }
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyResolvedTheme(resolveTheme(preference, prefersDark));
}

describe("theme preference writer (issue #97)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { preference: "light", prefersDark: true, resolved: "light" },
    { preference: "light", prefersDark: false, resolved: "light" },
    { preference: "dark", prefersDark: true, resolved: "dark" },
    { preference: "dark", prefersDark: false, resolved: "dark" },
    { preference: "system", prefersDark: true, resolved: "dark" },
    { preference: "system", prefersDark: false, resolved: "light" },
  ] as const)(
    "stores $preference and resolves the document to $resolved when the OS is $prefersDark",
    ({ preference, prefersDark, resolved }) => {
      const { provider, root, setItem, store, themeMeta } =
        setupThemeWriterHarness(prefersDark);
      writeThemePreference(preference, prefersDark);

      expect(normalizeThemePreference(store[THEME_STORAGE_KEY] ?? null)).toBe(
        preference
      );
      expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, preference);
      expect(root).toEqual({
        dataset: { theme: resolved },
        style: { colorScheme: resolved },
      });
      expect(provider).toEqual(root);
      expect(themeMeta.content).toBe(
        resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
      );
    }
  );
});

describe("ColorMode definition gate (issue #97)", () => {
  const appChromeLibSource = readFileSync(
    join(process.cwd(), "src/lib/app-chrome.ts"),
    "utf-8"
  );

  it("keeps ColorMode as light | dark in source", () => {
    expect(appChromeLibSource).toMatch(
      /export type ColorMode\s*=\s*["']light["']\s*\|\s*["']dark["']/
    );
    expect(appChromeLibSource).not.toMatch(
      /export type ColorMode\s*=.*["']system["']/
    );
  });

  it("keeps ThemePreference split exports from batch 1 (#96)", () => {
    expect(appChromeLibSource).toMatch(/export type ThemePreference/);
    expect(appChromeLibSource).toMatch(
      /export function normalizeThemePreference/
    );
    expect(appChromeLibSource).toMatch(/export function hasFixedThemeChoice/);
    expect(appChromeLibSource).not.toMatch(
      /export function hasExplicitThemeChoice/
    );
  });
});

describe(isPublicMarketingRoute, () => {
  it("matches the landing page only", () => {
    expect(isPublicMarketingRoute("/")).toBe(true);
    expect(isPublicMarketingRoute("/dashboard")).toBe(false);
  });
});

describe(isBlogRoute, () => {
  it("matches the blog index and article pages", () => {
    expect(isBlogRoute("/blog")).toBe(true);
    expect(isBlogRoute("/blog/protein-for-hypertrophy")).toBe(true);
    expect(isBlogRoute("/dashboard")).toBe(false);
  });
});

describe(isMinimalChromeRoute, () => {
  it("includes auth, marketing, and blog pages", () => {
    expect(isMinimalChromeRoute("/sign-in")).toBe(true);
    expect(isMinimalChromeRoute("/")).toBe(true);
    expect(isMinimalChromeRoute("/blog")).toBe(true);
    expect(isMinimalChromeRoute("/blog/macros-101")).toBe(true);
    expect(isMinimalChromeRoute("/dashboard")).toBe(false);
  });
});
