import { describe, it, expect } from 'vitest'
import {
  activeSessionFromUrl,
  buildFreeFormSuggestion,
  estimate1RM,
  weightFrom1RM,
  calculateVolume,
  rpeToRir,
  recommendWeeklyVolume,
  calculateWorkoutStats,
  suggestWeightProgression,
  formatLastPerformanceLine,
  formatRelativeDaysAgo,
  VOLUME_GUIDELINES,
  getDupDayEmphasis,
  parseTargetReps,
} from '~/lib/workout'

describe('1RM Estimation - Epley Equation', () => {
  it('returns weight as-is for single rep', () => {
    expect(estimate1RM(100, 1)).toBe(100)
  })

  it('estimates 1RM for 5 reps at 80kg correctly', () => {
    // Epley: 80 * (1 + 5/30) = 80 * 1.1667 = 93.33
    expect(estimate1RM(80, 5)).toBeCloseTo(93.33, 1)
  })

  it('estimates higher 1RM for same weight at lower reps vs higher reps', () => {
    const heavy5 = estimate1RM(100, 5)
    const light10 = estimate1RM(100, 10)
    // 100x5 = 116.67, 100x10 = 133.33
    // More reps at same weight implies higher 1RM
    expect(light10).toBeGreaterThan(heavy5)
  })

  it('reverse calculation: weightFrom1RM returns correct working weight', () => {
    const oneRm = 120
    const workingWeight = weightFrom1RM(oneRm, 5)
    // 120 / (1 + 5/30) = 120 / 1.1667 = 102.86
    expect(workingWeight).toBeCloseTo(102.86, 1)
  })
})

describe('Volume Calculation', () => {
  it('calculates total training volume for sets x reps x weight', () => {
    expect(calculateVolume(4, 8, 100)).toBe(3200)
  })

  it('returns 0 for zero reps', () => {
    expect(calculateVolume(4, 0, 100)).toBe(0)
  })

  it('scales linearly with sets', () => {
    const v3 = calculateVolume(3, 10, 50)
    const v6 = calculateVolume(6, 10, 50)
    expect(v6).toBe(v3 * 2)
  })
})

describe('RPE to RIR Conversion', () => {
  it('RPE 10 = 0 reps in reserve (max effort)', () => {
    expect(rpeToRir(10)).toBe(0)
  })

  it('RPE 7 = 3 reps in reserve', () => {
    expect(rpeToRir(7)).toBe(3)
  })

  it('RPE never returns negative RIR', () => {
    expect(rpeToRir(11)).toBe(0)
    expect(rpeToRir(15)).toBe(0)
  })

  it('follows the standard RPE-RIR mapping', () => {
    for (let rpe = 6; rpe <= 10; rpe++) {
      const expectedRir = 10 - rpe
      expect(rpeToRir(rpe)).toBe(expectedRir)
    }
  })
})

describe('Weekly Volume Recommendations (Schoenfeld et al. 2017)', () => {
  it('recommends mid-range volume for 2x/week frequency', () => {
    const chest = recommendWeeklyVolume(2, 'chest')
    const mid = (VOLUME_GUIDELINES.chest.min + VOLUME_GUIDELINES.chest.max) / 2
    expect(chest).toBe(Math.round(mid))
  })

  it('recommends max volume when training muscle once per week', () => {
    const legs = recommendWeeklyVolume(1, 'legs')
    expect(legs).toBe(VOLUME_GUIDELINES.legs.max)
  })

  it('all muscle groups have minimum 8 sets/week', () => {
    for (const mg of Object.keys(VOLUME_GUIDELINES)) {
      expect(VOLUME_GUIDELINES[mg as keyof typeof VOLUME_GUIDELINES].min).toBeGreaterThanOrEqual(8)
    }
  })

  it('back and legs have higher volume guidelines than arms', () => {
    expect(VOLUME_GUIDELINES.back.min).toBeGreaterThanOrEqual(VOLUME_GUIDELINES.arms.min)
    expect(VOLUME_GUIDELINES.legs.min).toBeGreaterThanOrEqual(VOLUME_GUIDELINES.arms.min)
  })
})

describe('Progressive Overload Suggestions', () => {
  it('suggests weight increase when RPE is low and reps exceeded', () => {
    const suggestion = suggestWeightProgression(100, 12, 8, 6)
    expect(suggestion.weight).toBeGreaterThan(100)
    expect(suggestion.reps).toBe(8)
    expect(suggestion.note).toContain('+2.5%')
  })

  it('suggests maintaining weight when RPE is high and reps missed', () => {
    const suggestion = suggestWeightProgression(100, 5, 8, 10)
    expect(suggestion.weight).toBe(100)
    expect(suggestion.reps).toBeLessThan(8)
    expect(suggestion.note).toContain('Hold weight')
  })

  it('suggests adding reps in the sweet spot (RPE 7-9, target met)', () => {
    const suggestion = suggestWeightProgression(80, 8, 8, 8)
    expect(suggestion.weight).toBe(80)
    expect(suggestion.reps).toBeGreaterThanOrEqual(8)
  })

  it('weight increase is approximately 2.5% (not aggressive)', () => {
    const suggestion = suggestWeightProgression(100, 12, 8, 6)
    const expectedIncrease = 100 * 1.025
    expect(suggestion.weight).toBeCloseTo(expectedIncrease, 1)
  })
})

describe('Workout Stats', () => {
  it('calculates total volume and set count from workout', () => {
    const sets = [
      { reps: 8, weight_kg: 100, exercise_id: 1 },
      { reps: 8, weight_kg: 100, exercise_id: 1 },
      { reps: 10, weight_kg: 80, exercise_id: 2 },
    ]
    const stats = calculateWorkoutStats(sets)
    expect(stats.totalSets).toBe(3)
    expect(stats.totalVolume).toBe(8 * 100 + 8 * 100 + 10 * 80)
  })

  it('handles null reps/weight gracefully', () => {
    const sets = [
      { reps: null, weight_kg: null, exercise_id: 1 },
    ]
    const stats = calculateWorkoutStats(sets)
    expect(stats.totalVolume).toBe(0)
    expect(stats.totalSets).toBe(1)
  })

  it('estimates duration based on sets (rough)', () => {
    const sets = Array.from({ length: 10 }, () => ({ reps: 8, weight_kg: 60, exercise_id: 1 }))
    const stats = calculateWorkoutStats(sets)
    // ~150 seconds per set -> 10 sets = 1500 seconds = 25 minutes
    expect(stats.estimatedDuration).toBeGreaterThan(15)
    expect(stats.estimatedDuration).toBeLessThan(40)
  })
})

describe('DUP rep-zone emphasis (Rhea et al. 2002; Prestes et al. 2009)', () => {
  // DUP rotates rep zones within the week: <=5 strength, 6-10 hypertrophy, >=11 endurance.
  it.each([
    ['5', 'strength'],
    ['6', 'hypertrophy'],
    ['10', 'hypertrophy'],
    ['11', 'endurance'],
    ['3-5', 'strength'],
    ['8-12', 'hypertrophy'],
    ['12-15', 'endurance'],
    ['15-20', 'endurance'],
  ] as const)('classifies target reps "%s" as %s emphasis', (targetReps, expected) => {
    expect(getDupDayEmphasis(targetReps)).toBe(expected)
  })

  it('falls back to a hypertrophy rep range when the prescription is unparseable', () => {
    // parseTargetReps defaults to 8 reps (mid-hypertrophy) for garbage input.
    expect(getDupDayEmphasis('')).toBe('hypertrophy')
    expect(getDupDayEmphasis('rest')).toBe('hypertrophy')
  })
})

describe('Target rep parsing', () => {
  it('returns the single value for a plain number', () => {
    expect(parseTargetReps('8')).toBe(8)
  })

  it('averages the endpoints of a rep range', () => {
    // 8-12 midpoint = 10, 3-5 midpoint = 4
    expect(parseTargetReps('8-12')).toBe(10)
    expect(parseTargetReps('3-5')).toBe(4)
  })

  it('tolerates surrounding whitespace in ranges', () => {
    expect(parseTargetReps('  6 - 8  ')).toBe(7)
  })

  it('defaults to 8 reps when no digits are present', () => {
    expect(parseTargetReps('failure')).toBe(8)
  })
})


describe('Last-performance formatting (PRD 10 Batch 1)', () => {
  it('formats relative days ago', () => {
    expect(formatRelativeDaysAgo('2019-12-20', '2020-01-01')).toBe('12 days ago')
    expect(formatRelativeDaysAgo('2020-01-01', '2020-01-01')).toBe('today')
    expect(formatRelativeDaysAgo('2019-12-31', '2020-01-01')).toBe('1 day ago')
  })

  it('renders the last-time inline line', () => {
    const line = formatLastPerformanceLine(
      { weight_kg: 100, reps: 8, rpe: 8, date: '2019-12-20' },
      '2020-01-01',
    )
    expect(line).toBe('Last time: 100 kg × 8 @ RPE 8 (12 days ago)')
  })
})

describe('Free-form progression suggestion (issue #59)', () => {
  it('uses suggestWeightProgression as the source of free-form suggestions', () => {
    const performance = { weight_kg: 100, reps: 12, rpe: 6, date: '2019-12-20' }
    const expected = suggestWeightProgression(100, 12, 8, 6, 2.5)
    expect(buildFreeFormSuggestion(performance)).toEqual(expected)
  })

  it('returns null when there is no prior performance', () => {
    expect(buildFreeFormSuggestion(null)).toBeNull()
  })
})

describe('activeSessionFromUrl', () => {
  it('maps server session fields to ActiveSession shape', () => {
    expect(activeSessionFromUrl({
      id: 5,
      program_id: 2,
      program_day_id: 7,
    })).toEqual({
      id: 5,
      tempRef: 'session-5',
      programId: 2,
      programDayId: 7,
    })
  })

  it('preserves null program linkage for free-form sessions', () => {
    expect(activeSessionFromUrl({
      id: 12,
      program_id: null,
      program_day_id: null,
    })).toEqual({
      id: 12,
      tempRef: 'session-12',
      programId: null,
      programDayId: null,
    })
  })
})
