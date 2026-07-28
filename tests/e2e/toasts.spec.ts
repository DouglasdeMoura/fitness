import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function openAppPage(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function clickHydratedButton(button: Locator) {
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

function toastRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Notifications" });
}

function infoToast(page: Page, body: string | RegExp): Locator {
  return toastRegion(page).getByRole("status").filter({ hasText: body });
}

test.describe("Toast notifications for mutations", () => {
  test("saving profile shows a Profile saved toast", async ({ page }) => {
    await openAppPage(page, "/settings");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible({
      timeout: 10_000,
    });
    await clickHydratedButton(
      page.getByRole("button", { name: "Save Profile" })
    );
    await expect(infoToast(page, "Profile saved")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("logging weight shows Weight logged toast with kg", async ({ page }) => {
    await openAppPage(page, "/settings");
    const weight = page.getByLabel("Weight in kg", { exact: true });
    await expect(weight).toBeVisible({ timeout: 10_000 });
    await weight.fill("76.2");
    await clickHydratedButton(page.getByRole("button", { name: "Log" }));
    await expect(infoToast(page, "Weight logged — 76.2kg")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("exporting data shows Data exported toast", async ({ page }) => {
    await openAppPage(page, "/settings");
    await expect(
      page.getByRole("heading", { name: "Export Data" })
    ).toBeVisible({
      timeout: 10_000,
    });
    const downloadPromise = page.waitForEvent("download");
    await clickHydratedButton(
      page.getByRole("button", { name: "Export as JSON" })
    );
    await downloadPromise;
    await expect(infoToast(page, "Data exported")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("logging and deleting food shows toasts, Undo restores the entry", async ({
    page,
  }) => {
    const foodName = `Toast Food ${Date.now()}`;
    await openAppPage(page, "/nutrition");
    await clickHydratedButton(
      page.getByRole("button", { name: "Create Custom Food" })
    );
    await page.getByLabel("Name").fill(foodName);
    await page.getByLabel("Calories per serving").fill("180");
    await page.getByLabel("Protein (g)").fill("18");
    await clickHydratedButton(page.getByRole("button", { name: "Save Food" }));
    await expect(page.getByText(foodName)).toBeVisible();

    await clickHydratedButton(page.getByRole("button", { name: "Add to Log" }));
    await expect(infoToast(page, "Food logged")).toBeVisible({
      timeout: 10_000,
    });

    const foodRow = page.getByRole("row").filter({ hasText: foodName });
    await expect(foodRow).toBeVisible({ timeout: 10_000 });
    await clickHydratedButton(
      foodRow.getByRole("button", { name: `Delete ${foodName}` })
    );
    const deleteDialog = page.getByRole("dialog");
    await expect(
      deleteDialog.getByRole("heading", { name: "Delete this entry?" })
    ).toBeVisible();
    await clickHydratedButton(
      deleteDialog.getByRole("button", { name: "Confirm delete" })
    );

    const deletedToast = infoToast(page, "Entry deleted");
    await expect(deletedToast).toBeVisible({ timeout: 10_000 });
    await expect(foodRow).not.toBeVisible();

    await clickHydratedButton(
      deletedToast.getByRole("button", { name: "Undo" })
    );
    await expect(
      page.getByRole("row").filter({ hasText: foodName })
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("saving and deleting a workout set shows toasts with Undo", async ({
    page,
  }) => {
    await openAppPage(page, "/workout");

    const finishBtn = page.getByRole("button", { name: "Finish workout" });
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click();
      await expect(
        page.getByRole("heading", { name: "Session Summary" })
      ).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Done" }).click();
    }

    await clickHydratedButton(
      page.getByRole("button", { name: "Start Workout" })
    );
    await expect(page.getByRole("heading", { name: "Exercise" })).toBeVisible({
      timeout: 10_000,
    });

    const exerciseField = page.getByRole("combobox", { name: "Exercise" });
    await exerciseField.click();
    const options = await page.getByRole("option").count();
    test(options === 0, "No exercises seeded for set logging");
    await page.getByRole("option").first().click();

    await clickHydratedButton(page.getByRole("button", { name: "Add set" }));
    await clickHydratedButton(
      page.getByRole("button", { name: /Save set 1 of/ })
    );
    await expect(infoToast(page, "Set saved")).toBeVisible({ timeout: 10_000 });

    await clickHydratedButton(
      page.getByRole("button", { name: /Delete set 1 of/ })
    );
    const setDeleteDialog = page.getByRole("dialog");
    await expect(
      setDeleteDialog.getByRole("heading", { name: "Delete this set?" })
    ).toBeVisible();
    await clickHydratedButton(
      setDeleteDialog.getByRole("button", { name: "Confirm delete" })
    );
    const deletedToast = infoToast(page, "Set deleted");
    await expect(deletedToast).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /Save set 1 of/ })
    ).toHaveCount(0);

    await clickHydratedButton(
      deletedToast.getByRole("button", { name: "Undo" })
    );
    await expect(
      page.getByRole("button", { name: /Save set 1 of/ })
    ).toBeVisible({
      timeout: 10_000,
    });
  });
});
