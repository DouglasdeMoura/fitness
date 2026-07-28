import { describe, expect, it } from 'vitest'
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  type DataLoadQueryResult,
} from '~/lib/data-load-query'

function mockQuery<T>(
  partial: Partial<DataLoadQueryResult<T>> & Pick<DataLoadQueryResult<T>, 'isError'>,
): DataLoadQueryResult<T> {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isFetching: false,
    refetch: async () => ({}) as never,
    ...partial,
  } as DataLoadQueryResult<T>
}

describe('data load query helpers (issue #29)', () => {
  it('treats pending without data as initial load', () => {
    expect(isDataLoadPending(mockQuery({ isPending: true, isError: false }))).toBe(true)
    expect(
      isDataLoadPending(mockQuery({ isPending: true, isError: false, data: { ok: true } })),
    ).toBe(false)
  })

  it('returns the first failed query for banner rendering', () => {
    const ok = mockQuery({ isError: false, data: [] })
    const failed = mockQuery({ isError: true, error: new Error('load failed') })
    expect(pickFailedDataLoadQuery([ok, failed])).toBe(failed)
    expect(pickFailedDataLoadQuery([ok])).toBeUndefined()
  })
})
