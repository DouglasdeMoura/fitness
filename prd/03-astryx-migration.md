# PRD: Astryx DS Migration - Replace Custom CSS with Design System Components

## Problem

The app currently uses 357 lines of custom CSS (`src/styles/app.css`) with hand-rolled classes (`.card`, `.btn`, `.grid-2`, `.stat-row`, `.input`, etc.) across 11 route files with 290+ className references. This violates Astryx DS conventions — components should handle all layout and styling, not custom CSS.

## Goal

Replace every custom CSS class and inline `style={{}}` with Astryx DS components so the app looks consistent, themeable, and follows Meta's design system best practices.

## Migration Mapping

| Custom CSS | Astryx Component | Import Path |
|-----------|-----------------|-------------|
| `.app-header` + `.app-nav` | `AppShell` + `TopNav` + `TopNavItem` | `@astryxdesign/core/AppShell`, `@astryxdesign/core/TopNav` |
| `.card` + `.card-title` | `Card` | `@astryxdesign/core/Card` |
| `.btn` / `.btn-primary` / `.btn-secondary` | `Button` | `@astryxdesign/core/Button` |
| `.btn-sm` | `Button` with `size="small"` | same |
| `.grid-2` / `.grid-3` | `Layout` / `Section` with `display="grid"` | `@astryxdesign/core/Layout` |
| `.stat-row` + `.stat-label` + `.stat-value` | `MetadataList` + `MetadataListItem` | `@astryxdesign/core/MetadataList` |
| `.progress-bar` + `.progress-bar-fill` | `ProgressBar` | `@astryxdesign/core/ProgressBar` |
| `.input` | `TextInput` / `NumberInput` | `@astryxdesign/core/TextInput` |
| `.label` | `Field` (wraps inputs with label) | `@astryxdesign/core/Field` |
| `.badge` / `.badge-positive` / `.badge-negative` | `Badge` / `Token` / `StatusDot` | `@astryxdesign/core/Badge` |
| `table` / `th` / `td` | `Table` + `TableRow` + `TableCell` | `@astryxdesign/core/Table` |
| `.empty-state` | `EmptyState` | `@astryxdesign/core/EmptyState` |
| `.form-group` | `Field` + `VStack` | `@astryxdesign/core/Field`, `@astryxdesign/core/Layout` |
| `.section-header` + `.section-title` | `Heading` (from Typography) | `@astryxdesign/core/Heading` |
| Dark mode `[data-theme="dark"]` | `Theme` / `MediaTheme` | `@astryxdesign/core/theme` |
| `.app-nav-brand` | `TopNavHeading` | `@astryxdesign/core/TopNav` |

## Batches

Each batch is independently shippable and testable. Work bottom-up (shared primitives first, then pages).

### Batch 1: App Shell + Navigation (root layout)
**Scope:** `src/routes/__root.tsx`
Replace the custom header/nav with `AppShell` + `TopNav` + `TopNavHeading` + `TopNavItem`. Dark mode toggle moves to `endContent` slot.

### Batch 2: Dashboard Page (`src/routes/index.tsx`)
Replace `.card`, `.card-title`, `.stat-row`, `.stat-label`, `.stat-value`, `.grid-2`, `.grid-3`, `.progress-bar`, `.section-header`, `.section-title` with Astryx components.

### Batch 3: Settings Page (`src/routes/settings/index.tsx`)
Replace `.card`, `.form-group`, `.input`, `.label`, `.btn`, `select` with `Card`, `Field`, `TextInput`, `NumberInput`, `Button`, Astryx `Select`.

### Batch 4: Nutrition Page (`src/routes/nutrition/index.tsx`)
Replace `.card`, `.grid-2`, `.stat-row`, `.input`, `.btn`, `table`, `.empty-state` with Astryx `Card`, `Layout`, `MetadataList`, `TextInput`, `Button`, `Table`, `EmptyState`.

### Batch 5: Workout Page (`src/routes/workout/index.tsx`)
Same mapping as nutrition. Tables for set logging, inputs for weight/reps/RPE.

### Batch 6: Progress Page (`src/routes/progress/index.tsx`)
Replace custom SVG chart container, `.grid-3`, stat cards, and volume bars with Astryx `Card`, `Layout`, `MetadataList`, `ProgressBar`.

### Batch 7: Sub-pages (programs, templates, planning)
Migrate the remaining 5 route files: `workout/programs/`, `nutrition/templates/`, `nutrition/planning/`.

### Batch 8: Cleanup - Remove Custom CSS
After all pages are migrated, remove all custom classes from `src/styles/app.css`. The file should only contain the Astryx CSS imports. Dark mode handled by Astryx `Theme` component.

## Rules

1. **Read AGENTS.md first** — it has the Astryx cheat sheet
2. **Use `astryx component <Name>` to check props** before writing
3. **No `style={{}}`** — use component props or StyleX `xstyle` instead
4. **No raw hex/px** — use tokens (Astryx spacing scale: 0-10)
5. **No `<div>` for layout** — use `VStack`, `HStack`, `Layout`, `Section`
6. **Each batch must pass all tests** (unit + e2e + build) before committing
7. **Update e2e tests** if selectors change (e.g., `.card-title` → whatever Astryx uses)
8. **Commit after each batch** with conventional commit format

## Acceptance Criteria

- [ ] Zero custom CSS classes in `src/styles/app.css` (only Astryx imports)
- [ ] Zero `style={{}}` inline styles in route files
- [ ] Zero `<div>` elements used for layout (only for non-layout purposes)
- [ ] All 41 unit tests pass
- [ ] All e2e browser tests pass
- [ ] Production build succeeds
- [ ] Dark mode works via Astryx Theme component
- [ ] App looks visually consistent with Astryx design language
