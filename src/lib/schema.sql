-- FitTrack Database Schema
-- Science-backed fitness & nutrition tracker

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Athlete',
  email TEXT UNIQUE,
  birth_date TEXT,
  sex TEXT DEFAULT 'male' CHECK(sex IN ('male', 'female', 'other')),
  height_cm REAL,
  activity_level TEXT DEFAULT 'moderate'
    CHECK(activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal_type TEXT DEFAULT 'build_muscle'
    CHECK(goal_type IN ('lose_fat', 'build_muscle', 'maintain', 'recomp')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS body_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  weight_kg REAL,
  body_fat_pct REAL,
  muscle_mass_kg REAL,
  waist_cm REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT,
  serving_size REAL NOT NULL DEFAULT 100,
  serving_unit TEXT NOT NULL DEFAULT 'g',
  calories_per_serving REAL NOT NULL,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  fiber_g REAL DEFAULT 0,
  sugar_g REAL DEFAULT 0,
  sodium_mg REAL DEFAULT 0,
  barcode TEXT,
  source TEXT DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode);

CREATE TABLE IF NOT EXISTS food_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  food_id INTEGER REFERENCES foods(id),
  custom_name TEXT,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'snack'
    CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  servings REAL NOT NULL DEFAULT 1,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_food_log_date ON food_log(date);
CREATE INDEX IF NOT EXISTS idx_food_log_user_date ON food_log(user_id, date DESC);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'compound'
    CHECK(category IN ('compound', 'isolation', 'bodyweight', 'cardio', 'mobility')),
  muscle_group TEXT NOT NULL,
  equipment TEXT,
  instructions TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON exercises(muscle_group);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  frequency_per_week INTEGER DEFAULT 3,
  periodization_type TEXT NOT NULL DEFAULT 'linear'
    CHECK(periodization_type IN ('linear', 'dup')),
  progression_increment_pct REAL NOT NULL DEFAULT 2.5,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS program_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  day_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS program_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_day_id INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  target_sets INTEGER,
  target_reps TEXT,
  target_rpe INTEGER,
  rest_seconds INTEGER,
  sort_order INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  name TEXT,
  duration_minutes INTEGER,
  notes TEXT,
  program_id INTEGER REFERENCES programs(id),
  program_day_id INTEGER REFERENCES program_days(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(date);

CREATE TABLE IF NOT EXISTS workout_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight_kg REAL,
  rpe INTEGER DEFAULT 7,
  rest_seconds INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Replay log for mutations queued on-device while offline.
-- Every queued mutation carries a UUID minted by the client, so a sync that is
-- retried (flaky reconnect, two tabs, background sync firing twice) resolves to
-- the same row instead of duplicating a meal or a set.
-- temp_ref holds the client-side placeholder id for rows whose real primary key
-- only exists after the insert, letting a set queued offline find its session
-- even when the two are synced in separate batches.
CREATE TABLE IF NOT EXISTS sync_queue (
  client_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  temp_ref TEXT,
  result_id INTEGER,
  status TEXT NOT NULL DEFAULT 'applied'
    CHECK(status IN ('applied', 'failed')),
  error TEXT,
  queued_at TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_temp_ref ON sync_queue(temp_ref);
-- Saved meal templates (food combos / recipes)
CREATE TABLE IF NOT EXISTS meal_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  default_meal_type TEXT NOT NULL DEFAULT 'lunch'
    CHECK(default_meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meal_templates_user ON meal_templates(user_id);

CREATE TABLE IF NOT EXISTS meal_template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  servings REAL NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Weekly meal plan slots (assign a template to date + meal type)
CREATE TABLE IF NOT EXISTS meal_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL
    CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  template_id INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_date ON meal_plans(date);


-- Web Push subscriptions (issue #65 / PRD 11 Batch 3)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
