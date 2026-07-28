export function getStoredTheme(): "light" | "dark" {
  if (typeof localStorage === "undefined") {
    return "light";
  }
  const stored = localStorage.getItem("fittrack-theme");
  return stored === "dark" ? "dark" : "light";
}

/** Custom event dispatched when theme is toggled from Settings (issue #34). */
export const THEME_CHANGE_EVENT = "fittrack-theme-changed";

export function persistTheme(mode: "light" | "dark"): void {
  localStorage.setItem("fittrack-theme", mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
  }
}

export function toggleColorMode(mode: "light" | "dark"): "light" | "dark" {
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

/** Auth and marketing pages share the minimal chrome wrapper. */
export function isMinimalChromeRoute(pathname: string): boolean {
  return isAuthRoute(pathname) || isPublicMarketingRoute(pathname);
}
