import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";

const __dirname = import.meta.dirname;

let dbInstance: Database.Database | null = null;

function runMigrations(db: Database.Database) {
  const migrations: { table: string; column: string; sql: string }[] = [
    {
      column: "periodization_type",
      sql: "ALTER TABLE programs ADD COLUMN periodization_type TEXT NOT NULL DEFAULT 'linear' CHECK(periodization_type IN ('linear', 'dup'))",
      table: "programs",
    },
    {
      column: "progression_increment_pct",
      sql: "ALTER TABLE programs ADD COLUMN progression_increment_pct REAL NOT NULL DEFAULT 2.5",
      table: "programs",
    },
    {
      column: "is_active",
      sql: "ALTER TABLE programs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0",
      table: "programs",
    },
    {
      column: "program_id",
      sql: "ALTER TABLE workout_sessions ADD COLUMN program_id INTEGER REFERENCES programs(id)",
      table: "workout_sessions",
    },
    {
      column: "program_day_id",
      sql: "ALTER TABLE workout_sessions ADD COLUMN program_day_id INTEGER REFERENCES program_days(id)",
      table: "workout_sessions",
    },
    {
      column: "barcode",
      sql: "ALTER TABLE foods ADD COLUMN barcode TEXT",
      table: "foods",
    },
  ];

  for (const migration of migrations) {
    const columns = db
      .prepare(`PRAGMA table_info(${migration.table})`)
      .all() as { name: string }[];
    if (!columns.some((column) => column.name === migration.column)) {
      db.exec(migration.sql);
    }
  }

  // Batch 1 (PRD 09): recency/frequency queries over food_log by user + date.
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_food_log_user_date ON food_log(user_id, date DESC)"
  );

  // Batch 5 (PRD 09, issue #58): barcode lookup on packaged foods.
  db.exec("CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode)");

  // Batch 1 (PRD 10): last-performance queries by exercise.
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id, id DESC)"
  );

  // Scheduled push delivery idempotency (issue #67).
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      slot TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      PRIMARY KEY (user_id, type, slot)
    )
  `);
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath =
      process.env.DATABASE_PATH || join(process.cwd(), "data", "fittrack.db");
    const dir = dirname(dbPath);
    import("node:fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));

    dbInstance = new Database(dbPath);
    dbInstance.pragma("journal_mode = WAL");
    dbInstance.pragma("foreign_keys = ON");

    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    dbInstance.exec(schema);
    runMigrations(dbInstance);
  }
  return dbInstance;
}

export interface User {
  activity_level: "sedentary" | "light" | "moderate" | "active" | "very_active";
  birth_date: string | null;
  created_at: string;
  email: string | null;
  goal_type: "lose_fat" | "build_muscle" | "maintain" | "recomp";
  height_cm: number | null;
  id: number;
  name: string;
  sex: "male" | "female" | "other";
  updated_at: string;
}

export interface BodyLog {
  body_fat_pct: number | null;
  created_at: string;
  date: string;
  id: number;
  muscle_mass_kg: number | null;
  notes: string | null;
  user_id: number;
  waist_cm: number | null;
  weight_kg: number | null;
}

export interface Food {
  barcode: string | null;
  brand: string | null;
  calories_per_serving: number;
  carbs_g: number;
  created_at: string;
  fat_g: number;
  fiber_g: number;
  id: number;
  name: string;
  protein_g: number;
  serving_size: number;
  serving_unit: string;
  sodium_mg: number;
  source: string;
  sugar_g: number;
}

export interface FoodLogEntry {
  calories: number;
  carbs_g: number;
  created_at: string;
  custom_name: string | null;
  date: string;
  fat_g: number;
  food_id: number | null;
  id: number;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  notes: string | null;
  protein_g: number;
  servings: number;
  user_id: number;
}

export interface Exercise {
  category: "compound" | "isolation" | "bodyweight" | "cardio" | "mobility";
  created_at: string;
  equipment: string | null;
  id: number;
  instructions: string | null;
  muscle_group: string;
  name: string;
}

export interface WorkoutSession {
  created_at: string;
  date: string;
  duration_minutes: number | null;
  id: number;
  name: string | null;
  notes: string | null;
  program_day_id: number | null;
  program_id: number | null;
  user_id: number;
}

export interface WorkoutSet {
  created_at: string;
  exercise_id: number;
  id: number;
  notes: string | null;
  reps: number | null;
  rest_seconds: number | null;
  rpe: number;
  session_id: number;
  set_number: number;
  weight_kg: number | null;
}

export type PeriodizationType = "linear" | "dup";

export interface Program {
  created_at: string;
  description: string | null;
  frequency_per_week: number;
  id: number;
  is_active: number;
  name: string;
  periodization_type: PeriodizationType;
  progression_increment_pct: number;
  user_id: number;
}

export interface ProgramDay {
  created_at: string;
  day_name: string;
  id: number;
  program_id: number;
  sort_order: number;
}

export interface ProgramExercise {
  created_at: string;
  exercise_id: number;
  id: number;
  program_day_id: number;
  rest_seconds: number | null;
  sort_order: number;
  target_reps: string | null;
  target_rpe: number | null;
  target_sets: number | null;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealTemplate {
  created_at: string;
  default_meal_type: MealType;
  description: string | null;
  id: number;
  name: string;
  user_id: number;
}

export interface MealTemplateItem {
  created_at: string;
  food_id: number;
  id: number;
  servings: number;
  sort_order: number;
  template_id: number;
}

export interface MealPlan {
  created_at: string;
  date: string;
  id: number;
  meal_type: MealType;
  template_id: number;
  user_id: number;
}

export interface PushSubscription {
  auth: string;
  created_at: string;
  endpoint: string;
  id: number;
  p256dh: string;
  user_id: number;
}

/** Per-user reminder toggles and schedules (issue #66 / PRD 11 Batch 4). */
export interface NotificationPreferencesRow {
  meal_reminders: number;
  meal_times: string | null;
  quiet_end: string | null;
  quiet_start: string | null;
  rest_timer: number;
  user_id: number;
  weekly_review: number;
  weekly_review_day: number | null;
  weekly_review_time: string | null;
  workout_days: string | null;
  workout_reminders: number;
  workout_time: string | null;
}

/** One successful scheduled reminder send per user/type/slot (issue #67). */
export interface NotificationDeliveryRow {
  delivered_at: string;
  slot: string;
  type: string;
  user_id: number;
}
