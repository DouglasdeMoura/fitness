import type { Locator, Page } from "@playwright/test";

/** CSS selector for clock-derived regions marked in app source (issue #51). */
export const VISUAL_MASK_SELECTOR = "[data-visual-mask]";

/** Rest timer slot always masks — countdown ticks between frames. */
export const REST_TIMER_SLOT_SELECTOR = "[data-fittrack-rest-timer-slot]";

/** Locators for dynamic UI excluded from pixel comparison (issue #51). */
export function getVisualMaskLocators(page: Page): Locator[] {
  return [
    page.locator(VISUAL_MASK_SELECTOR),
    page.locator(REST_TIMER_SLOT_SELECTOR),
  ];
}

/** Stable snapshot filename segment for a route path. */
export function visualSnapshotSlug(route: string): string {
  if (route === "/") {
    return "home";
  }
  return route.slice(1).replaceAll("/", "__");
}
