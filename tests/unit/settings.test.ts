import { describe, it, expect } from 'vitest'
import {
  GOAL_OPTIONS,
  SCIENCE_REFERENCES,
  SEX_OPTIONS,
  activityOptions,
  buildProfileUpdate,
  exportDownloadFilename,
  parseWeightKg,
  saveProfileButtonLabel,
  todayISODate,
  toISODate,
} from '~/lib/settings'

describe('buildProfileUpdate', () => {
  it('maps form fields onto the updateUser payload shape', () => {
    expect(
      buildProfileUpdate({
        name: 'Alex',
        heightCm: 178,
        sex: 'male',
        activity: 'moderate',
        goal: 'build_muscle',
        birthDate: '1990-05-01',
      }),
    ).toEqual({
      name: 'Alex',
      height_cm: 178,
      sex: 'male',
      activity_level: 'moderate',
      goal_type: 'build_muscle',
      birth_date: '1990-05-01',
    })
  })

  it('stores null birth_date when the field is cleared', () => {
    const payload = buildProfileUpdate({
      name: 'Alex',
      heightCm: null,
      sex: 'female',
      activity: 'sedentary',
      goal: 'lose_fat',
      birthDate: '',
    })
    expect(payload.birth_date).toBeNull()
    expect(payload.height_cm).toBeNull()
  })
})

describe('parseWeightKg', () => {
  it('accepts positive finite weights', () => {
    expect(parseWeightKg(72.5)).toBe(72.5)
    expect(parseWeightKg(1)).toBe(1)
  })

  it('rejects empty, zero, negative, and non-finite values', () => {
    expect(parseWeightKg(null)).toBeNull()
    expect(parseWeightKg(undefined)).toBeNull()
    expect(parseWeightKg(0)).toBeNull()
    expect(parseWeightKg(-3)).toBeNull()
    expect(parseWeightKg(Number.NaN)).toBeNull()
    expect(parseWeightKg(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('exportDownloadFilename', () => {
  it('uses the ISO calendar date in the download name', () => {
    expect(exportDownloadFilename(new Date('2026-07-25T15:30:00.000Z'))).toBe(
      'fittrack-export-2026-07-25.json',
    )
  })
})

describe('todayISODate', () => {
  it('formats the local calendar date as zero-padded YYYY-MM-DD', () => {
    // Construct via local components so the test is timezone-independent.
    expect(todayISODate(new Date(2026, 6, 25))).toBe('2026-07-25')
  })

  it('pads single-digit months and days', () => {
    expect(todayISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('does not roll back a day like toISOString can west of Greenwich', () => {
    // Local midnight on Jan 5 anywhere is still Jan 5 locally; the helper
    // must read local components, not UTC.
    const local = new Date(2026, 0, 5, 0, 0, 0)
    expect(todayISODate(local)).toBe('2026-01-05')
  })
})

describe('toISODate', () => {
  it('accepts well-formed YYYY-MM-DD strings', () => {
    expect(toISODate('1990-05-01')).toBe('1990-05-01')
  })

  it('rejects empty, null, and malformed input', () => {
    expect(toISODate('')).toBeNull()
    expect(toISODate(null)).toBeNull()
    expect(toISODate(undefined)).toBeNull()
    expect(toISODate('1990-5-1')).toBeNull()
    expect(toISODate('not-a-date')).toBeNull()
    expect(toISODate('1990/05/01')).toBeNull()
  })
})

describe('saveProfileButtonLabel', () => {
  it('shows a confirmation label after a successful save', () => {
    expect(saveProfileButtonLabel(false)).toBe('Save Profile')
    expect(saveProfileButtonLabel(true)).toBe('Saved')
  })
})

describe('settings selector catalogues', () => {
  it('exposes surplus and deficit wording on goal options', () => {
    const labels = GOAL_OPTIONS.map((o) => o.label)
    expect(labels.some((l) => l.includes('Build Muscle') && l.includes('surplus'))).toBe(
      true,
    )
    expect(labels.some((l) => l.includes('Lose Fat') && l.includes('deficit'))).toBe(true)
  })

  it('lists sedentary and moderately active activity levels', () => {
    const labels = activityOptions().map((o) => o.label)
    expect(labels.some((l) => l.includes('Sedentary'))).toBe(true)
    expect(labels.some((l) => l.includes('Moderately active'))).toBe(true)
  })

  it('includes male, female, and other sex options for BMR', () => {
    expect(SEX_OPTIONS.map((o) => o.value)).toEqual(['male', 'female', 'other'])
  })
})

describe('SCIENCE_REFERENCES', () => {
  it('cites the core formulas surfaced in the About card', () => {
    const blob = SCIENCE_REFERENCES.map((r) => `${r.topic} ${r.citation}`).join(' ')
    expect(blob).toContain('Mifflin-St Jeor')
    expect(blob).toContain('Morton')
    expect(blob).toContain('Epley')
    expect(blob).toContain('Zourdos')
    expect(blob).toContain('Schoenfeld')
  })
})
