import { expect, type Locator, type Page, test } from "@playwright/test";

async function openAppPage(page: Page, path: string) {
  await page.goto(path);
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

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test.describe("Meal templates and weekly planning", () => {
  test("creates a meal template, previews macros, and assigns it to the week", async ({
    page,
  }) => {
    const templateName = `E2E Dinner ${Date.now()}`;
    await openAppPage(page, "/nutrition/templates");

    const templatesPage = page.getByRole("main");
    await expect(
      templatesPage.getByRole("heading", {
        exact: true,
        name: "Meal Templates",
      })
    ).toBeVisible();
    await clickHydratedButton(
      templatesPage.getByRole("button", { name: "New Template" })
    );
    await templatesPage
      .getByRole("textbox", { name: "Name" })
      .fill(templateName);
    await chooseOption(page, "Default meal", "Dinner");
    await templatesPage
      .getByRole("button", { name: "Create & Edit Foods" })
      .click();

    await expect(page).toHaveURL(/\/nutrition\/templates\/\d+$/);
    await page
      .getByRole("textbox", { name: "Search foods" })
      .fill("Chicken Breast");
    await page.getByRole("button", { exact: true, name: "Search" }).click();
    await page
      .getByRole("button", { name: /Add Chicken Breast \(raw\)/ })
      .first()
      .click();
    await page
      .getByRole("spinbutton", { name: "Servings for Chicken Breast (raw)" })
      .fill("2");
    await expect(page.getByText("330 kcal", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save Template" }).click();
    await expect(page.getByRole("button", { name: "Saved!" })).toBeVisible();

    await page.getByRole("link", { name: "Back to templates" }).click();
    await page.getByRole("link", { name: "Weekly Planner" }).click();
    await expect(
      page.getByRole("heading", { name: "Weekly Meal Plan" })
    ).toBeVisible();

    const firstDay = page.getByRole("row").nth(1);
    const mealSelector = firstDay.getByRole("combobox").first();
    await mealSelector.click();
    await page.getByRole("option", { name: templateName }).click();
    await expect(mealSelector).toHaveText(templateName);
    await expect(firstDay.getByRole("cell").nth(1)).toContainText("330 kcal");
    await expect(firstDay.getByRole("progressbar")).toBeVisible();
  });
});

test.describe("Training programs", () => {
  test("creates and configures a DUP training program", async ({ page }) => {
    const programName = `E2E DUP Program ${Date.now()}`;
    await openAppPage(page, "/workout/programs");

    const programsPage = page.getByRole("main");
    await expect(
      programsPage.getByRole("heading", { name: "Training Programs" })
    ).toBeVisible();
    await clickHydratedButton(
      programsPage.getByRole("button", { name: "New Program" })
    );
    await programsPage.getByRole("textbox", { name: "Name" }).fill(programName);
    await chooseOption(page, "Periodization", "Daily undulating (DUP)");
    await programsPage.getByRole("button", { name: "Create Program" }).click();

    await expect(page).toHaveURL(/\/workout\/programs\/\d+$/);
    await expect(
      page.getByRole("heading", { name: programName })
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Periodization" })
    ).toHaveText("Daily undulating (DUP)");
    await page.getByRole("button", { name: "Add exercise to Day A" }).click();
    await expect(
      page.getByRole("table", { name: "Day A exercises" })
    ).toBeVisible();
    await expect(page.getByText("strength", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add exercise to Day A" }).click();
    await expect(
      page.getByRole("spinbutton", { name: /Sets for .+, row 1 of Day A/ })
    ).toBeVisible();
    await expect(
      page.getByRole("spinbutton", { name: /Sets for .+, row 2 of Day A/ })
    ).toBeVisible();
    await page.getByRole("button", { name: "Save Program" }).click();
    await expect(page.getByRole("button", { name: "Saved!" })).toBeVisible();
  });
  test("hydrates updated program lists without stale server data", async ({
    page,
  }) => {
    const programName = `E2E Hydration Program ${Date.now()}`;
    await openAppPage(page, "/workout/programs");
    await clickHydratedButton(
      page.getByRole("button", { name: "New Program" })
    );
    await page.getByRole("textbox", { name: "Name" }).fill(programName);
    await page.getByRole("button", { name: "Create Program" }).click();
    await expect(page).toHaveURL(/\/workout\/programs\/\d+$/);

    const hydrationErrors: string[] = [];
    page.on("pageerror", (error) => {
      if (error.message.includes("server rendered text didn't match")) {
        hydrationErrors.push(error.message);
      }
    });
    await openAppPage(page, "/workout/programs");

    await expect(page.getByText(programName, { exact: true })).toBeVisible();
    expect(hydrationErrors).toEqual([]);
  });
  test("derives program targets from the session URL and clears them on finish", async ({
    page,
  }) => {
    const programName = `E2E Program Targets ${Date.now()}`;
    await openAppPage(page, "/workout/programs");

    const programsPage = page.getByRole("main");
    await clickHydratedButton(
      programsPage.getByRole("button", { name: "New Program" })
    );
    await programsPage.getByRole("textbox", { name: "Name" }).fill(programName);
    await programsPage.getByRole("button", { name: "Create Program" }).click();

    await expect(page).toHaveURL(/\/workout\/programs\/\d+$/);
    await page.getByRole("button", { name: "Add exercise to Day A" }).click();
    await page.getByRole("button", { name: "Save Program" }).click();
    await expect(page.getByRole("button", { name: "Saved!" })).toBeVisible();

    await page.getByRole("button", { name: "Start Day A" }).click();
    await expect(page).toHaveURL(/\/workout\/?\?session=\d+$/);
    await expect(
      page.getByText("Program Targets", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("table").filter({ hasText: "Target" }).first()
    ).toBeVisible();

    await clickHydratedButton(page.getByRole("button", { name: "Finish" }));
    await expect(page).toHaveURL(/\/workout\/?\?session=\d+&summary=true/);
    await expect(
      page.getByRole("heading", { name: "Session Summary" })
    ).toBeVisible();
    await clickHydratedButton(page.getByRole("button", { name: "Done" }));
    await expect(page).toHaveURL(/\/workout\/?$/);
    await expect(
      page.getByText("Ready to train?", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Program Targets", { exact: true })
    ).not.toBeVisible();
  });

  test("starts the remaining day after an unsaved deletion", async ({
    page,
  }) => {
    const programName = `E2E Day Identity ${Date.now()}`;
    await openAppPage(page, "/workout/programs");

    const programsPage = page.getByRole("main");
    await clickHydratedButton(
      programsPage.getByRole("button", { name: "New Program" })
    );
    await programsPage.getByRole("textbox", { name: "Name" }).fill(programName);
    await programsPage.getByRole("button", { name: "Create Program" }).click();

    await expect(page).toHaveURL(/\/workout\/programs\/\d+$/);
    await page.getByRole("button", { name: "Add Training Day" }).click();
    await page.getByRole("button", { name: "Save Program" }).click();
    await expect(
      page.getByRole("button", { name: "Start Day B" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Remove Day A" }).click();
    await page.getByRole("button", { name: "Start Day B" }).click();
    await expect(page).toHaveURL(/\/workout\/?\?session=\d+$/);

    await openAppPage(page, "/workout");
    const recentSessions = page.getByRole("table").first();
    await expect(
      recentSessions.getByRole("row").nth(1).getByRole("cell").nth(1)
    ).toHaveText("Day B");
  });
});
