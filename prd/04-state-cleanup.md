# PRD: State Management Cleanup — Remove Unnecessary useState/useEffect

## Problem

The codebase has 66 `useState` and 5 `useEffect` calls across 10 files. Many of these are unnecessary — either redundant state that duplicates data already available from server queries, or Effects that could be replaced with derived values computed during render.

**Reference:** [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — the official React guide on removing unnecessary state and effects.

## Goal

Sweep the codebase file-by-file and eliminate every `useState` and `useEffect` that has a better idiomatic alternative. Each removal must be verified by tests.

## Key Anti-Patterns to Fix

### 1. State that mirrors server data — use TanStack Form

The project uses `@tanstack/react-form` for all form state management. Forms should NOT use individual `useState` calls for fields. Instead:

```tsx
import { useForm } from '@tanstack/react-form'

// 🔴 Avoid: 8 separate useState for form fields
const [name, setName] = useState(user.name)
const [heightCm, setHeightCm] = useState(user.height_cm)
const [saved, setSaved] = useState(false)

// ✅ Use TanStack Form
const form = useForm({
  defaultValues: { name: user.name, heightCm: user.height_cm, ... },
  onSubmit: async ({ value }) => {
    await updateUser({ data: value })
  },
})
// form.state.isSubmitting replaces manual "saved"/"loading" state
```

**Worst offender:** `src/routes/settings/index.tsx` has 8 separate `useState` calls.

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
const [saved, setSaved] = useState(false);
// ...in handler: setSaved(true); setTimeout(() => setSaved(false), 2000)

// ✅ Better: use TanStack Query's mutation state (isPending, isSuccess)
// or use a toast/notification system
```

### 4. Effects that sync external state

```tsx
// 🔴 Avoid: syncing query data to local state on mount
useEffect(() => {
  setName(user.name);
}, [user]);

// ✅ Better: use `user.name` directly, or use `useForm` pattern
// with `key={user.id}` to reset on user change
```

## Batches

### Batch 1: Settings page (`src/routes/settings/index.tsx`) — 8 useState

Replace ALL form state with `@tanstack/react-form`'s `useForm` hook:

- Single `useForm` call with `defaultValues` from the `user` query
- `form.state.isSubmitting` replaces manual `saved` state
- `form.handleSubmit` calls the `updateUser` server function
- No `useState` for any form field

### Batch 2: Workout page (`src/routes/workout/index.tsx`) — 5 useState + 1 useEffect

- `activeSession`: keep (legitimate UI state for current workout)
- `programTargets`: derive from query data if possible
- `selectedExercise`: keep (legitimate UI selection state)
- `sets`: keep (draft workout data before saving)
- `useEffect` syncing program targets: replace with derived value

### Batch 3: Program detail (`src/routes/workout/programs/$programId.tsx`) — 9 useState + 1 useEffect

Replace ALL form state with `@tanstack/react-form`:

- Single `useForm` with `defaultValues` from the program query
- Remove the `useEffect` that syncs query data to local state — TanStack Form handles this via `defaultValues` + `form.reset()` on data change
- `form.state.isSubmitting` replaces `saved` state

### Batch 4: Template detail (`src/routes/nutrition/templates/$templateId.tsx`) — 9 useState + 1 useEffect

Replace ALL form state with `@tanstack/react-form`:

- Single `useForm` with `defaultValues` from the template query
- Remove the `useEffect` syncing query data to local state
- `form.state.isSubmitting` replaces `saved` state

### Batch 5: AddFoodCard (`src/components/nutrition/AddFoodCard.tsx`) — 9 useState

- `query`, `results`, `hasSearched`: replace with TanStack Query `useQuery` for search
- `selectedFood`, `servings`, `mealType`: consolidate into a single `@tanstack/react-form` instance for the food log entry
- `isOpen`: keep (legitimate UI toggle)
- `draft` (custom food): use a `@tanstack/react-form` instance for the custom food creation form

### Batch 6: Remaining files (programs/index, templates/index, planning, AppChrome, OfflineStatus)

- `showCreate`, `name`, `description`, `frequency`, `periodizationType` patterns: replace create forms with `@tanstack/react-form`
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
