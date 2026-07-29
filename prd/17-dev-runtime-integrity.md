# PRD 17 — Dev-mode runtime integrity

## Overview

Sign-up does nothing when a human clicks "Create account" in `npm run dev`. Not
"shows an error" — nothing. No network request, no banner, no navigation.

The cause is not in the sign-up form, in Better Auth, or in the auth PRD 16
work. React never hydrates on **any** route in dev, so the button has no click
handler attached. The page is server-rendered HTML with dead controls.

Behind that failure sits a second, independent one: the local development
database cannot be migrated, so every auth write returns 500 even once
hydration is fixed. Both were reproduced end to end. Both are invisible to
`npm run test:unit`, `npm run test:e2e`, `tsc`, and `npm run build`, all of
which pass.

The through-line: **the app is verified only in the mode nobody develops in.**

## What was measured

Against the running dev server (`vite dev`, port 3000) and a fresh production
build, on 2026-07-29.

Dev mode, `/sign-up`, real Chromium, form filled and submitted:

| Observation | Result |
| --- | --- |
| Requests to `/api/auth/*` | **none** |
| Error banner rendered | none |
| URL after submit | unchanged |
| `pageerror` on load | `Module "node:fs" has been externalized for browser compatibility. Cannot access "node:fs.readdirSync" in client code.` |
| Typing an invalid email renders its validation error | **no** — React is not hydrated |

The same `pageerror` fires on `/sign-up`, `/sign-in`, `/`, and `/blog`. It is
not specific to auth; the entire dev app is non-interactive.

Production build of the same commit, same browser, same form:

| Observation | Result |
| --- | --- |
| `pageerror` on load | none — hydration succeeds |
| Requests to `/api/auth/*` | `POST /api/auth/sign-up/email` |
| Response | `500`, zero-byte body, no `content-type` |
| Banner rendered | "Authentication failed. Check your details and try again." |

So the client-side break is dev-only, and it is masking a server-side break
that is not.

## Problem 1 — server-only code is reachable from the client route graph

`src/lib/blog-api.ts:1` imports `node:fs` at module top level:

```ts
import { readdirSync, readFileSync } from "node:fs";
```

`createDefaultBlogReader` is an ordinary function, not a server function body,
so the TanStack Start compiler cannot strip the import. `src/routeTree.gen.ts`
statically imports every route module, including `./routes/blog/index` and
`./routes/blog/$slug`, both of which import `~/lib/blog-api`. The route tree is
loaded by every page, so `node:fs` enters the client module graph on every
route. Vite replaces it with a stub that throws on property access, the throw
escapes during hydration, and React gives up.

Rollup tree-shakes the same import out of the production client bundle —
verified: no `node:fs` or `readdirSync` string appears anywhere under
`.output/public/`. That is why the bug is dev-only, and why every existing gate
missed it.

The repo already has the boundary convention this needs:
`src/lib/auth-enforcement-handlers.server.ts`. `blog-api.ts` does not use it.

## Problem 2 — nothing exercises the app in dev mode

`playwright.config.ts:18` sets the web server command to:

```
npm run build && npm run start
```

Every e2e test therefore runs against a production build. No test in the
repository has ever loaded a page from `vite dev`. A defect that exists only in
dev is structurally undetectable, which is exactly what happened here.

There is one `pageerror` listener, at `tests/e2e/sub-pages.spec.ts:135`, and it
filters:

```ts
if (error.message.includes("server rendered text didn't match")) {
```

A module-externalization error does not match that substring, so even in the
one place page errors are collected, this class of failure is discarded.

## Problem 3 — the development database cannot be migrated

`data/fittrack.db` is in a state `migrate()` cannot advance:

- `__drizzle_migrations` has **zero rows**
- every table from `0000_jazzy_zaran.sql` **exists**
- the Better Auth tables from `0001_busy_misty_knight.sql` — `user`, `session`,
  `account`, `verification` — **do not exist**

With no bookkeeping rows, `migrate()` replays from `0000` and dies on the first
statement:

```
DrizzleError: Failed to run the query 'CREATE TABLE `body_logs` ...'
  cause: SqliteError: table `body_logs` already exists
```

`0001` never runs, so the tables Better Auth writes to are absent. Every
sign-in and sign-up returns 500 — 10 of 10 attempts, no intermittency. The
healthy `data/e2e-fittrack.db` has 3 migration rows and all four auth tables,
which is why e2e does not see this either.

Two things are wrong and both need addressing:

1. The database is broken and needs a recovery path.
2. A failed `migrate()` surfaces as a per-request 500 with an empty body. It
   should fail loudly at startup, naming the database path and the failing
   migration. A developer currently gets a blank 500 and no message anywhere.

`src/db/index.ts:41` calls `migrate()` inside `initDrizzle()`, after
`drizzleInstance` has already been assigned, so the failure is silently
swallowed on every call after the first within a module instance.

## Problem 4 — migration 0003 is not registered

`drizzle/0003_sync_queue_user_id.sql` exists on disk. `drizzle/meta/_journal.json`
contains entries for `0000`, `0001`, `0002` only. Drizzle runs journal entries,
not directory listings, so `0003` has never executed. Confirmed against the
database: `sync_queue` has no `user_id` column.

That migration exists to support the ownership work from PRD 16. It is
currently inert, so any code depending on `sync_queue.user_id` will fail at
runtime against a real database while passing tests that build their schema by
concatenating the `.sql` files directly.

## Problem 5 — a server fault is reported as a user mistake

`src/lib/auth-form.ts:83` falls through to:

```ts
return "Authentication failed. Check your details and try again.";
```

On the measured 500 the Better Auth client returns
`{status: 500, statusText: "Internal Server Error"}` with no `message` and no
`code`, so this fallback is what users see. It tells them to check credentials
that were never the problem. A 5xx is not a credential error and must not be
worded as one.

## Stance

Fixing `blog-api.ts` takes one commit. That is not the point of this PRD.

The point is that a totally non-interactive application passed types, unit
tests, e2e, and build. Every gate was green while no button on any page worked.
Patching the import without closing that hole leaves the next server-only
import free to do the same thing, and it will not be caught either.

Per PRD 13, each requirement below is a machine-checkable assertion. Nothing in
this document routes to human review or manual smoke testing. "Someone will
notice the app is broken" is precisely the control that failed.

## Constraints

- No weakening of any existing gate to make a new one pass.
- Batch 2's dev-mode check must assert on **all** page errors, not a filtered
  substring. The filter at `sub-pages.spec.ts:135` is the reason this escaped
  and must not be reproduced.
- Batch 1's scan must fail on the import graph as it exists today, before the
  fix, and pass after. A scan that is green on the broken tree is worthless.
- The recovery path in Batch 3 must not silently delete a database containing
  real rows.

## Batch 1 — get `node:fs` out of the client graph

Move filesystem access in `src/lib/blog-api.ts` behind a `.server.ts` module,
following the existing `auth-enforcement-handlers.server.ts` convention. Pure
parsing stays in `src/lib/blog.ts` and remains unit-testable without the
filesystem; the `BlogContentReader` injection point is already there and should
be preserved.

Acceptance:

- Loading `/sign-up` in `vite dev` produces zero page errors.
- Filling and submitting the sign-up form in dev issues a
  `POST /api/auth/sign-up/email`.
- `/blog` and `/blog/<slug>` still render their posts, server-side and after
  client navigation.

## Batch 2 — make the class of defect detectable

A unit scan that walks the client-reachable import graph starting from
`src/routeTree.gen.ts` and fails when any reachable module imports a Node
builtin (`node:fs`, `node:path`, `node:crypto`, …) outside a `.server.ts` file
or a server-function body. Use the TypeScript compiler API, matching the
existing pattern in `tests/unit/server-fn-auth-scan.ts`. An explicit allowlist
is permitted, with a reason string per entry, exactly as
`PUBLIC_SERVER_FUNCTIONS` does.

Plus a dev-mode smoke spec: start `vite dev`, load every prefix in
`APP_ROUTE_PREFIXES` (`src/lib/route-auth.ts:9`) along with `/`, `/sign-in`,
`/sign-up`, and `/blog`, and assert on each that no `pageerror` fired and that
hydration completed — proven by an interaction, not by the HTML being present.

Acceptance:

- The scan fails when reverted onto the parent of Batch 1's fix.
- The dev smoke spec fails on that same parent commit.
- Both pass on the fixed tree.
- Adding a `node:fs` import to any route-reachable module fails the scan.

## Batch 3 — make migration failure loud and recoverable

Wrap the `migrate()` call in `src/db/index.ts` so a failure throws with the
database path, the failing migration tag, and the underlying SQLite message,
rather than surfacing as an empty 500 per request. Add a documented reset path
for a development database in an unmigratable state, which refuses to run
against a database holding rows it did not create unless explicitly forced.

Acceptance:

- Booting against a database in the measured state (0000 tables present,
  `__drizzle_migrations` empty) produces one diagnostic naming
  `data/fittrack.db` and `0000_jazzy_zaran`.
- After recovery, `user`, `session`, `account`, and `verification` all exist,
  `__drizzle_migrations` is populated, and sign-up returns 200.
- The reset path leaves a database with unrecognised rows untouched unless
  forced.

## Batch 4 — register migration 0003

Add the `0003_sync_queue_user_id` entry to `drizzle/meta/_journal.json` and
verify it applies cleanly to a database at `0002`.

Extend `tests/unit/drizzle-migration.test.ts` with a bidirectional assertion:
every `drizzle/*.sql` file has a journal entry, and every journal entry has a
file. Ordering by `idx` must be contiguous from zero.

Acceptance:

- The new assertion fails on the current tree, naming `0003_sync_queue_user_id`.
- `sync_queue.user_id` exists after migrating a fresh database.
- Adding a `.sql` file without a journal entry fails the test.

## Batch 5 — stop blaming the user for 5xx

`formatAuthError` must distinguish a transport or server failure from a
credential failure. A 5xx gets wording that says the server failed and the
attempt can be retried; it must not say "check your details".

Acceptance:

- `formatAuthError({status: 500, statusText: "Internal Server Error"})` returns
  copy that mentions neither credentials nor user input.
- A 4xx credential rejection keeps its current wording.
- Unit tests cover 500, 403, 401, and a network-level failure with no status.

## Sequencing

Batch 1 unblocks local development and is the only batch a human is currently
waiting on — ship it first and alone.

Batch 2 is the batch that matters. It must land immediately after, and its
tests must be shown failing on the pre-fix commit. Without that demonstration
there is no evidence the gate detects anything.

Batches 3 and 4 are both migration correctness and can go together. Batch 5 is
independent and can land at any point.

## Dependency

Batch 3's acceptance requires a successful sign-up against a repaired database.
That is the same flow PRD 16 Batch 4 covers in `tests/e2e/auth.spec.ts`, which
runs against a production build. Batch 3 must verify against the development
database specifically — a green auth e2e run does not demonstrate it.

## Out of scope

- The 76 stale-selector e2e failures. Those run against a production build and
  are unrelated to this hydration defect; conflating them would let this PRD be
  closed by fixing selectors.
- Any change to PRD 16's auth enforcement. The 500 measured here is a migration
  fault, not an authorization fault, and `requireAuth` behaved correctly
  throughout.
- Restructuring `routeTree.gen.ts` eager imports. Eager route imports are
  TanStack Router's generated default; the defect is the server-only import,
  not the route tree.
