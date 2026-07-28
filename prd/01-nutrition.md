# PRD: Nutrition Tracking Module

## Overview

Comprehensive nutrition tracking system with a food database, daily logging, and science-backed macro calculations.

## User Stories

1. As a user, I can search a database of common foods by name
2. As a user, I can log food entries with serving sizes and meal types
3. As a user, I can see my daily calorie and macro consumption vs targets
4. As a user, I can add custom foods with full macro information
5. As a user, I can view my food log for any past date
6. As a user, I can delete incorrectly logged entries

## Science-Backed Calculations

### Calorie Targets

- **Surplus (build muscle):** TDEE + 10%
- **Deficit (lose fat):** TDEE - 20%
- **Maintenance:** TDEE
- **Recomp:** TDEE (high protein)

### Macro Distribution

- **Protein:** Goal-dependent (1.6-2.4 g/kg bodyweight)
- **Fat:** 0.8-1.2 g/kg (endocrine health minimum)
- **Carbs:** Remaining calories (primary fuel for training)

### Fiber

- 14g per 1000 kcal (USDA Dietary Guidelines)

## Data Model

```
foods:
  - id, name, brand, serving_size, serving_unit
  - calories_per_serving, protein_g, carbs_g, fat_g
  - fiber_g, sugar_g, sodium_mg, source

food_log:
  - id, user_id, food_id, date, meal_type
  - servings, calories, protein_g, carbs_g, fat_g
```

## Acceptance Criteria

- [x] Food search returns results in <100ms
- [x] Daily summary shows consumed vs target for all macros
- [x] Progress bars visualize macro completion
- [x] Food log persists across sessions (SQLite)
- [x] Default meal type auto-detected by time of day
