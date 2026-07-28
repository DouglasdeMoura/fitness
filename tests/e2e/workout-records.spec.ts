import { expect, type Page, test } from "@playwright/test";

import {
  finishActiveSessionIfNeeded,
  installDeterministicClock,
  routeWithStableQuery,
} from "./test-helpers";

const MOBILE_VIEWPORT = { height: 844, width: 390 };
// Kettlebell Swing is used by NO other spec. workout-progression.spec.ts also
// drives Farmer Carry and runs first alphabetically, so with workers:1 and a
// shared SQLite file it left set history behind — and PR detection compares
// against "most reps at this weight or heavier". That cross-spec history is
// what made this test flaky, not the detection logic.
const PR_EXERCISE_OPTION = /^Kettlebell Swing \(full_body\)$/i;
const NO_HISTORY_GUIDANCE =
  "Select a weight that reaches the target RPE for all prescribed sets.";

test.describe.configure({ mode: "serial" });

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

async function resolveFreshWeight(page: Page): Promise<number> {
  const lastTime = page.getByText(/Last time: ([\d.]+) kg × \d+/);
  await expect(lastTime.or(page.getByText(NO_HISTORY_GUIDANCE))).toBeVisible({
    timeout: 10_000,
  });

  if (await lastTime.isVisible()) {
    const text = await lastTime.textContent();
    const match = text?.match(/Last time: ([\d.]+) kg/);
    if (match) {
      return Math.round(Number.parseFloat(match[1]) + 5);
    }
  }
  return 205;
}

async function setSetValues(
  page: Page,
  setNumber: number,
  weight: number,
  reps: number,
  rpe: number
) {
  const row = page
    .getByRole("button", { name: new RegExp(`Save set ${setNumber}`) })
    .locator("xpath=ancestor::tr[1]");
  await row.locator('input[inputmode="decimal"]').fill(String(weight));
  await row.locator('input[inputmode="numeric"]').first().fill(String(reps));
  await row.locator('input[inputmode="numeric"]').nth(1).fill(String(rpe));
}

function toastRegion(page: Page) {
  return page.getByRole("region", { name: "Notifications" });
}

test.describe("Personal record detection (issue #61)", () => {
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

  test("detects rep PR on save, badges the set, and shows PR in session history", async ({
    page,
  }) => {
    await startWorkout(page);
    await selectExercise(page, PR_EXERCISE_OPTION);
    await page.getByRole("button", { name: "Add set" }).click();

    const weightKg = await resolveFreshWeight(page);
    const baselineReps = 5;
    const prReps = 12;

    await setSetValues(page, 1, weightKg, baselineReps, 7);
    await page.getByRole("button", { name: /Save set 1/ }).click();
    await expect(
      toastRegion(page).getByRole("status").filter({ hasText: "Set saved" })
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      toastRegion(page).getByRole("status").filter({ hasText: /PR/ })
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Add set" }).click();
    await setSetValues(page, 2, weightKg, prReps, 8);
    await page.getByRole("button", { name: /Save set 2/ }).click();
    await expect(
      toastRegion(page)
        .getByRole("status")
        .filter({ hasText: /Rep PR — beat \d+ reps/ })
    ).toBeVisible({ timeout: 10_000 });

    const setsTable = page.getByRole("table", {
      name: /Kettlebell Swing sets/i,
    });
    await expect(setsTable.getByRole("row", { name: /2 PR/ })).toBeVisible({
      timeout: 10_000,
    });

    await finishActiveSessionIfNeeded(page);
    await page.goto(routeWithStableQuery("/workout"));
    await page.waitForLoadState("networkidle");

    const viewSession = page
      .getByRole("link", { name: /View session/i })
      .first();
    await expect(viewSession).toBeVisible({ timeout: 10_000 });
    await viewSession.click();

    await expect(
      page.getByRole("heading", { name: "Session History" })
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page
        .getByRole("table", { name: "Logged sets for this session" })
        .getByText("PR")
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
