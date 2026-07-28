import type { Food, MealType } from "./db";

/** Minimum query length before the food catalog search runs. */
export const FOOD_SEARCH_MIN_LENGTH = 2;

/**
 * True while the user is waiting on debounced input or an in-flight search.
 * Keeps the search spinner visible during both phases of a typeahead request.
 */
export function isFoodSearchPending(
  query: string,
  debouncedQuery: string,
  isFetching: boolean,
  minLength: number = FOOD_SEARCH_MIN_LENGTH
): boolean {
  const trimmed = query.trim();
  if (trimmed.length < minLength) {
    return false;
  }
  return query !== debouncedQuery || isFetching;
}

/** Per-food logging history used to boost and badge search results. */
export interface FoodLogHistory {
  food_id: number;
  last_meal_type: MealType;
  last_servings: number;
  log_count: number;
}

export interface RankedFoodSearchResult {
  food: Food;
  lastMealType: MealType | null;
  lastServings: number | null;
  logCount: number | null;
}

/**
 * Boosts previously-logged foods above catalog matches. Logged foods sort by
 * descending log count; never-logged foods keep the catalog's relevance order.
 * Self-monitoring consistency predicts outcomes (Burke et al. 2011) — surfacing
 * repeat foods first removes taps from the highest-frequency path.
 *
 * @example
 * rankFoodSearchResults(catalogHits, [{ food_id: 3, log_count: 12, ... }])
 */
export function rankFoodSearchResults(
  results: Food[],
  history: FoodLogHistory[]
): RankedFoodSearchResult[] {
  const historyByFoodId = new Map(
    history.map((entry) => [entry.food_id, entry])
  );

  const ranked = results.map((food, index) => {
    const stats = historyByFoodId.get(food.id);
    return {
      food,
      hasHistory: stats !== undefined,
      index,
      lastMealType: stats?.last_meal_type ?? null,
      lastServings: stats?.last_servings ?? null,
      logCount: stats?.log_count ?? null,
    };
  });

  ranked.sort((a, b) => {
    if (a.hasHistory !== b.hasHistory) {
      return a.hasHistory ? -1 : 1;
    }
    if (a.hasHistory && b.hasHistory) {
      const countDiff = (b.logCount ?? 0) - (a.logCount ?? 0);
      if (countDiff !== 0) {
        return countDiff;
      }
    }
    return a.index - b.index;
  });

  return ranked.map(({ food, logCount, lastServings, lastMealType }) => ({
    food,
    lastMealType,
    lastServings,
    logCount,
  }));
}
