---
title: "How Much Training Volume Do You Need?"
description: "Schoenfeld's dose-response research on weekly sets for hypertrophy — and how FitTrack tracks volume per muscle group."
date: "2026-07-26"
tags: ["training", "volume", "hypertrophy"]
readingTime: 6
---

# Sets, reps, and the hypertrophy dose-response

"How many sets should I do?" is one of the most common training questions. The answer is not a universal magic number — it is a **dose-response relationship** between weekly volume and muscle growth, modulated by training experience and recovery capacity.

FitTrack encodes this research in weekly volume guidelines on the [workout](/workout) and [progress](/progress) screens.

## What the research shows

### Weekly set volume (Schoenfeld et al., 2017)

Schoenfeld BJ, Ogborn D, Krieger JW (2017) meta-analysed the relationship between weekly resistance-training set volume and hypertrophy. Key conclusions:

- **Higher weekly sets per muscle group produced greater muscle growth** in the pooled data, with a graded dose-response.
- Very low volumes (fewer than ~5 sets per week per muscle) under-stimulated growth for most participants.
- Benefits continued to increase through moderate volumes; extremely high volumes showed diminishing returns and elevated fatigue risk in practice.

FitTrack's per-muscle guidelines (for example, chest 8–16 sets/week, legs 10–20 sets/week) sit inside the effective range identified by this literature.

### Training frequency (Schoenfeld et al., 2019)

Schoenfeld BJ, Grgic J, Krieger JW (2019) examined training frequency — how often each muscle is trained per week. When weekly volume was equated, **training each muscle group twice per week** produced superior hypertrophy compared with once per week.

That is why FitTrack's `recommendWeeklyVolume` logic distributes sets across multiple exposures when your program frequency is two or more days per week.

### Per-session set doses (Radaelli et al., 2023)

Radaelli R, Fleck SJ, Leite T, et al. (2023) compared 1, 3, and 5 sets per exercise in trained men. More sets per session produced greater elbow-flexor hypertrophy, reinforcing that volume — not a single "best" set count — drives adaptation.

## How FitTrack calculates volume

**Volume load** for a set = weight × reps. Session volume sums every logged set. Weekly volume groups sets by muscle based on your program's exercise assignments.

When you train a muscle **twice per week**, FitTrack targets the midpoint of each muscle group's guideline range. When you train **once per week**, it biases toward the upper bound because each session must deliver more stimulus.

Log sessions on [workout](/workout) and review trends on [progress](/progress) to see whether you are inside, below, or above the evidence-based band.

## Pairing volume with effort

Volume only works when sets are sufficiently challenging. Combine weekly set targets with **RIR 1–3** on most working sets — see [Progressive Overload: RPE, RIR, and Volume Tracking](/blog/progressive-overload-guide).

Nutrition supports the recovery those sets demand. Morton et al. (2018) established protein targets that protect and build lean tissue; read [How Much Protein Do You Really Need?](/blog/protein-for-hypertrophy).

## Practical guidelines

1. **Start near the lower bound** of FitTrack's range if you are newer to training, then add sets when recovery stays solid.
2. **Increase one variable at a time** — add a weekly set before adding load and reps simultaneously.
3. **Track weekly totals**, not single heroic sessions. Hypertrophy responds to sustained volume.
4. **Use [progress](/progress)** to confirm that volume increases correlate with strength trends, not just soreness.

## References

- Schoenfeld BJ, Ogborn D, Krieger JW (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. *Journal of Strength and Conditioning Research*, 31(12), 3508–3523.
- Schoenfeld BJ, Grgic J, Krieger JW (2019). How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis of studies examining the effects of resistance training frequency. *Sports Medicine*, 49(7), 1283–1292.
- Radaelli R, Fleck SJ, Leite T, et al. (2023). Dose-response of 1, 3, and 5 sets of resistance exercise on elbow flexors in trained men. *European Journal of Applied Physiology*, 123, 1985–1996.

## Related reading

- [Progressive Overload: RPE, RIR, and Volume Tracking](/blog/progressive-overload-guide)
- [How Much Protein Do You Really Need?](/blog/protein-for-hypertrophy)
