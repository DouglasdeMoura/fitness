import { describe, expect, it } from "vitest";

import type { MealTemplateDetail } from "~/lib/api";
import type { Food } from "~/lib/db";
import type { EditableItem } from "~/lib/template-form";
import {
  buildCreateTemplatePayload,
  buildTemplateSavePayload,
  editableItemFromFood,
  makeTempId,
  templateFormDefaults,
  validateCreateTemplateName,
  validateTemplateItems,
} from "~/lib/template-form";

const chicken: Food = {
  brand: null,
  calories_per_serving: 165,
  carbs_g: 0,
  created_at: "2025-01-01T00:00:00Z",
  fat_g: 3.6,
  fiber_g: 0,
  id: 11,
  name: "Chicken Breast (raw)",
  protein_g: 31,
  serving_size: 100,
  serving_unit: "g",
  sodium_mg: 74,
  source: "usda",
  sugar_g: 0,
};

function detailFixture(
  overrides: Partial<MealTemplateDetail> = {}
): MealTemplateDetail {
  return {
    created_at: "2025-01-01T00:00:00Z",
    default_meal_type: "lunch",
    description: " Everyday lunch ",
    id: 1,
    items: [
      {
        calories_per_serving: chicken.calories_per_serving,
        carbs_g: chicken.carbs_g,
        fat_g: chicken.fat_g,
        fiber_g: chicken.fiber_g,
        food_id: chicken.id,
        food_name: chicken.name,
        id: 100,
        protein_g: chicken.protein_g,
        serving_unit: chicken.serving_unit,
        servings: 1.5,
        sort_order: 1,
        template_id: 1,
      },
    ],
    name: "Lunch Bowl",
    totals: {
      calories: 248,
      carbs_g: 0,
      fat_g: 5.4,
      fiber_g: 0,
      protein_g: 46.5,
    },
    user_id: 1,
    ...overrides,
  };
}

describe(templateFormDefaults, () => {
  it("seeds form fields from the query row and tags each item with a stable tempId", () => {
    const defaults = templateFormDefaults(detailFixture());

    expect(defaults.name).toBe("Lunch Bowl");
    expect(defaults.defaultMealType).toBe("lunch");
    expect(defaults.items).toHaveLength(1);
    expect(defaults.items[0]).toMatchObject({
      food_id: chicken.id,
      food_name: chicken.name,
      servings: 1.5,
      tempId: "item-100",
    });
  });

  it("coerces a null description into an empty string for a controlled input", () => {
    const defaults = templateFormDefaults(detailFixture({ description: null }));
    expect(defaults.description).toBe("");
  });
});

describe(editableItemFromFood, () => {
  it("maps a searched food into a one-serving item at the given sort position", () => {
    const item = editableItemFromFood(chicken, 2);
    expect(item.food_id).toBe(chicken.id);
    expect(item.servings).toBe(1);
    expect(item.sort_order).toBe(2);
    expect(item.tempId).toMatch(/^tmp-/);
  });
});

describe(buildTemplateSavePayload, () => {
  it("trims text, drops empty descriptions, and reindexes sort_order from position", () => {
    const itemA: EditableItem = {
      calories_per_serving: 165,
      carbs_g: 0,
      fat_g: 3.6,
      fiber_g: 0,
      food_id: 11,
      food_name: "Chicken Breast (raw)",
      protein_g: 31,
      serving_unit: "g",
      servings: 2,
      sort_order: 99,
      tempId: "tmp-a",
    };
    const itemB: EditableItem = { ...itemA, food_id: 22, tempId: "tmp-b" };

    const payload = buildTemplateSavePayload(
      {
        defaultMealType: "dinner",
        description: "   ",
        items: [itemA, itemB],
        name: "  Dinner  ",
      },
      7
    );

    expect(payload).toStrictEqual({
      default_meal_type: "dinner",
      description: undefined,
      id: 7,
      items: [
        { food_id: 11, servings: 2, sort_order: 1 },
        { food_id: 22, servings: 2, sort_order: 2 },
      ],
      name: "Dinner",
    });
  });

  it("keeps a non-empty trimmed description", () => {
    const payload = buildTemplateSavePayload(
      {
        defaultMealType: "snack",
        description: " high protein ",
        items: [],
        name: "X",
      },
      1
    );
    expect(payload.description).toBe("high protein");
  });
});

describe(validateTemplateItems, () => {
  const valid = (overrides: Partial<EditableItem> = {}): EditableItem => ({
    calories_per_serving: 165,
    carbs_g: 0,
    fat_g: 3.6,
    fiber_g: 0,
    food_id: 11,
    food_name: "Chicken Breast (raw)",
    protein_g: 31,
    serving_unit: "g",
    servings: 1,
    sort_order: 1,
    tempId: "tmp-1",
    ...overrides,
  });

  it("allows an empty template (save clears all items)", () => {
    expect(validateTemplateItems([])).toBeUndefined();
  });

  it("passes for well-formed items", () => {
    expect(validateTemplateItems([valid()])).toBeUndefined();
  });

  it("flags a non-positive serving count with the offending food name", () => {
    expect(validateTemplateItems([valid({ servings: 0 })])).toBe(
      "Chicken Breast (raw) needs servings greater than 0"
    );
  });

  it("flags an item missing its food reference", () => {
    expect(validateTemplateItems([valid({ food_id: 0 })])).toBe(
      "Every item needs a food"
    );
  });
});

describe(makeTempId, () => {
  it("produces unique client ids prefixed with tmp-", () => {
    const a = makeTempId();
    const b = makeTempId();
    expect(a).toMatch(/^tmp-/);
    expect(a).not.toBe(b);
  });
});

describe(validateCreateTemplateName, () => {
  it("rejects blank names", () => {
    expect(validateCreateTemplateName("")).toBe("Template name is required.");
    expect(validateCreateTemplateName("  ")).toBe("Template name is required.");
  });

  it("accepts non-empty names", () => {
    expect(
      validateCreateTemplateName("High-protein breakfast")
    ).toBeUndefined();
  });
});

describe(buildCreateTemplatePayload, () => {
  it("trims fields and starts with an empty item list", () => {
    const payload = buildCreateTemplatePayload({
      defaultMealType: "dinner",
      description: "  Notes  ",
      name: "  Dinner bowl  ",
    });

    expect(payload).toStrictEqual({
      default_meal_type: "dinner",
      description: "Notes",
      items: [],
      name: "Dinner bowl",
    });
  });

  it("omits description when blank", () => {
    const payload = buildCreateTemplatePayload({
      defaultMealType: "lunch",
      description: "   ",
      name: "Lunch",
    });

    expect(payload.description).toBeUndefined();
  });
});
