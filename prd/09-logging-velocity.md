# PRD: Logging Velocity

## Overview

Make logging so fast it stops being a decision. Every feature here is measured in
one unit: **taps to log a thing you have logged before.**

## Problem

People abandon fitness trackers because logging is tedious, not because the
design is imperfect. Today FitTrack has no mechanism that exploits repetition,
even though repetition is the dominant pattern in real eating:

| Capability | Status |
|---|---|
| Recent foods | absent |
| Frequent foods | absent |
| Copy yesterday / copy a meal | absent |
| One-tap logging from a saved template | absent (editor exists, not wired) |
| Barcode scan | absent |
| Quick-add raw calories | absent |

Logging a breakfast you eat every single day currently costs the same as logging
a food you have never eaten: open nutrition, focus search, type a query, wait for
the debounce, read results, pick the food, set servings, pick meal type, submit.

The meal-template editor at `src/routes/nutrition/templates/` is fully built and
earns nothing, because no path turns a template into a log entry.

## Goal

| Metric | Today | Target |
|---|---|---|
| Taps to log a repeated meal | ~8 | ≤ 2 |
| Taps to log a full repeated day | ~30 | ≤ 2 |
| Taps to log a packaged food by barcode | ~8 + typing | ≤ 3 |
| Time to log a repeat breakfast | ~25 s | < 5 s |

Non-goal: reducing taps for a genuinely *new* food. Search is the right tool
there and it already performs (<100ms per PRD 01).

## Why this is the highest-leverage work

Self-monitoring adherence — not tracking accuracy — is what predicts outcomes.
Burke LE et al. (J Am Diet Assoc. 2011) found consistency of self-monitoring was
the strongest behavioural predictor of weight-loss success across 22 studies.
Every tap removed is adherence bought.

---

## Batch 1: Recent and Frequent Foods

**Goal**: the food you are about to log is already on screen.

- Add a `getRecentFoods` server function: distinct foods from `food_log` for the
  current user, ordered by `MAX(date)` desc, limit 20.
- Add a `getFrequentFoods` server function: distinct foods ordered by
  `COUNT(*)` desc over the last 90 days, limit 20.
- Derive both from `food_log` with SQL aggregation. Do **not** add a
  denormalised `last_logged_at` column — the query is cheap at personal-log
  scale and a cached column is one more thing to invalidate.
- Nutrition page: when the search field is empty, show a **Recent** section
  instead of nothing. This replaces the current empty-search dead space.
- When a search *is* active, boost previously-logged foods to the top of the
  result list and mark them with a subtle `Badge` ("logged 12×").
- Each row logs with one tap using the **last servings and meal type used for
  that food**, which is right far more often than defaulting to 1 serving.

Files: `src/lib/api.ts`, `src/lib/food-search.ts`,
`src/components/nutrition/AddFoodCard.tsx`

## Batch 2: Copy Yesterday, Copy a Meal

**Goal**: repetition costs one tap.

- `copyMealFromDate({ fromDate, toDate, mealType })` — clone every entry of one
  meal to another date.
- `copyDayFromDate({ fromDate, toDate })` — clone a whole day.
- Nutrition page, per meal section: a "Copy from yesterday" action, shown **only
  when that meal is empty and yesterday's same meal was not** — an action that
  cannot do anything should not occupy space.
- Day-level "Copy yesterday" in the nutrition page header, same conditional rule.
- Copying is a single mutation writing N rows in one transaction, and must route
  through `runOrQueue` so it works offline like every other mutation.
- Undo: show a Toast with an "Undo" action that deletes the created entries.
  Copying 14 rows by mistake must not require 14 deletions.

Files: `src/lib/api.ts`, `src/routes/nutrition/index.tsx`,
`src/components/nutrition/FoodLogCard.tsx`

## Batch 3: One-Tap Template Logging

**Goal**: connect the asset that already exists.

- `logMealTemplate({ templateId, date, mealType })` — expand a template's items
  into `food_log` rows in one transaction.
- Template list and template detail both get a "Log this" primary action.
- Nutrition page: a "Log a saved meal" entry point per meal section, showing
  templates whose `default_meal_type` matches that section first.
- After logging, Toast confirms with the total kcal added and an Undo action.

Files: `src/lib/api.ts`, `src/routes/nutrition/templates/index.tsx`,
`src/routes/nutrition/templates/$templateId.tsx`, `src/routes/nutrition/index.tsx`

## Batch 4: Quick Add

**Goal**: never let "I don't know the exact food" become "I didn't log."

- A "Quick add" action per meal: calories required, protein/carbs/fat optional.
- Writes a `food_log` row with a null `food_id` and a user-supplied label, so
  quick entries still count toward daily totals and macro progress.
- Requires a nullable `food_id` and a `label` column on `food_log` — see the
  migration note below.
- Display quick entries in the log with a distinguishing `Badge` so they are
  visibly less precise than database foods.

Rationale: an approximate logged meal is worth vastly more than a skipped one.
A tracker that punishes uncertainty trains people to stop opening it.

Files: `src/lib/api.ts`, `src/lib/db.ts`, `src/components/nutrition/FoodLogCard.tsx`

## Batch 5: Barcode Scanner

**Goal**: packaged food in three taps.

- Use the `BarcodeDetector` API where available; fall back to a manual barcode
  entry field where it is not (notably iOS Safari, which lacks it).
- Camera access via `navigator.mediaDevices.getUserMedia`, requested **only**
  when the user taps "Scan" — never on page load.
- Match the scanned GTIN against a new `foods.barcode` column.
- On a miss, offer "Add this food" pre-filled with the barcode, so a miss grows
  the database instead of dead-ending.
- Requires HTTPS, which the PWA already needs; document the localhost exception
  for development.

This is the one batch with a hard external dependency: without a barcode-to-food
dataset, matching only works for foods the user has already entered once. Ship
the scan-and-remember loop first and treat an external food database as a
separate decision.

Files: `src/lib/db.ts`, `src/lib/api.ts`,
`src/components/nutrition/BarcodeScanner.tsx` (new)

---

## Data Model Changes

```sql
-- Batch 4: quick-add entries have no catalogue food
ALTER TABLE food_log ADD COLUMN label TEXT;          -- user label for quick adds
-- food_log.food_id must become nullable

-- Batch 5: barcode lookup
ALTER TABLE foods ADD COLUMN barcode TEXT;
CREATE INDEX idx_foods_barcode ON foods(barcode);

-- Batch 1: recency and frequency queries
CREATE INDEX idx_food_log_user_date ON food_log(user_id, date DESC);
```

Sequencing note: PRD 07 migrates the data layer to Drizzle (issues #37–#41). If
those land first, express these changes as Drizzle schema edits plus generated
migrations rather than raw `ALTER TABLE`. If this PRD lands first, the Drizzle
migration must carry them forward. Do not do both.

## Acceptance Criteria

- [ ] Empty food search shows Recent foods, not empty space
- [ ] Previously-logged foods rank above never-logged foods in search results
- [ ] One tap re-logs a recent food with its last-used servings and meal type
- [ ] "Copy yesterday" exists at both meal and day level, and is hidden when it
      would be a no-op
- [ ] Every copy and template log offers Undo via Toast
- [ ] Saved meal templates can be logged without opening the editor
- [ ] Quick-add accepts calories alone and still updates macro progress
- [ ] Barcode scan resolves known foods and offers creation for unknown ones
- [ ] Barcode entry has a manual fallback where `BarcodeDetector` is unavailable
- [ ] Camera permission is requested on tap, never on load
- [ ] All copy/template/quick-add mutations work offline via `runOrQueue`
- [ ] Taps to log a repeated meal measured at ≤ 2 in an e2e test
- [ ] `npm run test:unit` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run build` passes

## References

- Burke LE, Wang J, Sevick MA. "Self-monitoring in weight loss: a systematic
  review." J Am Diet Assoc. 2011;111(1):92-102.
- Harkin B et al. "Does monitoring goal progress promote goal attainment?"
  Psychol Bull. 2016;142(2):198-229.
