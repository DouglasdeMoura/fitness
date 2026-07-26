import { describe, it, expect } from 'vitest'
import { isFoodSearchPending, FOOD_SEARCH_MIN_LENGTH } from '~/lib/food-search'

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
