import { describe, it, expect } from 'vitest'
import type { BodyLog } from '~/lib/db'
import type { MuscleVolume } from '~/lib/api'
import {
  capitalizeMuscleGroup,
  volumeProgress,
  volumeStatusBadge,
  volumeVariant,
  weightChangeTone,
  weightChartGeometry,
  weightChartPoints,
  weightTrend,
  workoutsPerWeek,
} from '~/lib/progress'

/** Minimal BodyLog factory; only the fields the helpers read are populated. */
function bodyLog(id: number, date: string, weightKg: number | null): BodyLog {
  return {
    id,
    user_id: 1,
    date,
    weight_kg: weightKg,
    body_fat_pct: null,
    muscle_mass_kg: null,
    waist_cm: null,
    notes: null,
    created_at: date,
  }
}

/** MuscleVolume factory. */
function muscleVolume(overrides: Partial<MuscleVolume>): MuscleVolume {
  return {
    muscle_group: 'chest',
    total_sets: 10,
    total_volume: 1000,
    min_recommended: 8,
    max_recommended: 16,
    status: 'optimal',
    ...overrides,
  }
}

describe('weightTrend', () => {
  it('returns null when no logs carry a weight', () => {
    expect(weightTrend([bodyLog(1, '2024-01-01', null)])).toBeNull()
    expect(weightTrend([])).toBeNull()
  })

  it('orders oldest -> newest so change = newest - oldest', () => {
    // getBodyLogs returns newest-first; the helper must not inherit that order.
    const logs = [
      bodyLog(3, '2024-03-01', 82),
      bodyLog(2, '2024-02-01', 81),
      bodyLog(1, '2024-01-01', 80),
    ]
    const trend = weightTrend(logs)!
    expect(trend.first).toBe(80) // oldest
    expect(trend.last).toBe(82) // newest
    expect(trend.change).toBe(2) // gained 2 kg
  })

  it('ignores logs without a weight when computing min/max', () => {
    const logs = [
      bodyLog(1, '2024-01-01', 90),
      bodyLog(2, '2024-01-02', null),
      bodyLog(3, '2024-01-03', 85),
    ]
    const trend = weightTrend(logs)!
    expect(trend.min).toBe(85)
    expect(trend.max).toBe(90)
    expect(trend.change).toBe(-5) // lost 5 kg
  })

  it('handles a single weighted log without dividing by zero', () => {
    const trend = weightTrend([bodyLog(1, '2024-01-01', 75)])!
    expect(trend.first).toBe(75)
    expect(trend.last).toBe(75)
    expect(trend.change).toBe(0)
  })
})

describe('weightChangeTone', () => {
  it('reads weight loss as favourable (success) and gain as unfavourable (error)', () => {
    // Preserves the prior custom-CSS framing; see TODO in progress.ts for
    // making this goal-aware.
    expect(weightChangeTone(-1.5)).toBe('success')
    expect(weightChangeTone(1.5)).toBe('error')
  })

  it('returns null for a flat or non-finite trend so no badge renders', () => {
    expect(weightChangeTone(0)).toBeNull()
    expect(weightChangeTone(Number.NaN)).toBeNull()
  })
})

describe('workoutsPerWeek', () => {
  it('normalises a 90-day session count to a weekly average', () => {
    // 13 sessions over 90 days -> 13 / (90/7) = 13 / 12.857 ~= 1.011
    expect(workoutsPerWeek(13, 90)).toBeCloseTo(1.011, 2)
  })

  it('returns zero for a non-positive window instead of dividing by zero', () => {
    expect(workoutsPerWeek(5, 0)).toBe(0)
    expect(workoutsPerWeek(5, -7)).toBe(0)
  })
})

describe('volumeVariant / volumeStatusBadge', () => {
  // Schoenfeld et al. 2017 buckets: optimal = target zone, under = caution,
  // high = over-reaching risk.
  it('maps each status to its semantic tone', () => {
    expect(volumeVariant('optimal')).toBe('success')
    expect(volumeVariant('under')).toBe('warning')
    expect(volumeVariant('high')).toBe('error')
  })

  it('pairs each tone with a human-readable label', () => {
    expect(volumeStatusBadge('optimal')).toEqual({ label: 'Optimal', variant: 'success' })
    expect(volumeStatusBadge('under')).toEqual({ label: 'Under', variant: 'warning' })
    expect(volumeStatusBadge('high')).toEqual({ label: 'High', variant: 'error' })
  })
})

describe('volumeProgress', () => {
  it('drives the bar from sets vs. the recommended weekly max', () => {
    const bar = volumeProgress(muscleVolume({ total_sets: 8, max_recommended: 16 }))
    expect(bar.value).toBe(8)
    expect(bar.max).toBe(16)
    expect(bar.percent).toBe(50)
  })

  it('clamps the fill and percent at the recommended max on an over-training week', () => {
    const bar = volumeProgress(muscleVolume({ total_sets: 40, max_recommended: 16, status: 'high' }))
    // Fill never overflows the track, but the tone flips to error.
    expect(bar.value).toBe(16)
    expect(bar.percent).toBe(100)
    expect(bar.variant).toBe('error')
  })

  it('switches the tone to warning while under the minimum', () => {
    const bar = volumeProgress(muscleVolume({ total_sets: 2, status: 'under' }))
    expect(bar.variant).toBe('warning')
  })

  it('guards against a zero recommended max so the bar never divides by zero', () => {
    const bar = volumeProgress(muscleVolume({ total_sets: 5, max_recommended: 0 }))
    expect(bar.max).toBe(1)
    expect(bar.percent).toBe(100)
  })
})

describe('weightChartGeometry', () => {
  it('widens the plot with the number of samples for readable dense histories', () => {
    expect(weightChartGeometry(10).width).toBe(100) // floors at 100
    expect(weightChartGeometry(20).width).toBe(160) // 20 * 8
  })

  it('exposes a fixed plot height plus gutters for the viewBox', () => {
    const geom = weightChartGeometry(5)
    expect(geom.height).toBe(200)
    expect(geom.viewBoxHeight).toBeGreaterThan(geom.height)
  })
})

describe('weightChartPoints', () => {
  it('spreads points across the full plot width', () => {
    const geom = weightChartGeometry(3)
    const points = weightChartPoints([70, 75, 80], 70, 80, geom)
    expect(points[0].x).toBe(0)
    expect(points[points.length - 1].x).toBeCloseTo(geom.width, 5)
  })

  it('plots heavier weights higher (smaller y) — axis is inverted', () => {
    const geom = weightChartGeometry(2)
    const [lighter, heavier] = weightChartPoints([70, 80], 70, 80, geom)
    expect(heavier.y).toBeLessThan(lighter.y)
  })

  it('does not divide by zero for a flat series', () => {
    const geom = weightChartGeometry(3)
    const points = weightChartPoints([75, 75, 75], 75, 75, geom)
    // All points share the same y; no NaN/Infinity.
    expect(points.every((p) => Number.isFinite(p.y))).toBe(true)
  })

  it('does not divide by zero for a single sample', () => {
    const geom = weightChartGeometry(1)
    const [point] = weightChartPoints([75], 70, 80, geom)
    expect(Number.isFinite(point.x)).toBe(true)
    expect(Number.isFinite(point.y)).toBe(true)
  })
})

describe('capitalizeMuscleGroup', () => {
  it('title-cases snake_case muscle groups', () => {
    expect(capitalizeMuscleGroup('full_body')).toBe('Full Body')
    expect(capitalizeMuscleGroup('chest')).toBe('Chest')
  })
})
