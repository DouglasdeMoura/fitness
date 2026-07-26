// Science-backed nutrition calculations
// References:
// - Mifflin MD et al. "A new predictive equation for resting metabolic rate." Am J Clin Nutr. 1990
// - Morton RW et al. "A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength." Br J Sports Med. 2018
// - Helms ER et al. "A systematic review of dietary protein during caloric restriction in resistance-trained lean athletes." Int J Sport Nutr Exerc Metab. 2014

export type Sex = 'male' | 'female' | 'other'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type GoalType = 'lose_fat' | 'build_muscle' | 'maintain' | 'recomp'

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (little or no exercise)',
  light: 'Lightly active (1-3 days/week)',
  moderate: 'Moderately active (3-5 days/week)',
  active: 'Very active (6-7 days/week)',
  very_active: 'Extra active (physical job + training)',
}

/**
 * Mifflin-St Jeor Equation for BMR (Basal Metabolic Rate)
 * Validated as most accurate predictive equation (Frankenfield et al., 2005)
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: Sex
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78 // average of male/female adjustments
}

/**
 * Total Daily Energy Expenditure
 * BMR * activity multiplier
 */
export function calculateTDEE(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity])
}

export function calculateAge(birthDate: string): number {
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

export type MacroTargets = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

/**
 * Calculate macro targets based on goal type and current bodyweight.
 *
 * Protein recommendations based on:
 *   - Morton et al. 2018: 1.6-2.2 g/kg for hypertrophy (dose-response up to ~1.62 g/kg)
 *   - Helms et al. 2014: 2.2-3.1 g/kg FFM during caloric restriction
 *
 * Fat minimum: 0.8-1.2 g/kg for endocrine health
 * Carbs: remainder of calories (primary fuel for high-intensity training)
 */
export function calculateMacroTargets(
  weightKg: number,
  tdee: number,
  goal: GoalType
): MacroTargets {
  let calories: number
  let proteinPerKg: number
  let fatPerKg: number

  switch (goal) {
    case 'build_muscle':
      calories = Math.round(tdee + tdee * 0.1) // 10% surplus
      proteinPerKg = 1.8 // upper-mid range of Morton et al.
      fatPerKg = 1.0
      break
    case 'lose_fat':
      calories = Math.round(tdee - tdee * 0.2) // 20% deficit
      proteinPerKg = 2.4 // Helms et al. upper range during deficit
      fatPerKg = 0.9
      break
    case 'recomp':
      calories = tdee // maintenance
      proteinPerKg = 2.2 // high protein for simultaneous gain/loss
      fatPerKg = 1.0
      break
    case 'maintain':
    default:
      calories = tdee
      proteinPerKg = 1.6
      fatPerKg = 1.0
      break
  }

  const protein_g = Math.round(proteinPerKg * weightKg)
  const fat_g = Math.round(fatPerKg * weightKg)
  const proteinCalories = protein_g * 4
  const fatCalories = fat_g * 9
  const carbs_g = Math.max(0, Math.round((calories - proteinCalories - fatCalories) / 4))
  const fiber_g = Math.round((calories / 1000) * 14) // ~14g per 1000 kcal (USDA recommendation)

  return { calories, protein_g, carbs_g, fat_g, fiber_g }
}

export type NutritionTotals = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export function emptyTotals(): NutritionTotals {
  return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
}

export function addTotals(
  a: NutritionTotals,
  b: Partial<NutritionTotals>
): NutritionTotals {
  return {
    calories: a.calories + (b.calories || 0),
    protein_g: a.protein_g + (b.protein_g || 0),
    carbs_g: a.carbs_g + (b.carbs_g || 0),
    fat_g: a.fat_g + (b.fat_g || 0),
    fiber_g: a.fiber_g + (b.fiber_g || 0),
  }
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function todayString(): string {
  return formatDate(new Date())
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/**
 * Infers the default meal from a local clock hour for faster food logging.
 * @example mealTypeForHour(12) // 'lunch'
 */
export function mealTypeForHour(hour: number): MealType {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(
      `Invalid hour ${String(hour)}; expected an integer from 0 through 23`,
    )
  }
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

export type FoodMacrosInput = {
  calories_per_serving: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
}

export type FoodLoggable = FoodMacrosInput & {
  id: number
  name: string
}

export type FoodLogDraft = {
  food_id: number
  custom_name: string
  date: string
  meal_type: MealType
  servings: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

/**
 * Scale per-serving food macros by servings.
 * Uses label values (Atwater general factors: protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g).
 * Reference: Atwater WO. USDA Farmers' Bulletin No. 142. 1902; codified in NLEA/FDA labeling.
 */
export function calculateFoodMacros(food: FoodMacrosInput, servings: number): NutritionTotals {
  return {
    calories: food.calories_per_serving * servings,
    protein_g: food.protein_g * servings,
    carbs_g: food.carbs_g * servings,
    fat_g: food.fat_g * servings,
    fiber_g: (food.fiber_g ?? 0) * servings,
  }
}

/**
 * Builds the persisted food-log payload from per-serving label values.
 * @example buildFoodLogDraft(food, 2, '2026-07-25', 'lunch')
 */
export function buildFoodLogDraft(
  food: FoodLoggable,
  servings: number,
  date: string,
  mealType: MealType,
): FoodLogDraft {
  const macros = calculateFoodMacros(food, servings)
  return {
    food_id: food.id,
    custom_name: food.name,
    date,
    meal_type: mealType,
    servings,
    calories: macros.calories,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
  }
}

export function sumNutritionTotals(items: NutritionTotals[]): NutritionTotals {
  return items.reduce((acc, item) => addTotals(acc, item), emptyTotals())
}

/** Monday of the week containing the given date (ISO week start). */
export function getWeekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return formatDate(date)
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`)
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

export function formatWeekday(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}
