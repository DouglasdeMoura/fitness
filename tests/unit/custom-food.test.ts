import { describe, expect, it } from "vitest";

import type { CustomFoodDraft } from "~/lib/custom-food";
import {
  customFoodPayload,
  EMPTY_CUSTOM_FOOD_DRAFT,
  isCustomFoodDraftValid,
} from "~/lib/custom-food";

describe(EMPTY_CUSTOM_FOOD_DRAFT, () => {
  it("seeds a sensible starting point for the custom-food form", () => {
    expect(EMPTY_CUSTOM_FOOD_DRAFT).toStrictEqual({
      barcode: "",
      brand: "",
      calories: null,
      carbs: null,
      fat: null,
      name: "",
      protein: null,
      servingSize: 100,
      servingUnit: "g",
    });
  });

  it("declares the grams unit that nutrition labels use by default", () => {
    expect(EMPTY_CUSTOM_FOOD_DRAFT.servingUnit).toBe("g");
  });
});

describe(isCustomFoodDraftValid, () => {
  it("accepts a draft with a name and calories", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      calories: 52,
      name: "Apple",
    };
    expect(isCustomFoodDraftValid(draft)).toBeTruthy();
  });

  it("rejects a blank name even when calories are present", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      calories: 52,
      name: "   ",
    };
    expect(isCustomFoodDraftValid(draft)).toBeFalsy();
  });

  it("rejects a draft with a name but no calories", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: "Mystery Food",
    };
    expect(isCustomFoodDraftValid(draft)).toBeFalsy();
  });

  it("rejects the empty draft outright (save button starts disabled)", () => {
    expect(isCustomFoodDraftValid(EMPTY_CUSTOM_FOOD_DRAFT)).toBeFalsy();
  });

  it("treats a zero-calorie entry as valid (e.g. plain water)", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      calories: 0,
      name: "Sparkling Water",
    };
    expect(isCustomFoodDraftValid(draft)).toBeTruthy();
  });
});

describe(customFoodPayload, () => {
  it("maps every entered field onto the persisted Food shape", () => {
    const draft: CustomFoodDraft = {
      barcode: "",
      brand: "Fage",
      calories: 130,
      carbs: 9,
      fat: 0,
      name: "Greek Yogurt",
      protein: 18,
      servingSize: 170,
      servingUnit: "g",
    };
    expect(customFoodPayload(draft)).toStrictEqual({
      barcode: null,
      brand: "Fage",
      calories_per_serving: 130,
      carbs_g: 9,
      fat_g: 0,
      fiber_g: 0,
      name: "Greek Yogurt",
      protein_g: 18,
      serving_size: 170,
      serving_unit: "g",
      sodium_mg: 0,
      sugar_g: 0,
    });
  });

  it("persists a trimmed barcode when provided", () => {
    const draft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      barcode: " 012345678905 ",
      calories: 120,
      name: "Cereal",
    };
    expect(customFoodPayload(draft).barcode).toBe("012345678905");
  });

  it("stores a null brand when the field is left blank", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      brand: "",
      calories: 320,
      name: "Homemade Chili",
    };
    expect(customFoodPayload(draft).brand).toBeNull();
  });

  it("trims whitespace from name and brand before persisting", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      brand: "  Dole  ",
      calories: 105,
      name: "  Banana  ",
    };
    const payload = customFoodPayload(draft);
    expect(payload.name).toBe("Banana");
    expect(payload.brand).toBe("Dole");
  });

  it("defaults macros to 0 so missing fields do not become NaN downstream", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      calories: 2,
      name: "Black Coffee",
    };
    const payload = customFoodPayload(draft);
    expect(payload.protein_g).toBe(0);
    expect(payload.carbs_g).toBe(0);
    expect(payload.fat_g).toBe(0);
  });

  it("zeroes micronutrients the form does not yet collect", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      calories: 100,
      name: "Test Food",
    };
    const payload = customFoodPayload(draft);
    expect(payload.fiber_g).toBe(0);
    expect(payload.sugar_g).toBe(0);
    expect(payload.sodium_mg).toBe(0);
  });

  it("falls back to a 100 g serving when both serving fields are cleared", () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      calories: 100,
      name: "Test Food",
      servingSize: null,
    };
    expect(customFoodPayload(draft).serving_size).toBe(100);
  });
});
