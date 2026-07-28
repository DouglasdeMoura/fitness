---
title: "How FitTrack Calculates Your BMR and TDEE"
description: "Why FitTrack uses the Mifflin-St Jeor equation for resting metabolic rate, how activity multipliers yield TDEE, and where those numbers appear in the app."
date: "2026-07-25"
tags: ["nutrition", "bmr", "tdee", "calories"]
readingTime: 6
---

# From resting metabolism to daily calories

Every macro target in FitTrack starts with two numbers: your **basal metabolic rate (BMR)** — calories burned at complete rest — and your **total daily energy expenditure (TDEE)** — BMR adjusted for movement. Get these wrong and even perfect food logging misses the mark.

FitTrack uses the **Mifflin-St Jeor equation** (Mifflin et al., 1990), validated as the most accurate common predictive formula (Frankenfield et al., 2005). Update your profile in [settings](/settings) and the app recalculates automatically.

## The Mifflin-St Jeor equation

Mifflin MD, St Jeor ST, Hill LA, et al. (1990) published a predictive equation in the *American Journal of Clinical Nutrition* derived from 498 healthy subjects. For weight in kilograms (W), height in centimeters (H), and age in years (A):

**Men:** BMR = 10W + 6.25H − 5A + 5  
**Women:** BMR = 10W + 6.25H − 5A − 161

Frankenfield DC, Roth-Yousey L, Compher C (2005) compared predictive equations in a clinical review and concluded Mifflin-St Jeor was **more accurate than the older Harris-Benedict equation** across diverse populations — which is why FitTrack adopted it.

### Example

A 30-year-old woman weighing 68 kg and 165 cm tall:

BMR = (10 × 68) + (6.25 × 165) − (5 × 30) − 161 ≈ **1,420 kcal/day**

That is energy for breathing, circulation, and cellular maintenance — not training, walking, or digestion.

## From BMR to TDEE

TDEE multiplies BMR by an activity factor. FitTrack offers five levels matching standard physical-activity categories:

| Activity level | Multiplier | Typical pattern |
|----------------|------------|-----------------|
| Sedentary | 1.20 | Desk job, little exercise |
| Lightly active | 1.375 | 1–3 training days per week |
| Moderately active | 1.55 | 3–5 training days per week |
| Very active | 1.725 | 6–7 training days per week |
| Extra active | 1.90 | Physical job plus training |

Continuing the example at **moderately active**:

TDEE ≈ 1,420 × 1.55 ≈ **2,201 kcal/day**

That TDEE becomes the anchor for calorie targets. Muscle-building goals add a modest surplus; fat-loss goals apply a controlled deficit — details in [Macros 101](/blog/macros-101).

## Limitations every equation shares

Predictive equations estimate population averages. Individual metabolism varies with lean mass, genetics, sleep, and diet history. Treat TDEE as a **starting hypothesis**, then adjust based on weekly trends on [progress](/progress).

Indirect calorimetry remains the laboratory gold standard (Frankenfield et al., 2005), but it is impractical for daily tracking. Mifflin-St Jeor balances accuracy and usability.

## Where you see these numbers in FitTrack

1. **[Settings](/settings)** — Enter sex, height, weight, birth date, activity level, and goal. FitTrack computes BMR and TDEE on save.
2. **[Nutrition](/nutrition)** — Daily calorie and macro targets derive from TDEE and goal adjustments.
3. **[Dashboard](/dashboard)** — Calorie progress bars compare intake against the computed target.

Protein grams within those targets follow Morton et al. (2018); see [How Much Protein Do You Really Need?](/blog/protein-for-hypertrophy).

## References

- Mifflin MD, St Jeor ST, Hill LA, et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals. *American Journal of Clinical Nutrition*, 51(2), 241–247.
- Frankenfield DC, Roth-Yousey L, Compher C (2005). Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults. *Journal of the American Dietetic Association*, 105(5), 775–789.

## Related reading

- [Macros 101: Protein, Carbs, and Fat Explained](/blog/macros-101)
- [How Much Protein Do You Really Need?](/blog/protein-for-hypertrophy)
