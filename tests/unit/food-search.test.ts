import { describe, expect, it } from "vitest";

import type { Food } from "~/lib/db";
import type { FoodLogHistory } from "~/lib/food-search";
import {
  FOOD_SEARCH_MIN_LENGTH,
  isFoodSearchPending,
  rankFoodSearchResults,
} from "~/lib/food-search";

function makeFood(id: number, name: string): Food {
  return {
    brand: null,
    calories_per_serving: 100,
    carbs_g: 5,
    created_at: "2020-01-01T00:00:00Z",
    fat_g: 2,
    fiber_g: 0,
    id,
    name,
    protein_g: 10,
    serving_size: 100,
    serving_unit: "g",
    sodium_mg: 0,
    source: "seed",
    sugar_g: 0,
  };
}

describe(isFoodSearchPending, () => {
  it("returns false when the query is below the minimum search length", () => {
    expect(isFoodSearchPending("a", "a", false)).toBeFalsy();
    expect(isFoodSearchPending("", "", false)).toBeFalsy();
  });

  it("returns true while the debounced query is catching up", () => {
    expect(
      isFoodSearchPending("chicken", "chick", false, FOOD_SEARCH_MIN_LENGTH)
    ).toBeTruthy();
  });

  it("returns true while the catalog request is in flight", () => {
    expect(
      isFoodSearchPending("chicken", "chicken", true, FOOD_SEARCH_MIN_LENGTH)
    ).toBeTruthy();
  });

  it("returns false once debounce and fetch have settled", () => {
    expect(
      isFoodSearchPending("chicken", "chicken", false, FOOD_SEARCH_MIN_LENGTH)
    ).toBeFalsy();
  });
});

describe(rankFoodSearchResults, () => {
  const catalog = [
    makeFood(1, "Apple"),
    makeFood(2, "Banana"),
    makeFood(3, "Chicken"),
  ];

  it("ranks previously-logged foods above never-logged matches", () => {
    const history: FoodLogHistory[] = [
      { food_id: 3, last_meal_type: "lunch", last_servings: 1, log_count: 2 },
    ];
    const ranked = rankFoodSearchResults(catalog, history);
    expect(ranked.map((row) => row.food.id)).toStrictEqual([3, 1, 2]);
  });

  it("sorts logged foods by descending log count", () => {
    const history: FoodLogHistory[] = [
      {
        food_id: 1,
        last_meal_type: "breakfast",
        last_servings: 1,
        log_count: 3,
      },
      { food_id: 2, last_meal_type: "dinner", last_servings: 2, log_count: 12 },
    ];
    const ranked = rankFoodSearchResults(catalog, history);
    expect(ranked.map((row) => row.food.id)).toStrictEqual([2, 1, 3]);
  });

  it("preserves catalog order among foods with no log history", () => {
    const ranked = rankFoodSearchResults(catalog, []);
    expect(ranked.map((row) => row.food.id)).toStrictEqual([1, 2, 3]);
    expect(ranked.every((row) => row.logCount === null)).toBeTruthy();
  });

  it("attaches log counts for badge display", () => {
    const history: FoodLogHistory[] = [
      {
        food_id: 2,
        last_meal_type: "snack",
        last_servings: 1.5,
        log_count: 12,
      },
    ];
    const ranked = rankFoodSearchResults([makeFood(2, "Banana")], history);
    expect(ranked[0]?.logCount).toBe(12);
    expect(ranked[0]?.lastServings).toBe(1.5);
    expect(ranked[0]?.lastMealType).toBe("snack");
  });
});
