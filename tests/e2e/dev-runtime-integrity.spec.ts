import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { APP_ROUTE_PREFIXES } from "../../src/lib/route-auth";
import {
  resolveSeedDemoPassword,
  SEED_DEMO_ACCOUNT,
} from "../../src/lib/seed-auth";
import { routeWithStableQuery } from "./test-helpers";

const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-up", "/blog"] as const;

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function clickHydratedControl(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  await expect
    .poll(
      () =>
        control.evaluate((element) =>
          Object.getOwnPropertyNames(element).some((property) =>
            property.startsWith("__reactProps$")
          )
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  await control.click();
}

async function assertMarketingRouteHydrated(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  const blogLink = page
    .getByRole("navigation", { name: "FitTrack marketing navigation" })
    .getByRole("link", { name: "Blog" });
  await clickHydratedControl(blogLink);
  await expect(page).toHaveURL("/blog");
}

async function assertAuthRouteHydrated(
  page: Page,
  path: "/sign-in" | "/sign-up"
): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  const submitLabel = path === "/sign-in" ? "Sign in" : "Create account";
  const submitButton = page.getByRole("button", { name: submitLabel });
  await clickHydratedControl(submitButton);
  await expect(page.getByText("Email is required")).toBeVisible();
}

async function assertBlogRouteHydrated(page: Page): Promise<void> {
  await page.goto("/blog");
  await page.waitForLoadState("domcontentloaded");
  await clickHydratedControl(page.getByRole("button", { name: "All" }));
  await expect(page).toHaveURL("/blog");
}

async function signInForDevSmoke(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.waitForLoadState("domcontentloaded");

  const email = page.getByRole("textbox", { name: "Email" });
  const password = page.getByRole("textbox", { name: "Password" });
  const submitButton = page.getByRole("button", { name: "Sign in" });

  await clickHydratedControl(submitButton);
  await email.fill(SEED_DEMO_ACCOUNT.email);
  await password.fill(resolveSeedDemoPassword());

  const authResponse = page.waitForResponse(
    (response) => response.url().includes("/api/auth/sign-in/email"),
    { timeout: 15_000 }
  );
  await submitButton.click();
  const response = await authResponse;
  expect(response.ok(), await response.text()).toBe(true);
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

async function assertProtectedRouteHydrated(
  page: Page,
  path: (typeof APP_ROUTE_PREFIXES)[number]
): Promise<void> {
  await page.goto(routeWithStableQuery(path));
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("navigation", { name: "FitTrack navigation" })
  ).toBeVisible({ timeout: 15_000 });

  const accountMenuButton = page.getByRole("button", {
    name: SEED_DEMO_ACCOUNT.name,
  });
  await clickHydratedControl(accountMenuButton);
  const accountMenu = page.getByRole("menu", { name: SEED_DEMO_ACCOUNT.name });
  await expect(accountMenu).toBeVisible();
  await accountMenuButton.click();
  await expect(accountMenu).toBeHidden();
}

test.describe("dev-mode runtime integrity (issue #87)", () => {
  for (const path of PUBLIC_ROUTES) {
    test(`loads ${path} in vite dev without page errors and hydrates`, async ({
      page,
    }) => {
      const pageErrors = trackPageErrors(page);

      if (path === "/") {
        await assertMarketingRouteHydrated(page);
      } else if (path === "/sign-in" || path === "/sign-up") {
        await assertAuthRouteHydrated(page, path);
      } else if (path === "/blog") {
        await assertBlogRouteHydrated(page);
      }

      expect(pageErrors, pageErrors.join("\n")).toStrictEqual([]);
    });
  }

  test("loads protected app routes in vite dev without page errors and hydrates", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    await signInForDevSmoke(page);

    for (const path of APP_ROUTE_PREFIXES) {
      await assertProtectedRouteHydrated(page, path);
    }

    expect(pageErrors, pageErrors.join("\n")).toStrictEqual([]);
  });
});
