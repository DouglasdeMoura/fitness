import { createServerFn } from '@tanstack/react-start'
import { barcodeLookupVariants, normalizeBarcode } from './barcode'
import { getDb, type User, type Food, type FoodLogEntry, type Exercise, type WorkoutSession, type WorkoutSet, type BodyLog, type Program, type ProgramDay, type ProgramExercise, type PeriodizationType, type MealTemplate, type MealTemplateItem, type MealPlan, type MealType } from './db'
import {
  calculateBMR,
  calculateTDEE,
  calculateAge,
  calculateMacroTargets,
  calculateFoodMacros,
  sumNutritionTotals,
  sumFoodLogEntryTotals,
  getWeekStart,
  addDays,
  todayString,
  emptyTotals,
  type ActivityLevel,
  type GoalType,
  type MacroTargets,
  type NutritionTotals,
} from './nutrition'
import {
  copyDayEntriesInDb,
  copyMealEntriesInDb,
  deleteFoodLogEntriesInDb,
} from './food-log-copy'
import { logMealTemplateInDb } from './meal-template-log'
import {
  compareSessionVolumes,
  computeSessionVolumeStats,
  durationMinutesBetween,
  formatSessionVolumeComparison,
  resolveProgramTargets,
} from './workout'
import { assembleConsistencyMetrics, type ConsistencyMetrics } from './consistency'
import { recordKindsBySetId, type ExerciseSetSnapshot } from './records'
import {
  assembleWeeklyReview,
  hasReviewableWeek,
  lastCompleteWeekRange,
  priorWeekRange,
  type WeeklyReviewPayload,
} from './weekly-review'
import { type QueuedMutation, type SyncOutcome, type SyncResult } from './sync'

// --- Ensure default user exists ---

export const ensureDefaultUser = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  let user = db.prepare('SELECT * FROM users LIMIT 1').get() as User | undefined
  if (!user) {
    db.prepare(
      `INSERT INTO users (name, sex, height_cm, activity_level, goal_type)
       VALUES ('Athlete', 'male', 178, 'moderate', 'build_muscle')`
    ).run()
    user = db.prepare('SELECT * FROM users LIMIT 1').get() as User
  }
  return user
})

// --- User ---

export const getUser = createServerFn({ method: 'GET' }).handler(async () => {
  return await ensureDefaultUser()
})

export const updateUser = createServerFn({ method: 'POST' })
  .validator((data: Partial<User>) => data as Partial<User>)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const updates = ctx.data
    const fields = Object.keys(updates).filter((k) => k !== 'id' && k !== 'created_at' && k !== 'updated_at')
    if (fields.length === 0) return user

    const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
    const params: Record<string, unknown> = { id: user.id }
    for (const f of fields) params[f] = (updates as Record<string, unknown>)[f]
    params['updated_at'] = new Date().toISOString()

    db.prepare(`UPDATE users SET ${setClause}, updated_at = @updated_at WHERE id = @id`).run(params)
    return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as User
  })

// --- Body Logs ---

export const getBodyLogs = createServerFn({ method: 'GET' })
  .validator((data: { limit?: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const limit = ctx.data?.limit || 90
    return db.prepare(
      'SELECT * FROM body_logs WHERE user_id = ? ORDER BY date DESC LIMIT ?'
    ).all(user.id, limit) as BodyLog[]
  })

export const logBodyweight = createServerFn({ method: 'POST' })
  .validator((data: { weight_kg: number; body_fat_pct?: number; notes?: string; date?: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const date = ctx.data.date || todayString()
    db.prepare(
      `INSERT INTO body_logs (user_id, date, weight_kg, body_fat_pct, notes)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET
         weight_kg = excluded.weight_kg,
         body_fat_pct = COALESCE(excluded.body_fat_pct, body_logs.body_fat_pct),
         notes = excluded.notes`
    ).run(user.id, date, ctx.data.weight_kg, ctx.data.body_fat_pct ?? null, ctx.data.notes ?? null)
    return db.prepare('SELECT * FROM body_logs WHERE user_id = ? AND date = ?').get(user.id, date) as BodyLog
  })

export const getLatestBodyweight = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()
  return db.prepare(
    'SELECT * FROM body_logs WHERE user_id = ? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1'
  ).get(user.id) as BodyLog | undefined
})

// --- Calculated Targets ---
export type DailyTargets = MacroTargets & {
  weightKg: number
  bmr: number
  tdee: number
  age: number
}


export const getDailyTargets = createServerFn({ method: 'GET' }).handler(async (): Promise<DailyTargets> => {
  const db = getDb()
  const user = await ensureDefaultUser()
  const bw = await getLatestBodyweight()
  const weightKg = bw?.weight_kg || 75

  let bmr = 0
  let tdee = 0
  let age = 30

  if (user.birth_date) {
    age = calculateAge(user.birth_date)
  }
  if (user.height_cm) {
    bmr = calculateBMR(weightKg, user.height_cm, age, user.sex)
    tdee = calculateTDEE(bmr, user.activity_level as ActivityLevel)
  }

  const macros = calculateMacroTargets(weightKg, tdee, user.goal_type as GoalType)

  return { weightKg, bmr: Math.round(bmr), tdee, age, ...macros }
})

// --- Foods ---

export const searchFoods = createServerFn({ method: 'GET' })
  .validator((data: { query: string; limit?: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const query = `%${ctx.data.query}%`
    const limit = ctx.data.limit || 20
    return db.prepare(
      'SELECT * FROM foods WHERE name LIKE ? OR brand LIKE ? ORDER BY name LIMIT ?'
    ).all(query, query, limit) as Food[]
  })

export const getAllFoods = createServerFn({ method: 'GET' })
  .validator((data: { limit?: number } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const db = getDb()
    const limit = ctx.data?.limit || 100
    return db.prepare('SELECT * FROM foods ORDER BY name LIMIT ?').all(limit) as Food[]
  })

/** Resolve a scanned GTIN against foods the user has logged before (issue #58). */
export const getFoodByBarcode = createServerFn({ method: 'GET' })
  .validator((data: { barcode: string }) => data)
  .handler(async (ctx) => {
    const normalized = normalizeBarcode(ctx.data.barcode)
    if (!normalized) {
      return null
    }
    const db = getDb()
    const variants = barcodeLookupVariants(normalized)
    const placeholders = variants.map(() => '?').join(', ')
    return (db.prepare(
      `SELECT * FROM foods WHERE barcode IN (${placeholders}) LIMIT 1`,
    ).get(...variants) as Food | undefined) ?? null
  })

export const addFood = createServerFn({ method: 'POST' })
  .validator((data: Omit<Food, 'id' | 'created_at' | 'source'> & { source?: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const d = ctx.data
    const result = db.prepare(
      `INSERT INTO foods (name, brand, serving_size, serving_unit, calories_per_serving, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, barcode, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      d.name, d.brand, d.serving_size, d.serving_unit,
      d.calories_per_serving, d.protein_g, d.carbs_g, d.fat_g,
      d.fiber_g, d.sugar_g, d.sodium_mg, d.barcode ?? null, d.source || 'user'
    )
    return db.prepare('SELECT * FROM foods WHERE id = ?').get(result.lastInsertRowid) as Food
  })

export type LoggedFoodSummary = Food & {
  last_servings: number
  last_meal_type: MealType
  log_count?: number
}

export type FoodLogStats = {
  food_id: number
  log_count: number
  last_servings: number
  last_meal_type: MealType
}

const LATEST_FOOD_LOG_CTE = `
  SELECT food_id, servings, meal_type, date, created_at,
    ROW_NUMBER() OVER (PARTITION BY food_id ORDER BY date DESC, created_at DESC) AS rn
  FROM food_log
  WHERE user_id = ? AND food_id IS NOT NULL
`

/** Distinct foods ordered by most recent log date (derived, not denormalised). */
export const getRecentFoods = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()
  return db.prepare(`
    WITH latest AS (${LATEST_FOOD_LOG_CTE})
    SELECT f.*, latest.servings AS last_servings, latest.meal_type AS last_meal_type
    FROM latest
    JOIN foods f ON f.id = latest.food_id
    WHERE latest.rn = 1
    ORDER BY latest.date DESC, latest.created_at DESC
    LIMIT 20
  `).all(user.id) as LoggedFoodSummary[]
})

/** Distinct foods ordered by log count over the trailing 90 days. */
export const getFrequentFoods = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()
  return db.prepare(`
    WITH freq AS (
      SELECT food_id, COUNT(*) AS log_count
      FROM food_log
      WHERE user_id = ? AND food_id IS NOT NULL
        AND date >= date('now', '-90 days')
      GROUP BY food_id
      ORDER BY log_count DESC
      LIMIT 20
    ),
    latest AS (${LATEST_FOOD_LOG_CTE})
    SELECT f.*, freq.log_count, latest.servings AS last_servings, latest.meal_type AS last_meal_type
    FROM freq
    JOIN foods f ON f.id = freq.food_id
    JOIN latest ON latest.food_id = freq.food_id AND latest.rn = 1
    ORDER BY freq.log_count DESC
  `).all(user.id, user.id) as LoggedFoodSummary[]
})

/** All-time log counts plus last-used servings/meal for search ranking. */
export const getLoggedFoodStats = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()
  return db.prepare(`
    WITH latest AS (${LATEST_FOOD_LOG_CTE}),
    counts AS (
      SELECT food_id, COUNT(*) AS log_count
      FROM food_log
      WHERE user_id = ? AND food_id IS NOT NULL
      GROUP BY food_id
    )
    SELECT c.food_id, c.log_count, latest.servings AS last_servings, latest.meal_type AS last_meal_type
    FROM counts c
    JOIN latest ON latest.food_id = c.food_id AND latest.rn = 1
  `).all(user.id, user.id) as FoodLogStats[]
})

// --- Food Log ---

export const getFoodLog = createServerFn({ method: 'GET' })
  .validator((data: { date?: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const date = ctx.data?.date || todayString()
    return db.prepare(
      'SELECT * FROM food_log WHERE user_id = ? AND date = ? ORDER BY meal_type, created_at'
    ).all(user.id, date) as (FoodLogEntry & { food_name?: string })[]
  })

export const addFoodLogEntry = createServerFn({ method: 'POST' })
  .validator((data: {
    food_id?: number
    custom_name?: string
    date?: string
    meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
    servings: number
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    notes?: string
  }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const d = ctx.data
    const date = d.date || todayString()
    const result = db.prepare(
      `INSERT INTO food_log (user_id, food_id, custom_name, date, meal_type, servings, calories, protein_g, carbs_g, fat_g, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(user.id, d.food_id ?? null, d.custom_name ?? null, date, d.meal_type, d.servings, d.calories, d.protein_g, d.carbs_g, d.fat_g, d.notes ?? null)
    return db.prepare('SELECT * FROM food_log WHERE id = ?').get(result.lastInsertRowid) as FoodLogEntry
  })

export const deleteFoodLogEntry = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    db.prepare('DELETE FROM food_log WHERE id = ? AND user_id = ?').run(ctx.data.id, user.id)
    return { success: true }
  })

export const deleteFoodLogEntries = createServerFn({ method: 'POST' })
  .validator((data: { ids: number[] }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    return deleteFoodLogEntriesInDb(db, user.id, ctx.data.ids)
  })

export const copyMealFromDate = createServerFn({ method: 'POST' })
  .validator((data: { fromDate: string; toDate: string; mealType: MealType }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const { fromDate, toDate, mealType } = ctx.data
    return copyMealEntriesInDb(db, user.id, fromDate, toDate, mealType)
  })

export const copyDayFromDate = createServerFn({ method: 'POST' })
  .validator((data: { fromDate: string; toDate: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const { fromDate, toDate } = ctx.data
    return copyDayEntriesInDb(db, user.id, fromDate, toDate)
  })

export const logMealTemplate = createServerFn({ method: 'POST' })
  .validator((data: { templateId: number; date: string; mealType: MealType }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const { templateId, date, mealType } = ctx.data
    return logMealTemplateInDb(db, user.id, templateId, date, mealType)
  })

/** LEFT JOIN so null food_id quick-add rows are never dropped from totals (issue #57). */
export const FOOD_LOG_SUMMARY_SQL = `SELECT fl.*, f.name AS food_name
       FROM food_log fl
       LEFT JOIN foods f ON f.id = fl.food_id
       WHERE fl.user_id = ? AND fl.date = ?
       ORDER BY fl.meal_type, fl.created_at`

export function fetchFoodLogSummaryEntries(
  db: ReturnType<typeof getDb>,
  userId: number,
  date: string,
): (FoodLogEntry & { food_name?: string | null })[] {
  return db.prepare(FOOD_LOG_SUMMARY_SQL).all(userId, date) as (FoodLogEntry & {
    food_name?: string | null
  })[]
}

export const getNutritionSummary = createServerFn({ method: 'GET' })
  .validator((data: { date?: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const date = ctx.data?.date || todayString()
    const entries = fetchFoodLogSummaryEntries(db, user.id, date)
    const totals = sumFoodLogEntryTotals(entries)

    return { entries, totals }
  })

// --- Exercises ---

export const getExercises = createServerFn({ method: 'GET' })
  .validator((data: { muscle_group?: string } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const db = getDb()
    if (ctx.data?.muscle_group) {
      return db.prepare('SELECT * FROM exercises WHERE muscle_group = ? ORDER BY name').all(ctx.data.muscle_group) as Exercise[]
    }
    return db.prepare('SELECT * FROM exercises ORDER BY name').all() as Exercise[]
  })

// --- Workouts ---

export const getWorkoutSessions = createServerFn({ method: 'GET' })
  .validator((data: { limit?: number; date?: string } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const limit = ctx.data?.limit || 30
    // `date` is a day string, so every session logged today compares equal and
    // SQLite is free to return them in any order — the recent-sessions list
    // could show this morning's workout above the one just finished. The id
    // tiebreaker makes "most recent first" actually true within a day.
    if (ctx.data?.date) {
      return db.prepare(
        'SELECT * FROM workout_sessions WHERE user_id = ? AND date = ? ORDER BY date DESC, id DESC'
      ).all(user.id, ctx.data.date) as WorkoutSession[]
    }
    return db.prepare(
      'SELECT * FROM workout_sessions WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT ?'
    ).all(user.id, limit) as WorkoutSession[]
  })

export const getWorkoutSession = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(ctx.data.id) as WorkoutSession | undefined
    if (!session) return null
    const sets = db.prepare(
      `SELECT ws.*, e.name as exercise_name, e.muscle_group
       FROM workout_sets ws
       JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.session_id = ?
       ORDER BY ws.exercise_id, ws.set_number`
    ).all(ctx.data.id) as (WorkoutSet & { exercise_name: string; muscle_group: string })[]
    return { session, sets }
  })

export const createWorkoutSession = createServerFn({ method: 'POST' })
  .validator((data: { name?: string; date?: string; program_id?: number; program_day_id?: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const date = ctx.data.date || todayString()
    const result = db.prepare(
      'INSERT INTO workout_sessions (user_id, date, name, program_id, program_day_id) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, date, ctx.data.name || 'Workout', ctx.data.program_id ?? null, ctx.data.program_day_id ?? null)
    return { id: result.lastInsertRowid as number }
  })

export const addWorkoutSet = createServerFn({ method: 'POST' })
  .validator((data: {
    session_id: number
    exercise_id: number
    set_number: number
    reps: number
    weight_kg: number
    rpe?: number
    rest_seconds?: number
    notes?: string
  }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const d = ctx.data
    const result = db.prepare(
      `INSERT INTO workout_sets (session_id, exercise_id, set_number, reps, weight_kg, rpe, rest_seconds, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(d.session_id, d.exercise_id, d.set_number, d.reps, d.weight_kg, d.rpe ?? 7, d.rest_seconds ?? null, d.notes ?? null)
    return db.prepare('SELECT * FROM workout_sets WHERE id = ?').get(result.lastInsertRowid) as WorkoutSet
  })

export const deleteWorkoutSet = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    db.prepare('DELETE FROM workout_sets WHERE id = ?').run(ctx.data.id)
    return { success: true }
  })

export type WorkoutSessionSummary = {
  sessionId: number
  name: string
  date: string
  totalVolume: number
  setCount: number
  exerciseCount: number
  durationMinutes: number | null
  personalRecordCount: number
  comparisonSentence: string
}

type SessionSetRow = {
  id: number
  exercise_id: number
  reps: number | null
  weight_kg: number | null
}

function loadSessionSets(db: ReturnType<typeof getDb>, sessionId: number): SessionSetRow[] {
  return db
    .prepare(
      `SELECT id, exercise_id, reps, weight_kg
       FROM workout_sets
       WHERE session_id = ?
       ORDER BY exercise_id, set_number`,
    )
    .all(sessionId) as SessionSetRow[]
}

function loadExerciseHistory(
  db: ReturnType<typeof getDb>,
  userId: number,
  exerciseId: number,
): ExerciseSetSnapshot[] {
  return db
    .prepare(
      `SELECT ws.id, ws.session_id, ws.weight_kg, ws.reps
       FROM workout_sets ws
       JOIN workout_sessions wse ON ws.session_id = wse.id
       WHERE wse.user_id = ? AND ws.exercise_id = ?
         AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
       ORDER BY wse.date ASC, ws.id ASC`,
    )
    .all(userId, exerciseId) as ExerciseSetSnapshot[]
}

function countSessionPersonalRecords(
  db: ReturnType<typeof getDb>,
  userId: number,
  sets: SessionSetRow[],
): number {
  const exerciseIds = [...new Set(sets.map((set) => set.exercise_id))]
  let prSetCount = 0

  for (const exerciseId of exerciseIds) {
    const chronological = loadExerciseHistory(db, userId, exerciseId)
    const kindsBySetId = recordKindsBySetId(chronological)
    for (const set of sets) {
      if (set.exercise_id !== exerciseId) continue
      if ((kindsBySetId.get(set.id) ?? []).length > 0) {
        prSetCount += 1
      }
    }
  }

  return prSetCount
}

function findPreviousNamedSession(
  db: ReturnType<typeof getDb>,
  userId: number,
  session: WorkoutSession,
): WorkoutSession | null {
  const sessionName = session.name ?? 'Workout'
  return (
    (db
      .prepare(
        `SELECT * FROM workout_sessions
         WHERE user_id = ? AND name = ? AND id < ?
         ORDER BY date DESC, id DESC
         LIMIT 1`,
      )
      .get(userId, sessionName, session.id) as WorkoutSession | undefined) ?? null
  )
}

function buildWorkoutSessionSummary(
  db: ReturnType<typeof getDb>,
  userId: number,
  session: WorkoutSession,
): WorkoutSessionSummary {
  const sets = loadSessionSets(db, session.id)
  const stats = computeSessionVolumeStats(sets)
  const previousSession = findPreviousNamedSession(db, userId, session)
  const previousStats = previousSession
    ? computeSessionVolumeStats(loadSessionSets(db, previousSession.id))
    : null
  const comparison = compareSessionVolumes(stats, previousStats)

  return {
    sessionId: session.id,
    name: session.name ?? 'Workout',
    date: session.date,
    totalVolume: stats.totalVolume,
    setCount: stats.setCount,
    exerciseCount: stats.exerciseCount,
    durationMinutes: session.duration_minutes,
    personalRecordCount: countSessionPersonalRecords(db, userId, sets),
    comparisonSentence: formatSessionVolumeComparison(stats.totalVolume, session.name, comparison),
  }
}


export const finishWorkoutSession = createServerFn({ method: 'POST' })
  .validator((data: { id: number; finishedAt?: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const session = db
      .prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
      .get(ctx.data.id, user.id) as WorkoutSession | undefined

    if (!session) {
      throw new Error(`finishWorkoutSession: session id ${ctx.data.id} not found for user ${user.id}`)
    }

    const finishedAt = ctx.data.finishedAt ?? new Date().toISOString()
    const durationMinutes = durationMinutesBetween(session.created_at, finishedAt)

    db.prepare('UPDATE workout_sessions SET duration_minutes = ? WHERE id = ?').run(
      durationMinutes,
      session.id,
    )

    const updated = { ...session, duration_minutes: durationMinutes }
    return buildWorkoutSessionSummary(db, user.id, updated)
  })

export const getWorkoutSessionSummary = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const session = db
      .prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
      .get(ctx.data.id, user.id) as WorkoutSession | undefined

    if (!session) {
      return null
    }

    return buildWorkoutSessionSummary(db, user.id, session)
  })

export type LastPerformanceResult = {
  weight_kg: number
  reps: number
  rpe: number
  date: string
}

/** Most recent logged set for an exercise before the active session (PRD 10 Batch 1). */
export const getLastPerformance = createServerFn({ method: 'GET' })
  .validator((data: { exerciseId: number; excludeSessionId?: number | null }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const excludeSessionId = ctx.data.excludeSessionId ?? null

    const row = db
      .prepare(
        `SELECT ws.weight_kg, ws.reps, ws.rpe, wse.date
         FROM workout_sets ws
         JOIN workout_sessions wse ON ws.session_id = wse.id
         WHERE wse.user_id = ? AND ws.exercise_id = ?
           AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
           AND (? IS NULL OR ws.session_id != ?)
         ORDER BY wse.date DESC, ws.id DESC
         LIMIT 1`,
      )
      .get(
        user.id,
        ctx.data.exerciseId,
        excludeSessionId,
        excludeSessionId,
      ) as LastPerformanceResult | undefined

    return row ?? null
  })

export type ExerciseSetHistoryRow = {
  id: number
  session_id: number
  weight_kg: number
  reps: number
}

/** Chronological set history for an exercise — feeds pure PR detection (issue #61). */
export const getExerciseSetHistory = createServerFn({ method: 'GET' })
  .validator((data: { exerciseId: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()

    const sets = db
      .prepare(
        `SELECT ws.id, ws.session_id, ws.weight_kg, ws.reps
         FROM workout_sets ws
         JOIN workout_sessions wse ON ws.session_id = wse.id
         WHERE wse.user_id = ? AND ws.exercise_id = ?
           AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
         ORDER BY wse.date ASC, ws.id ASC`,
      )
      .all(user.id, ctx.data.exerciseId) as ExerciseSetHistoryRow[]

    return { sets }
  })

// --- Training Programs ---

export type ProgramExerciseInput = {
  exercise_id: number
  target_sets: number
  target_reps: string
  target_rpe: number
  rest_seconds?: number
  sort_order: number
}

export type ProgramDayInput = {
  day_name: string
  sort_order: number
  exercises: ProgramExerciseInput[]
}

export type ProgramDetail = Program & {
  days: Array<ProgramDay & {
    exercises: Array<ProgramExercise & {
      exercise_name: string
      muscle_group: string
    }>
  }>
}

export type ProgramSummary = Program & {
  day_count: number
}

export type ProgramDayTarget = {
  program_exercise_id: number
  exercise_id: number
  exercise_name: string
  muscle_group: string
  target_sets: number
  target_reps: string
  target_rpe: number
  rest_seconds: number | null
  suggested_weight_kg: number | null
  progression_note: string
  dup_emphasis?: 'strength' | 'hypertrophy' | 'endurance'
}

function loadProgramDetail(db: ReturnType<typeof getDb>, programId: number, userId: number): ProgramDetail | null {
  const program = db.prepare('SELECT * FROM programs WHERE id = ? AND user_id = ?').get(programId, userId) as Program | undefined
  if (!program) return null

  const days = db.prepare(
    'SELECT * FROM program_days WHERE program_id = ? ORDER BY sort_order'
  ).all(programId) as ProgramDay[]

  const exercises = db.prepare(
    `SELECT pe.*, e.name as exercise_name, e.muscle_group
     FROM program_exercises pe
     JOIN exercises e ON pe.exercise_id = e.id
     JOIN program_days pd ON pe.program_day_id = pd.id
     WHERE pd.program_id = ?
     ORDER BY pd.sort_order, pe.sort_order`
  ).all(programId) as Array<ProgramExercise & { exercise_name: string; muscle_group: string }>

  return {
    ...program,
    days: days.map((day) => ({
      ...day,
      exercises: exercises.filter((exercise) => exercise.program_day_id === day.id),
    })),
  }
}

export const getPrograms = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()
  return db.prepare(
    `SELECT p.*, COUNT(DISTINCT pd.id) as day_count
     FROM programs p
     LEFT JOIN program_days pd ON pd.program_id = p.id
     WHERE p.user_id = ?
     GROUP BY p.id
     ORDER BY p.is_active DESC, p.created_at DESC`
  ).all(user.id) as ProgramSummary[]
})

export const getProgram = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    return loadProgramDetail(db, ctx.data.id, user.id)
  })

export const saveProgram = createServerFn({ method: 'POST' })
  .validator((data: {
    id?: number
    name: string
    description?: string
    frequency_per_week: number
    periodization_type: PeriodizationType
    progression_increment_pct?: number
    is_active?: boolean
    days: ProgramDayInput[]
  }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const d = ctx.data

    const save = db.transaction(() => {
      let programId = d.id

      if (programId) {
        db.prepare(
          `UPDATE programs
           SET name = ?, description = ?, frequency_per_week = ?, periodization_type = ?,
               progression_increment_pct = ?, is_active = ?
           WHERE id = ? AND user_id = ?`
        ).run(
          d.name,
          d.description ?? null,
          d.frequency_per_week,
          d.periodization_type,
          d.progression_increment_pct ?? 2.5,
          d.is_active ? 1 : 0,
          programId,
          user.id,
        )
      } else {
        const result = db.prepare(
          `INSERT INTO programs (user_id, name, description, frequency_per_week, periodization_type, progression_increment_pct, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          user.id,
          d.name,
          d.description ?? null,
          d.frequency_per_week,
          d.periodization_type,
          d.progression_increment_pct ?? 2.5,
          d.is_active ? 1 : 0,
        )
        programId = result.lastInsertRowid as number
      }

      if (d.is_active) {
        db.prepare('UPDATE programs SET is_active = 0 WHERE user_id = ? AND id != ?').run(user.id, programId)
      }

      const existingDays = db.prepare('SELECT id FROM program_days WHERE program_id = ?').all(programId) as Array<{ id: number }>
      for (const day of existingDays) {
        db.prepare('DELETE FROM program_exercises WHERE program_day_id = ?').run(day.id)
      }
      db.prepare('DELETE FROM program_days WHERE program_id = ?').run(programId)

      for (const day of d.days) {
        const dayResult = db.prepare(
          'INSERT INTO program_days (program_id, day_name, sort_order) VALUES (?, ?, ?)'
        ).run(programId, day.day_name, day.sort_order)

        const dayId = dayResult.lastInsertRowid as number
        for (const exercise of day.exercises) {
          db.prepare(
            `INSERT INTO program_exercises
             (program_day_id, exercise_id, target_sets, target_reps, target_rpe, rest_seconds, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            dayId,
            exercise.exercise_id,
            exercise.target_sets,
            exercise.target_reps,
            exercise.target_rpe,
            exercise.rest_seconds ?? null,
            exercise.sort_order,
          )
        }
      }

      return programId
    })

    const programId = save()
    return loadProgramDetail(db, programId, user.id)
  })

export const deleteProgram = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    db.prepare('DELETE FROM programs WHERE id = ? AND user_id = ?').run(ctx.data.id, user.id)
    return { success: true }
  })

export const setActiveProgram = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    db.prepare('UPDATE programs SET is_active = 0 WHERE user_id = ?').run(user.id)
    db.prepare('UPDATE programs SET is_active = 1 WHERE id = ? AND user_id = ?').run(ctx.data.id, user.id)
    return { success: true }
  })

export const getProgramDayTargets = createServerFn({ method: 'GET' })
  .validator((data: { programId: number; programDayId: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const program = db.prepare('SELECT * FROM programs WHERE id = ? AND user_id = ?').get(ctx.data.programId, user.id) as Program | undefined
    if (!program) return null

    const day = db.prepare('SELECT * FROM program_days WHERE id = ? AND program_id = ?').get(ctx.data.programDayId, ctx.data.programId) as ProgramDay | undefined
    if (!day) return null

    const exercises = db.prepare(
      `SELECT pe.*, e.name as exercise_name, e.muscle_group
       FROM program_exercises pe
       JOIN exercises e ON pe.exercise_id = e.id
       WHERE pe.program_day_id = ?
       ORDER BY pe.sort_order`
    ).all(ctx.data.programDayId) as Array<ProgramExercise & { exercise_name: string; muscle_group: string }>

    const targets: ProgramDayTarget[] = exercises.map((exercise) => {
      const lastSet = db.prepare(
        `SELECT ws.weight_kg, ws.reps, ws.rpe
         FROM workout_sets ws
         JOIN workout_sessions wse ON ws.session_id = wse.id
         WHERE wse.user_id = ? AND wse.program_id = ? AND ws.exercise_id = ?
           AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
         ORDER BY wse.date DESC, ws.id DESC
         LIMIT 1`
      ).get(user.id, program.id, exercise.exercise_id) as { weight_kg: number; reps: number; rpe: number } | undefined

      const prescription = {
        target_sets: exercise.target_sets ?? 3,
        target_reps: exercise.target_reps ?? '8-12',
        target_rpe: exercise.target_rpe ?? 8,
        rest_seconds: exercise.rest_seconds,
      }

      const resolved = resolveProgramTargets(
        program.periodization_type,
        prescription,
        lastSet
          ? { weight_kg: lastSet.weight_kg, reps: lastSet.reps, rpe: lastSet.rpe }
          : null,
        program.progression_increment_pct,
      )

      return {
        program_exercise_id: exercise.id,
        exercise_id: exercise.exercise_id,
        exercise_name: exercise.exercise_name,
        muscle_group: exercise.muscle_group,
        target_sets: prescription.target_sets,
        target_reps: prescription.target_reps,
        target_rpe: prescription.target_rpe,
        rest_seconds: exercise.rest_seconds,
        suggested_weight_kg: resolved.suggested_weight_kg,
        progression_note: resolved.progression_note,
        dup_emphasis: resolved.dup_emphasis,
      }
    })

    return {
      program,
      day,
      targets,
    }
  })

export const startWorkoutFromProgram = createServerFn({ method: 'POST' })
  .validator((data: { programId: number; programDayId: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const day = db.prepare('SELECT * FROM program_days WHERE id = ? AND program_id = ?').get(ctx.data.programDayId, ctx.data.programId) as ProgramDay | undefined
    if (!day) throw new Error('Program day not found')

    const date = todayString()
    const result = db.prepare(
      'INSERT INTO workout_sessions (user_id, date, name, program_id, program_day_id) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, date, day.day_name, ctx.data.programId, ctx.data.programDayId)

    const sessionId = result.lastInsertRowid as number
    const dayTargets = await getProgramDayTargets({ data: { programId: ctx.data.programId, programDayId: ctx.data.programDayId } })

    return {
      sessionId,
      dayName: day.day_name,
      targets: dayTargets?.targets ?? [],
    }
  })



// --- Meal Templates & Planning ---

export type MealTemplateItemInput = {
  food_id: number
  servings: number
  sort_order: number
}

export type MealTemplateDetail = MealTemplate & {
  items: Array<MealTemplateItem & {
    food_name: string
    serving_unit: string
    calories_per_serving: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
  }>
  totals: NutritionTotals
}

export type MealTemplateSummary = MealTemplate & {
  item_count: number
  totals: NutritionTotals
}

export type MealPlanSlot = {
  date: string
  meal_type: MealType
  plan_id: number | null
  template_id: number | null
  template_name: string | null
  macros: NutritionTotals
}

export type WeekMealPlan = {
  start_date: string
  end_date: string
  days: Array<{
    date: string
    day_label: string
    slots: MealPlanSlot[]
    day_totals: NutritionTotals
  }>
  week_totals: NutritionTotals
  targets: Awaited<ReturnType<typeof getDailyTargets>>
}

function loadMealTemplateDetail(db: ReturnType<typeof getDb>, templateId: number, userId: number): MealTemplateDetail | null {
  const template = db.prepare('SELECT * FROM meal_templates WHERE id = ? AND user_id = ?').get(templateId, userId) as MealTemplate | undefined
  if (!template) return null

  const items = db.prepare(
    `SELECT mti.*, f.name as food_name, f.serving_unit, f.calories_per_serving, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g
     FROM meal_template_items mti
     JOIN foods f ON mti.food_id = f.id
     WHERE mti.template_id = ?
     ORDER BY mti.sort_order`
  ).all(templateId) as MealTemplateDetail['items']

  const totals = sumNutritionTotals(
    items.map((item) => calculateFoodMacros(item, item.servings))
  )

  return { ...template, items, totals }
}

function templateMacros(db: ReturnType<typeof getDb>, templateId: number): NutritionTotals {
  const items = db.prepare(
    `SELECT f.calories_per_serving, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g, mti.servings
     FROM meal_template_items mti
     JOIN foods f ON mti.food_id = f.id
     WHERE mti.template_id = ?`
  ).all(templateId) as Array<Food & { servings: number }>

  return sumNutritionTotals(items.map((item) => calculateFoodMacros(item, item.servings)))
}

export const getMealTemplates = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()
  const templates = db.prepare(
    'SELECT * FROM meal_templates WHERE user_id = ? ORDER BY created_at DESC'
  ).all(user.id) as MealTemplate[]

  return templates.map((template) => ({
    ...template,
    item_count: (db.prepare('SELECT COUNT(*) as count FROM meal_template_items WHERE template_id = ?').get(template.id) as { count: number }).count,
    totals: templateMacros(db, template.id),
  }))
})

export const getMealTemplate = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    return loadMealTemplateDetail(db, ctx.data.id, user.id)
  })

export const saveMealTemplate = createServerFn({ method: 'POST' })
  .validator((data: {
    id?: number
    name: string
    description?: string
    default_meal_type: MealType
    items: MealTemplateItemInput[]
  }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const d = ctx.data

    const save = db.transaction(() => {
      let templateId = d.id

      if (templateId) {
        db.prepare(
          'UPDATE meal_templates SET name = ?, description = ?, default_meal_type = ? WHERE id = ? AND user_id = ?'
        ).run(d.name, d.description ?? null, d.default_meal_type, templateId, user.id)
      } else {
        const result = db.prepare(
          'INSERT INTO meal_templates (user_id, name, description, default_meal_type) VALUES (?, ?, ?, ?)'
        ).run(user.id, d.name, d.description ?? null, d.default_meal_type)
        templateId = result.lastInsertRowid as number
      }

      db.prepare('DELETE FROM meal_template_items WHERE template_id = ?').run(templateId)

      for (const item of d.items) {
        db.prepare(
          'INSERT INTO meal_template_items (template_id, food_id, servings, sort_order) VALUES (?, ?, ?, ?)'
        ).run(templateId, item.food_id, item.servings, item.sort_order)
      }

      return templateId
    })

    const templateId = save()
    return loadMealTemplateDetail(db, templateId, user.id)
  })

export const deleteMealTemplate = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    db.prepare('DELETE FROM meal_templates WHERE id = ? AND user_id = ?').run(ctx.data.id, user.id)
    return { success: true }
  })

export const getWeekMealPlan = createServerFn({ method: 'GET' })
  .validator((data: { start_date?: string } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const startDate = getWeekStart(ctx.data?.start_date || todayString())
    const endDate = addDays(startDate, 6)
    const targets = await getDailyTargets()

    const plans = db.prepare(
      `SELECT mp.*, mt.name as template_name
       FROM meal_plans mp
       JOIN meal_templates mt ON mp.template_id = mt.id
       WHERE mp.user_id = ? AND mp.date >= ? AND mp.date <= ?`
    ).all(user.id, startDate, endDate) as Array<MealPlan & { template_name: string }>

    const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
    const days = []
    let weekTotals = emptyTotals()

    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(startDate, offset)
      const slots: MealPlanSlot[] = []
      let dayTotals = emptyTotals()

      for (const mealType of mealTypes) {
        const plan = plans.find((entry) => entry.date === date && entry.meal_type === mealType)
        const macros = plan ? templateMacros(db, plan.template_id) : emptyTotals()
        dayTotals = sumNutritionTotals([dayTotals, macros])
        slots.push({
          date,
          meal_type: mealType,
          plan_id: plan?.id ?? null,
          template_id: plan?.template_id ?? null,
          template_name: plan?.template_name ?? null,
          macros,
        })
      }

      weekTotals = sumNutritionTotals([weekTotals, dayTotals])
      days.push({
        date,
        day_label: new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        slots,
        day_totals: dayTotals,
      })
    }

    return {
      start_date: startDate,
      end_date: endDate,
      days,
      week_totals: weekTotals,
      targets,
    } satisfies WeekMealPlan
  })

export const setMealPlan = createServerFn({ method: 'POST' })
  .validator((data: { date: string; meal_type: MealType; template_id: number }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const d = ctx.data

    const template = db.prepare('SELECT id FROM meal_templates WHERE id = ? AND user_id = ?').get(d.template_id, user.id)
    if (!template) throw new Error('Meal template not found')

    db.prepare(
      `INSERT INTO meal_plans (user_id, date, meal_type, template_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, date, meal_type) DO UPDATE SET template_id = excluded.template_id`
    ).run(user.id, d.date, d.meal_type, d.template_id)

    return { success: true }
  })

export const clearMealPlan = createServerFn({ method: 'POST' })
  .validator((data: { date: string; meal_type: MealType }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    db.prepare('DELETE FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?').run(user.id, ctx.data.date, ctx.data.meal_type)
    return { success: true }
  })

export const logMealFromPlan = createServerFn({ method: 'POST' })
  .validator((data: { date: string; meal_type: MealType }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const plan = db.prepare(
      'SELECT * FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?'
    ).get(user.id, ctx.data.date, ctx.data.meal_type) as MealPlan | undefined

    if (!plan) throw new Error('No meal planned for this slot')

    const template = loadMealTemplateDetail(db, plan.template_id, user.id)
    if (!template) throw new Error('Meal template not found')

    const insert = db.prepare(
      `INSERT INTO food_log (user_id, food_id, custom_name, date, meal_type, servings, calories, protein_g, carbs_g, fat_g, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const logged = template.items.map((item) => {
      const macros = calculateFoodMacros(item, item.servings)
      const result = insert.run(
        user.id,
        item.food_id,
        null,
        ctx.data.date,
        ctx.data.meal_type,
        item.servings,
        macros.calories,
        macros.protein_g,
        macros.carbs_g,
        macros.fat_g,
        `From template: ${template.name}`,
      )
      return db.prepare('SELECT * FROM food_log WHERE id = ?').get(result.lastInsertRowid) as FoodLogEntry
    })

    return { entries: logged, template_name: template.name }
  })


// --- Weekly Volume Analysis ---
// Based on Schoenfeld et al. 2017: 10-20 sets per muscle group per week for hypertrophy

export type MuscleVolume = {
  muscle_group: string
  total_sets: number
  total_volume: number
  min_recommended: number
  max_recommended: number
  status: 'under' | 'optimal' | 'high'
}

export const getWeeklyVolume = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()

  const rows = db.prepare(
    `SELECT e.muscle_group, COUNT(ws.id) as total_sets, COALESCE(SUM(ws.reps * ws.weight_kg), 0) as total_volume
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     JOIN workout_sessions wse ON ws.session_id = wse.id
     WHERE wse.user_id = ? AND wse.date >= date('now', '-7 days')
     GROUP BY e.muscle_group
     ORDER BY total_sets DESC`
  ).all(user.id) as { muscle_group: string; total_sets: number; total_volume: number }[]

  const guidelines: Record<string, { min: number; max: number }> = {
    chest: { min: 8, max: 16 },
    back: { min: 10, max: 20 },
    shoulders: { min: 8, max: 16 },
    arms: { min: 8, max: 16 },
    legs: { min: 10, max: 20 },
    core: { min: 8, max: 16 },
    full_body: { min: 10, max: 20 },
  }

  return rows.map((r) => {
    const g = guidelines[r.muscle_group] || { min: 8, max: 16 }
    const status: MuscleVolume['status'] =
      r.total_sets < g.min ? 'under' : r.total_sets > g.max ? 'high' : 'optimal'
    return { ...r, min_recommended: g.min, max_recommended: g.max, status }
  }) as MuscleVolume[]
})

// --- Weekly Nutrition Reports ---

export type WeeklyNutritionDay = {
  date: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  entries: number
}

export type WeeklyNutritionReport = {
  daily: WeeklyNutritionDay[]
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number; days: number }
  avg: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
}

export const getWeeklyNutrition = createServerFn({ method: 'GET' }).handler(async (): Promise<WeeklyNutritionReport> => {
  const db = getDb()
  const user = await ensureDefaultUser()

  const rows = db.prepare(
    `SELECT date,
       SUM(calories) as calories,
       SUM(protein_g) as protein_g,
       SUM(carbs_g) as carbs_g,
       SUM(fat_g) as fat_g,
       COUNT(*) as entries
     FROM food_log
     WHERE user_id = ? AND date >= date('now', '-7 days')
     GROUP BY date
     ORDER BY date DESC`
  ).all(user.id) as WeeklyNutritionDay[]

  const totals = rows.reduce(
    (acc, r) => ({
      calories: acc.calories + r.calories,
      protein_g: acc.protein_g + r.protein_g,
      carbs_g: acc.carbs_g + r.carbs_g,
      fat_g: acc.fat_g + r.fat_g,
      days: acc.days + 1,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, days: 0 }
  )

  const avg = {
    calories: totals.days > 0 ? Math.round(totals.calories / totals.days) : 0,
    protein_g: totals.days > 0 ? Math.round(totals.protein_g / totals.days) : 0,
    carbs_g: totals.days > 0 ? Math.round(totals.carbs_g / totals.days) : 0,
    fat_g: totals.days > 0 ? Math.round(totals.fat_g / totals.days) : 0,
  }

  return { daily: rows, totals, avg }
})

// --- Data Export ---

export const exportData = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()

  const body_logs = db.prepare('SELECT * FROM body_logs WHERE user_id = ?').all(user.id) as BodyLog[]
  const food_log = db.prepare('SELECT * FROM food_log WHERE user_id = ?').all(user.id) as FoodLogEntry[]
  const workouts = db.prepare('SELECT * FROM workout_sessions WHERE user_id = ?').all(user.id) as WorkoutSession[]
  const workout_sets = db.prepare(
    `SELECT ws.* FROM workout_sets ws
     JOIN workout_sessions wse ON ws.session_id = wse.id
     WHERE wse.user_id = ?`
  ).all(user.id) as WorkoutSet[]

  const programs = db.prepare('SELECT * FROM programs WHERE user_id = ?').all(user.id)
  const program_days = db.prepare(
    `SELECT pd.* FROM program_days pd
     JOIN programs p ON pd.program_id = p.id
     WHERE p.user_id = ?`
  ).all(user.id)
  const program_exercises = db.prepare(
    `SELECT pe.* FROM program_exercises pe
     JOIN program_days pd ON pe.program_day_id = pd.id
     JOIN programs p ON pd.program_id = p.id
     WHERE p.user_id = ?`
  ).all(user.id)

  return {
    exported_at: new Date().toISOString(),
    app: 'FitTrack',
    version: '0.1.0',
    user: { ...user },
    body_logs,
    food_log,
    workouts,
    workout_sets,
    programs,
    program_days,
    program_exercises,
  }
})

// --- Dashboard Stats ---

export const getDashboardStats = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()
  const targets = await getDailyTargets()

  const today = todayString()
  const todayEntries = db.prepare(
    'SELECT * FROM food_log WHERE user_id = ? AND date = ?'
  ).all(user.id, today) as FoodLogEntry[]

  const consumed = todayEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein_g: acc.protein_g + e.protein_g,
      carbs_g: acc.carbs_g + e.carbs_g,
      fat_g: acc.fat_g + e.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  const last30Days = db.prepare(
    `SELECT DISTINCT date FROM workout_sessions WHERE user_id = ? AND date >= date('now', '-30 days')`
  ).all(user.id) as { date: string }[]

  const recentBodyweight = db.prepare(
    'SELECT * FROM body_logs WHERE user_id = ? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 30'
  ).all(user.id) as BodyLog[]

  return {
    user,
    targets,
    consumed,
    remaining: {
      calories: targets.calories - consumed.calories,
      protein_g: targets.protein_g - consumed.protein_g,
      carbs_g: targets.carbs_g - consumed.carbs_g,
      fat_g: targets.fat_g - consumed.fat_g,
    },
    workoutDaysThisMonth: last30Days.length,
    recentBodyweight,
  }
})

// --- Consistency ---

export type { ConsistencyMetrics }

/** Burke et al. 2011: rolling adherence and streak metrics for retention. */
export const getConsistency = createServerFn({ method: 'GET' })
  .validator((data: { asOf?: string } | undefined) => data ?? {})
  .handler(async (ctx): Promise<ConsistencyMetrics> => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const asOf = ctx.data.asOf ?? todayString()
    const windowStart = addDays(asOf, -27)

    const rows = db.prepare(
      `SELECT DISTINCT date FROM food_log WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date`,
    ).all(user.id, windowStart, asOf) as { date: string }[]

    return assembleConsistencyMetrics(rows.map((row) => row.date), asOf)
  })


// --- Weekly Review (issue #64) ---

export type WeeklyReview = WeeklyReviewPayload

function collectActivityDates(
  db: ReturnType<typeof getDb>,
  userId: number,
): string[] {
  const foodDates = db
    .prepare('SELECT DISTINCT date FROM food_log WHERE user_id = ?')
    .all(userId) as { date: string }[]
  const sessionDates = db
    .prepare('SELECT DISTINCT date FROM workout_sessions WHERE user_id = ?')
    .all(userId) as { date: string }[]
  const bodyDates = db
    .prepare(
      'SELECT DISTINCT date FROM body_logs WHERE user_id = ? AND weight_kg IS NOT NULL',
    )
    .all(userId) as { date: string }[]

  return [...foodDates, ...sessionDates, ...bodyDates].map((row) => row.date)
}

function countPersonalRecordsInRange(
  db: ReturnType<typeof getDb>,
  userId: number,
  range: { start: string; end: string },
): number {
  const sets = db
    .prepare(
      `SELECT ws.id, ws.exercise_id, ws.weight_kg, ws.reps
       FROM workout_sets ws
       JOIN workout_sessions wse ON ws.session_id = wse.id
       WHERE wse.user_id = ? AND wse.date >= ? AND wse.date <= ?
         AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
       ORDER BY wse.date ASC, ws.id ASC`,
    )
    .all(userId, range.start, range.end) as Array<{
    id: number
    exercise_id: number
    weight_kg: number
    reps: number
  }>

  const exerciseIds = [...new Set(sets.map((set) => set.exercise_id))]
  let prCount = 0

  for (const exerciseId of exerciseIds) {
    const history = loadExerciseHistory(db, userId, exerciseId)
    const kindsBySetId = recordKindsBySetId(history)
    for (const set of sets) {
      if (set.exercise_id !== exerciseId) {
        continue
      }
      if ((kindsBySetId.get(set.id) ?? []).length > 0) {
        prCount += 1
      }
    }
  }

  return prCount
}

function loadWeeklyReviewFromDb(
  db: ReturnType<typeof getDb>,
  userId: number,
  asOf: string,
  calorieTarget: number,
  proteinTargetG: number,
): WeeklyReview | null {
  const week = lastCompleteWeekRange(asOf)
  const prior = priorWeekRange(week)
  const bodyLogStart = addDays(week.start, -6)

  const foodRows = db
    .prepare(
      `SELECT date,
              SUM(calories) AS calories,
              SUM(protein_g) AS protein_g
       FROM food_log
       WHERE user_id = ? AND date >= ? AND date <= ?
       GROUP BY date`,
    )
    .all(userId, prior.start, week.end) as Array<{
    date: string
    calories: number
    protein_g: number
  }>

  const dailyNutrition = new Map(
    foodRows.map((row) => [
      row.date,
      { calories: row.calories, protein_g: row.protein_g },
    ]),
  )

  const setRows = db
    .prepare(
      `SELECT ws.exercise_id, ws.reps, ws.weight_kg, wse.date
       FROM workout_sets ws
       JOIN workout_sessions wse ON ws.session_id = wse.id
       WHERE wse.user_id = ? AND wse.date >= ? AND wse.date <= ?`,
    )
    .all(userId, prior.start, week.end) as Array<{
    exercise_id: number
    reps: number | null
    weight_kg: number | null
    date: string
  }>

  const sessionDates = (
    db
      .prepare(
        `SELECT DISTINCT date FROM workout_sessions
         WHERE user_id = ? AND date >= ? AND date <= ?`,
      )
      .all(userId, prior.start, week.end) as { date: string }[]
  ).map((row) => row.date)

  const bodyLogs = db
    .prepare(
      `SELECT * FROM body_logs
       WHERE user_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`,
    )
    .all(userId, bodyLogStart, week.end) as BodyLog[]

  const personalRecordCount = countPersonalRecordsInRange(db, userId, week)

  return assembleWeeklyReview({
    asOf,
    calorieTarget,
    proteinTargetG,
    dailyNutrition,
    workoutSets: setRows,
    sessionDates,
    bodyLogs,
    personalRecordCount,
  })
}

/** Whether the dashboard should link to the weekly review (issue #64). */
export const getWeeklyReviewAvailability = createServerFn({ method: 'GET' })
  .validator((data: { asOf?: string } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const asOf = ctx.data.asOf ?? todayString()
    const activityDates = collectActivityDates(db, user.id)
    return { available: hasReviewableWeek(asOf, activityDates) }
  })

/** Last complete week's review metrics and headline (issue #64). */
export const getWeeklyReview = createServerFn({ method: 'GET' })
  .validator((data: { asOf?: string } | undefined) => data ?? {})
  .handler(async (ctx): Promise<WeeklyReview | null> => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const asOf = ctx.data.asOf ?? todayString()
    const targets = await getDailyTargets()
    return loadWeeklyReviewFromDb(
      db,
      user.id,
      asOf,
      targets.calories,
      targets.protein_g,
    )
  })

// --- Offline Support ---

/**
 * Days of history sent to a device for offline use. Covers the trailing 7-day
 * windows that the volume and nutrition reports read from, with a week of slack
 * so a device that has been offline for several days can still render its own
 * recent history without a round trip.
 */
const OFFLINE_HISTORY_DAYS = 14

/**
 * Everything the app needs to stay useful with no network: the full food and
 * exercise reference data, plus the user's recent logs and current targets.
 * The client stores this in IndexedDB and the service worker keeps a copy of
 * the response, so a cold start offline still has data to render.
 */
export const getOfflineBundle = createServerFn({ method: 'GET' }).handler(async () => {
  const db = getDb()
  const user = await ensureDefaultUser()
  const targets = await getDailyTargets()
  const since = `-${OFFLINE_HISTORY_DAYS} days`

  const foods = db.prepare('SELECT * FROM foods ORDER BY name').all() as Food[]
  const exercises = db.prepare('SELECT * FROM exercises ORDER BY name').all() as Exercise[]

  const food_log = db.prepare(
    `SELECT * FROM food_log
     WHERE user_id = ? AND date >= date('now', ?)
     ORDER BY date DESC, meal_type`
  ).all(user.id, since) as FoodLogEntry[]

  const workout_sessions = db.prepare(
    `SELECT * FROM workout_sessions
     WHERE user_id = ? AND date >= date('now', ?)
     ORDER BY date DESC`
  ).all(user.id, since) as WorkoutSession[]

  const workout_sets = db.prepare(
    `SELECT ws.* FROM workout_sets ws
     JOIN workout_sessions wse ON ws.session_id = wse.id
     WHERE wse.user_id = ? AND wse.date >= date('now', ?)
     ORDER BY ws.session_id, ws.set_number`
  ).all(user.id, since) as WorkoutSet[]

  const body_logs = db.prepare(
    'SELECT * FROM body_logs WHERE user_id = ? ORDER BY date DESC LIMIT 90'
  ).all(user.id) as BodyLog[]

  return {
    generated_at: new Date().toISOString(),
    history_days: OFFLINE_HISTORY_DAYS,
    user,
    targets,
    foods,
    exercises,
    food_log,
    workout_sessions,
    workout_sets,
    body_logs,
  }
})

/**
 * Replay mutations a device recorded while offline.
 *
 * Ordering matters: entries arrive oldest-first so a workout session created
 * offline is inserted before the sets that reference it. Each entry is applied
 * in its own transaction alongside its sync_queue row, so one bad mutation
 * fails on its own instead of discarding the rest of the batch.
 */
export const syncQueuedMutations = createServerFn({ method: 'POST' })
  .validator((data: { mutations: QueuedMutation[] }) => data)
  .handler(async (ctx): Promise<SyncResult> => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const mutations = ctx.data?.mutations ?? []

    const findApplied = db.prepare(
      `SELECT result_id FROM sync_queue WHERE client_id = ? AND status = 'applied'`
    )
    const findByTempRef = db.prepare(
      `SELECT result_id FROM sync_queue WHERE temp_ref = ? AND status = 'applied'`
    )
    const recordOutcome = db.prepare(
      `INSERT INTO sync_queue (client_id, kind, payload, temp_ref, result_id, status, error, queued_at)
       VALUES (@client_id, @kind, @payload, @temp_ref, @result_id, @status, @error, @queued_at)
       ON CONFLICT(client_id) DO UPDATE SET
         result_id = excluded.result_id,
         status = excluded.status,
         error = excluded.error,
         applied_at = datetime('now')`
    )

    // Sessions created earlier in this same batch, keyed by their device-side
    // placeholder id. Falls back to sync_queue when the session was created in
    // an earlier batch that already landed.
    const sessionIds = new Map<string, number>()

    const resolveSessionId = (m: Extract<QueuedMutation, { kind: 'addWorkoutSet' }>): number => {
      if (typeof m.payload.session_id === 'number') return m.payload.session_id
      const ref = m.payload.session_temp_ref
      if (!ref) throw new Error('workout set is missing both session_id and session_temp_ref')
      const inBatch = sessionIds.get(ref)
      if (inBatch) return inBatch
      const stored = findByTempRef.get(ref) as { result_id: number | null } | undefined
      if (!stored?.result_id) throw new Error(`unknown workout session reference "${ref}"`)
      return stored.result_id
    }

    const apply = (m: QueuedMutation): number | undefined => {
      switch (m.kind) {
        case 'addFoodLogEntry': {
          const d = m.payload
          const res = db.prepare(
            `INSERT INTO food_log (user_id, food_id, custom_name, date, meal_type, servings, calories, protein_g, carbs_g, fat_g, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            user.id, d.food_id ?? null, d.custom_name ?? null,
            d.date || todayString(), d.meal_type, d.servings,
            d.calories, d.protein_g, d.carbs_g, d.fat_g, d.notes ?? null
          )
          return res.lastInsertRowid as number
        }
        case 'deleteFoodLogEntry': {
          db.prepare('DELETE FROM food_log WHERE id = ? AND user_id = ?').run(m.payload.id, user.id)
          return m.payload.id
        }
        case 'deleteFoodLogEntries': {
          deleteFoodLogEntriesInDb(db, user.id, m.payload.ids)
          return m.payload.ids[0]
        }
        case 'copyMealFromDate': {
          const d = m.payload
          const result = copyMealEntriesInDb(db, user.id, d.fromDate, d.toDate, d.mealType)
          return result.entries[0]?.id
        }
        case 'copyDayFromDate': {
          const d = m.payload
          const result = copyDayEntriesInDb(db, user.id, d.fromDate, d.toDate)
          return result.entries[0]?.id
        }
        case 'logMealTemplate': {
          const d = m.payload
          const result = logMealTemplateInDb(db, user.id, d.templateId, d.date, d.mealType)
          return result.entries[0]?.id
        }
        case 'logBodyweight': {
          const d = m.payload
          const date = d.date || todayString()
          db.prepare(
            `INSERT INTO body_logs (user_id, date, weight_kg, body_fat_pct, notes)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id, date) DO UPDATE SET
               weight_kg = excluded.weight_kg,
               body_fat_pct = COALESCE(excluded.body_fat_pct, body_logs.body_fat_pct),
               notes = excluded.notes`
          ).run(user.id, date, d.weight_kg, d.body_fat_pct ?? null, d.notes ?? null)
          const row = db.prepare(
            'SELECT id FROM body_logs WHERE user_id = ? AND date = ?'
          ).get(user.id, date) as { id: number }
          return row.id
        }
        case 'addFood': {
          const d = m.payload
          const res = db.prepare(
            `INSERT INTO foods (name, brand, serving_size, serving_unit, calories_per_serving, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, barcode, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')`
          ).run(
            d.name, d.brand ?? null, d.serving_size, d.serving_unit,
            d.calories_per_serving, d.protein_g, d.carbs_g, d.fat_g,
            d.fiber_g ?? 0, d.sugar_g ?? 0, d.sodium_mg ?? 0, d.barcode ?? null
          )
          return res.lastInsertRowid as number
        }
        case 'createWorkoutSession': {
          const d = m.payload
          const res = db.prepare(
            'INSERT INTO workout_sessions (user_id, date, name) VALUES (?, ?, ?)'
          ).run(user.id, d.date || todayString(), d.name || 'Workout')
          return res.lastInsertRowid as number
        }
        case 'addWorkoutSet': {
          const d = m.payload
          const sessionId = resolveSessionId(m)
          const res = db.prepare(
            `INSERT INTO workout_sets (session_id, exercise_id, set_number, reps, weight_kg, rpe, rest_seconds, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            sessionId, d.exercise_id, d.set_number, d.reps, d.weight_kg,
            d.rpe ?? 7, d.rest_seconds ?? null, d.notes ?? null
          )
          return res.lastInsertRowid as number
        }
      }
    }

    const applyAndRecord = db.transaction((m: QueuedMutation) => {
      const result_id = apply(m)
      recordOutcome.run({
        client_id: m.client_id,
        kind: m.kind,
        payload: JSON.stringify(m.payload),
        temp_ref: m.kind === 'createWorkoutSession' ? m.payload.temp_ref : null,
        result_id: result_id ?? null,
        status: 'applied',
        error: null,
        queued_at: m.queued_at,
      })
      return result_id
    })

    const outcomes: SyncOutcome[] = []

    for (const m of mutations) {
      const already = findApplied.get(m.client_id) as { result_id: number | null } | undefined
      if (already) {
        if (m.kind === 'createWorkoutSession' && already.result_id) {
          sessionIds.set(m.payload.temp_ref, already.result_id)
        }
        outcomes.push({
          client_id: m.client_id,
          kind: m.kind,
          status: 'duplicate',
          result_id: already.result_id ?? undefined,
        })
        continue
      }

      try {
        const result_id = applyAndRecord(m)
        if (m.kind === 'createWorkoutSession' && result_id) {
          sessionIds.set(m.payload.temp_ref, result_id)
        }
        outcomes.push({ client_id: m.client_id, kind: m.kind, status: 'applied', result_id })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        recordOutcome.run({
          client_id: m.client_id,
          kind: m.kind,
          payload: JSON.stringify(m.payload),
          temp_ref: null,
          result_id: null,
          status: 'failed',
          error: message,
          queued_at: m.queued_at,
        })
        outcomes.push({ client_id: m.client_id, kind: m.kind, status: 'failed', error: message })
      }
    }

    return {
      applied: outcomes.filter((o) => o.status === 'applied').length,
      duplicates: outcomes.filter((o) => o.status === 'duplicate').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
      outcomes,
      synced_at: new Date().toISOString(),
    }
  })

/**
 * Entries the server has already accepted, so a device can drop anything from
 * its outbox that landed on a previous attempt whose response it never saw.
 */
export const getSyncedClientIds = createServerFn({ method: 'POST' })
  .validator((data: { client_ids: string[] }) => data)
  .handler(async (ctx) => {
    const ids = ctx.data?.client_ids ?? []
    if (ids.length === 0) return { client_ids: [] as string[] }
    const db = getDb()
    const placeholders = ids.map(() => '?').join(', ')
    const rows = db.prepare(
      `SELECT client_id FROM sync_queue
       WHERE status = 'applied' AND client_id IN (${placeholders})`
    ).all(...ids) as { client_id: string }[]
    return { client_ids: rows.map((r) => r.client_id) }
  })
