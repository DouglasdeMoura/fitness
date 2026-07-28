import { describe, expect, it } from "vitest";

import { isDataLoadPending, pickFailedDataLoadQuery } from '~/lib/data-load-query';
import type { DataLoadQueryResult } from '~/lib/data-load-query';

function mockQuery<T>(
  partial: Partial<DataLoadQueryResult<T>> &
    Pick<DataLoadQueryResult<T>, "isError">
): DataLoadQueryResult<T> {
  return {
    data: undefined,
    error: null,
    isFetching: false,
    isPending: false,
    refetch: async () => ({}) as never,
    ...partial,
  } as DataLoadQueryResult<T>;
}

describe("data load query helpers (issue #29)", () => {
  it("treats pending without data as initial load", () => {
    expect(
      isDataLoadPending(mockQuery({ isError: false, isPending: true }))
    ).toBeTruthy();
    expect(
      isDataLoadPending(
        mockQuery({ data: { ok: true }, isError: false, isPending: true })
      )
    ).toBeFalsy();
  });

  it("returns the first failed query for banner rendering", () => {
    const ok = mockQuery({ data: [], isError: false });
    const failed = mockQuery({
      error: new Error("load failed"),
      isError: true,
    });
    expect(pickFailedDataLoadQuery([ok, failed])).toBe(failed);
    expect(pickFailedDataLoadQuery([ok])).toBeUndefined();
  });
});
