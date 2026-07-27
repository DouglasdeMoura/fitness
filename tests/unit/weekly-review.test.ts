import { describe, expect, it } from 'vitest'
import type { BodyLog } from '~/lib/db'
import {
  assembleWeeklyReview,
  formatCalorieAverageVersusTarget,
  formatVolumeWeekDelta,
  formatWeightTrendDelta,
  generateWeeklyReviewHeadline,
  hasReviewableWeek,
  headlineSoundsFalselyPositive,
  lastCompleteWeekRange,
  movingAverageWeightKg,
  priorWeekRange,
  weightMovingAverageDelta,
  type WeeklyReviewFacts,
} from '~/lib/weekly-review'

// Re-export helper for tests only — use assembleWeeklyReview inputs instead
function bodyLog(date: string, weightKg: number): BodyLog {
  return {
    id: 1,
    user_id: 1,
    date,
    weight_kg: weightKg,
    body_fat_pct: null,
    notes: null,
    created_at: `${date}T12:00:00.000Z`,
  }
}

function baseFacts(overrides: Partial<WeeklyReviewFacts> = {}): WeeklyReviewFacts {
  const week = lastCompleteWeekRange('2020-01-08')
  return {
    week,
    nutrition: {
      logAdherencePct: 43,
      proteinTargetDays: 2,
      avgDailyCalories: 1800,
      calorieTarget: 2200,
      loggedDays: 3,
    },
    training: {
      totalVolume: 4000,
      setCount: 24,
      sessionCount: 3,
      volumeDeltaPct: null,
      volumeDirection: 'first',
      priorTotalVolume: 0,
      priorSetCount: 0,
    },
    weight: { movingAvgDeltaKg: null },
    personalRecordCount: 0,
    ...overrides,
  }
}

describe('lastCompleteWeekRange', () => {
  it('returns the Monday–Sunday week before the week containing asOf', () => {
    expect(lastCompleteWeekRange('2020-01-08')).toEqual({
      start: '2019-12-30',
      end: '2020-01-05',
    })
    expect(lastCompleteWeekRange('2020-01-01')).toEqual({
      start: '2019-12-23',
      end: '2019-12-29',
    })
  })
})

describe('hasReviewableWeek', () => {
  it('is false when asOf is still inside the candidate week', () => {
    expect(hasReviewableWeek('2019-12-29', ['2019-12-29'])).toBe(false)
  })

  it('is true when the prior week ended and activity exists in that week', () => {
    expect(hasReviewableWeek('2020-01-01', ['2019-12-25'])).toBe(true)
  })

  it('is false without activity in the review week', () => {
    expect(hasReviewableWeek('2020-01-01', ['2019-12-31'])).toBe(false)
  })
})

describe('generateWeeklyReviewHeadline', () => {
  it('combines protein and volume wins when both are notable', () => {
    const headline = generateWeeklyReviewHeadline(
      baseFacts({
        nutrition: {
          logAdherencePct: 86,
          proteinTargetDays: 6,
          avgDailyCalories: 2100,
          calorieTarget: 2200,
          loggedDays: 6,
        },
        training: {
          totalVolume: 5000,
          setCount: 30,
          sessionCount: 4,
          volumeDeltaPct: 8,
          volumeDirection: 'more',
          priorTotalVolume: 4600,
          priorSetCount: 28,
        },
      }),
    )
    expect(headline).toBe(
      'You hit your protein target 6 of 7 days and added 8% training volume.',
    )
  })

  it('uses neutral copy for a poor week instead of false praise', () => {
    const headline = generateWeeklyReviewHeadline(baseFacts())
    expect(headline).toBe('A lighter week — 3 sessions logged.')
    expect(headlineSoundsFalselyPositive(headline)).toBe(false)
    expect(headline.toLowerCase()).toContain('lighter week')
  })

  it('handles a zero-data week without throwing', () => {
    const review = assembleWeeklyReview({
      asOf: '2020-01-08',
      calorieTarget: 2200,
      proteinTargetG: 150,
      dailyNutrition: new Map(),
      workoutSets: [],
      sessionDates: [],
      bodyLogs: [bodyLog('2020-01-01', 80)],
      personalRecordCount: 0,
    })

    expect(review).not.toBeNull()
    expect(review?.nutrition.avgDailyCalories).toBe(0)
    expect(review?.nutrition.logAdherencePct).toBe(0)
    expect(review?.headline).toBe('No food or workouts logged this week.')
  })
})

describe('weightMovingAverageDelta', () => {
  it('computes delta between week-start and week-end moving averages', () => {
    const range = { start: '2020-01-01', end: '2020-01-07' }
    const logs = [
      bodyLog('2019-12-26', 80),
      bodyLog('2019-12-27', 80),
      bodyLog('2019-12-28', 80),
      bodyLog('2019-12-29', 80),
      bodyLog('2019-12-30', 80),
      bodyLog('2019-12-31', 80),
      bodyLog('2020-01-01', 80),
      bodyLog('2020-01-02', 81),
      bodyLog('2020-01-03', 82),
      bodyLog('2020-01-04', 83),
      bodyLog('2020-01-05', 84),
      bodyLog('2020-01-06', 85),
      bodyLog('2020-01-07', 86),
    ]

    const trend = weightMovingAverageDelta(logs, range)
    expect(trend.movingAvgDeltaKg).not.toBeNull()
    expect(trend.movingAvgDeltaKg).toBeGreaterThan(0)
  })

  it('returns null when there is insufficient weight data', () => {
    const trend = weightMovingAverageDelta([], lastCompleteWeekRange('2020-01-08'))
    expect(trend.movingAvgDeltaKg).toBeNull()
  })
})

describe('movingAverageWeightKg', () => {
  it('returns null for an empty map', () => {
    expect(movingAverageWeightKg(new Map(), '2020-01-01')).toBeNull()
  })
})

describe('format helpers', () => {
  it('formats volume delta copy', () => {
    expect(formatVolumeWeekDelta('more', 12)).toBe('12% more than prior week')
    expect(formatVolumeWeekDelta('first', null)).toBe('First week with logged sets')
  })

  it('formats calorie average versus target', () => {
    expect(formatCalorieAverageVersusTarget(2000, 2200)).toContain('2,000 kcal avg')
    expect(formatCalorieAverageVersusTarget(0, 2200)).toContain('0 kcal avg')
  })

  it('formats missing weight trend as em dash', () => {
    expect(formatWeightTrendDelta(null)).toBe('—')
    expect(formatWeightTrendDelta(0.4)).toBe('+0.4 kg')
  })
})

describe('priorWeekRange', () => {
  it('steps back one calendar week', () => {
    const week = lastCompleteWeekRange('2020-01-08')
    expect(priorWeekRange(week)).toEqual({ start: '2019-12-23', end: '2019-12-29' })
  })
})
