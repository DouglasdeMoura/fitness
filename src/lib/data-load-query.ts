import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

/** Query result for page data loads that surface a Banner + Retry on failure (issue #29). */
export type DataLoadQueryResult<T> = UseQueryResult<T, Error>;

/**
 * Wraps useQuery for route-level data: no automatic retries — the user retries via Banner.
 * @example const statsQuery = useDataLoadQuery({ queryKey: ['dashboard'], queryFn: getStats })
 */
export function useDataLoadQuery<T>(
  options: UseQueryOptions<T, Error>
): DataLoadQueryResult<T> {
  return useQuery({
    retry: false,
    ...options,
  });
}

/** True while the first fetch is in flight and no cached/initial data exists yet. */
export function isDataLoadPending<T>(result: DataLoadQueryResult<T>): boolean {
  return result.isPending && result.data === undefined;
}

/** Returns the first failed query so pages can render one error banner. */
export function pickFailedDataLoadQuery(
  queries: readonly DataLoadQueryResult<unknown>[]
): DataLoadQueryResult<unknown> | undefined {
  return queries.find((query) => query.isError);
}
