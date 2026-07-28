import type { MealType } from "~/db/types";

/**
 * Templates whose default meal matches the section appear first (issue #56).
 * @example sortTemplatesForMealSection(templates, 'breakfast')
 */
export function sortTemplatesForMealSection<
  T extends { default_meal_type: MealType; item_count: number },
>(templates: T[], mealType: MealType): T[] {
  const loggable = templates.filter((template) => template.item_count > 0);
  return [...loggable].sort((left, right) => {
    const leftMatch = left.default_meal_type === mealType ? 0 : 1;
    const rightMatch = right.default_meal_type === mealType ? 0 : 1;
    if (leftMatch !== rightMatch) {
      return leftMatch - rightMatch;
    }
    return 0;
  });
}
