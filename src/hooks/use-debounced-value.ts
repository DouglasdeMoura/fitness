import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` has
 * elapsed without further changes. Used to drive a TanStack Query lookup from
 * a controlled input without firing a request per keystroke.
 *
 * This is the React-team-endorsed debounce pattern ("You Might Not Need an
 * Effect" — effects that coordinate *timing*, not effects that mirror server
 * state, are legitimate).
 *
 * @example const debounced = useDebouncedValue(query, 300)
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
