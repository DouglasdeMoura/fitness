import { expect, type Page, test } from "@playwright/test";

import { findReducedMotionOffenders } from "./design-gate-helpers";
import {
  finishActiveSessionIfNeeded,
  installDeterministicClock,
  routeWithStableQuery,
} from "./test-helpers";

const MOBILE_VIEWPORT = { height: 844, width: 390 };
const BENCH_PRESS_OPTION = /^Barbell Bench Press \(chest\)$/i;

async function startWorkout(page: Page) {
  await finishActiveSessionIfNeeded(page);
  await page.getByRole("button", { name: "Start Workout" }).click();
  await expect(page.getByRole("heading", { name: "Exercise" })).toBeVisible({
    timeout: 15_000,
  });
}

async function selectExercise(page: Page, optionPattern: RegExp) {
  const exerciseField = page.getByRole("combobox", { name: "Exercise" });
  await exerciseField.click();
  await page.getByRole("option", { name: optionPattern }).first().click();
}

async function clickHydratedButton(button: ReturnType<Page["getByRole"]>) {
  await expect(button).toBeVisible();
  await expect
    .poll(() =>
      button.evaluate((element) =>
        Object.getOwnPropertyNames(element).some((property) =>
          property.startsWith("__reactProps$")
        )
      )
    )
    .toBe(true);
  await button.click();
}

async function setSetValues(
  page: Page,
  weight: number,
  reps: number,
  rpe: number
) {
  await page.locator('input[inputmode="decimal"]').first().fill(String(weight));
  await page.locator('input[inputmode="numeric"]').first().fill(String(reps));
  await page.locator('input[inputmode="numeric"]').nth(1).fill(String(rpe));
}

function restTimerRegion(page: Page) {
  return page.getByRole("region", { name: "Rest timer" });
}

test.describe("Rest timer (issue #60)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await installDeterministicClock(page);
    await page.goto(routeWithStableQuery("/workout"));
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("navigation", { name: "FitTrack navigation" })
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test("starts on set log with RPE-based suggested duration", async ({
    page,
  }) => {
    await startWorkout(page);
    await selectExercise(page, BENCH_PRESS_OPTION);
    await page.getByRole("button", { name: "Add set" }).click();
    await setSetValues(page, 80, 8, 8);
    await clickHydratedButton(page.getByRole("button", { name: /Save set 1/ }));
    await expect(page.getByText("Set saved")).toBeVisible({ timeout: 10_000 });

    const timer = restTimerRegion(page);
    await expect(timer).toBeVisible();
    await expect(timer.getByText("2:30")).toBeVisible();
  });

  test("survives in-app navigation away and back mid-rest", async ({
    page,
  }) => {
    await startWorkout(page);
    await selectExercise(page, BENCH_PRESS_OPTION);
    await page.getByRole("button", { name: "Add set" }).click();
    await setSetValues(page, 80, 8, 7);
    await clickHydratedButton(page.getByRole("button", { name: /Save set 1/ }));
    await expect(restTimerRegion(page).getByText("2:00")).toBeVisible({
      timeout: 10_000,
    });

    const savedUrl = new URL(page.url());
    const restEnd = savedUrl.searchParams.get("restEnd");
    const restDur = savedUrl.searchParams.get("restDur");
    expect(restEnd).toBeTruthy();
    expect(restDur).toBeTruthy();

    // Tolerant window, not an exact second. The timer derives remaining time
    // from a target timestamp, so real wall-clock elapsed during navigation and
    // rendering adds to the virtual fastForward — an exact '1:15' is a race.
    await page.clock.fastForward(45_000);
    await expect(restTimerRegion(page).getByText(/1:1[0-5]/)).toBeVisible();

    await page
      .getByRole("navigation", { name: "FitTrack mobile navigation" })
      .getByRole("link", { name: "Nutrition" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Nutrition" })
    ).toBeVisible({
      timeout: 15_000,
    });

    await page.clock.fastForward(30_000);
    await expect(restTimerRegion(page).getByText(/0:4[0-5]/)).toBeVisible({
      timeout: 10_000,
    });

    await page
      .getByRole("navigation", { name: "FitTrack mobile navigation" })
      .getByRole("link", { name: "Workout" })
      .click();
    await expect(restTimerRegion(page).getByText(/0:4[0-9]/)).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByRole("button", { name: "Start Workout" })
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(restTimerRegion(page)).not.toContainText("Stopped");
  });

  test("fires a toast when rest completes", async ({ page }) => {
    await startWorkout(page);
    await selectExercise(page, BENCH_PRESS_OPTION);
    await page.getByRole("button", { name: "Add set" }).click();
    await setSetValues(page, 60, 10, 6);
    await clickHydratedButton(page.getByRole("button", { name: /Save set 1/ }));
    await expect(restTimerRegion(page).getByText("2:00")).toBeVisible({
      timeout: 10_000,
    });

    await page.clock.fastForward(120_000);
    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByText("Rest complete")
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("hides countdown progress animation under prefers-reduced-motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startWorkout(page);
    await selectExercise(page, BENCH_PRESS_OPTION);
    await page.getByRole("button", { name: "Add set" }).click();
    await setSetValues(page, 70, 8, 9);
    await clickHydratedButton(page.getByRole("button", { name: /Save set 1/ }));
    await expect(restTimerRegion(page).getByText("3:00")).toBeVisible({
      timeout: 10_000,
    });

    await expect(
      page.getByRole("progressbar", { name: "Rest progress" })
    ).toHaveCount(0);
    const offenders = await findReducedMotionOffenders(page);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  test("timer controls meet the 44px touch target minimum", async ({
    page,
  }) => {
    await startWorkout(page);
    await selectExercise(page, BENCH_PRESS_OPTION);
    await page.getByRole("button", { name: "Add set" }).click();
    await setSetValues(page, 70, 8, 8);
    await clickHydratedButton(page.getByRole("button", { name: /Save set 1/ }));
    await expect(restTimerRegion(page)).toBeVisible({ timeout: 10_000 });

    for (const name of ["Start rest", "Stop rest", "Reset rest"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
