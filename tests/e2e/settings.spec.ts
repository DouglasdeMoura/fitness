import { expect, test } from "@playwright/test";

import {
  installDeterministicClock,
  openAppRoute,
  prepareTheme,
} from "./test-helpers";

test.describe("Settings page (issue #34)", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicClock(page);
    await prepareTheme(page, "light");
    await openAppRoute(page, "/settings");
  });

  test("renders grouped Card sections with Heading level={3} headings", async ({
    page,
  }) => {
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 3, name: "Profile" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 3, name: "Goals" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 3, name: "Body Metrics" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 3, name: "Data Management" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 3, name: "About" })
    ).toBeVisible();
  });

  test("goal selector renders as visual SelectableCard grid", async ({
    page,
  }) => {
    const goalCards = page.getByRole("checkbox"); // SelectableCard renders as checkbox
    // Goal cards exist
    const count = await goalCards.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Each card has label text — use exact matches to avoid description text collisions
    await expect(page.getByText("Build Muscle", { exact: true })).toBeVisible();
    await expect(page.getByText("Lose Fat", { exact: true })).toBeVisible();
    await expect(page.getByText("Maintain", { exact: true })).toBeVisible();
    await expect(page.getByText("Recomp", { exact: true })).toBeVisible();

    // Cards have descriptions
    await expect(page.getByText(/calorie surplus/i)).toBeVisible();
    await expect(page.getByText(/calorie deficit/i)).toBeVisible();
  });

  test("activity level uses SegmentedControl", async ({ page }) => {
    const segmented = page.getByRole("radiogroup", { name: "Activity Level" });
    await expect(segmented).toBeVisible();

    // All 5 activity level options visible (labels from ACTIVITY_LABELS)
    await expect(
      segmented.getByRole("radio", { name: "Sedentary" })
    ).toBeVisible();
    await expect(
      segmented.getByRole("radio", { name: "Lightly active" })
    ).toBeVisible();
    await expect(
      segmented.getByRole("radio", { name: "Moderately active" })
    ).toBeVisible();
    await expect(
      segmented.getByRole("radio", { name: "Very active" })
    ).toBeVisible();
    await expect(
      segmented.getByRole("radio", { name: "Extra active" })
    ).toBeVisible();
  });

  test("dark mode uses Switch toggle", async ({ page }) => {
    const darkModeSwitch = page.getByRole("switch", { name: "Dark Mode" });
    await expect(darkModeSwitch).toBeVisible();

    // Description text for dark mode
    await expect(page.getByText(/light and dark/)).toBeVisible();
  });

  test("dark mode toggle changes theme", async ({ page }) => {
    // Initial state is light
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    // Toggle dark mode on
    const darkModeSwitch = page.getByRole("switch", { name: "Dark Mode" });
    await darkModeSwitch.click();

    // Wait for theme to update via React state + Theme component re-render
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
      { timeout: 5000 }
    );
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("weight logging section has input and log button", async ({ page }) => {
    const main = page.getByRole("main");

    // Weight input field
    const weightInput = main.getByRole("spinbutton", { name: /Weight in kg/ });
    await expect(weightInput).toBeVisible();

    // Log button
    const logButton = main.getByRole("button", { name: "Log" });
    await expect(logButton).toBeVisible();
  });

  test("persists a weigh-in after reloading settings", async ({ page }) => {
    const weightInput = page.getByRole("spinbutton", { name: /Weight in kg/ });
    await weightInput.fill("77.3");
    await page.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText("Weight logged — 77.3kg")).toBeVisible();

    await page.reload();
    await expect(
      page.getByText(/Recent Weight History|Log at least two weigh-ins/)
    ).toBeVisible();
  });

  test("data management section has export and import buttons", async ({
    page,
  }) => {
    const exportButton = page.getByRole("button", { name: "Export as JSON" });
    const importButton = page.getByRole("button", { name: "Import Data" });

    await expect(exportButton).toBeVisible();
    await expect(importButton).toBeVisible();
  });

  test("profile form saves user data", async ({ page }) => {
    const nameInput = page.getByRole("textbox", { name: "Name" });
    await nameInput.fill("Test Athlete");

    const saveButton = page.getByRole("button", { name: "Save Profile" });
    await saveButton.click();

    // Should show saved confirmation
    await expect(page.getByText("Profile saved")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Test Athlete"
    );
  });
});
