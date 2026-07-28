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

async function createLoggedCustomFood(
  page: Page,
  foodName: string
): Promise<Locator> {
  await openAppPage(page, "/nutrition");
  await clickHydratedButton(page.getByRole("button", { name: "Log food" }));
  await clickHydratedButton(
    page.getByRole("button", { name: "Create Custom Food" })
  );
  await page.getByLabel("Name").fill(foodName);
  await page.getByLabel("Calories per serving").fill("180");
  await page.getByLabel("Protein (g)").fill("18");
  await clickHydratedButton(page.getByRole("button", { name: "Save Food" }));
  await clickHydratedButton(page.getByRole("button", { name: "Add to Log" }));
  await clickHydratedButton(
    page.getByRole("dialog").getByRole("button", { name: "Close" })
  );
  const foodRow = page.getByRole("row").filter({ hasText: foodName });
  for (const meal of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
    await clickHydratedButton(
      page.getByRole("button", { name: new RegExp(`^${meal}`) })
    );
    if (await foodRow.isVisible().catch(() => false)) {
      return foodRow;
    }
  }
  return foodRow;
}

function deleteDialog(page: Page): Locator {
  return page.getByRole("dialog");
}

test.describe("Delete confirmation dialogs (issue #25)", () => {
  test("food log delete requires dialog confirmation and Cancel keeps the entry", async ({
    page,
  }) => {
    const foodName = `Confirm Food ${Date.now()}`;
    const foodRow = await createLoggedCustomFood(page, foodName);
    await expect(foodRow).toBeVisible({ timeout: 10_000 });

    await clickHydratedButton(
      foodRow.getByRole("button", { name: `Delete ${foodName}` })
    );
    const dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Delete this entry?" })
    ).toBeVisible();
    await clickHydratedButton(
      dialog.getByRole("button", { name: "Cancel delete" })
    );
    await expect(dialog).not.toBeVisible();
    await expect(foodRow).toBeVisible();
  });

  test("confirmed food log deletion removes the entry", async ({ page }) => {
    const foodName = `Delete Food ${test.info().project.name} ${Date.now()}`;
    const foodRow = await createLoggedCustomFood(page, foodName);
    await expect(foodRow).toBeVisible({ timeout: 10_000 });

    await clickHydratedButton(
      foodRow.getByRole("button", { name: `Delete ${foodName}` })
    );
    await clickHydratedButton(
      deleteDialog(page).getByRole("button", { name: "Confirm delete" })
    );

    await expect(
      page.getByText("Entry deleted", { exact: true })
    ).toBeVisible();
    await expect(foodRow).not.toBeVisible();
  });

  test("workout set delete shows dialog with destructive confirm button", async ({
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
    test.skip(options === 0, "No exercises seeded for set logging");
    await page.getByRole("option").first().click();

    await clickHydratedButton(page.getByRole("button", { name: "Add set" }));
    await clickHydratedButton(
      page.getByRole("button", { name: /Save set 1 of/u })
    );

    await clickHydratedButton(
      page.getByRole("button", { name: /Delete set 1 of/u })
    );
    const dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Delete this set?" })
    ).toBeVisible();

    const deleteButton = dialog.getByRole("button", { name: "Confirm delete" });
    await expect(deleteButton).toBeVisible();
    const destructiveColor = await deleteButton.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("background-color")
    );
    const secondaryButton = dialog.getByRole("button", {
      name: "Cancel delete",
    });
    const secondaryColor = await secondaryButton.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("background-color")
    );
    expect(destructiveColor).not.toBe(secondaryColor);

    await clickHydratedButton(deleteButton);
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Save set 1 of/u })
    ).toHaveCount(0);
  });

  test("program delete from list shows named confirmation dialog", async ({
    page,
  }) => {
    await openAppPage(page, "/workout/programs");
    const deleteButton = page.getByRole("button", { name: /Delete /u }).first();
    test.skip((await deleteButton.count()) === 0, "No programs seeded");

    const programName = await deleteButton.getAttribute("aria-label");
    const match = programName?.match(/^Delete (.+)$/u);
    expect(match, "Delete button missing program name label").not.toBeNull();

    await clickHydratedButton(deleteButton);
    const dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: `Delete '${match?.[1]}'?` })
    ).toBeVisible();
    await expect(dialog.getByText("This cannot be undone.")).toBeVisible();
    await clickHydratedButton(
      dialog.getByRole("button", { name: "Cancel delete" })
    );
    await expect(dialog).not.toBeVisible();
  });
});
