import { describe, expect, it } from "vitest";

import type { FoodLogEntry } from "~/db/types";
import type { MealType } from "~/lib/nutrition";
import {
  ACTIVITY_MULTIPLIERS,
  addDays,
  buildFoodLogDraft,
  calculateAge,
  calculateBMR,
  calculateFoodMacros,
  calculateMacroTargets,
  calculateTDEE,
  formatDisplayDate,
  groupEntriesByMeal,
  mealSubtotals,
  mealTypeForHour,
  parseSearchDate,
  resolveSelectedDate,
  sumNutritionTotals,
} from "~/lib/nutrition";

function makeEntry(
  overrides: Partial<FoodLogEntry> & { meal_type: MealType; calories: number }
): FoodLogEntry {
  return {
    calories: overrides.calories,
    carbs_g: overrides.carbs_g ?? 0,
    created_at: "2026-07-25T08:00:00Z",
    custom_name: null,
    date: "2026-07-25",
    fat_g: overrides.fat_g ?? 0,
    food_id: null,
    id: 1,
    meal_type: overrides.meal_type,
    notes: null,
    protein_g: overrides.protein_g ?? 0,
    servings: 1,
    user_id: 1,
  };
}

describe("BMR - Mifflin-St Jeor Equation", () => {
  it("calculates BMR for a 30-year-old male (validated against published reference)", () => {
    // Reference: Mifflin et al. 1990, male: 10*weight + 6.25*height - 5*age + 5
    const bmr = calculateBMR(80, 180, 30, "male");
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(bmr).toBe(1780);
  });

  it("calculates BMR for a 25-year-old female", () => {
    const bmr = calculateBMR(60, 165, 25, "female");
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
    expect(bmr).toBeCloseTo(1345.25, 1);
  });

  it('uses average adjustment for "other" sex', () => {
    const bmr = calculateBMR(70, 175, 30, "other");
    // Should be between male (+5) and female (-161), average = -78
    const maleBmr = calculateBMR(70, 175, 30, "male");
    const femaleBmr = calculateBMR(70, 175, 30, "female");
    expect(bmr).toBeGreaterThan(femaleBmr);
    expect(bmr).toBeLessThan(maleBmr);
  });

  it("scales linearly with weight", () => {
    const bmr75 = calculateBMR(75, 175, 30, "male");
    const bmr80 = calculateBMR(80, 175, 30, "male");
    // 5kg difference = 50 kcal difference (10 kcal per kg)
    expect(bmr80 - bmr75).toBe(50);
  });
});

describe("TDEE - Activity Multipliers", () => {
  it("applies sedentary multiplier correctly", () => {
    const tdee = calculateTDEE(1780, "sedentary");
    expect(tdee).toBe(Math.round(1780 * 1.2));
  });

  it("applies very_active multiplier correctly", () => {
    const tdee = calculateTDEE(1780, "very_active");
    expect(tdee).toBe(Math.round(1780 * 1.9));
  });

  it("returns higher TDEE for more active lifestyles", () => {
    const sedentary = calculateTDEE(1780, "sedentary");
    const moderate = calculateTDEE(1780, "moderate");
    const veryActive = calculateTDEE(1780, "very_active");
    expect(sedentary).toBeLessThan(moderate);
    expect(moderate).toBeLessThan(veryActive);
  });

  it("has all 5 activity levels defined", () => {
    expect(Object.keys(ACTIVITY_MULTIPLIERS)).toHaveLength(5);
    expect(ACTIVITY_MULTIPLIERS.sedentary).toBe(1.2);
    expect(ACTIVITY_MULTIPLIERS.light).toBe(1.375);
    expect(ACTIVITY_MULTIPLIERS.moderate).toBe(1.55);
    expect(ACTIVITY_MULTIPLIERS.active).toBe(1.725);
    expect(ACTIVITY_MULTIPLIERS.very_active).toBe(1.9);
  });
});

describe("Macro Targets - Goal-based calculations", () => {
  const weightKg = 80;
  const tdee = 2670;

  it("creates 10% surplus for build_muscle goal", () => {
    const macros = calculateMacroTargets(weightKg, tdee, "build_muscle");
    expect(macros.calories).toBe(Math.round(tdee * 1.1));
  });

  it("creates 20% deficit for lose_fat goal", () => {
    const macros = calculateMacroTargets(weightKg, tdee, "lose_fat");
    expect(macros.calories).toBe(Math.round(tdee * 0.8));
  });

  it("maintains calories for maintain goal", () => {
    const macros = calculateMacroTargets(weightKg, tdee, "maintain");
    expect(macros.calories).toBe(tdee);
  });

  it("maintains calories for recomp goal", () => {
    const macros = calculateMacroTargets(weightKg, tdee, "recomp");
    expect(macros.calories).toBe(tdee);
  });

  it("sets protein within Morton et al. 2018 range for hypertrophy", () => {
    // Morton et al.: dose-response up to ~1.62 g/kg, practical upper bound 2.2 g/kg
    const macros = calculateMacroTargets(weightKg, tdee, "build_muscle");
    const proteinPerKg = macros.protein_g / weightKg;
    expect(proteinPerKg).toBeGreaterThanOrEqual(1.6);
    expect(proteinPerKg).toBeLessThanOrEqual(2.2);
  });

  it("sets higher protein during caloric deficit (Helms et al. 2014)", () => {
    const deficit = calculateMacroTargets(weightKg, tdee, "lose_fat");
    const surplus = calculateMacroTargets(weightKg, tdee, "build_muscle");
    // During deficit, protein should be higher (2.4 vs 1.8)
    expect(deficit.protein_g).toBeGreaterThan(surplus.protein_g);
    const proteinPerKg = deficit.protein_g / weightKg;
    expect(proteinPerKg).toBeGreaterThanOrEqual(2.2);
  });

  it("macronutrient calories should approximately equal total calories", () => {
    const macros = calculateMacroTargets(weightKg, tdee, "maintain");
    const macroCalories =
      macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9;
    // Within 5% tolerance (rounding)
    expect(Math.abs(macroCalories - macros.calories)).toBeLessThan(
      macros.calories * 0.05
    );
  });

  it("calculates fiber based on calorie intake (~14g per 1000 kcal)", () => {
    const macros = calculateMacroTargets(weightKg, 3000, "maintain");
    // USDA recommendation: 14g fiber per 1000 kcal
    expect(macros.fiber_g).toBeCloseTo(42, 0);
  });

  it("never returns negative carbs", () => {
    // Extreme case: very high protein and fat relative to calories
    const macros = calculateMacroTargets(120, 1500, "lose_fat");
    expect(macros.carbs_g).toBeGreaterThanOrEqual(0);
  });
});

describe("Age calculation", () => {
  it("calculates age from birth date string", () => {
    const thirtyYearsAgo = new Date();
    thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
    const age = calculateAge(thirtyYearsAgo.toISOString());
    expect(age).toBeGreaterThanOrEqual(29);
    expect(age).toBeLessThanOrEqual(30);
  });

  it("handles future-adjacent dates correctly", () => {
    const age = calculateAge("2000-01-01");
    expect(age).toBeGreaterThan(20);
  });
});

describe("Meal type auto-detection", () => {
  it.each([
    [0, "breakfast"],
    [10, "breakfast"],
    [11, "lunch"],
    [14, "lunch"],
    [15, "dinner"],
    [20, "dinner"],
    [21, "snack"],
    [23, "snack"],
  ] as const)("maps hour %i to %s", (hour, expectedMealType) => {
    expect(mealTypeForHour(hour)).toBe(expectedMealType);
  });

  it.each([-1, 24, 2.5, Number.NaN])("rejects invalid hour %s", (hour) => {
    expect(() => mealTypeForHour(hour)).toThrow(
      `Invalid hour ${String(hour)}; expected an integer from 0 through 23`
    );
  });
});

describe("Food log draft", () => {
  it("scales the selected food macros by the requested servings", () => {
    const draft = buildFoodLogDraft(
      {
        calories_per_serving: 120,
        carbs_g: 8,
        fat_g: 0,
        id: 42,
        name: "Greek Yogurt",
        protein_g: 18,
      },
      1.5,
      "2026-07-25",
      "breakfast"
    );

    expect(draft).toStrictEqual({
      calories: 180,
      carbs_g: 12,
      custom_name: "Greek Yogurt",
      date: "2026-07-25",
      fat_g: 0,
      food_id: 42,
      meal_type: "breakfast",
      protein_g: 27,
      servings: 1.5,
    });
  });
});

describe("Food macro scaling (Atwater label values)", () => {
  // Reference: Atwater general factors (protein 4, carbs 4, fat 9 kcal/g);
  // codified in NLEA/FDA nutrition labeling.
  const chicken = {
    calories_per_serving: 165,
    carbs_g: 0,
    fat_g: 3.6,
    protein_g: 31,
  };

  it("scales every macro linearly with servings", () => {
    // 2 servings of raw chicken breast: 330 kcal, 62g protein (matches e2e preview).
    const macros = calculateFoodMacros(chicken, 2);
    expect(macros.calories).toBe(330);
    expect(macros.protein_g).toBe(62);
    expect(macros.carbs_g).toBe(0);
    expect(macros.fat_g).toBeCloseTo(7.2, 5);
  });

  it("handles fractional servings", () => {
    const macros = calculateFoodMacros(chicken, 1.5);
    expect(macros.calories).toBeCloseTo(247.5, 1);
    expect(macros.protein_g).toBeCloseTo(46.5, 1);
  });

  it("defaults fiber to 0 when the food omits it", () => {
    const macros = calculateFoodMacros({ ...chicken, fiber_g: undefined }, 1);
    expect(macros.fiber_g).toBe(0);
  });

  it("scales fiber when provided", () => {
    const macros = calculateFoodMacros({ ...chicken, fiber_g: 4 }, 2);
    expect(macros.fiber_g).toBe(8);
  });

  it("returns zeros for zero servings", () => {
    const macros = calculateFoodMacros(chicken, 0);
    expect(macros.calories).toBe(0);
    expect(macros.protein_g).toBe(0);
  });
});

describe("Nutrition totals aggregation", () => {
  it("returns an empty total for no items", () => {
    expect(sumNutritionTotals([])).toStrictEqual({
      calories: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      protein_g: 0,
    });
  });

  it("sums macros across multiple items", () => {
    const total = sumNutritionTotals([
      { calories: 200, carbs_g: 30, fat_g: 5, fiber_g: 4, protein_g: 10 },
      { calories: 130, carbs_g: 2, fat_g: 3.6, fiber_g: 0, protein_g: 22 },
    ]);
    expect(total.calories).toBe(330);
    expect(total.protein_g).toBeCloseTo(32, 5);
    expect(total.carbs_g).toBe(32);
    expect(total.fat_g).toBeCloseTo(8.6, 5);
    expect(total.fiber_g).toBe(4);
  });

  it("returns the single item unchanged", () => {
    const item = {
      calories: 250,
      carbs_g: 15,
      fat_g: 8,
      fiber_g: 3,
      protein_g: 20,
    };
    expect(sumNutritionTotals([item])).toStrictEqual(item);
  });
});

describe("Date arithmetic (ISO, DST-safe at noon)", () => {
  it("advances the day by the given offset", () => {
    expect(addDays("2026-07-25", 1)).toBe("2026-07-26");
    expect(addDays("2026-07-25", 7)).toBe("2026-08-01");
  });

  it("rolls over month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("supports negative offsets into the previous month", () => {
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("Date search param helpers", () => {
  it("accepts valid ISO dates and rejects malformed values", () => {
    expect(parseSearchDate("2026-07-25")).toBe("2026-07-25");
    expect(parseSearchDate("2026-02-30")).toBeUndefined();
    expect(parseSearchDate("07-25-2026")).toBeUndefined();
    expect(parseSearchDate()).toBeUndefined();
  });

  it("resolves selected date from search and clamps future days to today", () => {
    const today = resolveSelectedDate();
    expect(resolveSelectedDate("2026-07-25")).toBe("2026-07-25");
    expect(resolveSelectedDate("2099-01-01")).toBe(today);
    expect(resolveSelectedDate("not-a-date")).toBe(today);
  });

  it("formats display dates for the navigation bar", () => {
    expect(formatDisplayDate("2026-07-25")).toContain("Jul");
    expect(formatDisplayDate("2026-07-25")).toContain("2026");
  });
});

describe("Meal grouping and subtotals (PRD 06 Batch 2)", () => {
  it("groups entries by meal type preserving MEAL_TYPES order", () => {
    const entries = [
      makeEntry({ calories: 400, id: 1, meal_type: "lunch" }),
      makeEntry({ calories: 300, id: 2, meal_type: "breakfast" }),
      makeEntry({ calories: 200, id: 3, meal_type: "breakfast" }),
      makeEntry({ calories: 600, id: 4, meal_type: "dinner" }),
    ];
    const groups = groupEntriesByMeal(entries);
    const groupTypes = Object.keys(groups);
    expect(groupTypes).toStrictEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(groups.breakfast).toHaveLength(2);
    expect(groups.lunch).toHaveLength(1);
    expect(groups.dinner).toHaveLength(1);
    expect(groups.snack).toHaveLength(0);
  });

  it("returns empty arrays for every meal type when there are no entries", () => {
    const groups = groupEntriesByMeal([]);
    expect(Object.keys(groups)).toStrictEqual([
      "breakfast",
      "lunch",
      "dinner",
      "snack",
    ]);
    expect(groups.breakfast).toStrictEqual([]);
    expect(groups.lunch).toStrictEqual([]);
    expect(groups.dinner).toStrictEqual([]);
    expect(groups.snack).toStrictEqual([]);
  });

  it("calculates per-meal subtotals from entry macros", () => {
    const entries = [
      makeEntry({
        calories: 300,
        carbs_g: 40,
        fat_g: 8,
        meal_type: "breakfast",
        protein_g: 20,
      }),
      makeEntry({
        calories: 200,
        carbs_g: 30,
        fat_g: 5,
        meal_type: "breakfast",
        protein_g: 10,
      }),
    ];
    const subtotals = mealSubtotals(entries);
    expect(subtotals.calories).toBe(500);
    expect(subtotals.protein_g).toBe(30);
    expect(subtotals.carbs_g).toBe(70);
    expect(subtotals.fat_g).toBe(13);
  });

  it("returns zero subtotals for an empty meal", () => {
    const subtotals = mealSubtotals([]);
    expect(subtotals.calories).toBe(0);
    expect(subtotals.protein_g).toBe(0);
    expect(subtotals.carbs_g).toBe(0);
    expect(subtotals.fat_g).toBe(0);
  });
});
