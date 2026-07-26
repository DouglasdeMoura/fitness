import { describe, it, expect } from 'vitest'
import {
  calculateBMR,
  calculateTDEE,
  calculateMacroTargets,
  calculateAge,
  ACTIVITY_MULTIPLIERS,
  mealTypeForHour,
  buildFoodLogDraft,
} from '~/lib/nutrition'

describe('BMR - Mifflin-St Jeor Equation', () => {
  it('calculates BMR for a 30-year-old male (validated against published reference)', () => {
    // Reference: Mifflin et al. 1990, male: 10*weight + 6.25*height - 5*age + 5
    const bmr = calculateBMR(80, 180, 30, 'male')
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(bmr).toBe(1780)
  })

  it('calculates BMR for a 25-year-old female', () => {
    const bmr = calculateBMR(60, 165, 25, 'female')
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
    expect(bmr).toBeCloseTo(1345.25, 1)
  })

  it('uses average adjustment for "other" sex', () => {
    const bmr = calculateBMR(70, 175, 30, 'other')
    // Should be between male (+5) and female (-161), average = -78
    const maleBmr = calculateBMR(70, 175, 30, 'male')
    const femaleBmr = calculateBMR(70, 175, 30, 'female')
    expect(bmr).toBeGreaterThan(femaleBmr)
    expect(bmr).toBeLessThan(maleBmr)
  })

  it('scales linearly with weight', () => {
    const bmr75 = calculateBMR(75, 175, 30, 'male')
    const bmr80 = calculateBMR(80, 175, 30, 'male')
    // 5kg difference = 50 kcal difference (10 kcal per kg)
    expect(bmr80 - bmr75).toBe(50)
  })
})

describe('TDEE - Activity Multipliers', () => {
  it('applies sedentary multiplier correctly', () => {
    const tdee = calculateTDEE(1780, 'sedentary')
    expect(tdee).toBe(Math.round(1780 * 1.2))
  })

  it('applies very_active multiplier correctly', () => {
    const tdee = calculateTDEE(1780, 'very_active')
    expect(tdee).toBe(Math.round(1780 * 1.9))
  })

  it('returns higher TDEE for more active lifestyles', () => {
    const sedentary = calculateTDEE(1780, 'sedentary')
    const moderate = calculateTDEE(1780, 'moderate')
    const veryActive = calculateTDEE(1780, 'very_active')
    expect(sedentary).toBeLessThan(moderate)
    expect(moderate).toBeLessThan(veryActive)
  })

  it('has all 5 activity levels defined', () => {
    expect(Object.keys(ACTIVITY_MULTIPLIERS)).toHaveLength(5)
    expect(ACTIVITY_MULTIPLIERS.sedentary).toBe(1.2)
    expect(ACTIVITY_MULTIPLIERS.light).toBe(1.375)
    expect(ACTIVITY_MULTIPLIERS.moderate).toBe(1.55)
    expect(ACTIVITY_MULTIPLIERS.active).toBe(1.725)
    expect(ACTIVITY_MULTIPLIERS.very_active).toBe(1.9)
  })
})

describe('Macro Targets - Goal-based calculations', () => {
  const weightKg = 80
  const tdee = 2670

  it('creates 10% surplus for build_muscle goal', () => {
    const macros = calculateMacroTargets(weightKg, tdee, 'build_muscle')
    expect(macros.calories).toBe(Math.round(tdee * 1.1))
  })

  it('creates 20% deficit for lose_fat goal', () => {
    const macros = calculateMacroTargets(weightKg, tdee, 'lose_fat')
    expect(macros.calories).toBe(Math.round(tdee * 0.8))
  })

  it('maintains calories for maintain goal', () => {
    const macros = calculateMacroTargets(weightKg, tdee, 'maintain')
    expect(macros.calories).toBe(tdee)
  })

  it('maintains calories for recomp goal', () => {
    const macros = calculateMacroTargets(weightKg, tdee, 'recomp')
    expect(macros.calories).toBe(tdee)
  })

  it('sets protein within Morton et al. 2018 range for hypertrophy', () => {
    // Morton et al.: dose-response up to ~1.62 g/kg, practical upper bound 2.2 g/kg
    const macros = calculateMacroTargets(weightKg, tdee, 'build_muscle')
    const proteinPerKg = macros.protein_g / weightKg
    expect(proteinPerKg).toBeGreaterThanOrEqual(1.6)
    expect(proteinPerKg).toBeLessThanOrEqual(2.2)
  })

  it('sets higher protein during caloric deficit (Helms et al. 2014)', () => {
    const deficit = calculateMacroTargets(weightKg, tdee, 'lose_fat')
    const surplus = calculateMacroTargets(weightKg, tdee, 'build_muscle')
    // During deficit, protein should be higher (2.4 vs 1.8)
    expect(deficit.protein_g).toBeGreaterThan(surplus.protein_g)
    const proteinPerKg = deficit.protein_g / weightKg
    expect(proteinPerKg).toBeGreaterThanOrEqual(2.2)
  })

  it('macronutrient calories should approximately equal total calories', () => {
    const macros = calculateMacroTargets(weightKg, tdee, 'maintain')
    const macroCalories = macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9
    // Within 5% tolerance (rounding)
    expect(Math.abs(macroCalories - macros.calories)).toBeLessThan(macros.calories * 0.05)
  })

  it('calculates fiber based on calorie intake (~14g per 1000 kcal)', () => {
    const macros = calculateMacroTargets(weightKg, 3000, 'maintain')
    // USDA recommendation: 14g fiber per 1000 kcal
    expect(macros.fiber_g).toBeCloseTo(42, 0)
  })

  it('never returns negative carbs', () => {
    // Extreme case: very high protein and fat relative to calories
    const macros = calculateMacroTargets(120, 1500, 'lose_fat')
    expect(macros.carbs_g).toBeGreaterThanOrEqual(0)
  })
})

describe('Age calculation', () => {
  it('calculates age from birth date string', () => {
    const thirtyYearsAgo = new Date()
    thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30)
    const age = calculateAge(thirtyYearsAgo.toISOString())
    expect(age).toBeGreaterThanOrEqual(29)
    expect(age).toBeLessThanOrEqual(30)
  })

  it('handles future-adjacent dates correctly', () => {
    const age = calculateAge('2000-01-01')
    expect(age).toBeGreaterThan(20)
  })
})

describe('Meal type auto-detection', () => {
  it.each([
    [0, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [14, 'lunch'],
    [15, 'dinner'],
    [20, 'dinner'],
    [21, 'snack'],
    [23, 'snack'],
  ] as const)('maps hour %i to %s', (hour, expectedMealType) => {
    expect(mealTypeForHour(hour)).toBe(expectedMealType)
  })

  it.each([-1, 24, 2.5, Number.NaN])('rejects invalid hour %s', (hour) => {
    expect(() => mealTypeForHour(hour)).toThrow(
      `Invalid hour ${String(hour)}; expected an integer from 0 through 23`,
    )
  })
})

describe('Food log draft', () => {
  it('scales the selected food macros by the requested servings', () => {
    const draft = buildFoodLogDraft(
      {
        id: 42,
        name: 'Greek Yogurt',
        calories_per_serving: 120,
        protein_g: 18,
        carbs_g: 8,
        fat_g: 0,
      },
      1.5,
      '2026-07-25',
      'breakfast',
    )

    expect(draft).toEqual({
      food_id: 42,
      custom_name: 'Greek Yogurt',
      date: '2026-07-25',
      meal_type: 'breakfast',
      servings: 1.5,
      calories: 180,
      protein_g: 27,
      carbs_g: 12,
      fat_g: 0,
    })
  })
})
