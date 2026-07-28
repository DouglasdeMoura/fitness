import { desc, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

const SEX_VALUES = ["male", "female", "other"] as const;
const ACTIVITY_LEVEL_VALUES = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;
const GOAL_TYPE_VALUES = [
  "lose_fat",
  "build_muscle",
  "maintain",
  "recomp",
] as const;
const MEAL_TYPE_VALUES = ["breakfast", "lunch", "dinner", "snack"] as const;
const EXERCISE_CATEGORY_VALUES = [
  "compound",
  "isolation",
  "bodyweight",
  "cardio",
  "mobility",
] as const;
const PERIODIZATION_TYPE_VALUES = ["linear", "dup"] as const;
const SYNC_STATUS_VALUES = ["applied", "failed"] as const;
const CURRENT_TIMESTAMP = sql`(datetime('now'))`;

export const users = sqliteTable(
  "users",
  {
    activityLevel: text("activity_level", { enum: ACTIVITY_LEVEL_VALUES })
      .notNull()
      .default("moderate"),
    birthDate: text("birth_date"),
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    email: text("email").unique(),
    goalType: text("goal_type", { enum: GOAL_TYPE_VALUES })
      .notNull()
      .default("build_muscle"),
    heightCm: real("height_cm"),
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().default("Athlete"),
    sex: text("sex", { enum: SEX_VALUES }).notNull().default("male"),
    updatedAt: text("updated_at").notNull().default(CURRENT_TIMESTAMP),
  },
  (table) => [
    check("users_sex_check", sql`${table.sex} in ('male', 'female', 'other')`),
    check(
      "users_activity_level_check",
      sql`${table.activityLevel} in ('sedentary', 'light', 'moderate', 'active', 'very_active')`
    ),
    check(
      "users_goal_type_check",
      sql`${table.goalType} in ('lose_fat', 'build_muscle', 'maintain', 'recomp')`
    ),
  ]
);

export const bodyLogs = sqliteTable(
  "body_logs",
  {
    bodyFatPct: real("body_fat_pct"),
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    date: text("date").notNull(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    muscleMassKg: real("muscle_mass_kg"),
    notes: text("notes"),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    waistCm: real("waist_cm"),
    weightKg: real("weight_kg"),
  },
  (table) => [unique("body_logs_user_date_unique").on(table.userId, table.date)]
);

export const foods = sqliteTable(
  "foods",
  {
    barcode: text("barcode"),
    brand: text("brand"),
    caloriesPerServing: real("calories_per_serving").notNull(),
    carbsG: real("carbs_g").notNull().default(0),
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    fatG: real("fat_g").notNull().default(0),
    fiberG: real("fiber_g").notNull().default(0),
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    proteinG: real("protein_g").notNull().default(0),
    servingSize: real("serving_size").notNull().default(100),
    servingUnit: text("serving_unit").notNull().default("g"),
    sodiumMg: real("sodium_mg").notNull().default(0),
    source: text("source").notNull().default("user"),
    sugarG: real("sugar_g").notNull().default(0),
  },
  (table) => [
    index("idx_foods_name").on(table.name),
    index("idx_foods_barcode").on(table.barcode),
  ]
);

export const foodLog = sqliteTable(
  "food_log",
  {
    calories: real("calories").notNull(),
    carbsG: real("carbs_g").notNull(),
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    customName: text("custom_name"),
    date: text("date").notNull(),
    fatG: real("fat_g").notNull(),
    foodId: integer("food_id").references(() => foods.id),
    id: integer("id").primaryKey({ autoIncrement: true }),
    mealType: text("meal_type", { enum: MEAL_TYPE_VALUES })
      .notNull()
      .default("snack"),
    notes: text("notes"),
    proteinG: real("protein_g").notNull(),
    servings: real("servings").notNull().default(1),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    check(
      "food_log_meal_type_check",
      sql`${table.mealType} in ('breakfast', 'lunch', 'dinner', 'snack')`
    ),
    index("idx_food_log_date").on(table.date),
    index("idx_food_log_user_date").on(table.userId, desc(table.date)),
  ]
);

export const exercises = sqliteTable(
  "exercises",
  {
    category: text("category", { enum: EXERCISE_CATEGORY_VALUES })
      .notNull()
      .default("compound"),
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    equipment: text("equipment"),
    id: integer("id").primaryKey({ autoIncrement: true }),
    instructions: text("instructions"),
    muscleGroup: text("muscle_group").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    check(
      "exercises_category_check",
      sql`${table.category} in ('compound', 'isolation', 'bodyweight', 'cardio', 'mobility')`
    ),
    index("idx_exercises_muscle").on(table.muscleGroup),
  ]
);

export const programs = sqliteTable(
  "programs",
  {
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    description: text("description"),
    frequencyPerWeek: integer("frequency_per_week").notNull().default(3),
    id: integer("id").primaryKey({ autoIncrement: true }),
    isActive: integer("is_active").notNull().default(0),
    name: text("name").notNull(),
    periodizationType: text("periodization_type", {
      enum: PERIODIZATION_TYPE_VALUES,
    })
      .notNull()
      .default("linear"),
    progressionIncrementPct: real("progression_increment_pct")
      .notNull()
      .default(2.5),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    check(
      "programs_periodization_type_check",
      sql`${table.periodizationType} in ('linear', 'dup')`
    ),
  ]
);

export const programDays = sqliteTable("program_days", {
  createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
  dayName: text("day_name").notNull(),
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
});

export const programExercises = sqliteTable("program_exercises", {
  createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id),
  id: integer("id").primaryKey({ autoIncrement: true }),
  programDayId: integer("program_day_id")
    .notNull()
    .references(() => programDays.id, { onDelete: "cascade" }),
  restSeconds: integer("rest_seconds"),
  sortOrder: integer("sort_order").notNull(),
  targetReps: text("target_reps"),
  targetRpe: integer("target_rpe"),
  targetSets: integer("target_sets"),
});

export const workoutSessions = sqliteTable(
  "workout_sessions",
  {
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    date: text("date").notNull(),
    durationMinutes: integer("duration_minutes"),
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    notes: text("notes"),
    programDayId: integer("program_day_id").references(() => programDays.id),
    programId: integer("program_id").references(() => programs.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [index("idx_workout_sessions_date").on(table.date)]
);

export const workoutSets = sqliteTable(
  "workout_sets",
  {
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    id: integer("id").primaryKey({ autoIncrement: true }),
    notes: text("notes"),
    reps: integer("reps"),
    restSeconds: integer("rest_seconds"),
    rpe: integer("rpe").notNull().default(7),
    sessionId: integer("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    weightKg: real("weight_kg"),
  },
  (table) => [
    index("idx_workout_sets_exercise").on(table.exerciseId, desc(table.id)),
  ]
);

export const syncQueue = sqliteTable(
  "sync_queue",
  {
    appliedAt: text("applied_at").notNull().default(CURRENT_TIMESTAMP),
    clientId: text("client_id").primaryKey(),
    error: text("error"),
    kind: text("kind").notNull(),
    payload: text("payload").notNull(),
    queuedAt: text("queued_at").notNull(),
    resultId: integer("result_id"),
    status: text("status", { enum: SYNC_STATUS_VALUES })
      .notNull()
      .default("applied"),
    tempRef: text("temp_ref"),
  },
  (table) => [
    check(
      "sync_queue_status_check",
      sql`${table.status} in ('applied', 'failed')`
    ),
    index("idx_sync_queue_temp_ref").on(table.tempRef),
  ]
);

export const mealTemplates = sqliteTable(
  "meal_templates",
  {
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    defaultMealType: text("default_meal_type", { enum: MEAL_TYPE_VALUES })
      .notNull()
      .default("lunch"),
    description: text("description"),
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    check(
      "meal_templates_default_meal_type_check",
      sql`${table.defaultMealType} in ('breakfast', 'lunch', 'dinner', 'snack')`
    ),
    index("idx_meal_templates_user").on(table.userId),
  ]
);

export const mealTemplateItems = sqliteTable("meal_template_items", {
  createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
  foodId: integer("food_id")
    .notNull()
    .references(() => foods.id),
  id: integer("id").primaryKey({ autoIncrement: true }),
  servings: real("servings").notNull().default(1),
  sortOrder: integer("sort_order").notNull(),
  templateId: integer("template_id")
    .notNull()
    .references(() => mealTemplates.id, { onDelete: "cascade" }),
});

export const mealPlans = sqliteTable(
  "meal_plans",
  {
    createdAt: text("created_at").notNull().default(CURRENT_TIMESTAMP),
    date: text("date").notNull(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    mealType: text("meal_type", { enum: MEAL_TYPE_VALUES }).notNull(),
    templateId: integer("template_id")
      .notNull()
      .references(() => mealTemplates.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    check(
      "meal_plans_meal_type_check",
      sql`${table.mealType} in ('breakfast', 'lunch', 'dinner', 'snack')`
    ),
    unique("meal_plans_user_date_meal_unique").on(
      table.userId,
      table.date,
      table.mealType
    ),
    index("idx_meal_plans_date").on(table.date),
  ]
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    auth: text("auth").notNull(),
    createdAt: text("created_at").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    id: integer("id").primaryKey({ autoIncrement: true }),
    p256dh: text("p256dh").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [index("idx_push_subscriptions_user").on(table.userId)]
);

export const notificationPreferences = sqliteTable("notification_preferences", {
  mealReminders: integer("meal_reminders").notNull().default(0),
  mealTimes: text("meal_times"),
  quietEnd: text("quiet_end"),
  quietStart: text("quiet_start"),
  restTimer: integer("rest_timer").notNull().default(0),
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id),
  weeklyReview: integer("weekly_review").notNull().default(0),
  weeklyReviewDay: integer("weekly_review_day"),
  weeklyReviewTime: text("weekly_review_time"),
  workoutDays: text("workout_days"),
  workoutReminders: integer("workout_reminders").notNull().default(0),
  workoutTime: text("workout_time"),
});

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    deliveredAt: text("delivered_at").notNull(),
    slot: text("slot").notNull(),
    type: text("type").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type, table.slot] })]
);

// Better Auth tables (issue #42). Coexist with legacy `users` until batch 3 migration.
export const user = sqliteTable("user", {
  activityLevel: text("activity_level").default("moderate"),
  birthDate: text("birth_date"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  goalType: text("goal_type").default("build_muscle"),
  heightCm: integer("height_cm"),
  id: text("id").primaryKey(),
  image: text("image"),
  name: text("name").notNull(),
  sex: text("sex").default("male"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    id: text("id").primaryKey(),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    accountId: text("account_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
