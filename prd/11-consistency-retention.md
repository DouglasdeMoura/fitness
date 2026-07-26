# PRD: Consistency and Retention

## Overview

Give the user a reason to open the app tomorrow. Everything shipped so far
rewards the user *while* they are in the app; nothing brings them back.

## Problem

FitTrack has no retention mechanism of any kind:

| Capability | Status |
|---|---|
| Streaks / consistency tracking | absent |
| Weekly review moment | absent |
| Push notifications | absent (PRD 00 Phase 4, unscheduled) |
| Reminders | absent |

PRD 06 Batch 4 mentions a "streak count" as one bullet inside a Highlights card.
That is a *display* of a streak that no system computes.

This matters more than any remaining polish item. Consistency of self-monitoring
is the strongest behavioural predictor of outcome (Burke 2011); an app that does
not defend consistency is not doing the one thing that most affects results.

## Design stance: consistency, not perfection

A naive streak punishes a single missed day by resetting to zero, which reliably
produces abandonment — the user who breaks a 40-day streak often stops entirely.
So:

- Headline metric is **adherence percentage over a rolling 7 and 28 days**, not a
  fragile consecutive count.
- A consecutive-day streak is shown as a secondary, encouraging stat.
- A missed day is never rendered in an alarming colour. No red, no "you failed."
- One "rest day" per week does not break a workout streak — training programs
  prescribe rest, so the app must not punish adherence to them.

This is a deliberate departure from the streak mechanics most trackers use, and
it follows directly from PRD 06's principle: *"Helpful guidance, never error
messages that blame the user."*

---

## Batch 1: Consistency Engine

**Goal**: compute adherence honestly and cheaply.

- New `src/lib/consistency.ts` with pure functions:
  - `logAdherence(dates, windowDays)` → percentage of days with ≥1 food entry
  - `workoutAdherence(sessions, windowDays, restDaysAllowed)` → percentage of
    expected training days met
  - `currentStreak(dates, graceDays)` → consecutive days, tolerating a grace
    allowance
  - `longestStreak(dates)`
- All functions take arrays and return numbers. No database access, no `Date.now()`
  inside — the current date is a parameter, so the tests are deterministic and
  repeatable (AGENTS.md: F.I.R.S.T).
- Server function `getConsistency({ asOf })` assembles the inputs.
- Dashboard shows a compact consistency card: 7-day and 28-day adherence, current
  streak, longest streak.

Files: `src/lib/consistency.ts` (new), `src/lib/api.ts`, `src/routes/index.tsx`

## Batch 2: Weekly Review

**Goal**: a recurring moment worth returning for.

- A `/review` route showing the last complete week:
  - Nutrition adherence and average daily calories versus target
  - Total training volume and set count, versus the prior week
  - Weight trend (7-day moving average delta)
  - PRs hit that week (from PRD 10 Batch 3)
  - One generated headline sentence, e.g.
    `"You hit your protein target 6 of 7 days and added 8% training volume."`
- Headline generation is a pure function over the week's numbers with an ordered
  rule set — pick the single most notable true fact. Fully unit-testable, no
  model calls.
- Reachable from the dashboard whenever a complete week of data exists.
- Never fabricate positivity. If the week was poor, say something true and
  neutral: `"A lighter week — 3 sessions logged."` A tracker that praises
  everything is a tracker nobody believes.

Files: `src/lib/weekly-review.ts` (new), `src/routes/review/index.tsx` (new),
`src/lib/api.ts`

## Batch 3: Web Push Notifications

**Goal**: the app can reach the user on their phone.

This is the batch that makes the installed PWA meaningfully different from a
bookmark, and it depends on PRD 12's install correctness landing first.

- Extend `public/sw.js` with `push` and `notificationclick` handlers.
- Generate a VAPID keypair; private key in server env, public key served to the
  client. Never commit either.
- New `push_subscriptions` table: `user_id`, `endpoint`, `p256dh`, `auth`,
  `created_at`. Endpoint is unique.
- Permission is requested **only** after an explicit user action in Settings —
  never on page load. An unprompted permission dialog is how an app gets
  permanently blocked.
- Notification types, each independently toggleable in Settings:
  - Rest timer complete (PRD 10 Batch 2)
  - Meal reminder at user-chosen times
  - Workout reminder on user-chosen days
  - Weekly review ready
- All default to **off**. The user opts in per type.
- Delivery for scheduled types needs a server-side scheduler. **This does not
  exist yet and is split into its own issue.** `@platformatic/job-queue` is named
  in PRD 00's stack table but is not installed, and recurring delivery needs a
  long-running process — whether one exists depends on the deployment target,
  which is not yet decided. See "Scheduling: undecided" below.
- Only user-triggered notifications (the test notification, and the rest timer
  from PRD 10 Batch 2) are buildable without that decision.
- Prune subscriptions on a `410 Gone` response from the push service.
- iOS note: Web Push requires the PWA to be installed to the home screen
  (iOS 16.4+). Detect and explain rather than silently failing — if
  `Notification.permission` cannot be requested, show install guidance instead.

Files: `public/sw.js`, `src/lib/push.ts` (new), `src/lib/db.ts`, `src/lib/api.ts`,
`src/routes/settings/index.tsx`

## Batch 4: Reminder Preferences

**Goal**: notifications the user chose, at times they chose.

- Settings section "Reminders": per-type toggles plus time and day pickers.
- New `notification_preferences` table keyed by user.
- Quiet hours: a start/end window in which nothing is sent.
- A "Send test notification" button — the only way a user can trust the feature
  is to see it work once.

Files: `src/lib/db.ts`, `src/lib/api.ts`, `src/routes/settings/index.tsx`

---

## Data Model Changes

```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  rest_timer INTEGER NOT NULL DEFAULT 0,
  meal_reminders INTEGER NOT NULL DEFAULT 0,
  meal_times TEXT,                    -- JSON array of HH:MM
  workout_reminders INTEGER NOT NULL DEFAULT 0,
  workout_days TEXT,                  -- JSON array of weekday numbers
  weekly_review INTEGER NOT NULL DEFAULT 0,
  quiet_start TEXT,
  quiet_end TEXT
);
```

Scheduled delivery additionally needs a `notification_deliveries` table with a
unique key on `(user_id, type, slot)` — without it an overlapping or retried
scheduler run delivers the same reminder twice, which is the fastest way to get
notifications permanently disabled by the user.

Depends on `users` existing per-user, which is PRD 08 / issues #42–#44. Until
those land, use the existing `ensureDefaultUser()` pattern; #44 carries it
forward. Sequencing rule from PRD 09 applies: if Drizzle (PRD 07) lands first,
express as schema edits.

## Scheduling: undecided

Recurring delivery needs a runtime this project does not have. The options and
their trade-offs are recorded in the scheduled-delivery issue, and the chosen
one must be written back into this PRD as part of that change. Summary:

| Option | Fits when | Cost |
|---|---|---|
| In-process interval in the Nitro server | one always-on instance | trivial; breaks on scale-to-zero, double-fires with >1 instance |
| `@platformatic/job-queue` on the SQLite DB | always-on, want retries | one dependency; matches the stack table |
| External cron → authenticated endpoint | serverless or unknown hosting | needs a shared secret and an idempotency guard |

Default to the external cron endpoint while the deployment target is unknown: it
works everywhere, and an in-process timer can call the same endpoint later.

## Acceptance Criteria

All criteria are machine-verifiable — this PRD is built entirely by the
autonomous loop.

- [ ] Consistency functions are pure, take the current date as a parameter, and
      have unit tests covering empty history, single day, gaps, and grace days
- [ ] Dashboard shows 7-day and 28-day adherence plus current and longest streak
- [ ] A missed day never renders in an error/red tone (asserted in e2e by
      checking the computed colour is not the error token)
- [ ] One rest day per week does not break the workout streak (unit test)
- [ ] `/review` renders adherence, volume delta, weight trend, and PRs
- [ ] Weekly headline generation is a pure function with unit tests, including a
      poor-week case that produces a neutral — not falsely positive — sentence
- [ ] Service worker handles `push` and `notificationclick`
- [ ] Notification permission is never requested on load, verified by an e2e test
      asserting no permission prompt occurs before an explicit Settings action
- [ ] All notification types default to off
- [ ] Subscriptions are deleted on a `410` response (unit test with a fake push
      client — a named fake class, not an inline stub)
- [ ] Quiet hours suppress delivery (unit test)
- [ ] Test notification button delivers to a subscribed client
- [ ] Where Web Push is unavailable, install guidance renders instead of a failure
- [ ] `npm run test:unit` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run build` passes

## References

- Burke LE, Wang J, Sevick MA. "Self-monitoring in weight loss: a systematic
  review." J Am Diet Assoc. 2011;111(1):92-102.
- Harkin B et al. "Does monitoring goal progress promote goal attainment?"
  Psychol Bull. 2016;142(2):198-229.
- Schoenfeld BJ et al. "Effects of resistance training frequency on measures of
  muscle hypertrophy." Sports Med. 2016;46(11):1689-1697. (rest-day rationale)
