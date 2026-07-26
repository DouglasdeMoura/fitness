# PRD: State Management Cleanup — Remove Unnecessary useState/useEffect

## Problem

The codebase has 66 `useState` and 5 `useEffect` calls across 10 files. Many of these are unnecessary — either redundant state that duplicates data already available from server queries, or Effects that could be replaced with derived values computed during render.

**Reference:** [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — the official React guide on removing unnecessary state and effects.

## Goal

Sweep the codebase file-by-file and eliminate every `useState` and `useEffect` that has a better idiomatic alternative. Each removal must be verified by tests.

## Key Anti-Patterns to Fix

### 1. State that mirrors server data (most common in this codebase)

```tsx
// 🔴 Avoid: local state duplicates server data
const [name, setName] = useState(user.name)
const [heightCm, setHeightCm] = useState(user.height_cm)

// ✅ Better: use the query data directly, or use TanStack Query mutations
// If the form needs local "draft" state, use a single object, not 7 separate useStates
```

**Worst offender:** `src/routes/settings/index.tsx` has 8 separate `useState` calls for form fields that all derive from a single `user` query.

### 2. State for derived/calculated values

```tsx
// 🔴 Avoid
const [totals, setTotals] = useState({ calories: 0, ... })
useEffect(() => { setTotals(calculateTotals(entries)) }, [entries])

// ✅ Calculate during render
const totals = useMemo(() => calculateTotals(entries), [entries])
```

### 3. State for UI toggles that could be derived

```tsx
// 🔴 Avoid: tracking "saved" state manually
const [saved, setSaved] = useState(false)
// ...in handler: setSaved(true); setTimeout(() => setSaved(false), 2000)

// ✅ Better: use TanStack Query's mutation state (isPending, isSuccess)
// or use a toast/notification system
```

### 4. Effects that sync external state

```tsx
// 🔴 Avoid: syncing query data to local state on mount
useEffect(() => { setName(user.name) }, [user])

// ✅ Better: use `user.name` directly, or use `useForm` pattern
// with `key={user.id}` to reset on user change
```

## Batches

### Batch 1: Settings page (`src/routes/settings/index.tsx`) — 8 useState
Replace 8 separate field states with either:
- A single `formState` object managed by one `useReducer` or `useState`
- TanStack Query mutations (preferred — gives `isPending`, `isSuccess` for free)
- Remove `saved` state, use mutation status instead

### Batch 2: Workout page (`src/routes/workout/index.tsx`) — 5 useState + 1 useEffect
- `activeSession`: keep (legitimate UI state for current workout)
- `programTargets`: derive from query data if possible
- `selectedExercise`: keep (legitimate UI selection state)
- `sets`: keep (draft workout data before saving)
- `useEffect` syncing program targets: replace with derived value

### Batch 3: Program detail (`src/routes/workout/programs/$programId.tsx`) — 9 useState + 1 useEffect
Same pattern as settings: many form fields mirroring server data. Consolidate into single form state or use TanStack Query mutations.

### Batch 4: Template detail (`src/routes/nutrition/templates/$templateId.tsx`) — 9 useState + 1 useEffect
Same as program detail.

### Batch 5: AddFoodCard (`src/components/nutrition/AddFoodCard.tsx`) — 9 useState
- `query`, `results`, `hasSearched`: replace with TanStack Query `useQuery` for search
- `selectedFood`, `servings`, `mealType`: consolidate into single draft state
- `isOpen`: keep (legitimate UI toggle)
- `draft` (custom food): keep or consolidate

### Batch 6: Remaining files (programs/index, templates/index, planning, AppChrome, OfflineStatus)
- `showCreate`, `name`, `description` patterns: consolidate
- AppChrome: `colorMode`/`themeReady` Effects are legitimate (syncing localStorage)
- OfflineStatus: Effects are legitimate (browser API sync)

## Rules

1. **Read [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) first**
2. Each batch must pass all tests (`npm run test:unit` and `npm run build`)
3. If removing a `useState` changes UI behavior, update e2e tests accordingly
4. Prefer TanStack Query mutation state over manual "saved"/"loading" state
5. Prefer `useMemo` for derived data over `useState` + `useEffect`
6. Some `useState` is legitimate (UI toggles, modal open/closed, selected item) — don't force-remove those
7. Commit after each batch

## Acceptance Criteria

- [ ] No `useEffect` that syncs server data to local state
- [ ] No derived/calculated values stored in `useState`
- [ ] No redundant "saved"/"loading" state that duplicates TanStack Query
- [ ] Form state consolidated (not 8 separate `useState` for one form)
- [ ] All tests pass
- [ ] Build succeeds
