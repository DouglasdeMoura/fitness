# PRD 20 — Persist the theme preference on the user's account

## Overview

The theme preference lives in `localStorage` only. It belongs to the device, not
the account: it does not follow a user to a second device, and clearing site data
destroys it. It should be a column on the user's settings row, defaulting to
`system`.

The cause is **not** a missing write — `persistTheme` (`src/lib/app-chrome.ts:95`)
writes reliably. The preference has simply never had a server-side home.

The part that makes this more than an `ALTER TABLE`: **the theme must be correct
in the first paint.** PRD 15 exists because of that flash, and
`tests/e2e/theme-flash-helpers.ts:26-32` asserts `color-scheme` is already right
at `domcontentloaded`. Today the inline bootstrap
(`src/routes/__root.tsx:41-62`) achieves that by reading `localStorage`
synchronously before paint. A database value is not available to that script. So
moving the source of truth to the server means the server must also render the
answer into the document — otherwise every signed-in user on a fresh device gets
a light first paint that flips to dark after hydration, which is precisely the
regression PRD 15 forbids.

The through-line: **the database becomes the source of truth, `localStorage`
becomes a pre-paint cache, and the server renders the answer when it knows it.**

## What was measured

Measured 2026-07-29 against a **production build** (`npm run build && npm run
start`, Playwright `chromium`, seeded `data/e2e-fittrack.db`), on `d2aa338`.

### The preference does not travel with the account

Two independent browser contexts (two devices), both signed into the **same**
seeded account. Device A chooses Dark:

| device | `data-theme` | `localStorage.fittrack-theme` |
| --- | --- | --- |
| A, after choosing Dark | `dark` | `"dark"` |
| B, same account | `light` | `null` |
| B, after reload | `light` | `null` |

### Clearing site data destroys it

| step | `data-theme` | stored |
| --- | --- | --- |
| preference set to dark | `dark` | `"dark"` |
| after `localStorage.removeItem` | `light` | `null` |

### The first-paint guarantee that must not regress

`color-scheme` on `<html>` at `domcontentloaded`, before hydration:

| stored | computed `colorScheme` at DCL |
| --- | --- |
| `dark` | `dark` |
| `light` | `light` |

This is what `captureThemeFlashFrames` asserts. Any design that resolves the
theme after hydration breaks it.

### Document TTFB baseline

The root route has **no loader** today — `createRootRoute`
(`src/routes/__root.tsx:75-108`) declares only a static `head` and
`shellComponent`. Reading a session and a database row during document render is
new work on every document request, including public pages. Baseline, 5 samples
each:

| route | samples (ms) | median |
| --- | --- | --- |
| `/` | 31, 36, 59, 60, 68 | 59 |
| `/dashboard` | 31, 32, 36, 37, 38 | 36 |
| `/settings` | 44, 45, 48, 53, 57 | 48 |

### Existing patterns this must follow

| concern | precedent |
| --- | --- |
| per-user preference table + defaults | `src/lib/notification-preferences.ts`, `src/db/notification-queries.ts` |
| app profile row | `users` (`src/db/schema.ts:39-68`), with `check()` constraints on enum columns |
| auth-scoped server fn | `getUser` / `updateUser` (`src/lib/api.ts:206-222`), both via `requireAuth()` |
| server-side session | `fetchServerSession` (`src/lib/route-auth.ts:28-33`) |
| migration journal completeness | `tests/unit/drizzle-migration.test.ts:141-145` (issue #89) |
| per-migration behaviour gate | `tests/unit/drizzle-migration.test.ts:147-170` |
| offline-tolerant mutation | `runOrQueue` (`src/lib/offline.ts:335`), used at `src/routes/settings/index.tsx:185` |

Note there are **two** user tables: `users` (`src/db/schema.ts:39`, the app
profile, integer `id`, already carries `activityLevel`, `goalType`, `sex`) and
`user` (`src/db/schema.ts:399`, better-auth, text `id`). The theme preference is
an app profile setting and belongs on `users`, which is what
`updateUserRecord` already writes.

## Problem 1 — The preference is device-scoped

Measured above: same account, second device, `stored: null` and a light page
while device A is dark. Clearing site data loses it outright. There is no column
anywhere to hold it.

## Problem 2 — A server-held value cannot reach the pre-paint script

`src/routes/__root.tsx:43` reads `localStorage` synchronously inside an inline
`<script>`. That script runs before paint and cannot await a database read. With
the database as source of truth and no server-side rendering of the answer, a
signed-in user on a fresh device paints light (empty cache) and flips after
hydration — a flash, on the exact path PRD 15 closed.

The root route has no loader to hang a session read on (measured), so this is a
structural addition, not a tweak.

## Problem 3 — Two writers, no precedence rule

Once the database holds the preference and `localStorage` holds a cache, a load
can present two different answers: a stale cache from before a change made on
another device, and the server's row. Nothing in the current design says which
wins. Left unstated, it resolves by accident of ordering — and the cache is read
first, so the stale one would win.

## Stance

The tempting shape is "add a column, write it on change, read it in a query" —
three small commits, and every one of them correct in isolation. It produces a
theme flash for exactly the users this feature is for: the ones arriving on a
second device, whose cache is empty and whose row says dark.

The flash is not a polish item to follow up. `tests/e2e/theme-flash.spec.ts` and
`tests/unit/theme-flash.test.ts` are gates, and PRD 15 exists because this
already went wrong once. So the server-render path and the cache-precedence rule
are part of the feature, not a sequel to it.

The counter-pressure is real and worth naming: a session lookup plus a database
read on every document request, on a root route that currently does neither, with
public pages paying for a value only signed-in users have. That is why the
budget is measured above and stated as a constraint below, and why the read must
be skipped when there is no session.

## Constraints

- No weakening of an existing gate to make a new one pass.
- `color-scheme` on `<html>` must still be correct at `domcontentloaded` for
  every case, signed in or out. `tests/e2e/theme-flash.spec.ts` and
  `tests/unit/theme-flash.test.ts` stay green.
- **Default is `system`**, at the column level, for new and existing rows.
- `ColorMode` remains `"light" | "dark"`. `DEFAULT_COLOR_MODE`
  (`src/lib/app-chrome.ts:3`) stays `"light"` — it is the *resolved* fallback when
  `matchMedia` is unavailable, which is a different question from the default
  *preference*. Do not conflate them.
- Signed-out visitors keep today's behaviour exactly: `localStorage` plus OS, no
  session lookup, no database read. `/`, `/sign-in` and `/blog` must not acquire
  a per-request database read.
- Document TTFB must not regress beyond the measured baseline by more than 25ms
  at the median on `/dashboard` and `/settings`, and not at all on `/`.
- No raw SQL under `src/` — `tests/unit/drizzle-migration.test.ts:125` asserts it.
- Every migration keeps the journal contiguous
  (`tests/unit/drizzle-migration.test.ts:141-145`).
- Changing the theme must not require the "Save Profile" button. It applies
  immediately, and must not fail hard when offline.

## Relationship to PRD 18 and PRD 19

Neither is superseded; both are unstarted.

- **PRD 18** (#91–#95) fixes a Settings control that reads wrong on 10 of 10 SSR
  loads, and removes the header toggle. Independent of storage location.
- **PRD 19** (#96–#99) introduces `ThemePreference = "light" | "dark" | "system"`
  and the three-way control. #96's type is a prerequisite here — this PRD stores
  exactly that type.

PRD 19's "Out of scope" previously said the preference stays in `localStorage` and
that no column would be added. That call is reversed by this PRD; PRD 19's file
and issue #98 are amended to point here rather than contradict it.

Sequencing consequence: PRD 19 #98 (the three-way control) must write through
this PRD's persistence layer, or it ships a `localStorage`-only handler that is
immediately rewritten. #98 gains a dependency on Batch 3 below.

## Batch 1 — Column and migration

`theme_preference` on `users`, `NOT NULL DEFAULT 'system'`, with a `check()`
constraint matching the existing `users_sex_check` style, plus migration `0004`
and query helpers.

## Batch 2 — Gate the migration

Fresh-database and upgrade-from-`0003` behaviour, the `system` default on
pre-existing rows, and the CHECK rejecting an invalid value. Follows the
`migration 0003` describe block precedent.

## Batch 3 — Auth-scoped read and write server functions

`requireAuth()`-scoped, following `getUser`/`updateUser`. Not folded into the
profile form's save.

## Batch 4 — Gate the server functions

Including cross-user isolation: one account must not read or write another's
preference.

## Batch 5 — Server-render the preference, and define cache precedence

The shell resolves the preference server-side when a session exists, renders it
into the document before paint, and the server's answer takes precedence over the
`localStorage` cache. No session ⇒ today's path unchanged.

## Batch 6 — Gate first paint, precedence, and cross-device

Flash assertions in the `captureThemeFlashFrames` vocabulary, the stale-cache
precedence case, and the two-device case measured above.

## Sequencing

1 → 2 → 3 → 4 → 5 → 6. Batch 3 unblocks PRD 19 #98.

Batch 5 is the one carrying risk — it adds work to every document request. It
lands after the storage layer is proven so that a TTFB regression has exactly one
suspect.

## Out of scope

- **Realtime sync between open devices.** A second device picks up the change on
  its next document load. No websocket, no polling, no push. The measured defect
  is that the preference never arrives at all, not that it arrives late.
- **Migrating existing `localStorage` values into the database.** A device with
  `"dark"` cached and a row saying `system` resolves per Batch 5's precedence
  rule. Do not write a backfill that guesses which device was authoritative.
- **Any other user setting moving to the database.** Notification preferences are
  already server-side; nothing else changes home in this PRD.
- **Theme for signed-out visitors.** No session, no row, no change. Do not add a
  guest-preference table.
- **The three-way control itself.** PRD 19 #98 owns the UI. This PRD is not
  closable by shipping a control, and #98 is not closable by adding a column.
- **PRD 18's hydration defect.** #91 owns it.
- **Changing `DEFAULT_COLOR_MODE`.** It is the resolved-mode fallback, not the
  preference default, and this PRD does not touch it.
