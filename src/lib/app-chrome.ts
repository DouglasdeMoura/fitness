export type ColorMode = "light" | "dark";

export const DEFAULT_COLOR_MODE: ColorMode = "light";
export const THEME_STORAGE_KEY = "fittrack-theme";
export const DARK_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/** PWA status-bar colour in light mode (brand primary). */
export const THEME_COLOR_LIGHT = "#6741d9";
/** PWA status-bar colour in dark mode (matches --color-background-body). */
export const THEME_COLOR_DARK = "#1b1b1b";

const THEME_COLOR_BY_MODE: Record<ColorMode, string> = {
  dark: THEME_COLOR_DARK,
  light: THEME_COLOR_LIGHT,
};

/**
 * Single resolver for stored preference, then OS, then the light default.
 *
 * @example resolveTheme(null, true) // "dark"
 */
export function resolveTheme(
  storedTheme: string | null | undefined,
  prefersDark: boolean
): ColorMode {
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }
  return prefersDark ? "dark" : DEFAULT_COLOR_MODE;
}

export function getThemeColor(mode: ColorMode): string {
  return THEME_COLOR_BY_MODE[mode];
}

export function hasExplicitThemeChoice(): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "light" || storedTheme === "dark";
}

function readPrefersDark(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia(DARK_COLOR_SCHEME_QUERY).matches
  );
}

/**
 * Resolves the stored preference before the operating-system preference.
 *
 * @example getStoredTheme() // "dark" when no choice is stored and the OS is dark
 */
export function getStoredTheme(): ColorMode {
  if (typeof localStorage === "undefined") {
    return DEFAULT_COLOR_MODE;
  }
  return resolveTheme(
    localStorage.getItem(THEME_STORAGE_KEY),
    readPrefersDark()
  );
}

function setThemeColorMeta(mode: ColorMode): void {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  if (meta) {
    meta.content = getThemeColor(mode);
  }
}

/** Applies a resolved theme to the document without persisting a user choice. */
export function applyResolvedTheme(mode: ColorMode): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  setThemeColorMeta(mode);
  const provider = document.body.querySelector<HTMLElement>(
    "[data-astryx-theme]"
  );
  if (provider) {
    provider.dataset.theme = mode;
    provider.style.colorScheme = mode;
  }
}

/** Custom event dispatched when theme is toggled from Settings (issue #34). */
export const THEME_CHANGE_EVENT = "fittrack-theme-changed";

export function persistTheme(mode: ColorMode): void {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  applyResolvedTheme(mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
  }
}

const NOOP_UNSUBSCRIBE = () => {
  /* no media-query listener when matchMedia is unavailable */
};

/**
 * Keeps following the OS colour scheme until the user makes an explicit choice.
 *
 * @example subscribeToSystemTheme(setColorMode)
 */
export function subscribeToSystemTheme(
  onChange: (mode: ColorMode) => void
): () => void {
  if (typeof window === "undefined" || typeof matchMedia !== "function") {
    return NOOP_UNSUBSCRIBE;
  }
  const mediaQuery = matchMedia(DARK_COLOR_SCHEME_QUERY);
  const handleChange = () => {
    if (hasExplicitThemeChoice()) {
      return;
    }
    const mode = resolveTheme(
      localStorage.getItem(THEME_STORAGE_KEY),
      mediaQuery.matches
    );
    applyResolvedTheme(mode);
    onChange(mode);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
  };
  mediaQuery.addEventListener("change", handleChange);
  return () => mediaQuery.removeEventListener("change", handleChange);
}

export function toggleColorMode(mode: ColorMode): ColorMode {
  return mode === "light" ? "dark" : "light";
}

/** Matches TopNavItem selection to the current route (exact for Dashboard). */
export function isNavSelected(
  pathname: string,
  href: string,
  exact?: boolean
): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** TabList value for the active primary route (issue #52 mobile bottom nav). */
export function navValueFromPath(
  pathname: string,
  items: readonly { href: string }[]
): string {
  if (pathname === "/" || pathname === "/dashboard") {
    return "/dashboard";
  }
  const match = items.find(
    (item) =>
      item.href !== "/" &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
  return match?.href ?? "/dashboard";
}

/** Workout routes reserve space for the PRD 10 Batch 2 rest timer. */
export function isWorkoutRoute(pathname: string): boolean {
  return pathname === "/workout" || pathname.startsWith("/workout/");
}

/** Auth pages render without the main app shell (issue #43). */
export function isAuthRoute(pathname: string): boolean {
  return pathname === "/sign-in" || pathname === "/sign-up";
}

/** Public landing page renders without the authenticated app shell (issue #44). */
export function isPublicMarketingRoute(pathname: string): boolean {
  return pathname === "/";
}

/** Public blog index and articles use the marketing shell (issue #46). */
export function isBlogRoute(pathname: string): boolean {
  return pathname === "/blog" || pathname.startsWith("/blog/");
}

/** Auth and marketing pages share the minimal chrome wrapper. */
export function isMinimalChromeRoute(pathname: string): boolean {
  return (
    isAuthRoute(pathname) ||
    isPublicMarketingRoute(pathname) ||
    isBlogRoute(pathname)
  );
}
