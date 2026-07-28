# PRD: Auth Enforcement and Data Isolation

## Overview

PRD 08 introduced Better Auth and issue #44 migrated the app onto it. The
mechanism exists and works. What is missing is **enforcement everywhere and
proof that it holds** — four server functions run with no session at all, one
authenticated function reads across user boundaries, and no test anywhere
asserts that an unauthenticated or foreign caller is turned away.

This PRD closes the gaps and turns "auth is required" from a convention that
each new handler must remember into a property the test suite enforces.

## What already works

Measured on a fresh seeded database (2026-07-28), not assumed:

- `npx tsx scripts/seed.ts` completes and produces one `user` row, one
  `account` row with a credential password, and a `users` row whose
  `auth_user_id` links the two.
- `auth.api.signInEmail` with `SEED_DEMO_ACCOUNT` succeeds.
- The same call with a wrong password is rejected (`Invalid email or password`).
- `auth.api.signUpEmail` creates a new user.
- 61 of 65 server functions call `requireAuth()`.
- `src/routes/api/cron/notifications.ts` is behind `SCHEDULER_SECRET` and
  returns 401 without it (`src/lib/scheduler.ts:157`).

Sign-in and sign-up are not broken. The problems below are about the handlers
that were never brought under the same rule, and about the absence of gates.

## Problem

### 1. Four server functions require no session

| Location | Function | Effect of calling it with no session |
| --- | --- | --- |
| `src/lib/api.ts:623` | `addWorkoutSet` | Writes a set into **any** `session_id` supplied by the caller |
| `src/lib/api.ts:651` | `deleteWorkoutSet` | Deletes **any** set by row id |
| `src/lib/api.ts:1690` | `getSyncedClientIds` | Confirms which sync client ids exist |
| `src/lib/api.ts:1732` | `unsubscribePush` | Deletes **any** push subscription by endpoint |

The first two are the serious ones. `addWorkoutSet` takes `session_id` straight
from the request body and passes it to `insertWorkoutSetRecord`, which does not
filter by user (`src/db/workout-queries.ts`). An anonymous request can write
training data into a stranger's logged session, and another can delete it.

### 2. One authenticated function reads across users

`startWorkoutFromProgram` (`src/lib/api.ts:951`) calls:

```ts
const day = await findProgramDayRecord(drizzleDb, ctx.data.programDayId, ctx.data.programId);
```

`findProgramDayRecord` (`src/db/program-queries.ts:401`) filters on
`programDays.id` and `programDays.programId` only — never `userId`. A signed-in
user passing another user's ids gets that program's `day_name` back and creates
a `workout_sessions` row pointing at a program they do not own.

The sibling function two handlers up does it correctly:
`getProgramDayTargets` uses `findProgramDayContext(db, programId, programDayId, userId)`,
which returns `null` when the program is not the caller's
(`src/db/program-queries.ts:309-324`). The fix is to make the miss impossible,
not merely to patch this one call.

`createWorkoutSession` (`src/lib/api.ts:601`) similarly stores caller-supplied
`program_id` and `program_day_id` without checking either belongs to the user.

### 3. The seed can attach demo data to a real account

`scripts/seed.ts:389`:

```ts
let athlete = db.select({ id: users.id }).from(users).limit(1).get();
```

The first row in `users`, whoever that is. Re-running the seed against a
database that already has real accounts attaches the demo programs to whichever
user happens to sort first. `linkSeedDemoAccount` has the mirror problem: it
picks "the first `users` row where `auth_user_id IS NULL`"
(`src/lib/seed-auth.ts:41-47`) and silently returns without linking anything
when there is none, leaving the demo account with no data and no error.

### 4. The demo password is a hardcoded literal

`SEED_DEMO_ACCOUNT.password` is `"DemoSeed123!"` in `src/lib/seed-auth.ts:13`,
committed to the repository. Any deployment that runs the seed gets a publicly
known credential. The e2e suite needs a deterministic password; a production
database must not have this one.

### 5. Nothing asserts that a rejection happens

- No test calls a server function without a session and expects it to fail.
  `tests/unit/require-auth.test.ts` covers the helper in isolation, not its
  application.
- No test creates two users and checks that one cannot read the other's rows.
- There is no `tests/e2e/auth.spec.ts`. Sign-in is exercised only incidentally,
  by `signInAsDemoUser` inside `openAppRoute` (`tests/e2e/test-helpers.ts:86`),
  so it is proven only for the happy path with the seeded account. Sign-up,
  wrong-password, sign-out, and session persistence across reload are untested.

This is why gap 1 could exist for as long as it has: the suite goes green
whether or not a handler checks anything.

## Stance

> A server function is authenticated and user-scoped unless it appears on an
> explicit public allowlist. Adding a handler that is neither must fail the
> build.

Per PRD 13, this is stated as an assertion rather than a guideline. The
enumeration gate in Batch 5 makes it one: it walks every `createServerFn`
export in `src/` and checks each against the allowlist, so a new unauthenticated
handler fails `npm run test:unit` on the commit that introduces it. A checklist
item that says "remember to call requireAuth" is not acceptable here — that is
exactly what was already in place.

The second half — "only its own data" — is enforced at the query layer rather
than the handler layer. Any query that reads or writes a user-owned table takes
a `userId` and filters on it. A handler cannot forget a filter that its callee
requires as an argument.

## Constraints

**Do not weaken `requireAuth`.** It resolves the Better Auth session and the
linked FitTrack profile in one step and throws `UnauthorizedError` otherwise
(`src/lib/require-auth.ts`). Handlers use `user.id`, never a client-supplied
user id. Keep that shape.

**Public surfaces stay public.** `src/lib/blog-api.ts` (3 functions),
`getAuthPageConfig` and its sibling in `src/lib/auth-form.ts`, and
`fetchServerSession` in `src/lib/route-auth.ts` are deliberately reachable
without a session. They belong on the allowlist with a one-line reason each,
not behind auth.

**The cron endpoint keeps its own scheme.** `SCHEDULER_SECRET` bearer auth is
correct for a machine caller; do not route it through `requireAuth`.

**Ownership failures return empty, not detail.** Follow `getWorkoutSession`
(`src/lib/api.ts:586-599`): a row that is not the caller's is reported as
absent. Do not distinguish "does not exist" from "belongs to someone else" in
what the client receives.

---

## Batch 1: Close the Four Open Handlers

**Goal**: every server function that touches user data requires a session.

- `addWorkoutSet`: `requireAuth()`, then confirm `session_id` belongs to the
  caller before inserting. Reuse `findWorkoutSessionForUser`.
- `deleteWorkoutSet`: `requireAuth()`, then delete only when the set's session
  belongs to the caller.
- `getSyncedClientIds`: `requireAuth()`, and scope the applied-id lookup to the
  caller's rows.
- `unsubscribePush`: `requireAuth()`, and delete by `(userId, endpoint)` rather
  than endpoint alone.

**Acceptance criteria**

- Each of the four, called with no session, throws `UnauthorizedError` and
  leaves the database byte-identical.
- `addWorkoutSet` with a `session_id` owned by another user inserts no row.
- `deleteWorkoutSet` on another user's set deletes nothing and reports the same
  result shape as deleting a nonexistent set.
- `unsubscribePush` with another user's endpoint leaves that subscription.

## Batch 2: Make Ownership Structural

**Goal**: a query that can read a user's rows cannot be called without a user.

- Add `userId` to `findProgramDayRecord`, `findWorkoutSessionWithSets`,
  `listSessionSetRows`, `updateWorkoutSessionDuration`, `insertWorkoutSetRecord`,
  `deleteWorkoutSetRecord`, `templateMacroTotals`, and
  `deletePushSubscriptionByEndpoint`, filtering on it.
- Validate `program_id` and `program_day_id` ownership in
  `createWorkoutSession` before persisting them.
- `listAppliedClientIds` takes a `userId`.

**Acceptance criteria**

- Every exported function in `src/db/*queries.ts` that references a user-owned
  table (`foodLog`, `workoutSessions`, `workoutSets`, `programs`, `programDays`,
  `bodyLogs`, `mealPlans`, `pushSubscriptions`, `syncLog`) accepts a `userId`
  parameter. Catalog tables (`foods`, `exercises`) are exempt and named as such
  in the test.
- A unit test per changed function: seeded with two users, the query returns
  nothing for the non-owner.

## Batch 3: Rework the Seed

**Goal**: seeding is deterministic, idempotent, and safe to run against a
database that already has real accounts.

- Create the demo auth account **first**, then create its `users` profile row
  linked to it. Remove the "first row wins" lookups at `scripts/seed.ts:389`
  and `src/lib/seed-auth.ts:41`.
- Attach all seeded programs and demo data to that row by id.
- Read the demo password from `SEED_DEMO_PASSWORD`, defaulting to the current
  literal for local and e2e use. Refuse to run — non-zero exit, message naming
  the variable — when `NODE_ENV=production` and the variable is unset.
- Load `.env` in the seed so it runs under the same Better Auth configuration
  as the app. It currently warns `Base URL is not set`.
- Re-seeding must never modify a `users` row whose `auth_user_id` is not the
  demo account's.

**Acceptance criteria**

- Seeding twice into the same database produces identical `users`, `user`,
  `account`, and `programs` contents.
- Seeding a database that already contains a signed-up account leaves that
  account's rows unchanged and its `programs` count unchanged.
- After seeding, `signInEmail` with the demo credentials succeeds and the
  resulting session's `userId` owns the seeded programs.
- Seeding emits no Better Auth configuration warnings.
- With `NODE_ENV=production` and no `SEED_DEMO_PASSWORD`, the seed exits
  non-zero and writes no rows.

## Batch 4: Cover the Auth Flows End to End

**Goal**: sign-up and sign-in are tested as features, not as test-suite plumbing.

`tests/e2e/auth.spec.ts`, both projects (`chromium`, `pixel-7`):

- Sign up with a fresh email lands on the dashboard, and the new account starts
  with no food log and no workouts.
- Sign in with the seeded account lands on the dashboard.
- Sign in with a wrong password stays on `/sign-in` and shows the error banner.
- The session survives a reload.
- Sign out returns to a public page, and a subsequent `/dashboard` visit
  redirects to `/sign-in`.
- A signed-in visitor to `/sign-in` or `/sign-up` is redirected to the dashboard
  (`redirectAuthenticatedToDashboard`).
- Each protected prefix in `APP_ROUTE_PREFIXES` (`src/lib/route-auth.ts:8-15`)
  redirects to `/sign-in` when signed out — driven by that array, so adding a
  route to it adds a case.

**Acceptance criteria**

- The suite creates its own account rather than depending on the demo one, so
  sign-up is genuinely exercised.
- Removing `beforeLoad: requireAuthenticatedRoute` from any app route fails the
  suite.

## Batch 5: Gates

**Goal**: neither gap can reappear.

- `tests/unit/server-fn-auth.test.ts`: enumerate every `createServerFn` export
  under `src/`, assert each either calls `requireAuth()` or appears in
  `PUBLIC_SERVER_FUNCTIONS` with a stated reason. Fail on an allowlist entry
  that no longer exists, so the list cannot rot.
- `tests/unit/data-isolation.test.ts`: seed two users with a full record set,
  then for every read function assert user B receives nothing belonging to A,
  and for every write function assert B cannot modify A's rows.
- Both gates run in `npm run test:unit`, not e2e, so they hold while the e2e
  suite is unavailable.

**Acceptance criteria**

- Deleting the `requireAuth()` call from any handler fails `npm run test:unit`.
- Adding a new `createServerFn` without `requireAuth()` and without an
  allowlist entry fails `npm run test:unit`.
- Removing a `userId` filter from any user-scoped query fails
  `npm run test:unit`. Verify this by mutation on at least three queries before
  declaring the batch done — a test that passes with the filter removed is not
  a gate.

---

## Sequencing

Batches 1 and 2 are the security fix and should land first; 2 depends on 1 only
by convenience. Batch 3 is independent. Batch 4 depends on Batch 3, because the
e2e suite seeds through `globalSetup` (`tests/e2e/global-setup.ts`). Batch 5's
unit gates depend on 1 and 2 being done, or they land red.

## Dependency

The e2e suite was last measured **red — 76 failures** from stale selectors, and
the dev loop still runs with `e2e:disabled` (`.dev-loop/learnings.json`). Batch
4 adds specs to a suite whose failures are not currently being read, so its
value is limited until that is repaired. Batches 1, 2, 3, and 5 are fully
verifiable by `npm run test:unit` and do not wait on it.

## Out of Scope

- Email verification, password reset, and rate limiting on the auth endpoints.
- GitHub OAuth beyond what already exists — social sign-in stays optional and
  disabled when the client id or secret is unset.
- Multi-tenant or shared-data features. Every row has exactly one owner.
- Row-level encryption.
