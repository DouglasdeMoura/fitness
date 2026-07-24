import { createServerFn } from '@tanstack/react-start'
import { getDb, type User, type Food, type FoodLogEntry, type Exercise, type WorkoutSession, type WorkoutSet, type BodyLog } from './db'
import {
  calculateBMR,
  calculateTDEE,
  calculateAge,
  calculateMacroTargets,
  todayString,
  emptyTotals,
  type ActivityLevel,
  type GoalType,
} from './nutrition'

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

export const getDailyTargets = createServerFn({ method: 'GET' }).handler(async () => {
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

export const addFood = createServerFn({ method: 'POST' })
  .validator((data: Omit<Food, 'id' | 'created_at' | 'source'> & { source?: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const d = ctx.data
    const result = db.prepare(
      `INSERT INTO foods (name, brand, serving_size, serving_unit, calories_per_serving, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      d.name, d.brand, d.serving_size, d.serving_unit,
      d.calories_per_serving, d.protein_g, d.carbs_g, d.fat_g,
      d.fiber_g, d.sugar_g, d.sodium_mg, d.source || 'user'
    )
    return db.prepare('SELECT * FROM foods WHERE id = ?').get(result.lastInsertRowid) as Food
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

export const getNutritionSummary = createServerFn({ method: 'GET' })
  .validator((data: { date?: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const date = ctx.data?.date || todayString()
    const entries = db.prepare(
      'SELECT * FROM food_log WHERE user_id = ? AND date = ?'
    ).all(user.id, date) as FoodLogEntry[]

    const totals = entries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        protein_g: acc.protein_g + e.protein_g,
        carbs_g: acc.carbs_g + e.carbs_g,
        fat_g: acc.fat_g + e.fat_g,
        fiber_g: 0,
      }),
      emptyTotals()
    )

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
  .validator((data: { limit?: number } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const limit = ctx.data?.limit || 30
    return db.prepare(
      'SELECT * FROM workout_sessions WHERE user_id = ? ORDER BY date DESC LIMIT ?'
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
  .validator((data: { name?: string; date?: string }) => data)
  .handler(async (ctx) => {
    const db = getDb()
    const user = await ensureDefaultUser()
    const date = ctx.data.date || todayString()
    const result = db.prepare(
      'INSERT INTO workout_sessions (user_id, date, name) VALUES (?, ?, ?)'
    ).run(user.id, date, ctx.data.name || 'Workout')
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

export const getWeeklyNutrition = createServerFn({ method: 'GET' }).handler(async () => {
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
  ).all(user.id) as Array<{
    date: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    entries: number
  }>

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

  return {
    exported_at: new Date().toISOString(),
    app: 'FitTrack',
    version: '0.1.0',
    user: { ...user },
    body_logs,
    food_log,
    workouts,
    workout_sets,
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
