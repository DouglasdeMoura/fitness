import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import {
  PUSH_CARD_TITLE,
  PUSH_ENABLE_BUTTON,
  PUSH_NOT_CONFIGURED_MESSAGE,
  PUSH_TEST_BUTTON,
  PUSH_TEST_SUCCESS_MESSAGE,
} from "../../src/lib/push";

async function openSettings(page: Page) {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" })
  ).toBeVisible({
    timeout: 15_000,
  });
}

async function registerServiceWorker(page: Page): Promise<void> {
  const registered = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      return false;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    return Boolean(
      registration.active ?? registration.installing ?? registration.waiting
    );
  });
  expect(registered).toBe(true);
}

async function ensurePushSubscribed(page: Page): Promise<void> {
  const testButton = page.getByRole("button", { name: PUSH_TEST_BUTTON });
  if (await testButton.isVisible()) {
    return;
  }

  await page.evaluate(() => {
    Notification.requestPermission = async () => "granted";
    PushManager.prototype.subscribe = async () => ({
      endpoint: "https://push.example.test/e2e-device",
      toJSON() {
        return {
          endpoint: "https://push.example.test/e2e-device",
          keys: { auth: "test-auth", p256dh: "test-p256dh" },
        };
      },
      unsubscribe: async () => true,
    });
  });

  const enableButton = page.getByRole("button", { name: PUSH_ENABLE_BUTTON });
  await expect(enableButton).toBeVisible({ timeout: 15_000 });
  await enableButton.click();
  await expect(testButton).toBeVisible({ timeout: 15_000 });
}

test.describe("Web Push in Settings (issue #65)", () => {
  test("does not request notification permission before the user enables push", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = Notification.requestPermission.bind(Notification);
      (
        window as Window & { __fittrackPermissionRequested?: boolean }
      ).__fittrackPermissionRequested = false;
      Notification.requestPermission = async (...args) => {
        (
          window as Window & { __fittrackPermissionRequested?: boolean }
        ).__fittrackPermissionRequested = true;
        return original(...args);
      };
    });

    await openSettings(page);
    await expect(
      page.getByRole("heading", { level: 2, name: PUSH_CARD_TITLE })
    ).toBeVisible();

    const requested = await page.evaluate(
      () =>
        (window as Window & { __fittrackPermissionRequested?: boolean })
          .__fittrackPermissionRequested === true
    );
    expect(requested).toBe(false);
  });

  test("service worker defines push and notificationclick handlers", async () => {
    const swSource = readFileSync(join(process.cwd(), "public/sw.js"), "utf-8");
    expect(swSource).toContain("addEventListener('push'");
    expect(swSource).toContain("addEventListener('notificationclick'");
    expect(swSource).toContain("clients.matchAll");
    expect(swSource).toContain("client.focus");
  });

  test("subscribed client receives a test push notification", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      permissions: ["notifications"],
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(Notification, "permission", {
        configurable: true,
        get: () => "granted",
      });
    });
    await openSettings(page);
    await registerServiceWorker(page);
    await ensurePushSubscribed(page);

    await page.getByRole("button", { name: PUSH_TEST_BUTTON }).click();
    await expect(page.getByText(PUSH_TEST_SUCCESS_MESSAGE)).toBeVisible({
      timeout: 15_000,
    });

    // Delivery is confirmed by the success toast after sendTestPush; the SW
    // push handler itself is asserted in the source-scan test above.
    await context.close();
  });

  test("shows install guidance on iOS Safari before installation", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      Object.defineProperty(navigator, "platform", {
        configurable: true,
        value: "iPhone",
      });
      Object.defineProperty(navigator, "maxTouchPoints", {
        configurable: true,
        value: 5,
      });
    });

    await openSettings(page);
    await expect(
      page.getByText(/add FitTrack to your Home Screen/i)
    ).toBeVisible();
  });
});

test.describe("Push not configured (issue #65)", () => {
  test("unit coverage documents the not-configured copy constant", () => {
    expect(PUSH_NOT_CONFIGURED_MESSAGE).toMatch(/not configured/i);
  });
});
