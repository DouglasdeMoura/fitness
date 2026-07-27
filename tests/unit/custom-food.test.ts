import { describe, it, expect } from 'vitest'
import {
  customFoodPayload,
  EMPTY_CUSTOM_FOOD_DRAFT,
  isCustomFoodDraftValid,
  type CustomFoodDraft,
} from '~/lib/custom-food'

describe('EMPTY_CUSTOM_FOOD_DRAFT', () => {
  it('seeds a sensible starting point for the custom-food form', () => {
    expect(EMPTY_CUSTOM_FOOD_DRAFT).toEqual({
      name: '',
      brand: '',
      servingSize: 100,
      servingUnit: 'g',
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      barcode: '',
    })
  })

  it('declares the grams unit that nutrition labels use by default', () => {
    expect(EMPTY_CUSTOM_FOOD_DRAFT.servingUnit).toBe('g')
  })
})

describe('isCustomFoodDraftValid', () => {
  it('accepts a draft with a name and calories', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: 'Apple',
      calories: 52,
    }
    expect(isCustomFoodDraftValid(draft)).toBe(true)
  })

  it('rejects a blank name even when calories are present', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: '   ',
      calories: 52,
    }
    expect(isCustomFoodDraftValid(draft)).toBe(false)
  })

  it('rejects a draft with a name but no calories', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: 'Mystery Food',
    }
    expect(isCustomFoodDraftValid(draft)).toBe(false)
  })

  it('rejects the empty draft outright (save button starts disabled)', () => {
    expect(isCustomFoodDraftValid(EMPTY_CUSTOM_FOOD_DRAFT)).toBe(false)
  })

  it('treats a zero-calorie entry as valid (e.g. plain water)', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: 'Sparkling Water',
      calories: 0,
    }
    expect(isCustomFoodDraftValid(draft)).toBe(true)
  })
})

describe('customFoodPayload', () => {
  it('maps every entered field onto the persisted Food shape', () => {
    const draft: CustomFoodDraft = {
      name: 'Greek Yogurt',
      brand: 'Fage',
      servingSize: 170,
      servingUnit: 'g',
      calories: 130,
      protein: 18,
      carbs: 9,
      fat: 0,
      barcode: '',
    }
    expect(customFoodPayload(draft)).toEqual({
      name: 'Greek Yogurt',
      brand: 'Fage',
      serving_size: 170,
      serving_unit: 'g',
      calories_per_serving: 130,
      protein_g: 18,
      carbs_g: 9,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
      barcode: null,
    })
  })

  it('persists a trimmed barcode when provided', () => {
    const draft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: 'Cereal',
      calories: 120,
      barcode: ' 012345678905 ',
    }
    expect(customFoodPayload(draft).barcode).toBe('012345678905')
  })

  it('stores a null brand when the field is left blank', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: 'Homemade Chili',
      calories: 320,
      brand: '',
    }
    expect(customFoodPayload(draft).brand).toBeNull()
  })

  it('trims whitespace from name and brand before persisting', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: '  Banana  ',
      brand: '  Dole  ',
      calories: 105,
    }
    const payload = customFoodPayload(draft)
    expect(payload.name).toBe('Banana')
    expect(payload.brand).toBe('Dole')
  })

  it('defaults macros to 0 so missing fields do not become NaN downstream', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: 'Black Coffee',
      calories: 2,
    }
    const payload = customFoodPayload(draft)
    expect(payload.protein_g).toBe(0)
    expect(payload.carbs_g).toBe(0)
    expect(payload.fat_g).toBe(0)
  })

  it('zeroes micronutrients the form does not yet collect', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: 'Test Food',
      calories: 100,
    }
    const payload = customFoodPayload(draft)
    expect(payload.fiber_g).toBe(0)
    expect(payload.sugar_g).toBe(0)
    expect(payload.sodium_mg).toBe(0)
  })

  it('falls back to a 100 g serving when both serving fields are cleared', () => {
    const draft: CustomFoodDraft = {
      ...EMPTY_CUSTOM_FOOD_DRAFT,
      name: 'Test Food',
      calories: 100,
      servingSize: null,
    }
    expect(customFoodPayload(draft).serving_size).toBe(100)
  })
})
