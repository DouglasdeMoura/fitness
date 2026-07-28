import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  finishActiveSessionIfNeeded,
  installDeterministicClock,
  routeWithStableQuery,
} from "./test-helpers";

const MOBILE_VIEWPORT = { height: 844, width: 390 };
const BENCH_PRESS_OPTION = /^Barbell Bench Press \(chest\)$/iu;

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

async function addAndSaveSet(
  page: Page,
  weight: number,
  reps: number,
  rpe: number
) {
  await page.getByRole("button", { name: "Add set" }).click();
  await page.locator('input[inputmode="decimal"]').first().fill(String(weight));
  await page.locator('input[inputmode="numeric"]').first().fill(String(reps));
  await page.locator('input[inputmode="numeric"]').nth(1).fill(String(rpe));
  await page.getByRole("button", { name: /Save set 1/u }).click();
}

test.describe("Session summary on finish (issue #62)", () => {
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

  test("finish workout shows summary with volume, sets, exercises, duration, and PRs", async ({
    page,
  }) => {
    await startWorkout(page);
    await selectExercise(page, BENCH_PRESS_OPTION);
    await addAndSaveSet(page, 60, 8, 8);

    await page.getByRole("button", { name: "Finish workout" }).click();

    // Scope assertions to the dialog to avoid strict mode with background page content
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Session Summary" })
    ).toBeVisible();
    await expect(page.getByLabel("Session volume comparison")).toContainText(
      /kg total/u
    );
    await expect(dialog.getByText("Total volume")).toBeVisible();
    await expect(dialog.getByText("Sets logged")).toBeVisible();
    await expect(dialog.getByText("Exercises")).toBeVisible();
    await expect(dialog.getByText("Duration")).toBeVisible();
    await expect(dialog.getByText("Personal records")).toBeVisible();
    await expect(page.getByLabel("Session volume comparison")).toContainText(
      "480 kg total"
    );
  });

  test("summary is reachable again from workout history", async ({ page }) => {
    await startWorkout(page);
    await selectExercise(page, BENCH_PRESS_OPTION);
    await addAndSaveSet(page, 60, 8, 8);
    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(
      page.getByRole("heading", { name: "Session Summary" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("button", { name: "Start Workout" })
    ).toBeVisible();

    await page
      .getByRole("link", { name: /View summary Training Session/iu })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Session Summary" })
    ).toBeVisible();
    await expect(page.getByLabel("Session volume comparison")).toContainText(
      /kg total/u
    );
  });
});
