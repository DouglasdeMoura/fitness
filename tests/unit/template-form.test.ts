import { describe, it, expect } from 'vitest'
import type { MealTemplateDetail } from '~/lib/api'
import type { Food } from '~/lib/db'
import {
  buildTemplateSavePayload,
  editableItemFromFood,
  makeTempId,
  templateFormDefaults,
  validateTemplateItems,
  type EditableItem,
} from '~/lib/template-form'

const chicken: Food = {
  id: 11,
  name: 'Chicken Breast (raw)',
  brand: null,
  serving_size: 100,
  serving_unit: 'g',
  calories_per_serving: 165,
  protein_g: 31,
  carbs_g: 0,
  fat_g: 3.6,
  fiber_g: 0,
  sugar_g: 0,
  sodium_mg: 74,
  source: 'usda',
  created_at: '2025-01-01T00:00:00Z',
}

function detailFixture(overrides: Partial<MealTemplateDetail> = {}): MealTemplateDetail {
  return {
    id: 1,
    user_id: 1,
    name: 'Lunch Bowl',
    description: ' Everyday lunch ',
    default_meal_type: 'lunch',
    created_at: '2025-01-01T00:00:00Z',
    items: [
      {
        id: 100,
        template_id: 1,
        food_id: chicken.id,
        servings: 1.5,
        sort_order: 1,
        food_name: chicken.name,
        serving_unit: chicken.serving_unit,
        calories_per_serving: chicken.calories_per_serving,
        protein_g: chicken.protein_g,
        carbs_g: chicken.carbs_g,
        fat_g: chicken.fat_g,
        fiber_g: chicken.fiber_g,
      },
    ],
    totals: { calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4, fiber_g: 0 },
    ...overrides,
  }
}

describe('templateFormDefaults', () => {
  it('seeds form fields from the query row and tags each item with a stable tempId', () => {
    const defaults = templateFormDefaults(detailFixture())

    expect(defaults.name).toBe('Lunch Bowl')
    expect(defaults.defaultMealType).toBe('lunch')
    expect(defaults.items).toHaveLength(1)
    expect(defaults.items[0]).toMatchObject({
      tempId: 'item-100',
      food_id: chicken.id,
      servings: 1.5,
      food_name: chicken.name,
    })
  })

  it('coerces a null description into an empty string for a controlled input', () => {
    const defaults = templateFormDefaults(detailFixture({ description: null }))
    expect(defaults.description).toBe('')
  })
})

describe('editableItemFromFood', () => {
  it('maps a searched food into a one-serving item at the given sort position', () => {
    const item = editableItemFromFood(chicken, 2)
    expect(item.food_id).toBe(chicken.id)
    expect(item.servings).toBe(1)
    expect(item.sort_order).toBe(2)
    expect(item.tempId).toMatch(/^tmp-/)
  })
})

describe('buildTemplateSavePayload', () => {
  it('trims text, drops empty descriptions, and reindexes sort_order from position', () => {
    const itemA: EditableItem = {
      tempId: 'tmp-a',
      food_id: 11,
      servings: 2,
      sort_order: 99,
      food_name: 'Chicken Breast (raw)',
      serving_unit: 'g',
      calories_per_serving: 165,
      protein_g: 31,
      carbs_g: 0,
      fat_g: 3.6,
      fiber_g: 0,
    }
    const itemB: EditableItem = { ...itemA, tempId: 'tmp-b', food_id: 22 }

    const payload = buildTemplateSavePayload(
      {
        name: '  Dinner  ',
        description: '   ',
        defaultMealType: 'dinner',
        items: [itemA, itemB],
      },
      7,
    )

    expect(payload).toEqual({
      id: 7,
      name: 'Dinner',
      description: undefined,
      default_meal_type: 'dinner',
      items: [
        { food_id: 11, servings: 2, sort_order: 1 },
        { food_id: 22, servings: 2, sort_order: 2 },
      ],
    })
  })

  it('keeps a non-empty trimmed description', () => {
    const payload = buildTemplateSavePayload(
      { name: 'X', description: ' high protein ', defaultMealType: 'snack', items: [] },
      1,
    )
    expect(payload.description).toBe('high protein')
  })
})

describe('validateTemplateItems', () => {
  const valid = (overrides: Partial<EditableItem> = {}): EditableItem => ({
    tempId: 'tmp-1',
    food_id: 11,
    servings: 1,
    sort_order: 1,
    food_name: 'Chicken Breast (raw)',
    serving_unit: 'g',
    calories_per_serving: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
    fiber_g: 0,
    ...overrides,
  })

  it('allows an empty template (save clears all items)', () => {
    expect(validateTemplateItems([])).toBeUndefined()
  })

  it('passes for well-formed items', () => {
    expect(validateTemplateItems([valid()])).toBeUndefined()
  })

  it('flags a non-positive serving count with the offending food name', () => {
    expect(validateTemplateItems([valid({ servings: 0 })])).toBe(
      'Chicken Breast (raw) needs servings greater than 0',
    )
  })

  it('flags an item missing its food reference', () => {
    expect(validateTemplateItems([valid({ food_id: 0 })])).toBe('Every item needs a food')
  })
})

describe('makeTempId', () => {
  it('produces unique client ids prefixed with tmp-', () => {
    const a = makeTempId()
    const b = makeTempId()
    expect(a).toMatch(/^tmp-/)
    expect(a).not.toBe(b)
  })
})
