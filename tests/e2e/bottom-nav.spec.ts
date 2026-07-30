import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
  routeWithStableQuery,
} from "./test-helpers";

const MOBILE_VIEWPORT = { height: 844, width: 390 };
const DESKTOP_VIEWPORT = { height: 1024, width: 768 };

const MAIN_ROUTES = [
  { heading: "Dashboard", label: "Dashboard", path: "/" },
  { heading: "Nutrition", label: "Nutrition", path: "/nutrition" },
  { heading: "Workout", label: "Workout", path: "/workout" },
  { heading: "Progress", label: "Progress", path: "/progress" },
  { heading: "Settings", label: "Settings", path: "/settings" },
] as const;

function bottomNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "FitTrack primary navigation" });
}

/** Distance from the bar's bottom edge to the bottom of the viewport. */
async function gapBelowNav(page: Page): Promise<number> {
  const box = await bottomNav(page).boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  return (viewport?.height ?? 0) - ((box?.y ?? 0) + (box?.height ?? 0));
}

test.describe("Bottom navigation bar (issue #52)", () => {
  test.beforeEach(async ({ page }) => {
    await prepareTheme(page, "light");
    await installDeterministicClock(page);
  });

  test("stays visible at both mobile and desktop widths", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openAppRoute(page, "/");
    await expect(bottomNav(page)).toBeVisible();

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await expect(bottomNav(page)).toBeVisible();
  });

  test("renders a text label for every item", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openAppRoute(page, "/");

    for (const route of MAIN_ROUTES) {
      await expect(
        bottomNav(page).getByRole("link", { name: route.label })
      ).toContainText(route.label);
    }
  });

  test("stays pinned to the viewport bottom while the page scrolls", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(routeWithStableQuery("/settings"));
    await page.waitForLoadState("networkidle");

    expect(await gapBelowNav(page)).toBeLessThanOrEqual(1);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => gapBelowNav(page)).toBeLessThanOrEqual(1);
  });

  for (const route of MAIN_ROUTES) {
    test(`reaches ${route.label} from the bottom bar at 390px`, async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await openAppRoute(page, "/");

      await bottomNav(page).getByRole("link", { name: route.label }).click();
      await expect(page).toHaveURL(
        new RegExp(`${route.path === "/" ? "/$" : route.path}`)
      );
      await expect(
        page.getByRole("heading", { level: 1, name: route.heading })
      ).toBeVisible();
    });
  }

  test("marks the active route with aria-current in the bottom bar", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openAppRoute(page, "/");
    await expect(
      bottomNav(page).getByRole("link", { name: "Dashboard" })
    ).toHaveAttribute("aria-current", "page");

    await bottomNav(page).getByRole("link", { name: "Nutrition" }).click();
    await expect(page).toHaveURL(/\/nutrition/u);
    await expect(
      bottomNav(page).getByRole("link", { name: "Nutrition" })
    ).toHaveAttribute("aria-current", "page");
    await expect(
      bottomNav(page).getByRole("link", { name: "Dashboard" })
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("bottom bar respects safe-area padding custom property", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openAppRoute(page, "/");
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        "--app-safe-area-bottom",
        "20px"
      );
    });

    await expect
      .poll(async () =>
        bottomNav(page).evaluate(
          (element) => getComputedStyle(element).paddingBottom
        )
      )
      .toBe("20px");
  });

  test("last settings list row stays above the bottom bar at 390x844", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(routeWithStableQuery("/settings"));
    await page.waitForLoadState("networkidle");

    const lastItem = page.getByRole("listitem").last();
    await lastItem.scrollIntoViewIfNeeded();

    const navBox = await bottomNav(page).boundingBox();
    const itemBox = await lastItem.boundingBox();
    expect(navBox).not.toBeNull();
    expect(itemBox).not.toBeNull();
    expect(itemBox?.y + itemBox?.height).toBeLessThanOrEqual(navBox?.y + 1);
  });
});
