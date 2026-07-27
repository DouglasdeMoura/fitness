import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let dbInstance: Database.Database | null = null

function runMigrations(db: Database.Database) {
  const migrations: Array<{ table: string; column: string; sql: string }> = [
    {
      table: 'programs',
      column: 'periodization_type',
      sql: "ALTER TABLE programs ADD COLUMN periodization_type TEXT NOT NULL DEFAULT 'linear' CHECK(periodization_type IN ('linear', 'dup'))",
    },
    {
      table: 'programs',
      column: 'progression_increment_pct',
      sql: 'ALTER TABLE programs ADD COLUMN progression_increment_pct REAL NOT NULL DEFAULT 2.5',
    },
    {
      table: 'programs',
      column: 'is_active',
      sql: 'ALTER TABLE programs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0',
    },
    {
      table: 'workout_sessions',
      column: 'program_id',
      sql: 'ALTER TABLE workout_sessions ADD COLUMN program_id INTEGER REFERENCES programs(id)',
    },
    {
      table: 'workout_sessions',
      column: 'program_day_id',
      sql: 'ALTER TABLE workout_sessions ADD COLUMN program_day_id INTEGER REFERENCES program_days(id)',
    },
    {
      table: 'foods',
      column: 'barcode',
      sql: 'ALTER TABLE foods ADD COLUMN barcode TEXT',
    },
  ]

  for (const migration of migrations) {
    const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === migration.column)) {
      db.exec(migration.sql)
    }
  }

  // Batch 1 (PRD 09): recency/frequency queries over food_log by user + date.
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_food_log_user_date ON food_log(user_id, date DESC)',
  )

  // Batch 5 (PRD 09, issue #58): barcode lookup on packaged foods.
  db.exec('CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode)')
}

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
    runMigrations(dbInstance)
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
  barcode: string | null
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
  program_id: number | null
  program_day_id: number | null
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

export type PeriodizationType = 'linear' | 'dup'

export type Program = {
  id: number
  user_id: number
  name: string
  description: string | null
  frequency_per_week: number
  periodization_type: PeriodizationType
  progression_increment_pct: number
  is_active: number
  created_at: string
}

export type ProgramDay = {
  id: number
  program_id: number
  day_name: string
  sort_order: number
  created_at: string
}

export type ProgramExercise = {
  id: number
  program_day_id: number
  exercise_id: number
  target_sets: number | null
  target_reps: string | null
  target_rpe: number | null
  rest_seconds: number | null
  sort_order: number
  created_at: string
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type MealTemplate = {
  id: number
  user_id: number
  name: string
  description: string | null
  default_meal_type: MealType
  created_at: string
}

export type MealTemplateItem = {
  id: number
  template_id: number
  food_id: number
  servings: number
  sort_order: number
  created_at: string
}

export type MealPlan = {
  id: number
  user_id: number
  date: string
  meal_type: MealType
  template_id: number
  created_at: string
}
