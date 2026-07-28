# PRD: Full Design Sweep — Polished UX with Astryx DS

## Problem

The app currently "works" but the UX is rough. After the component migration (issues #9-#16) and state cleanup (issues #18-#23), the raw components are in place but the **experience** lacks polish:

- **No loading states** — pages flash empty then populate, no skeleton/spinner feedback
- **No feedback on actions** — saving a form gives no visual confirmation (the `saved` boolean hack was removed)
- **No confirmation for destructive actions** — deleting food log entries or workout sets happens instantly with no undo
- **Empty states are generic** — "No data" messages instead of helpful guidance with call-to-action
- **No date navigation** — nutrition/workout pages are locked to "today" with no way to view past days
- **Mobile responsiveness is incomplete** — grids collapse but tables overflow, nav doesn't adapt
- **No keyboard accessibility** — forms lack proper focus management, no skip links beyond what AppShell provides

## Reference

- **Astryx DS**: Use `npm run astryx component <Name>` for all component APIs
- **AGENTS.md**: Design system cheat sheet and rules
- **React philosophy**: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

## Goal

Transform the app from "functional but rough" to "polished, professional, and smooth." Every user action should give immediate, clear feedback. Every empty/loading/error state should guide the user forward.

## UX Patterns to Implement

### 1. Toast Notifications via `useToast()`

Every user-initiated mutation gets a toast confirmation:

| Action | Toast | Type | Auto-hide |
| --- | --- | --- | --- |
| Save profile | "Profile saved" | info | 5s |
| Log food | "Food logged — {name}" | info | 5s |
| Delete food entry | "Entry deleted" + **Undo** button in `endContent` | info | 8s |
| Save workout set | "Set saved" | info | 3s |
| Delete workout set | "Set deleted" + **Undo** | info | 8s |
| Log weight | "Weight logged — {kg}kg" | info | 5s |
| Export data | "Data exported" | info | 5s |
| Save fails | "{action} failed — try again" | **error** | persists |
| Create program | "Program created" | info | 5s |
| Delete program | "Program deleted" + **Undo** | info | 8s |

**Implementation**: Wrap app in `ToastViewport` at the root layout level. Use `useToast()` hook in each page.

### 2. Confirmation Dialogs for Destructive Actions

Use `Dialog` with `purpose="form"` for all deletes:

| Action                | Dialog                                       |
| --------------------- | -------------------------------------------- |
| Delete food log entry | "Delete this entry?" + Cancel/Delete buttons |
| Delete workout set    | "Delete this set?" + Cancel/Delete buttons   |
| Delete program        | "Delete '{name}'? This cannot be undone."    |
| Delete template       | Same pattern                                 |

### 3. Loading States

| Scenario | Component | Implementation |
| --- | --- | --- |
| Page initial load (SSR pending) | `Skeleton` | Match the shape of cards/content being loaded |
| Form submitting | `Spinner` inside `Button` | Button shows spinner + disabled while `isSubmitting` |
| Food search pending | `Spinner` | Small spinner next to search input |
| Workout saving | `Spinner` | Next to "Save Set" button |

### 4. Empty States with Call-to-Action

Use `EmptyState` with icon, title, description, and action button:

| Page | Empty State |
| --- | --- |
| Nutrition (no food logged) | Icon: 🍽️, Title: "No food logged yet", Action: "Add your first meal" (opens AddFoodCard) |
| Workout (no sessions) | Icon: 🏋️, Title: "No workouts yet", Action: "Start your first workout" |
| Progress (no weight data) | Icon: ⚖️, Title: "No weight logs yet", Action: "Log your weight" |
| Programs (no programs) | Icon: 📋, Title: "No training programs", Action: "Create a program" |
| Food search (no results) | Icon: 🔍, Title: "No foods found", Description: "Try a different search or create a custom food" |

### 5. Error States

Use `Banner` for persistent errors that need attention:

| Scenario | Banner |
| --- | --- |
| Server function fails to load data | `Banner` with `status="error"`, title: "Failed to load", action: "Retry" |
| Form validation errors | Inline `Field` validation (not banners) |
| Offline mode | `Banner` with `status="warning"`, title: "You're offline — changes will sync when reconnected" |

### 6. Date Navigation for Nutrition/Workout

Add a date picker (`DateInput`) and prev/next day buttons to nutrition and workout pages so users can log/view past days:

```
← [Today, Jul 25] →  (DateInput popover for jumping to specific dates)
```

### 7. Mobile Responsive Tables

Wrap tables in horizontally scrollable containers, or use `List` + `ListItem` for mobile card layouts when tables are too wide.

### 8. Tab Organization on Dashboard

Use `TabList` to organize dashboard into "Today" / "Nutrition" / "Training" / "Progress" tabs instead of one long scroll.

## Batches

### Batch 1: Toast Infrastructure + Core Feedback

- Add `ToastViewport` to root layout (`AppChrome.tsx`)
- Add toasts to: profile save, food log, weight log, workout set save, data export
- Add error toasts for failed mutations
- **Files**: `src/components/AppChrome.tsx`, `src/routes/settings/index.tsx`, `src/routes/nutrition/index.tsx`, `src/routes/workout/index.tsx`

### Batch 2: Confirmation Dialogs for Deletes

- Add `Dialog` confirmation for: food entry delete, workout set delete, program delete, template delete
- Wire up Undo via toast `endContent` for reversible operations
- **Files**: all routes with delete operations

### Batch 3: Loading States (Skeletons + Spinners)

- Replace flash-of-empty-content with `Skeleton` placeholders matching each page layout
- Add `Spinner` to all submit buttons via `Button`'s loading state
- Add search spinner in AddFoodCard
- **Files**: all route components

### Batch 4: Empty States with CTAs

- Replace all generic "No data" text with Astryx `EmptyState` component
- Include icon, descriptive title, description, and action button
- **Files**: nutrition, workout, progress, programs, templates routes

### Batch 5: Date Navigation

- Add date selector to nutrition and workout pages
- Persist selected date in URL search params (`?date=2026-07-24`)
- **Files**: `src/routes/nutrition/index.tsx`, `src/routes/workout/index.tsx`

### Batch 6: Mobile Polish + Error Banners

- Ensure all tables scroll horizontally on mobile (or switch to card/list layout)
- Add `Banner` error states for failed data loads
- Add retry buttons on error banners
- **Files**: all routes

## Acceptance Criteria

- [ ] Every mutation shows a toast confirmation
- [ ] Every delete shows a confirmation dialog
- [ ] Pages show skeletons during load, not empty flash
- [ ] All empty states have icons, titles, and action buttons
- [ ] Submit buttons show spinner while loading
- [ ] Food search shows loading indicator
- [ ] Nutrition and workout pages support date navigation
- [ ] Error states use Astryx Banner with retry action
- [ ] All tables work on mobile (scroll or card layout)
- [ ] No custom CSS — only Astryx components
- [ ] All unit tests pass (`npm run test:unit`)
- [ ] All e2e tests pass (`npm run test:e2e`)
- [ ] Build succeeds (`npm run build`)
