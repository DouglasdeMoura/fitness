import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { forwardRef, useImperativeHandle, useRef, useState, type MutableRefObject } from 'react'
import {
  Badge,
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
  Spinner,
  Text,
  TextInput,
  VStack,
} from '@astryxdesign/core'
import { useToast } from '@astryxdesign/core/Toast'
import {
  addFood,
  addFoodLogEntry,
  getLoggedFoodStats,
  getRecentFoods,
  searchFoods,
  type LoggedFoodSummary,
} from '~/lib/api'
import type { Food } from '~/lib/db'
import {
  buildFoodLogDraft,
  mealTypeForHour,
  MEAL_TYPE_LABELS,
  type MealType,
} from '~/lib/nutrition'
import { runOrQueue, searchCachedFoods } from '~/lib/offline'
import {
  customFoodPayload,
  EMPTY_CUSTOM_FOOD_DRAFT,
  isCustomFoodDraftValid,
  type CustomFoodDraft,
} from '~/lib/custom-food'
import { useDebouncedValue } from '~/hooks/use-debounced-value'
import {
  FOOD_SEARCH_MIN_LENGTH,
  isFoodSearchPending,
  rankFoodSearchResults,
  type RankedFoodSearchResult,
} from '~/lib/food-search'
import { BarcodeScanner } from '~/components/nutrition/BarcodeScanner'
import { foodLoggedBody, mutationFailedBody } from '~/lib/toasts'

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

// Below 2 chars the LIKE query is more noise than signal; 300 ms is short
// enough to feel instant, long enough to skip mid-word request storms.
const SEARCH_DEBOUNCE_MS = 300
const SEARCH_MIN_LENGTH = FOOD_SEARCH_MIN_LENGTH

type FoodLogEntryValues = {
  selectedFood: Food | null
  servings: number | null
  mealType: MealType
}

type FoodLogEntryForm = ReturnType<typeof useFoodLogEntryForm>
type CustomFoodFormApi = ReturnType<typeof useCustomFoodForm>

export type AddFoodCardHandle = {
  focusSearch: () => void
}

/**
 * Searches foods and collects the serving details for a new food-log entry.
 * The search box debounces into a TanStack Query; the entry details and the
 * custom-food form each live in their own TanStack Form instance. The only
 * `useState` left is the custom-food-form visibility toggle.
 * @example <AddFoodCard ref={addFoodRef} selectedDate="2026-07-25" />
 */
export const AddFoodCard = forwardRef<AddFoodCardHandle, { selectedDate: string }>(
  function AddFoodCard({ selectedDate }, ref) {
    const form = useFoodLogEntryForm(selectedDate)
    const selectedFood = useStore(form.store, (state) => state.values.selectedFood)
    const searchFocusRef = useRef<() => void>(() => {})
    useImperativeHandle(ref, () => ({
      focusSearch: () => searchFocusRef.current(),
    }))

    return (
      <Card>
        <VStack gap={3}>
          <Heading level={2}>Add Food</Heading>
          {selectedFood ? (
            <SelectedFoodEntry
              form={form}
              food={selectedFood}
              onCancel={() => form.reset()}
            />
          ) : (
            <FoodSearchForm
              selectedDate={selectedDate}
              onSelect={(food) => form.setFieldValue('selectedFood', food)}
              searchFocusRef={searchFocusRef}
            />
          )}
        </VStack>
      </Card>
    )
  },
)

/**
 * Entry form: holds the picked food plus the servings/meal-type fields the
 * user adjusts before logging. Submit persists the row and resets back to the
 * search view; Cancel resets without persisting.
 */
function useFoodLogEntryForm(selectedDate: string) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useForm({
    defaultValues: {
      selectedFood: null,
      servings: 1,
      mealType: mealTypeForHour(new Date().getHours()),
    } as FoodLogEntryValues,
    onSubmit: async ({ value, formApi }) => {
      if (!value.selectedFood) return
      const entry = buildFoodLogDraft(
        value.selectedFood,
        value.servings ?? 1,
        selectedDate,
        value.mealType,
      )
      try {
        const outcome = await runOrQueue('addFoodLogEntry', entry, () =>
          addFoodLogEntry({ data: entry }),
        )
        formApi.reset()
        toast({ body: foodLoggedBody() })
        if (!outcome.queued) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] }),
            queryClient.invalidateQueries({ queryKey: ['recent-foods'] }),
            queryClient.invalidateQueries({ queryKey: ['logged-food-stats'] }),
          ])
        }
      } catch {
        toast({ body: mutationFailedBody('Log food'), type: 'error' })
      }
    },
  })
}

function SelectedFoodEntry({
  form,
  food,
  onCancel,
}: {
  form: FoodLogEntryForm
  food: Food
  onCancel: () => void
}) {
  return (
    <VStack gap={3}>
      <FoodSelectionSummary food={food} />
      <FormLayout>
        <form.Field name="servings">
          {(field) => (
            <NumberInput
              label="Servings"
              value={field.state.value}
              onChange={field.handleChange}
              min={0.5}
              step={0.5}
              hasClear
            />
          )}
        </form.Field>
        <form.Field name="mealType">
          {(field) => (
            <Selector
              label="Meal"
              value={field.state.value}
              options={MEAL_OPTIONS}
              onChange={(value) => field.handleChange(value as MealType)}
            />
          )}
        </form.Field>
      </FormLayout>
      <HStack gap={2} wrap="wrap">
        <Button
          label="Add to Log"
          variant="primary"
          clickAction={form.handleSubmit}
        />
        <Button label="Cancel" clickAction={onCancel} />
      </HStack>
    </VStack>
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

/**
 * Search box whose input drives a debounced TanStack Query. Typing streams
 * results without a "Search" button; the only useState here is the custom-food
 * toggle in {@link CustomFoodForm}.
 */
function FoodSearchForm({
  selectedDate,
  onSelect,
  searchFocusRef,
}: {
  selectedDate: string
  onSelect: (food: Food) => void
  searchFocusRef: MutableRefObject<() => void>
}) {
  const searchForm = useForm({
    defaultValues: { query: '' } as { query: string },
    onSubmit: async () => {
      // Auto-search runs on input via useQuery; submit is intentionally empty.
    },
  })
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [customFoodOpen, setCustomFoodOpen] = useState(false)
  const [prefillBarcode, setPrefillBarcode] = useState('')
  searchFocusRef.current = () => searchInputRef.current?.focus()
  const query = useStore(searchForm.store, (state) => state.values.query)
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const searchState = useFoodSearchResults(debouncedQuery)
  const quickLog = useQuickLogFood(selectedDate)
  const trimmedQuery = query.trim()
  const showRecent = trimmedQuery.length < SEARCH_MIN_LENGTH
  const recentFoods = useRecentFoods(showRecent)
  const loggedHistory = useLoggedFoodHistory(!showRecent || searchState.hasSearched)
  const searchPending = isFoodSearchPending(
    trimmedQuery,
    debouncedQuery.trim(),
    searchState.isFetching,
    SEARCH_MIN_LENGTH,
  )

  return (
    <VStack gap={3}>
      <BarcodeScanner
        selectedDate={selectedDate}
        onSelectFood={onSelect}
        onCreateFood={(barcode) => {
          setPrefillBarcode(barcode)
          setCustomFoodOpen(true)
        }}
      />
      <searchForm.Field name="query">
        {(field) => (
          <HStack gap={2} vAlign="end">
            <TextInput
              ref={searchInputRef}
              label="Search foods"
              placeholder="e.g. chicken breast, rice..."
              value={field.state.value}
              onChange={field.handleChange}
              hasClear
            />
            {searchPending ? (
              <Spinner size="sm" aria-label="Searching foods" />
            ) : null}
          </HStack>
        )}
      </searchForm.Field>
      <FoodSearchResults
        searchState={searchState}
        trimmedQuery={trimmedQuery}
        recentFoods={recentFoods}
        loggedHistory={loggedHistory}
        onSelect={onSelect}
        onQuickLog={quickLog}
        onCreateCustomFood={() => setCustomFoodOpen(true)}
      />
      <CustomFoodForm
        onCreated={onSelect}
        isOpen={customFoodOpen}
        onOpenChange={(open) => {
          setCustomFoodOpen(open)
          if (!open) setPrefillBarcode('')
        }}
        initialBarcode={prefillBarcode}
      />
    </VStack>
  )
}

type FoodSearchResultsState = {
  results: Food[]
  hasSearched: boolean
  isFetching: boolean
}

async function searchFoodCatalog(searchQuery: string): Promise<Food[]> {
  try {
    return await searchFoods({ data: { query: searchQuery } })
  } catch {
    // No network: fall back to the food database cached for offline use.
    return searchCachedFoods(searchQuery)
  }
}

/**
 * Streams search results for a debounced query. The query is disabled below
 * the minimum length so empty input never fires a request; `keepPreviousData`
 * keeps the old list visible while the next page of results loads.
 */
function useFoodSearchResults(debouncedQuery: string): FoodSearchResultsState {
  const trimmed = debouncedQuery.trim()
  const enabled = trimmed.length >= SEARCH_MIN_LENGTH
  const { data, isFetched, isFetching } = useQuery({
    queryKey: ['food-search', trimmed],
    queryFn: () => searchFoodCatalog(trimmed),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60,
  })
  return {
    results: data ?? [],
    hasSearched: enabled && isFetched,
    isFetching,
  }
}

function useQuickLogFood(selectedDate: string) {
  const queryClient = useQueryClient()
  const toast = useToast()

  return async (food: Food, servings: number, mealType: MealType) => {
    const entry = buildFoodLogDraft(food, servings, selectedDate, mealType)
    try {
      const outcome = await runOrQueue('addFoodLogEntry', entry, () =>
        addFoodLogEntry({ data: entry }),
      )
      toast({ body: foodLoggedBody() })
      if (!outcome.queued) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] }),
          queryClient.invalidateQueries({ queryKey: ['recent-foods'] }),
          queryClient.invalidateQueries({ queryKey: ['logged-food-stats'] }),
        ])
      }
    } catch {
      toast({ body: mutationFailedBody('Log food'), type: 'error' })
    }
  }
}

function useRecentFoods(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ['recent-foods'],
    queryFn: () => getRecentFoods(),
    enabled,
    staleTime: 1000 * 60,
  })
  return data ?? []
}

function useLoggedFoodHistory(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ['logged-food-stats'],
    queryFn: () => getLoggedFoodStats(),
    enabled,
    staleTime: 1000 * 60,
  })
  return data ?? []
}

function recentFoodDescription(food: LoggedFoodSummary): string {
  const mealLabel = MEAL_TYPE_LABELS[food.last_meal_type]
  const servingLabel = food.last_servings === 1 ? '1 serving' : `${food.last_servings} servings`
  return `${servingLabel} · ${mealLabel} · ${food.calories_per_serving * food.last_servings} kcal`
}

function RecentFoodsList({
  foods,
  onQuickLog,
}: {
  foods: LoggedFoodSummary[]
  onQuickLog: (food: LoggedFoodSummary) => void
}) {
  if (foods.length === 0) return null
  return (
    <VStack gap={1}>
      <Text type="label">Recent</Text>
      {foods.map((food) => (
        <Button
          key={food.id}
          label={`${food.name} — ${recentFoodDescription(food)}`}
          variant="ghost"
          clickAction={() => onQuickLog(food)}
        />
      ))}
    </VStack>
  )
}

function FoodSearchResultItem({
  result,
  onSelect,
  onQuickLog,
}: {
  result: RankedFoodSearchResult
  onSelect: (food: Food) => void
  onQuickLog: (food: Food, servings: number, mealType: MealType) => void
}) {
  const { food, logCount, lastServings, lastMealType } = result
  const hasHistory = logCount !== null && lastServings !== null && lastMealType !== null
  return (
    <ListItem
      label={food.name}
      description={`${food.calories_per_serving} kcal · ${food.protein_g} g protein`}
      endContent={
        hasHistory ? (
          <Badge variant="neutral" label={`logged ${logCount}×`} />
        ) : undefined
      }
      onClick={() => {
        if (hasHistory) {
          onQuickLog(food, lastServings, lastMealType)
          return
        }
        onSelect(food)
      }}
    />
  )
}

function FoodSearchResults({
  searchState,
  trimmedQuery,
  recentFoods,
  loggedHistory,
  onSelect,
  onQuickLog,
  onCreateCustomFood,
}: {
  searchState: FoodSearchResultsState
  trimmedQuery: string
  recentFoods: LoggedFoodSummary[]
  loggedHistory: Awaited<ReturnType<typeof getLoggedFoodStats>>
  onSelect: (food: Food) => void
  onQuickLog: (food: Food, servings: number, mealType: MealType) => void
  onCreateCustomFood: () => void
}) {
  const showRecent = trimmedQuery.length < SEARCH_MIN_LENGTH

  if (showRecent) {
    return (
      <RecentFoodsList
        foods={recentFoods}
        onQuickLog={(food) => onQuickLog(food, food.last_servings, food.last_meal_type)}
      />
    )
  }

  if (searchState.results.length > 0) {
    const ranked = rankFoodSearchResults(searchState.results, loggedHistory)
    return (
      <List header={<Text type="label">Search results</Text>} hasDividers>
        {ranked.map((result) => (
          <FoodSearchResultItem
            key={result.food.id}
            result={result}
            onSelect={onSelect}
            onQuickLog={onQuickLog}
          />
        ))}
      </List>
    )
  }

  if (!searchState.hasSearched) return null

  return (
    <EmptyState
      icon={<span aria-hidden>🔍</span>}
      title="No foods found"
      description="Try a different search or create a custom food."
      actions={
        <Button label="Create a custom food" variant="primary" clickAction={onCreateCustomFood} />
      }
      headingLevel={3}
      isCompact
    />
  )
}

/**
 * Wraps the custom-food editor behind a toggle so the long form only mounts
 * when the user opts in. `isOpen` is the one legitimate useState in this file.
 */
function CustomFoodForm({
  onCreated,
  isOpen: controlledOpen,
  onOpenChange,
  initialBarcode = '',
}: {
  onCreated: (food: Food) => void
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  initialBarcode?: string
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  if (!isOpen) {
    return (
      <Button
        label="Create Custom Food"
        size="sm"
        clickAction={() => setOpen(true)}
      />
    )
  }
  return (
    <CustomFoodEditor
      initialBarcode={initialBarcode}
      onCreated={(food) => {
        onCreated(food)
        setOpen(false)
      }}
      onCancel={() => setOpen(false)}
    />
  )
}

function CustomFoodEditor({
  onCreated,
  onCancel,
  initialBarcode = '',
}: {
  onCreated: (food: Food) => void
  onCancel: () => void
  initialBarcode?: string
}) {
  const form = useCustomFoodForm(onCreated, onCancel, initialBarcode)
  return (
    <VStack gap={3}>
      <Heading level={3}>New Custom Food</Heading>
      <CustomFoodIdentity form={form} />
      <CustomFoodServing form={form} />
      <CustomFoodMacros form={form} />
      <HStack gap={2} wrap="wrap">
        <form.Subscribe selector={(state) => isCustomFoodDraftValid(state.values)}>
          {(isValid) => (
            <Button
              label="Save Food"
              variant="primary"
              clickAction={form.handleSubmit}
              isDisabled={!isValid}
            />
          )}
        </form.Subscribe>
        <Button label="Cancel" clickAction={onCancel} />
      </HStack>
    </VStack>
  )
}

function useCustomFoodForm(
  onCreated: (food: Food) => void,
  onCancel: () => void,
  initialBarcode = '',
) {
  return useForm({
    defaultValues: { ...EMPTY_CUSTOM_FOOD_DRAFT, barcode: initialBarcode } as CustomFoodDraft,
    onSubmit: async ({ value, formApi }) => {
      if (!isCustomFoodDraftValid(value)) return
      const payload = customFoodPayload(value)
      const outcome = await runOrQueue('addFood', payload, () =>
        addFood({ data: payload }),
      )
      formApi.reset()
      onCancel()
      // Queued (offline) mutations return no row yet; the outbox replay will
      // surface the food via the search cache invalidate elsewhere.
      if (!outcome.queued) onCreated(outcome.result)
    },
  })
}

function CustomFoodIdentity({ form }: { form: CustomFoodFormApi }) {
  return (
    <FormLayout direction="horizontal">
      <form.Field name="name">
        {(field) => (
          <TextInput
            label="Name"
            value={field.state.value}
            onChange={field.handleChange}
            placeholder="Food name"
            isRequired
          />
        )}
      </form.Field>
      <form.Field name="brand">
        {(field) => (
          <TextInput
            label="Brand"
            value={field.state.value}
            onChange={field.handleChange}
            isOptional
          />
        )}
      </form.Field>
      <form.Field name="barcode">
        {(field) => (
          <TextInput
            label="Barcode"
            value={field.state.value}
            onChange={field.handleChange}
            placeholder="GTIN from package"
            isOptional
          />
        )}
      </form.Field>
    </FormLayout>
  )
}

function CustomFoodServing({ form }: { form: CustomFoodFormApi }) {
  return (
    <FormLayout direction="horizontal">
      <form.Field name="servingSize">
        {(field) => (
          <NumberInput
            label="Serving Size"
            value={field.state.value}
            onChange={field.handleChange}
            min={0.01}
            step={0.01}
            isRequired
          />
        )}
      </form.Field>
      <form.Field name="servingUnit">
        {(field) => (
          <Selector
            label="Unit"
            value={field.state.value}
            options={SERVING_UNIT_OPTIONS}
            onChange={(value) => field.handleChange(value)}
          />
        )}
      </form.Field>
    </FormLayout>
  )
}

function CustomFoodMacros({ form }: { form: CustomFoodFormApi }) {
  return (
    <Grid columns={{ minWidth: 160 }} gap={2}>
      <form.Field name="calories">
        {(field) => (
          <NumberInput
            label="Calories per serving"
            value={field.state.value}
            onChange={field.handleChange}
            min={0}
            isRequired
          />
        )}
      </form.Field>
      <form.Field name="protein">
        {(field) => (
          <NumberInput
            label="Protein (g)"
            value={field.state.value}
            onChange={field.handleChange}
            min={0}
          />
        )}
      </form.Field>
      <form.Field name="carbs">
        {(field) => (
          <NumberInput
            label="Carbs (g)"
            value={field.state.value}
            onChange={field.handleChange}
            min={0}
          />
        )}
      </form.Field>
      <form.Field name="fat">
        {(field) => (
          <NumberInput
            label="Fat (g)"
            value={field.state.value}
            onChange={field.handleChange}
            min={0}
          />
        )}
      </form.Field>
    </Grid>
  )
}
