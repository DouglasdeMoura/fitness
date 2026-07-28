---
title: "Macros 101: Protein, Carbs, and Fat Explained"
description: "How FitTrack sets protein, carbohydrate, and fat targets from your TDEE — with citations for every gram."
date: "2026-07-24"
tags: ["nutrition", "macros", "protein", "calories"]
readingTime: 5
---

# The three macros that power your training

**Macronutrients** — protein, carbohydrates, and fat — supply the calories that fuel training and recovery. FitTrack does not hand you arbitrary percentages. It calculates each macro from your body weight, energy needs, and goal, then displays progress on [nutrition](/nutrition) and [dashboard](/dashboard).

This primer explains the logic behind those numbers and where to learn more.

## Calories: the foundation

A calorie is a unit of energy. Food labels and FitTrack use **kilocalories (kcal)**, often written as "Calories."

Energy content follows Atwater general factors codified in food labeling (Atwater WO, USDA Farmers' Bulletin No. 142, 1902; adopted in NLEA/FDA rules):

| Macro | Energy density |
|-------|----------------|
| Protein | 4 kcal/g |
| Carbohydrate | 4 kcal/g |
| Fat | 9 kcal/g |

Your daily calorie target starts from **TDEE** — see [How FitTrack Calculates Your BMR and TDEE](/blog/mifflin-st-jeor-bmr). Goals adjust that anchor:

- **Build muscle** — modest surplus (~10% above TDEE)
- **Lose fat** — controlled deficit (~20% below TDEE)
- **Recomposition / maintain** — at or near TDEE

## Protein: structure and recovery

Protein provides amino acids for muscle repair and growth. Morton RW, Murphy KT, McKellar SR, et al. (2018) meta-analysed protein supplementation during resistance training and found a dose-response plateau near **1.62 g/kg/day** for hypertrophy in healthy adults.

FitTrack sets protein per kilogram of body weight by goal — from ~1.6 g/kg when maintaining to ~2.4 g/kg during aggressive fat loss (Helms et al., 2014). Deep dive: [How Much Protein Do You Really Need?](/blog/protein-for-hypertrophy).

## Fat: hormones and essentials

Dietary fat supports hormone production and fat-soluble vitamin absorption. FitTrack targets roughly **0.8–1.0 g/kg** depending on goal — enough for endocrine health without crowding out protein and carbs.

Fat grams are set after protein; remaining calories are not "leftover" fat — they are allocated deliberately before carbs fill the gap.

## Carbohydrates: training fuel

After protein and fat are set, **carbohydrates receive the remaining calories**:

carbs (g) = (calorie target − protein kcal − fat kcal) ÷ 4

Carbs fuel high-intensity resistance training and replenish glycogen. On [nutrition](/nutrition), carb progress bars show intake versus target alongside protein and fat.

Fiber is estimated at ~14 g per 1,000 kcal following USDA dietary guidance — a practical default for digestive health.

## Reading your macro dashboard

1. **[Settings](/settings)** — Confirm profile data (weight, activity, goal).
2. **[Dashboard](/dashboard)** — Hero calorie bar plus protein, carb, and fat progress.
3. **[Nutrition](/nutrition)** — Meal-level logging against the same targets.

Targets update when you change weight or goal. Re-weigh periodically on [progress](/progress) so macros stay aligned with your current mass.

## Quick reference

| Macro | Primary role | FitTrack anchor |
|-------|--------------|-----------------|
| Protein | Muscle repair, satiety | Morton et al. (2018); Helms et al. (2014) in deficit |
| Fat | Hormones, essential fatty acids | ~0.8–1.0 g/kg body weight |
| Carbs | Training performance, glycogen | Remaining calories after protein and fat |

## References

- Morton RW, Murphy KT, McKellar SR, et al. (2018). A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults. *British Journal of Sports Medicine*, 52(6), 376–384.
- Helms ER, Aragon AA, Fitschen PJ (2014). Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. *Journal of the International Society of Sports Nutrition*, 11, 20.
- Atwater WO (1902). *Principles of Nutrition and Nutritive Value of Food*. USDA Farmers' Bulletin No. 142.

## Related reading

- [How Much Protein Do You Really Need?](/blog/protein-for-hypertrophy)
- [How FitTrack Calculates Your BMR and TDEE](/blog/mifflin-st-jeor-bmr)
