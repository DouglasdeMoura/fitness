import { describe, expect, it } from "vitest";

import { buildQuickAddDraft, QUICK_ADD_DEFAULT_NAME } from "~/lib/nutrition";

const DATE = "2020-01-01";

describe("buildQuickAddDraft (issue #57)", () => {
  it("requires calories and defaults optional macros to zero", () => {
    expect(buildQuickAddDraft({ calories: 500 }, DATE, "lunch")).toStrictEqual({
      calories: 500,
      carbs_g: 0,
      custom_name: QUICK_ADD_DEFAULT_NAME,
      date: DATE,
      fat_g: 0,
      meal_type: "lunch",
      protein_g: 0,
      servings: 1,
    });
  });

  it("uses trimmed custom_name when provided", () => {
    expect(
      buildQuickAddDraft(
        { calories: 320, name: "  Office lunch  ", protein_g: 20 },
        DATE,
        "breakfast"
      ).custom_name
    ).toBe("Office lunch");
  });

  it("rejects non-positive calories", () => {
    expect(() => buildQuickAddDraft({ calories: 0 }, DATE, "snack")).toThrow(
      RangeError
    );
  });
});
