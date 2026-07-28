import { expect, test } from "@playwright/test";

import {
  DESIGN_GATE_ROUTES,
  DESIGN_GATE_THRESHOLDS,
  findNonTokenTransitionElements,
  findReducedMotionOffenders,
  measureHeroMetricRatio,
  measureLowBodyContrastSamples,
  measureMainSectionGap,
} from "./design-gate-helpers";
import type { ColorMode } from "./test-helpers";
import {
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
  routeWithStableQuery,
} from "./test-helpers";

const MIGRATED_ROUTES = DESIGN_GATE_ROUTES;

const COLOR_MODES: ColorMode[] = ["light", "dark"];

for (const route of MIGRATED_ROUTES) {
  test.describe(`design gates on ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      await installDeterministicClock(page);
    });

    test("hero metric font-size is at least 2.5× body text (numbers are heroes)", async ({
      page,
    }) => {
      await prepareTheme(page, "light");
      await openAppRoute(page, route);

      const hero = await measureHeroMetricRatio(page);
      if (!hero) {
        test(true, "No hero metric with data-size on this route");
      }

      expect(
        hero?.ratio,
        `Hero "${hero?.text}" token size ${hero?.heroPx}px vs body ${hero?.bodyPx}px = ${hero?.ratio.toFixed(2)}× (need >= ${DESIGN_GATE_THRESHOLDS.minHeroRatio}×)`
      ).toBeGreaterThanOrEqual(DESIGN_GATE_THRESHOLDS.minHeroRatio);
    });

    test("top-level page sections have generous spacing (>= 24px)", async ({
      page,
    }) => {
      await prepareTheme(page, "light");
      await openAppRoute(page, route);

      const gap = await measureMainSectionGap(page);
      expect(
        gap,
        `Minimum main section gap on ${route} was ${gap}px; expected >= ${DESIGN_GATE_THRESHOLDS.minSectionGapPx}px`
      ).toBeGreaterThanOrEqual(DESIGN_GATE_THRESHOLDS.minSectionGapPx);
    });

    test("motion uses Astryx duration tokens in page content", async ({
      page,
    }) => {
      await prepareTheme(page, "light");
      await openAppRoute(page, route);

      const offenders = await findNonTokenTransitionElements(page);
      expect(offenders, offenders.join("\n")).toEqual([]);
    });

    for (const colorMode of COLOR_MODES) {
      test(`body text contrast is at least 4.5:1 (${colorMode})`, async ({
        page,
      }) => {
        await prepareTheme(page, colorMode);
        await openAppRoute(page, route);

        const lowContrast = await measureLowBodyContrastSamples(page);
        expect(
          lowContrast,
          lowContrast
            .map((sample) => `"${sample.text}" = ${sample.ratio}:1`)
            .join("\n")
        ).toEqual([]);
      });
    }
  });
}

test.describe("reduced motion (issue #50)", () => {
  for (const route of MIGRATED_ROUTES) {
    test(`${route} disables transitions when prefers-reduced-motion is set`, async ({
      page,
    }) => {
      await prepareTheme(page, "light");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(routeWithStableQuery(route));
      await page.waitForLoadState("networkidle");

      const offenders = await findReducedMotionOffenders(page);
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }
});
