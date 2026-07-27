import { describe, it, expect } from 'vitest'
import {
  isFoodSearchPending,
  FOOD_SEARCH_MIN_LENGTH,
  rankFoodSearchResults,
  type FoodLogHistory,
} from '~/lib/food-search'
import type { Food } from '~/lib/db'

function makeFood(id: number, name: string): Food {
  return {
    id,
    name,
    brand: null,
    serving_size: 100,
    serving_unit: 'g',
    calories_per_serving: 100,
    protein_g: 10,
    carbs_g: 5,
    fat_g: 2,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
    source: 'seed',
    created_at: '2020-01-01T00:00:00Z',
  }
}

describe('isFoodSearchPending', () => {
  it('returns false when the query is below the minimum search length', () => {
    expect(isFoodSearchPending('a', 'a', false)).toBe(false)
    expect(isFoodSearchPending('', '', false)).toBe(false)
  })

  it('returns true while the debounced query is catching up', () => {
    expect(isFoodSearchPending('chicken', 'chick', false, FOOD_SEARCH_MIN_LENGTH)).toBe(true)
  })

  it('returns true while the catalog request is in flight', () => {
    expect(isFoodSearchPending('chicken', 'chicken', true, FOOD_SEARCH_MIN_LENGTH)).toBe(true)
  })

  it('returns false once debounce and fetch have settled', () => {
    expect(isFoodSearchPending('chicken', 'chicken', false, FOOD_SEARCH_MIN_LENGTH)).toBe(false)
  })
})

describe('rankFoodSearchResults', () => {
  const catalog = [makeFood(1, 'Apple'), makeFood(2, 'Banana'), makeFood(3, 'Chicken')]

  it('ranks previously-logged foods above never-logged matches', () => {
    const history: FoodLogHistory[] = [
      { food_id: 3, log_count: 2, last_servings: 1, last_meal_type: 'lunch' },
    ]
    const ranked = rankFoodSearchResults(catalog, history)
    expect(ranked.map((row) => row.food.id)).toEqual([3, 1, 2])
  })

  it('sorts logged foods by descending log count', () => {
    const history: FoodLogHistory[] = [
      { food_id: 1, log_count: 3, last_servings: 1, last_meal_type: 'breakfast' },
      { food_id: 2, log_count: 12, last_servings: 2, last_meal_type: 'dinner' },
    ]
    const ranked = rankFoodSearchResults(catalog, history)
    expect(ranked.map((row) => row.food.id)).toEqual([2, 1, 3])
  })

  it('preserves catalog order among foods with no log history', () => {
    const ranked = rankFoodSearchResults(catalog, [])
    expect(ranked.map((row) => row.food.id)).toEqual([1, 2, 3])
    expect(ranked.every((row) => row.logCount === null)).toBe(true)
  })

  it('attaches log counts for badge display', () => {
    const history: FoodLogHistory[] = [
      { food_id: 2, log_count: 12, last_servings: 1.5, last_meal_type: 'snack' },
    ]
    const ranked = rankFoodSearchResults([makeFood(2, 'Banana')], history)
    expect(ranked[0]?.logCount).toBe(12)
    expect(ranked[0]?.lastServings).toBe(1.5)
    expect(ranked[0]?.lastMealType).toBe('snack')
  })
})
