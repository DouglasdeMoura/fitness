import { describe, it, expect } from 'vitest'
import type { ProgramDetail } from '~/lib/api'
import type { Exercise } from '~/lib/db'
import {
  buildProgramSavePayload,
  editableExerciseFromExercise,
  makeTempId,
  newProgramDay,
  buildCreateProgramPayload,
  programFormDefaults,
  validateCreateProgramName,
  validateProgramDays,
  type EditableProgramDay,
  type EditableProgramExercise,
  type ProgramFormValues,
} from '~/lib/program-form'

const squat: Exercise = {
  id: 21,
  name: 'Barbell Back Squat',
  category: 'compound',
  muscle_group: 'legs',
  equipment: 'barbell',
  instructions: null,
  created_at: '2025-01-01T00:00:00Z',
}

function exerciseFixture(
  overrides: Partial<EditableProgramExercise> = {},
): EditableProgramExercise {
  return {
    tempId: 'tmp-ex',
    exercise_id: squat.id,
    target_sets: 4,
    target_reps: '5',
    target_rpe: 8,
    rest_seconds: 180,
    sort_order: 1,
    ...overrides,
  }
}

function detailFixture(overrides: Partial<ProgramDetail> = {}): ProgramDetail {
  return {
    id: 7,
    user_id: 1,
    name: '5x5 Strength',
    description: ' Linear strength block ',
    frequency_per_week: 3,
    periodization_type: 'linear',
    progression_increment_pct: 2.5,
    is_active: 1,
    created_at: '2025-01-01T00:00:00Z',
    days: [
      {
        id: 100,
        program_id: 7,
        day_name: 'Day A',
        sort_order: 1,
        created_at: '2025-01-01T00:00:00Z',
        exercises: [
          {
            id: 1000,
            program_day_id: 100,
            exercise_id: squat.id,
            target_sets: 4,
            target_reps: '5',
            target_rpe: 8,
            rest_seconds: 180,
            sort_order: 1,
            created_at: '2025-01-01T00:00:00Z',
            exercise_name: squat.name,
            muscle_group: 'legs',
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('programFormDefaults', () => {
  it('seeds scalar fields from the query row and coerces the is_active flag to boolean', () => {
    const defaults = programFormDefaults(detailFixture())

    expect(defaults).toMatchObject({
      name: '5x5 Strength',
      description: ' Linear strength block ',
      frequency: 3,
      periodizationType: 'linear',
      incrementPct: 2.5,
      isActive: true,
    })
  })

  it('tags each day and exercise with a stable tempId derived from the persisted id', () => {
    const defaults = programFormDefaults(detailFixture())

    expect(defaults.days).toHaveLength(1)
    expect(defaults.days[0]).toMatchObject({
      tempId: 'day-100',
      persistedId: 100,
      day_name: 'Day A',
      exercises: [
        expect.objectContaining({ tempId: 'ex-1000', exercise_id: squat.id }),
      ],
    })
  })

  it('coerces a null description into an empty string for a controlled input', () => {
    const defaults = programFormDefaults(detailFixture({ description: null }))
    expect(defaults.description).toBe('')
  })

  it('falls back to sensible defaults when nullable DB columns are unset', () => {
    const defaults = programFormDefaults(
      detailFixture({
        days: [
          {
            id: 1,
            program_id: 7,
            day_name: 'Day A',
            sort_order: 1,
            created_at: '2025-01-01T00:00:00Z',
            exercises: [
              {
                id: 1,
                program_day_id: 1,
                exercise_id: squat.id,
                target_sets: null,
                target_reps: null,
                target_rpe: null,
                rest_seconds: null,
                sort_order: 1,
                created_at: '2025-01-01T00:00:00Z',
                exercise_name: squat.name,
                muscle_group: 'legs',
              },
            ],
          },
        ],
      }),
    )

    expect(defaults.days[0].exercises[0]).toMatchObject({
      target_sets: 3,
      target_reps: '8-12',
      target_rpe: 8,
      rest_seconds: 90,
    })
  })
})

describe('newProgramDay', () => {
  it('advances the day letter from the current day count and places the row last', () => {
    expect(newProgramDay(0)).toMatchObject({
      day_name: 'Day A',
      sort_order: 1,
      exercises: [],
    })
    expect(newProgramDay(1)).toMatchObject({ day_name: 'Day B', sort_order: 2 })
    expect(newProgramDay(25)).toMatchObject({ day_name: 'Day Z', sort_order: 26 })
  })

  it('mints a fresh tmp- id per call', () => {
    expect(newProgramDay(0).tempId).not.toBe(newProgramDay(0).tempId)
  })
})

describe('editableExerciseFromExercise', () => {
  it('defaults DUP exercises to a strength rep zone and linear to hypertrophy', () => {
    const dup = editableExerciseFromExercise(squat, 'dup', 1)
    const linear = editableExerciseFromExercise(squat, 'linear', 2)

    expect(dup).toMatchObject({
      exercise_id: squat.id,
      target_sets: 3,
      target_reps: '5',
      target_rpe: 8,
      rest_seconds: 90,
      sort_order: 1,
    })
    expect(linear.target_reps).toBe('8-12')
    expect(linear.sort_order).toBe(2)
  })
})

describe('buildProgramSavePayload', () => {
  const baseValues: ProgramFormValues = {
    name: '  Push Pull Legs ',
    description: '  ',
    frequency: 4,
    periodizationType: 'dup',
    incrementPct: 5,
    isActive: false,
    days: [
      {
        tempId: 'day-a',
        persistedId: 50,
        day_name: 'Push',
        sort_order: 99,
        exercises: [
          exerciseFixture({ tempId: 'ex-a', sort_order: 99 }),
          exerciseFixture({ tempId: 'ex-b', sort_order: 7 }),
        ],
      },
    ],
  }

  it('maps camelCase field names onto the snake_case server payload', () => {
    const payload = buildProgramSavePayload(baseValues, 7)

    expect(payload).toMatchObject({
      id: 7,
      frequency_per_week: 4,
      periodization_type: 'dup',
      progression_increment_pct: 5,
      is_active: false,
    })
  })

  it('trims the name, drops an all-whitespace description, and maps it to undefined', () => {
    const payload = buildProgramSavePayload(baseValues, 7)

    expect(payload.name).toBe('Push Pull Legs')
    expect(payload.description).toBeUndefined()
  })

  it('keeps a non-empty trimmed description', () => {
    const payload = buildProgramSavePayload(
      { ...baseValues, description: ' higher frequency ' },
      7,
    )
    expect(payload.description).toBe('higher frequency')
  })

  it('strips client-only fields and reindexes sort_order from position', () => {
    const payload = buildProgramSavePayload(baseValues, 7)

    expect(payload.days).toEqual([
      {
        day_name: 'Push',
        sort_order: 1,
        exercises: [
          {
            exercise_id: squat.id,
            target_sets: 4,
            target_reps: '5',
            target_rpe: 8,
            rest_seconds: 180,
            sort_order: 1,
          },
          {
            exercise_id: squat.id,
            target_sets: 4,
            target_reps: '5',
            target_rpe: 8,
            rest_seconds: 180,
            sort_order: 2,
          },
        ],
      },
    ])
    // No tempId/persistedId leaks into the server payload.
    expect(JSON.stringify(payload)).not.toContain('tempId')
    expect(JSON.stringify(payload)).not.toContain('persistedId')
  })
})

describe('validateProgramDays', () => {
  const validDay = (overrides: Partial<EditableProgramDay> = {}): EditableProgramDay => ({
    tempId: 'day-1',
    day_name: 'Day A',
    sort_order: 1,
    exercises: [exerciseFixture({ tempId: 'ex-1' })],
    ...overrides,
  })

  it('accepts an empty day list (clears every training day on save)', () => {
    expect(validateProgramDays([])).toBeUndefined()
  })

  it('accepts well-formed days', () => {
    expect(validateProgramDays([validDay()])).toBeUndefined()
  })

  it('rejects more than seven days — a week has no more', () => {
    const eight = Array.from({ length: 8 }, (_, index) =>
      validDay({ tempId: `day-${index}`, sort_order: index + 1 }),
    )
    expect(validateProgramDays(eight)).toBe(
      'A program can have at most 7 training days.',
    )
  })

  it('flags a day with a blank name', () => {
    expect(validateProgramDays([validDay({ day_name: '   ' })])).toBe(
      'Every training day needs a name.',
    )
  })

  it('flags an exercise with no sets using the offending day name', () => {
    const day = validDay({
      exercises: [exerciseFixture({ target_sets: 0 })],
    })
    expect(validateProgramDays([day])).toBe('Day A: every exercise needs at least 1 set.')
  })

  it('flags an exercise with no rep target', () => {
    const day = validDay({
      exercises: [exerciseFixture({ target_reps: '' })],
    })
    expect(validateProgramDays([day])).toBe('Day A: every exercise needs a rep target.')
  })
})

describe('makeTempId', () => {
  it('produces unique client ids prefixed with tmp-', () => {
    const a = makeTempId()
    const b = makeTempId()
    expect(a).toMatch(/^tmp-/)
    expect(a).not.toBe(b)
  })
})

describe('validateCreateProgramName', () => {
  it('rejects blank names', () => {
    expect(validateCreateProgramName('')).toBe('Program name is required.')
    expect(validateCreateProgramName('   ')).toBe('Program name is required.')
  })

  it('accepts non-empty names', () => {
    expect(validateCreateProgramName('Upper/Lower')).toBeUndefined()
  })
})

describe('buildCreateProgramPayload', () => {
  it('trims fields and seeds one empty training day', () => {
    const payload = buildCreateProgramPayload(
      {
        name: '  Push Pull  ',
        description: '  Notes  ',
        frequency: 4,
        periodizationType: 'dup',
      },
      { activateIfFirst: true },
    )

    expect(payload).toEqual({
      name: 'Push Pull',
      description: 'Notes',
      frequency_per_week: 4,
      periodization_type: 'dup',
      is_active: true,
      days: [{ day_name: 'Day A', sort_order: 1, exercises: [] }],
    })
  })

  it('omits description when blank', () => {
    const payload = buildCreateProgramPayload(
      {
        name: 'Starter',
        description: '   ',
        frequency: 3,
        periodizationType: 'linear',
      },
      { activateIfFirst: false },
    )

    expect(payload.description).toBeUndefined()
    expect(payload.is_active).toBe(false)
  })
})
