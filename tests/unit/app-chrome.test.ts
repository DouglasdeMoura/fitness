import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStoredTheme,
  isAuthRoute,
  isBlogRoute,
  isMinimalChromeRoute,
  isNavSelected,
  isPublicMarketingRoute,
  isWorkoutRoute,
  navValueFromPath,
} from "~/lib/app-chrome";

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

  it("treats unknown values as light", () => {
    localStorage.setItem("fittrack-theme", "sepia");
    expect(getStoredTheme()).toBe("light");
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
