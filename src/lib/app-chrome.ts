export type ColorMode = "light" | "dark";

export const DEFAULT_COLOR_MODE: ColorMode = "light";
export const THEME_STORAGE_KEY = "fittrack-theme";
export const DARK_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/**
 * Resolves the stored preference before the operating-system preference.
 *
 * @example getStoredTheme() // "dark" when no choice is stored and the OS is dark
 */
export function getStoredTheme(): ColorMode {
  if (typeof localStorage === "undefined") {
    return DEFAULT_COLOR_MODE;
  }
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }
  const prefersDark =
    typeof matchMedia === "function" &&
    matchMedia(DARK_COLOR_SCHEME_QUERY).matches;
  return prefersDark ? "dark" : DEFAULT_COLOR_MODE;
}

/** Custom event dispatched when theme is toggled from Settings (issue #34). */
export const THEME_CHANGE_EVENT = "fittrack-theme-changed";

export function persistTheme(mode: ColorMode): void {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    const provider = document.body.querySelector<HTMLElement>(
      "[data-astryx-theme]"
    );
    if (provider) {
      provider.dataset.theme = mode;
      provider.style.colorScheme = mode;
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
  }
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
