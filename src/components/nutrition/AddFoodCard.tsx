import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  FormLayout,
  Grid,
  Heading,
  HStack,
  List,
  ListItem,
  NumberInput,
  Selector,
  Text,
  TextInput,
  VStack,
} from '@astryxdesign/core'
import { addFood, addFoodLogEntry, searchFoods } from '~/lib/api'
import type { Food } from '~/lib/db'
import {
  buildFoodLogDraft,
  mealTypeForHour,
  MEAL_TYPE_LABELS,
  type MealType,
} from '~/lib/nutrition'
import { runOrQueue, searchCachedFoods } from '~/lib/offline'
type CustomFoodPayload = Omit<Food, 'id' | 'created_at' | 'source'>

const MEAL_OPTIONS = Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => ({
  label,
  value,
}))

const SERVING_UNIT_OPTIONS = [
  { label: 'Grams (g)', value: 'g' },
  { label: 'Milliliters (ml)', value: 'ml' },
  { label: 'Piece', value: 'piece' },
  { label: 'Cup', value: 'cup' },
]

/**
 * Searches foods and collects the serving details for a new food-log entry.
 * @example <AddFoodCard selectedDate="2026-07-25" />
 */
export function AddFoodCard({ selectedDate }: { selectedDate: string }) {
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>Add Food</Heading>
        {selectedFood ? (
          <SelectedFoodForm
            food={selectedFood}
            selectedDate={selectedDate}
            onComplete={() => setSelectedFood(null)}
          />
        ) : (
          <FoodSearchForm onSelect={setSelectedFood} />
        )}
      </VStack>
    </Card>
  )
}

type SelectedFoodFormState = {
  servings: number | null
  mealType: MealType
  setServings: (servings: number | null) => void
  setMealType: (mealType: MealType) => void
  addToLog: () => Promise<void>
}

function useSelectedFoodForm(
  food: Food,
  selectedDate: string,
  onComplete: () => void,
): SelectedFoodFormState {
  const queryClient = useQueryClient()
  const [servings, setServings] = useState<number | null>(1)
  const [mealType, setMealType] = useState<MealType>(() =>
    mealTypeForHour(new Date().getHours()),
  )
  const addToLog = async () => {
    const entry = buildFoodLogDraft(food, servings ?? 1, selectedDate, mealType)
    const outcome = await runOrQueue('addFoodLogEntry', entry, () =>
      addFoodLogEntry({ data: entry }),
    )
    onComplete()
    if (!outcome.queued) {
      await queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] })
    }
  }
  return { servings, mealType, setServings, setMealType, addToLog }
}

function SelectedFoodForm({
  food,
  selectedDate,
  onComplete,
}: {
  food: Food
  selectedDate: string
  onComplete: () => void
}) {
  const form = useSelectedFoodForm(food, selectedDate, onComplete)
  return (
    <VStack gap={3}>
      <FoodSelectionSummary food={food} />
      <SelectedFoodFields form={form} />
      <HStack gap={2} wrap="wrap">
        <Button label="Add to Log" variant="primary" clickAction={form.addToLog} />
        <Button label="Cancel" clickAction={onComplete} />
      </HStack>
    </VStack>
  )
}

function SelectedFoodFields({ form }: { form: SelectedFoodFormState }) {
  return (
    <FormLayout>
      <NumberInput
        label="Servings"
        value={form.servings}
        onChange={form.setServings}
        min={0.5}
        step={0.5}
        hasClear
      />
      <Selector
        label="Meal"
        value={form.mealType}
        options={MEAL_OPTIONS}
        onChange={(value) => form.setMealType(value as MealType)}
      />
    </FormLayout>
  )
}

function FoodSelectionSummary({ food }: { food: Food }) {
  return (
    <VStack gap={1}>
      <Heading level={3}>{food.name}</Heading>
      <Text type="supporting">
        {food.calories_per_serving} kcal per {food.serving_size}
        {food.serving_unit} · P {food.protein_g} g · C {food.carbs_g} g · F{' '}
        {food.fat_g} g
      </Text>
    </VStack>
  )
}

type FoodSearchState = {
  query: string
  results: Food[]
  hasSearched: boolean
  setQuery: (query: string) => void
  search: () => Promise<void>
}

async function searchFoodCatalog(searchQuery: string): Promise<Food[]> {
  try {
    return await searchFoods({ data: { query: searchQuery } })
  } catch {
    // No network: fall back to the food database cached for offline use.
    return searchCachedFoods(searchQuery)
  }
}

function useFoodSearch(): FoodSearchState {
  const [query, setQueryValue] = useState('')
  const [results, setResults] = useState<Food[] | null>(null)
  const setQuery = (nextQuery: string) => {
    setQueryValue(nextQuery)
    if (!nextQuery) setResults(null)
  }
  const search = async () => {
    const searchQuery = query.trim()
    if (searchQuery.length < 2) return
    setResults(await searchFoodCatalog(searchQuery))
  }
  return {
    query,
    results: results ?? [],
    hasSearched: results !== null,
    setQuery,
    search,
  }
}

function FoodSearchForm({ onSelect }: { onSelect: (food: Food) => void }) {
  const searchState = useFoodSearch()
  const searchInputRef = useRef<HTMLInputElement>(null)
  return (
    <VStack gap={3}>
      <TextInput
        ref={searchInputRef}
        label="Search foods"
        placeholder="e.g. chicken breast, rice..."
        value={searchState.query}
        onChange={searchState.setQuery}
        onEnter={searchState.search}
        hasClear
      />
      <Button label="Search" variant="primary" clickAction={searchState.search} />
      <FoodSearchResults
        searchState={searchState}
        onSelect={onSelect}
        onClear={() => {
          searchState.setQuery('')
          searchInputRef.current?.focus()
        }}
      />
      <CustomFoodForm onCreated={onSelect} />
    </VStack>
  )
}

function FoodSearchResults({
  searchState,
  onSelect,
  onClear,
}: {
  searchState: FoodSearchState
  onSelect: (food: Food) => void
  onClear: () => void
}) {
  if (searchState.results.length > 0) {
    return (
      <List header={<Text type="label">Search results</Text>} hasDividers>
        {searchState.results.map((food) => (
          <ListItem
            key={food.id}
            label={food.name}
            description={`${food.calories_per_serving} kcal · ${food.protein_g} g protein`}
            onClick={() => onSelect(food)}
          />
        ))}
      </List>
    )
  }
  if (!searchState.hasSearched) return null
  return (
    <EmptyState
      title="No foods found"
      description="Try another search term or create a custom food."
      actions={<Button label="Clear search" clickAction={onClear} />}
      headingLevel={3}
      isCompact
    />
  )
}

type CustomFoodDraft = {
  name: string
  brand: string
  servingSize: number | null
  servingUnit: string
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

type UpdateCustomFoodDraft = <Key extends keyof CustomFoodDraft>(
  key: Key,
  value: CustomFoodDraft[Key],
) => void

type CustomFoodDraftState = {
  draft: CustomFoodDraft
  updateDraft: UpdateCustomFoodDraft
  saveDraft: () => Promise<void>
}

const EMPTY_CUSTOM_FOOD: CustomFoodDraft = {
  name: '',
  brand: '',
  servingSize: 100,
  servingUnit: 'g',
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
}

function CustomFoodForm({ onCreated }: { onCreated: (food: Food) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  if (!isOpen) {
    return (
      <Button
        label="Create Custom Food"
        size="sm"
        clickAction={() => setIsOpen(true)}
      />
    )
  }
  return (
    <CustomFoodEditor
      onCreated={onCreated}
      onCancel={() => setIsOpen(false)}
    />
  )
}

function CustomFoodEditor({
  onCreated,
  onCancel,
}: {
  onCreated: (food: Food) => void
  onCancel: () => void
}) {
  const editor = useCustomFoodDraft(onCreated, onCancel)
  return (
    <VStack gap={3}>
      <Heading level={3}>New Custom Food</Heading>
      <CustomFoodIdentity draft={editor.draft} updateDraft={editor.updateDraft} />
      <CustomFoodServing draft={editor.draft} updateDraft={editor.updateDraft} />
      <CustomFoodMacros draft={editor.draft} updateDraft={editor.updateDraft} />
      <HStack gap={2} wrap="wrap">
        <Button label="Save Food" variant="primary" clickAction={editor.saveDraft} />
        <Button label="Cancel" clickAction={onCancel} />
      </HStack>
    </VStack>
  )
}

function useCustomFoodDraft(
  onCreated: (food: Food) => void,
  onComplete: () => void,
): CustomFoodDraftState {
  const [draft, setDraft] = useState<CustomFoodDraft>(EMPTY_CUSTOM_FOOD)
  const updateDraft: UpdateCustomFoodDraft = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const saveDraft = async () => {
    if (!draft.name.trim() || draft.calories == null) return
    const payload = customFoodPayload(draft)
    const outcome = await runOrQueue('addFood', payload, () =>
      addFood({ data: payload }),
    )
    onComplete()
    if (!outcome.queued) onCreated(outcome.result)
  }
  return { draft, updateDraft, saveDraft }
}

function customFoodPayload(draft: CustomFoodDraft): CustomFoodPayload {
  return {
    name: draft.name.trim(),
    brand: draft.brand.trim() || null,
    serving_size: draft.servingSize ?? 100,
    serving_unit: draft.servingUnit,
    calories_per_serving: draft.calories ?? 0,
    protein_g: draft.protein ?? 0,
    carbs_g: draft.carbs ?? 0,
    fat_g: draft.fat ?? 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
  }
}

function CustomFoodIdentity({
  draft,
  updateDraft,
}: {
  draft: CustomFoodDraft
  updateDraft: UpdateCustomFoodDraft
}) {
  return (
    <FormLayout direction="horizontal">
      <TextInput
        label="Name"
        value={draft.name}
        onChange={(value) => updateDraft('name', value)}
        placeholder="Food name"
        isRequired
      />
      <TextInput
        label="Brand"
        value={draft.brand}
        onChange={(value) => updateDraft('brand', value)}
        isOptional
      />
    </FormLayout>
  )
}

function CustomFoodServing({
  draft,
  updateDraft,
}: {
  draft: CustomFoodDraft
  updateDraft: UpdateCustomFoodDraft
}) {
  return (
    <FormLayout direction="horizontal">
      <NumberInput
        label="Serving Size"
        value={draft.servingSize}
        onChange={(value) => updateDraft('servingSize', value)}
        min={0.01}
        step={0.01}
        isRequired
      />
      <Selector
        label="Unit"
        value={draft.servingUnit}
        options={SERVING_UNIT_OPTIONS}
        onChange={(value) => updateDraft('servingUnit', value)}
      />
    </FormLayout>
  )
}

function CustomFoodMacros({
  draft,
  updateDraft,
}: {
  draft: CustomFoodDraft
  updateDraft: UpdateCustomFoodDraft
}) {
  return (
    <Grid columns={{ minWidth: 160 }} gap={2}>
      <NumberInput
        label="Calories per serving"
        value={draft.calories}
        onChange={(value) => updateDraft('calories', value)}
        min={0}
        isRequired
      />
      <NumberInput
        label="Protein (g)"
        value={draft.protein}
        onChange={(value) => updateDraft('protein', value)}
        min={0}
      />
      <NumberInput
        label="Carbs (g)"
        value={draft.carbs}
        onChange={(value) => updateDraft('carbs', value)}
        min={0}
      />
      <NumberInput
        label="Fat (g)"
        value={draft.fat}
        onChange={(value) => updateDraft('fat', value)}
        min={0}
      />
    </Grid>
  )
}
