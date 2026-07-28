import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyResolvedTheme,
  getStoredTheme,
  getThemeColor,
  hasExplicitThemeChoice,
  isAuthRoute,
  isBlogRoute,
  isMinimalChromeRoute,
  isNavSelected,
  isPublicMarketingRoute,
  isWorkoutRoute,
  navValueFromPath,
  persistTheme,
  resolveTheme,
  subscribeToSystemTheme,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
} from "~/lib/app-chrome";

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

  it("follows the operating system when nothing valid is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("sepia", true)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("light");
  });
});

describe(getThemeColor, () => {
  it("returns different browser chrome colours for light and dark", () => {
    expect(getThemeColor("light")).toBe(THEME_COLOR_LIGHT);
    expect(getThemeColor("dark")).toBe(THEME_COLOR_DARK);
    expect(THEME_COLOR_LIGHT).not.toBe(THEME_COLOR_DARK);
  });
});

describe(hasExplicitThemeChoice, () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false until the user saves light or dark", () => {
    expect(hasExplicitThemeChoice()).toBe(false);
    localStorage.setItem("fittrack-theme", "sepia");
    expect(hasExplicitThemeChoice()).toBe(false);
  });

  it("is true after the user saves light or dark", () => {
    localStorage.setItem("fittrack-theme", "dark");
    expect(hasExplicitThemeChoice()).toBe(true);
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
    vi.stubGlobal("window");
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

  it("follows OS changes only while no explicit choice is stored", () => {
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
