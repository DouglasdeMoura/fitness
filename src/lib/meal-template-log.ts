import type Database from 'better-sqlite3'
import type { FoodLogEntry, MealTemplate, MealTemplateItem } from './db'
import { calculateFoodMacros } from './nutrition'
import type { MealType } from './nutrition'

const INSERT_ENTRY = `
  INSERT INTO food_log (
    user_id, food_id, custom_name, date, meal_type,
    servings, calories, protein_g, carbs_g, fat_g, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

type TemplateFoodItem = MealTemplateItem & {
  calories_per_serving: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export type LogMealTemplateResult = {
  entries: FoodLogEntry[]
  template_name: string
  total_calories: number
}

/**
 * Expand a saved meal template into food_log rows in one transaction.
 * @example logMealTemplateInDb(db, 1, 42, '2020-01-01', 'breakfast')
 */
export function logMealTemplateInDb(
  db: Database.Database,
  userId: number,
  templateId: number,
  date: string,
  mealType: MealType,
): LogMealTemplateResult {
  const template = db
    .prepare('SELECT * FROM meal_templates WHERE id = ? AND user_id = ?')
    .get(templateId, userId) as MealTemplate | undefined
  if (!template) {
    throw new Error(`Meal template ${templateId} not found for user ${userId}`)
  }

  const items = db
    .prepare(
      `SELECT mti.*, f.calories_per_serving, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g
       FROM meal_template_items mti
       JOIN foods f ON mti.food_id = f.id
       WHERE mti.template_id = ?
       ORDER BY mti.sort_order`,
    )
    .all(templateId) as TemplateFoodItem[]

  if (items.length === 0) {
    throw new Error(
      `Meal template "${template.name}" (id ${templateId}) has no items to log`,
    )
  }

  const insert = db.prepare(INSERT_ENTRY)
  const select = db.prepare('SELECT * FROM food_log WHERE id = ?')

  const logged = db.transaction(() => {
    const entries: FoodLogEntry[] = []
    let totalCalories = 0
    for (const item of items) {
      const macros = calculateFoodMacros(item, item.servings)
      totalCalories += macros.calories
      const result = insert.run(
        userId,
        item.food_id,
        null,
        date,
        mealType,
        item.servings,
        macros.calories,
        macros.protein_g,
        macros.carbs_g,
        macros.fat_g,
        `From template: ${template.name}`,
      )
      entries.push(select.get(result.lastInsertRowid) as FoodLogEntry)
    }
    return { entries, total_calories: totalCalories }
  })()

  return { ...logged, template_name: template.name }
}

/**
 * Templates whose default meal matches the section appear first (issue #56).
 * @example sortTemplatesForMealSection(templates, 'breakfast')
 */
export function sortTemplatesForMealSection<
  T extends { default_meal_type: MealType; item_count: number },
>(templates: T[], mealType: MealType): T[] {
  const loggable = templates.filter((template) => template.item_count > 0)
  return [...loggable].sort((left, right) => {
    const leftMatch = left.default_meal_type === mealType ? 0 : 1
    const rightMatch = right.default_meal_type === mealType ? 0 : 1
    if (leftMatch !== rightMatch) return leftMatch - rightMatch
    return 0
  })
}
