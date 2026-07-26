# PRD: The Training Loop

## Overview

Turn the workout page from a logbook into a training tool: it should tell you
what to beat, time your rest, and confirm you improved.

## Problem

The science is already implemented and only half-connected.

`src/lib/workout.ts` exports `suggestWeightProgression()` implementing the PRD 02
progression rules (RPE ≤ 7 with extra reps → +2.5%, RPE ≥ 9 with missed reps →
hold, RPE 7-9 at target → add a rep first). It is rendered at exactly one place,
`src/routes/workout/index.tsx:296`, inside the **structured program** flow.

The free-form session path — the default, and the one most sessions use — shows
none of it. No last-session context, no suggested load, no progression note. A
user lifting without a program gets a blank set form and has to remember what
they did last Tuesday.

Also absent entirely:

| Capability | Status |
|---|---|
| Rest timer | absent |
| Last-time context on free-form sets | absent |
| PR detection | absent |
| Session summary on finish | absent |

## Goal

The user should never have to remember or calculate anything mid-session. The
app knows what they lifted last time, what to try now, how long to rest, and
whether they just hit a personal record.

---

## Batch 1: Last-Time Context on Free-Form Sets

**Goal**: surface the progression engine that already exists on the default path.

- Add `getLastPerformance({ exerciseId })`: the most recent set for that exercise
  before the current session, returning weight, reps, RPE, and date.
- When an exercise is selected in a free-form session, show inline:
  `Last time: 100 kg × 8 @ RPE 8 (12 days ago)`
- Call the existing `suggestWeightProgression()` with that performance and render
  the suggested load plus its note. Do not reimplement the maths — reuse the
  function and extend its tests.
- Pre-fill the weight and reps inputs with the suggestion. Pre-filling is the
  point: a suggestion the user must retype is not a suggestion.
- Show a plain-language reason (`"+2.5% — last set felt easy at RPE 7"`) so the
  number is never unexplained.
- When there is no history, keep the existing copy: "Select a weight that reaches
  the target RPE for all prescribed sets."

Files: `src/lib/api.ts`, `src/lib/workout.ts`, `src/routes/workout/index.tsx`

## Batch 2: Rest Timer

**Goal**: the reason the app stays open between sets.

- Start automatically when a set is logged. Manual start/stop/reset also available.
- Auto-suggest duration from the logged RPE, per de Salles et al. (2009) and
  Schoenfeld et al. (2016):

| RPE logged | Suggested rest | Basis |
|---|---|---|
| 6-7 | 2 min | Submaximal; shorter rest sufficient |
| 8 | 2.5 min | Approaching failure |
| 9-10 | 3 min | Longer rest preserves subsequent volume |

- Display as a prominent countdown that survives navigation within the app.
- Timer state lives in the URL search params or a small store — **not** in a
  `useState` that a route change destroys mid-rest.
- Fire a notification when rest completes (see PRD 11 Batch 3 for Web Push; until
  that lands, use an in-page Toast plus an optional audio cue).
- Respect `prefers-reduced-motion` for any countdown animation.
- The timer must keep counting correctly when the screen sleeps: store the target
  end timestamp and derive remaining time from the clock, never decrement a
  counter on an interval.

Files: `src/lib/rest-timer.ts` (new), `src/components/workout/RestTimer.tsx` (new),
`src/routes/workout/index.tsx`

## Batch 3: PR Detection

**Goal**: make improvement impossible to miss.

- Add `src/lib/records.ts` with pure functions detecting three record types
  against a user's set history:
  - **Estimated 1RM PR** — via the existing Epley `estimate1RM()`
  - **Rep PR** — most reps at a given weight or heavier
  - **Volume PR** — highest single-session volume for that exercise
- Detect on set submission; surface immediately as a Toast with the record type
  and the previous best it beat.
- Mark PR sets in the session view and in history with a `Badge`.
- Keep detection pure and fully unit-tested: given a set list and a new set,
  return which records it breaks. No database access inside the detection logic —
  pass history in as a parameter (AGENTS.md: inject dependencies).

Files: `src/lib/records.ts` (new), `src/lib/api.ts`, `src/routes/workout/index.tsx`

## Batch 4: Session Summary on Finish

**Goal**: end the session with a result, not a navigation.

- "Finish workout" opens a summary showing: total volume, set count, exercise
  count, duration, PRs hit, and volume versus the previous session of the same
  name.
- One comparison sentence: `"1,240 kg total — 8% more than last chest day."`
- Persist `duration_minutes` on `workout_sessions` (the column exists in the PRD
  02 data model; populate it from session start to finish).
- Summary is reachable again later from workout history — a result worth showing
  once is worth showing twice.

Files: `src/lib/workout.ts`, `src/lib/api.ts`, `src/routes/workout/index.tsx`

---

## Data Model Changes

```sql
-- Batch 4: session duration is in the PRD 02 model but never written
-- (verify presence before adding; populate on finish)
-- workout_sessions.duration_minutes INTEGER

-- Batch 1 + 3: last-performance and record queries walk sets by exercise
CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id, id DESC);
```

Same sequencing rule as PRD 09: if PRD 07's Drizzle migration lands first,
express these as schema edits, not raw DDL.

## Acceptance Criteria

All criteria are machine-verifiable — this PRD is built entirely by the
autonomous loop.

- [ ] Selecting an exercise in a **free-form** session renders last-time weight,
      reps, RPE, and relative date
- [ ] Weight and reps inputs are pre-filled with the suggested progression
- [ ] The suggestion renders a plain-language reason string
- [ ] `suggestWeightProgression()` is reused, not reimplemented (asserted by unit
      test importing the existing symbol)
- [ ] Rest timer starts on set log and suggests duration from RPE per the table
- [ ] Rest timer derives remaining time from a target timestamp, verified by a
      unit test that advances a mocked clock past a simulated sleep
- [ ] Rest timer survives in-app navigation, verified by an e2e test that
      navigates away and back
- [ ] PR detection is pure, takes history as a parameter, and has unit tests for
      1RM, rep, and volume records including tie-breaking
- [ ] A PR set is badged in the session view
- [ ] Finish workout shows volume, sets, duration, PRs, and a comparison to the
      previous same-named session
- [ ] `duration_minutes` is populated on finish
- [ ] Countdown animation is suppressed under `prefers-reduced-motion`
- [ ] `npm run test:unit` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run build` passes

## References

- Epley B. "Weight Training." Encyclopedia of Sports Medicine. 1985. (1RM)
- Zourdos MC et al. "Novel resistance training-specific RPE scale measuring
  repetitions in reserve." J Strength Cond Res. 2016;30(1):267-275.
- de Salles BF et al. "Rest interval between sets in strength training."
  Sports Med. 2009;39(9):765-777.
- Schoenfeld BJ et al. "Longer interset rest periods enhance muscle strength and
  hypertrophy in resistance-trained men." J Strength Cond Res. 2016;30(7):1805-12.
- Schoenfeld BJ et al. "Dose-response relationship between weekly resistance
  training volume and increases in muscle mass." J Sports Sci. 2017;35(11):1073-82.
