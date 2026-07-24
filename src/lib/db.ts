import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let dbInstance: Database.Database | null = null

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'fittrack.db')
    const dir = dirname(dbPath)
    import('node:fs').then((fs) => fs.mkdirSync(dir, { recursive: true }))

    dbInstance = new Database(dbPath)
    dbInstance.pragma('journal_mode = WAL')
    dbInstance.pragma('foreign_keys = ON')

    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
    dbInstance.exec(schema)
  }
  return dbInstance
}

export type User = {
  id: number
  name: string
  email: string | null
  birth_date: string | null
  sex: 'male' | 'female' | 'other'
  height_cm: number | null
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  goal_type: 'lose_fat' | 'build_muscle' | 'maintain' | 'recomp'
  created_at: string
  updated_at: string
}

export type BodyLog = {
  id: number
  user_id: number
  date: string
  weight_kg: number | null
  body_fat_pct: number | null
  muscle_mass_kg: number | null
  waist_cm: number | null
  notes: string | null
  created_at: string
}

export type Food = {
  id: number
  name: string
  brand: string | null
  serving_size: number
  serving_unit: string
  calories_per_serving: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  sodium_mg: number
  source: string
  created_at: string
}

export type FoodLogEntry = {
  id: number
  user_id: number
  food_id: number | null
  custom_name: string | null
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  servings: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  notes: string | null
  created_at: string
}

export type Exercise = {
  id: number
  name: string
  category: 'compound' | 'isolation' | 'bodyweight' | 'cardio' | 'mobility'
  muscle_group: string
  equipment: string | null
  instructions: string | null
  created_at: string
}

export type WorkoutSession = {
  id: number
  user_id: number
  date: string
  name: string | null
  duration_minutes: number | null
  notes: string | null
  created_at: string
}

export type WorkoutSet = {
  id: number
  session_id: number
  exercise_id: number
  set_number: number
  reps: number | null
  weight_kg: number | null
  rpe: number
  rest_seconds: number | null
  notes: string | null
  created_at: string
}
