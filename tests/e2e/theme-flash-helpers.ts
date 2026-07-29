import { execFileSync } from "node:child_process";

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { ColorMode } from "./test-helpers";
import { getVisualMaskLocators } from "./visual-helpers";

export interface ThemeFlashCapture {
  colorSchemeAtDomContentLoaded: string;
  firstPaint: Buffer;
  settled: Buffer;
}

export const THEME_LOCAL_STORAGE_KEY = "fittrack-theme";

/** Coarse TTFB guard baselines from PRD 20 (production curl, cold sample discarded). */
export const TTFB_BASELINES_MS = {
  "/": 7,
  "/dashboard": 38,
  "/settings": 47,
} as const;

export const TTFB_BUDGET_MS = 15;

/**
 * Captures screenshots at domcontentloaded and after hydration settles.
 * Masks clock-derived UI so comparisons stay repeatable (AGENTS.md F.I.R.S.T).
 *
 * @example await captureThemeFlashFrames(page, "/dashboard", "dark")
 */
export async function captureThemeFlashFrames(
  page: Page,
  path: string,
  colorMode: ColorMode
): Promise<ThemeFlashCapture> {
  await page.goto(path, { waitUntil: "domcontentloaded" });

  const colorSchemeAtDomContentLoaded = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme
  );
  expect(
    colorSchemeAtDomContentLoaded,
    "color-scheme must be set on <html> before hydration"
  ).toBe(colorMode);

  const mask = getVisualMaskLocators(page);
  const firstPaint = await page.screenshot({
    animations: "disabled",
    fullPage: true,
    mask,
  });

  await page.waitForFunction(
    (expectedTheme) => {
      const provider = document.body.querySelector("[data-astryx-theme]");
      return provider?.dataset.theme === expectedTheme;
    },
    colorMode,
    { timeout: 15_000 }
  );
  await page.evaluate(() => document.fonts.ready);

  const settled = await page.screenshot({
    animations: "disabled",
    fullPage: true,
    mask,
  });

  return { colorSchemeAtDomContentLoaded, firstPaint, settled };
}

export async function assertNoThemeLocalStorage(page: Page): Promise<void> {
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    THEME_LOCAL_STORAGE_KEY
  );
  expect(
    stored,
    "localStorage must not hold a device-scoped theme key"
  ).toBeNull();
}

export function assertFirstPaintMatchesSettled(
  firstPaint: Buffer,
  settled: Buffer
): void {
  expect(
    firstPaint,
    "theme flash detected: domcontentloaded screenshot differs from post-hydration"
  ).toEqual(settled);
}

/**
 * Server-path first paint: colorScheme at DCL, no localStorage key, no flash.
 *
 * @example await captureServerPathFirstPaint(page, "/dashboard", "dark")
 */
export async function captureServerPathFirstPaint(
  page: Page,
  path: string,
  expectedColorMode: ColorMode
): Promise<ThemeFlashCapture> {
  const capture = await captureThemeFlashFrames(page, path, expectedColorMode);
  await assertNoThemeLocalStorage(page);
  assertFirstPaintMatchesSettled(capture.firstPaint, capture.settled);
  return capture;
}

export function curlTimeToFirstByteMs(
  url: string,
  cookieHeader?: string
): number {
  const args = ["-o", "/dev/null", "-s", "-w", "%{time_starttransfer}"];
  if (cookieHeader) {
    args.push("-H", `Cookie: ${cookieHeader}`);
  }
  args.push(url);
  const out = execFileSync("curl", args, {
    encoding: "utf-8",
    timeout: 30_000,
  });
  return Number.parseFloat(out.trim()) * 1000;
}

export function medianMs(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Seven curl samples; discards the cold first sample and returns the median. */
export function measureMedianTtfb(url: string, cookieHeader?: string): number {
  const samples = Array.from({ length: 7 }, () =>
    curlTimeToFirstByteMs(url, cookieHeader)
  );
  const [, ...warmed] = samples;
  return medianMs(warmed);
}

export function buildCookieHeader(
  cookies: { name: string; value: string }[]
): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
