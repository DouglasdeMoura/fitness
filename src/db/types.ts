/** Snake-case API shapes returned to routes and offline clients. */

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
  meal_type: MealType;
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
