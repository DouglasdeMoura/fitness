# PRD: Workout Tracking Module

## Overview

Workout logging system with exercise library, set/rep/RPE tracking, volume calculation, and progressive overload analysis.

## User Stories

1. As a user, I can start a workout session
2. As a user, I can select exercises from a categorized library
3. As a user, I can log sets with weight, reps, and RPE
4. As a user, I can see total training volume per session
5. As a user, I can see estimated 1RM for my best set
6. As a user, I can view past workout sessions
7. As a user, I get RPE guidance (RIR conversion) during logging

## Science-Backed Features

### 1RM Estimation (Epley Equation)
```
1RM = weight × (1 + reps/30)
```
Reference: Epley B. "Weight Training." Encyclopedia of Sports Medicine. 1985

### RPE to RIR Conversion
| RPE | RIR | Interpretation |
|-----|-----|----------------|
| 6 | 4 | Very easy, warm-up weight |
| 7 | 3 | Moderate, 3 reps left |
| 8 | 2 | Hard, 2 reps left |
| 9 | 1 | Very hard, 1 rep left |
| 10 | 0 | Max effort, no reps left |

For hypertrophy: target RPE 7-9 (Zourdos et al. 2016)

### Volume Calculation
```
Volume = sets × reps × weight
```
Primary driver of hypertrophy (Schoenfeld et al. 2017)

### Progressive Overload Suggestions
- RPE ≤ 7 with extra reps → increase weight 2.5%
- RPE ≥ 9 with missed reps → maintain weight
- RPE 7-9 at target reps → add 1 rep before increasing weight

## Exercise Library Categories
- **Compound:** Bench Press, Squat, Deadlift, OHP, Rows
- **Isolation:** Biceps Curl, Triceps Pushdown, Lateral Raise
- **Bodyweight:** Push-up, Pull-up, Plank, Burpee
- **Legs:** Front Squat, RDL, Bulgarian Split Squat
- **Core:** Hanging Leg Raise, Cable Crunch

## Data Model

```
exercises:
  - id, name, category, muscle_group, equipment, instructions

workout_sessions:
  - id, user_id, date, name, duration_minutes, notes

workout_sets:
  - id, session_id, exercise_id, set_number
  - reps, weight_kg, rpe, rest_seconds
```

## Acceptance Criteria

- [x] Exercise library covers all major muscle groups
- [x] Set logging includes weight, reps, and RPE
- [x] Session volume is calculated and displayed
- [x] Estimated 1RM shown for best set
- [x] RPE guidance is displayed during logging
- [x] Past sessions are viewable
