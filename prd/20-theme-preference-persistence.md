# PRD 20 — The theme preference lives on the account

## Overview

The theme has three states — **system**, **light**, **dark** — defaulting to
**system**. The user's settings row in the database is the source of truth.
Unauthenticated visitors are **system**. There is no flicker, because the server
knows the preference before it renders anything.

That last claim is the design's load-bearing assumption, and it was verified
rather than assumed: a spike added a session-reading loader to the root route and
rendered its result onto `<html>`. For an authenticated request the value appears
in the **first 260 bytes** of the document. The root loader resolves before the
shell is flushed, and it costs 2–4ms.

One correction to the model, and it shapes the whole design: **the server cannot
resolve `system`.** `prefers-color-scheme` is a client-side media query, and the
first request carries no signal of it (`Sec-CH-Prefers-Color-Scheme` needs an
`Accept-CH` round trip and is Chromium-only, so it cannot serve a first paint).
Since `system` is both the default and the state of every signed-out visitor, it
is the common case, not an edge case.

So the server renders the **preference**, not always a resolved mode:

| preference | who resolves it | when |
| --- | --- | --- |
| `light` / `dark` | server | before the first byte |
| `system` | the pre-paint inline script, via `matchMedia` | before the first paint |

Both are flicker-free. The second is exactly how the app behaves today, and it
is measured below as already correct at `domcontentloaded`.

The simplification this buys: **`localStorage` stops being a source of truth and
can be deleted.** Authenticated users get the preference from the database on
every document load; signed-out users are always `system` and have nothing to
store. No cache, no second writer, no precedence rule to get wrong.

## What was measured

Measured 2026-07-29 against **production builds** (`npm run build && npm run
start`) on `48b822a`, with the seeded demo account.

### A root loader resolves before the shell is flushed

Spike: a loader on `createRootRoute` calling `fetchServerSession`
(`src/lib/route-auth.ts:28`), its result rendered onto `<html>`. Raw bytes off
the wire, `curl`, no browser:

Unauthenticated `/`:

```html
<!DOCTYPE html><html data-spike-theme="system" data-spike-session="false" lang="en"><head>...
```

Authenticated `/dashboard`:

```html
<!DOCTYPE html><html data-spike-theme="dark" data-spike-session="true" lang="en"><head>...
```

The server-derived value is in the opening tag of the document. This is what
makes a flicker-free explicit light/dark possible.

### The root loader is cheap

Same build, same host, `curl` time-to-first-byte, 7 samples per route, cold
sample discarded:

| route | no root loader | with root loader | delta |
| --- | --- | --- | --- |
| `/` (signed out) | ~7ms | ~6ms | none (noise) |
| `/dashboard` | ~38ms | ~40ms | +2ms |
| `/settings` | ~47ms | ~51ms | +4ms |

The spike read the session but not yet a preference row. A single indexed row
from local SQLite via better-sqlite3 is synchronous and sub-millisecond, so the
figure above is the dominant cost — but it is not zero, and Batch 6 keeps a
budget on it.

### The current pre-paint path is already flicker-free

`color-scheme` on `<html>` at `domcontentloaded`, before hydration:

| stored | computed `colorScheme` at DCL |
| --- | --- |
| `dark` | `dark` |
| `light` | `light` |

This is what `tests/e2e/theme-flash-helpers.ts:26-32` asserts, and it is the
mechanism `system` will keep using.

### `system` already resolves correctly end to end

Storing the literal `"system"` today:

| stored | OS scheme | `data-theme` | `style.colorScheme` | `meta[theme-color]` |
| --- | --- | --- | --- | --- |
| `system` | dark | `dark` | `dark` | `#1b1b1b` |
| `system` | light | `light` | `light` | `#6741d9` |

Live OS changes are followed with no reload. The bootstrap at
`src/routes/__root.tsx:46-50` treats any unrecognised value as "ask the OS".

### The preference is device-scoped today

Two contexts, same seeded account, device A chooses Dark:

| device | `data-theme` | `localStorage.fittrack-theme` |
| --- | --- | --- |
| A, after choosing Dark | `dark` | `"dark"` |
| B, same account | `light` | `null` |

Clearing site data destroys it.

### Patterns this must follow

| concern | precedent |
| --- | --- |
| app profile row, enum columns with `check()` | `users` (`src/db/schema.ts:39-68`) |
| per-user preference table | `src/db/notification-queries.ts` |
| auth-scoped server fn | `getUser` / `updateUser` (`src/lib/api.ts:206-222`) |
| server-side session | `fetchServerSession` (`src/lib/route-auth.ts:28-33`) |
| migration journal completeness | `tests/unit/drizzle-migration.test.ts:141-145` |
| per-migration behaviour gate | `tests/unit/drizzle-migration.test.ts:147-170` |

Two user tables exist: `users` (`src/db/schema.ts:39`, app profile, integer `id`,
already carrying `activityLevel`/`goalType`/`sex`) and `user`
(`src/db/schema.ts:399`, better-auth, text `id`). The preference belongs on
**`users`**.

## Problem 1 — The preference is device-scoped

Measured above: same account, second device, empty storage and a light page while
device A is dark. Clearing site data loses it. No column exists to hold it.

## Problem 2 — `localStorage` is the source of truth, and it should not be

`persistTheme` (`src/lib/app-chrome.ts:95`) writes `localStorage`, and the
pre-paint script (`src/routes/__root.tsx:43`) reads it. Nothing else knows the
preference. Once the database holds it, keeping `localStorage` authoritative
would create two writers and force a precedence rule — an entire class of
staleness bug that simply does not need to exist, because the server can supply
the answer on every document load.

## Problem 3 — The server cannot resolve `system`, and `system` is the default

The pre-paint script must survive. A design that renders a resolved `light`/`dark`
server-side for *all* users would have to guess the OS scheme for the default
state, and would guess wrong for every signed-out visitor and every user who
never changed the setting. The script stays; what changes is that it is driven by
the server-rendered preference instead of `localStorage`.

## Stance

The instinct after proving the root loader works is to render a resolved
`light`/`dark` on the server for everyone and delete the inline script. That
would be simpler, and it would be wrong: the server has no access to
`prefers-color-scheme`, so the default state — `system` — would be a coin flip
resolved after hydration. The flash PRD 15 closed would come back for the
majority case.

The design that survives the measurements is a split one: the server is
authoritative for *what the user chose*, and the client remains authoritative for
*what the OS currently prefers*. Each resolves the part it can see, both before
paint.

The payoff for accepting that split is that `localStorage` loses its job
entirely, which removes more complexity than the split adds.

## Constraints

- No weakening of an existing gate to make a new one pass.
- `color-scheme` on `<html>` must be correct at `domcontentloaded` for all three
  preferences, signed in and out. `tests/e2e/theme-flash.spec.ts` and
  `tests/unit/theme-flash.test.ts` stay green.
- **Default is `system`**, at the column level, for new and existing rows.
- **Unauthenticated visitors are `system`.** No session lookup result required,
  no database read, no stored preference.
- `ColorMode` remains `"light" | "dark"` — it is the resolved mode.
  `ThemePreference` is the three-state type. `DEFAULT_COLOR_MODE`
  (`src/lib/app-chrome.ts:3`) stays `"light"`: it is the resolved fallback when
  `matchMedia` is unavailable, not the default preference. Do not conflate them.
- The pre-paint inline script must not be deleted. It is what resolves `system`.
- No raw SQL under `src/` (`tests/unit/drizzle-migration.test.ts:125`).
- Migration journal stays contiguous (`tests/unit/drizzle-migration.test.ts:141-145`).
- Changing the theme applies immediately — it must not require "Save Profile".
- Document TTFB must stay within +15ms of the measured baselines at the median
  (`/` ~7ms, `/dashboard` ~38ms, `/settings` ~47ms by `curl`).

## Relationship to PRD 18 and PRD 19

- **PRD 19** (#96–#99) owns the three-state type and the Light/System/Dark
  control. Both are required here.
- **PRD 18** (#93, #94, #95) removes the header toggle and re-homes the
  dev-runtime hydration probe. Still valid and independent.
- **PRD 18 #91 and #92 are superseded.** They fixed a binary Settings switch by
  deriving it from a `localStorage` store. This PRD deletes `localStorage` as a
  source of truth, and PRD 19 #98 deletes the binary switch. Their measured
  defect — the switch reading wrong on 10 of 10 SSR loads — is fixed structurally
  here, because the control's value arrives as loader data that the server and
  client both see. Their SSR-correctness assertions are folded into #99 so the
  coverage is not lost.

## Batch 1 — Column and migration

`users.theme_preference`, `NOT NULL DEFAULT 'system'`, `check()` constraint,
migration `0004`, query helpers.

## Batch 2 — Gate the migration

Fresh database, upgrade from `0003` with pre-existing rows, the `system` default,
the CHECK rejecting an invalid value.

## Batch 3 — Auth-scoped read and write server functions

Following `getUser` / `updateUser`. Not folded into the profile form's save.

## Batch 4 — Gate the server functions

Including cross-user isolation and validator rejection.

## Batch 5 — Server-render the preference and retire `localStorage`

Root loader supplies the preference; the shell renders it; the pre-paint script
resolves `system` against `matchMedia` and applies `light`/`dark` directly. The
theme storage key and its reads and writes are removed.

## Batch 6 — Gate no-flicker, all three states, signed in and out

First-paint assertions for `system`/`light`/`dark` × authenticated/anonymous,
cross-device propagation, absence of `localStorage`, and the TTFB budget.

## Sequencing

1 → 2 → 3 → 4 → 5 → 6. Batch 3 unblocks PRD 19 #98.

Batch 5 is the one carrying risk and lands after the storage layer is proven, so
a regression has one suspect.

## Out of scope

- **Realtime sync between open devices.** A second device picks the change up on
  its next document load. No websocket, no polling.
- **`Sec-CH-Prefers-Color-Scheme` client hints.** Chromium-only and needs an
  `Accept-CH` round trip, so it cannot serve a first paint. Do not add it as a
  way to resolve `system` server-side.
- **Migrating existing `localStorage` values into the database.** Every user
  starts at the `system` default. Do not write a backfill that guesses which
  device was authoritative.
- **A guest preference for signed-out visitors.** They are `system`, full stop.
  No cookie, no table, no local storage.
- **Any other setting moving to the database.**
- **The control itself.** PRD 19 #98 owns it.
- **Changing `DEFAULT_COLOR_MODE`.** Resolved-mode fallback, not the preference
  default.
