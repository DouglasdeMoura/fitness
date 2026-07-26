/** Minimum query length before the food catalog search runs. */
export const FOOD_SEARCH_MIN_LENGTH = 2

/**
 * True while the user is waiting on debounced input or an in-flight search.
 * Keeps the search spinner visible during both phases of a typeahead request.
 */
export function isFoodSearchPending(
  query: string,
  debouncedQuery: string,
  isFetching: boolean,
  minLength: number = FOOD_SEARCH_MIN_LENGTH,
): boolean {
  const trimmed = query.trim()
  if (trimmed.length < minLength) return false
  return query !== debouncedQuery || isFetching
}
