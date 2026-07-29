import { expect, test } from "@playwright/test";

import {
  assertThemeControlPair,
  clickThemeSegment,
  emulateColorScheme,
  hardLoadSettings,
  readDemoUserThemePreference,
  resolveExpectedDataTheme,
  setDemoUserThemePreference,
  signInAsDemoUser,
} from "./test-helpers";
import type { ColorMode, ThemePreference } from "./test-helpers";

const THEME_PREFERENCES = ["light", "dark", "system"] as const;
const OS_SCHEMES = ["light", "dark"] as const;
const SSR_LOAD_COUNT = 10;

const FIRST_CLICK_TARGET: Record<ThemePreference, ThemePreference> = {
  dark: "light",
  light: "dark",
  system: "dark",
};

test.describe("Settings theme control (issue #99)", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsDemoUser(page);
    setDemoUserThemePreference("system");
  });

  for (const osScheme of OS_SCHEMES) {
    for (const preference of THEME_PREFERENCES) {
      test(`preference ${preference} with OS ${osScheme} shows (${preference}, ${resolveExpectedDataTheme(preference, osScheme)})`, async ({
        page,
      }) => {
        await emulateColorScheme(page, osScheme);
        setDemoUserThemePreference(preference);
        await hardLoadSettings(page);
        await assertThemeControlPair(page, {
          dataTheme: resolveExpectedDataTheme(preference, osScheme),
          segment: preference,
        });
      });
    }
  }

  test("system preference with OS dark reads System while data-theme is dark", async ({
    page,
  }) => {
    await emulateColorScheme(page, "dark");
    setDemoUserThemePreference("system");
    await hardLoadSettings(page);
    await assertThemeControlPair(page, {
      dataTheme: "dark",
      segment: "system",
    });
  });

  test("Light to System restores live OS-following", async ({ page }) => {
    await emulateColorScheme(page, "dark");
    await hardLoadSettings(page);
    await clickThemeSegment(page, "light");
    await assertThemeControlPair(page, {
      dataTheme: "light",
      segment: "light",
    });

    await clickThemeSegment(page, "system");
    await assertThemeControlPair(page, {
      dataTheme: "dark",
      segment: "system",
    });

    await emulateColorScheme(page, "light");
    await assertThemeControlPair(page, {
      dataTheme: "light",
      segment: "system",
    });
  });

  test("Dark to System restores live OS-following", async ({ page }) => {
    await emulateColorScheme(page, "light");
    await hardLoadSettings(page);
    await clickThemeSegment(page, "dark");
    await assertThemeControlPair(page, {
      dataTheme: "dark",
      segment: "dark",
    });

    await clickThemeSegment(page, "system");
    await assertThemeControlPair(page, {
      dataTheme: "light",
      segment: "system",
    });

    await emulateColorScheme(page, "dark");
    await assertThemeControlPair(page, {
      dataTheme: "dark",
      segment: "system",
    });
  });

  for (const preference of THEME_PREFERENCES) {
    test(`SSR hard load selects ${preference} on ${SSR_LOAD_COUNT} consecutive loads`, async ({
      page,
    }) => {
      const osScheme: ColorMode = preference === "dark" ? "light" : "dark";
      await emulateColorScheme(page, osScheme);
      setDemoUserThemePreference(preference);

      for (let load = 0; load < SSR_LOAD_COUNT; load += 1) {
        await hardLoadSettings(page);
        await assertThemeControlPair(page, {
          dataTheme: resolveExpectedDataTheme(preference, osScheme),
          segment: preference,
        });
      }
    });
  }

  for (const preference of THEME_PREFERENCES) {
    test(`first click after SSR hard load updates segment, data-theme, and account for ${preference}`, async ({
      page,
    }) => {
      const osScheme: ColorMode = "dark";
      const target = FIRST_CLICK_TARGET[preference];
      await emulateColorScheme(page, osScheme);
      setDemoUserThemePreference(preference);
      await hardLoadSettings(page);

      await clickThemeSegment(page, target);
      await assertThemeControlPair(page, {
        dataTheme: resolveExpectedDataTheme(target, osScheme),
        segment: target,
      });
      expect(readDemoUserThemePreference()).toBe(target);
    });
  }

  test("System preference keeps the segment while data-theme follows live OS changes", async ({
    page,
  }) => {
    await emulateColorScheme(page, "light");
    setDemoUserThemePreference("system");
    await hardLoadSettings(page);
    await assertThemeControlPair(page, {
      dataTheme: "light",
      segment: "system",
    });

    await emulateColorScheme(page, "dark");
    await assertThemeControlPair(page, {
      dataTheme: "dark",
      segment: "system",
    });

    await emulateColorScheme(page, "light");
    await assertThemeControlPair(page, {
      dataTheme: "light",
      segment: "system",
    });
  });

  test("hard load of /settings records zero React hydration errors or warnings", async ({
    page,
  }) => {
    const consoleIssues: string[] = [];
    page.on("console", (message) => {
      const type = message.type();
      if (type === "error" || type === "warning") {
        consoleIssues.push(`[${type}] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      consoleIssues.push(`[pageerror] ${error.message}`);
    });

    await emulateColorScheme(page, "dark");
    setDemoUserThemePreference("system");
    await hardLoadSettings(page);

    expect(consoleIssues).toEqual([]);
  });
});
