# PRD: Runtime Validation with Zod

## Overview

Every value entering this application from outside its own memory — an HTTP request body, a `localStorage` string, an uploaded file, an environment variable — is currently trusted. TypeScript makes the code *look* validated while compiling every one of those checks away. This PRD makes validation real, and makes Zod the single mechanism for it.

## Problem

`zod@4.4.3` is in `package.json:42`. It has **zero imports** in `src/`, `tests/`, or `scripts/`:

```
$ grep -rn "from ['\"]zod" src/ tests/ scripts/
(no matches)
```

### 1. All 47 server-function validators are identity functions

`src/lib/api.ts` exposes 47 `createServerFn` endpoints. Every one declares a `.validator()`, and every one of the 47 is a type annotation that returns its argument unchanged:

```ts
// src/lib/api.ts:404
.validator((data: { id: number }) => data)

// src/lib/api.ts:416
.validator((data: { ids: number[] }) => data)
```

TanStack Start calls `.validator()` as the *runtime* boundary for a server function — it is the designated place to reject bad input. Using it as a cast means the annotation is erased at build time and the handler receives whatever the caller sent. `deleteFoodLogEntry({ id: "1 OR 1=1" })` type-errors in the editor and succeeds over the wire.

This is not a theoretical concern in an app that ships an offline outbox: queued mutations are serialised to IndexedDB and replayed later, possibly by a newer app version against a payload shape written by an older one.

### 2. The import path casts an arbitrary file into the database

`src/lib/settings.ts:279` (`parseImportFile`) checks exactly two things about an uploaded JSON file: that it parses, and that `obj.app === "FitTrack"`. It then returns `Record<string, unknown>`. The caller casts that straight into a server function:

```ts
// src/routes/settings/index.tsx:224
data: result.data as Parameters<typeof importData>[0]["data"],
```

`importData`'s own validator (`src/lib/api.ts:1861`) is an identity function over seven optional record arrays. The result is that an arbitrary object, from a file the user chose, reaches a `db.transaction()` that writes all seven tables with no field ever inspected. A truncated or hand-edited export corrupts data silently rather than being rejected.

### 3. Rehydration validators are hand-rolled and each one is different

Four places parse persisted JSON, with four different levels of rigour:

| Location | Current check |
|---|---|
| `src/lib/rest-timer.ts:55` | `JSON.parse(raw) as RestTimerSnapshot`, then three hand-written `typeof` guards |
| `src/lib/notification-preferences.ts:71` | parses to `unknown`, bespoke narrowing |
| `src/lib/notification-preferences.ts:86` | parses to `unknown`, a second bespoke narrowing |
| `src/lib/settings.ts:285` | parses to `unknown`, checks one field |

`rest-timer.ts` validates three fields of its snapshot and ignores the rest; nothing fails if a fourth is added later. This is the duplication AGENTS.md prohibits — the same responsibility implemented four times, drifting independently.

### 4. Nothing validates the process environment

`readVapidConfig()` and the scheduler secret are read at runtime. A missing or malformed `VAPID_PRIVATE_KEY` surfaces as a push-library failure at send time, not as a startup error naming the variable.

## Stance

> **Every value crossing a trust boundary is parsed by a Zod schema before use, and its TypeScript type is derived from that schema — never declared beside it.**

The second clause matters as much as the first. A hand-written `type FoodLogEntry` next to a hand-written `foodLogEntrySchema` is two sources of truth that will disagree. `z.infer<typeof schema>` cannot disagree with itself.

A trust boundary is any point where data originates outside the current program's memory: HTTP request bodies and query params, `localStorage` / `sessionStorage` / IndexedDB reads, uploaded files, `process.env`, and third-party API responses.

Explicitly **not** a trust boundary: values passed between functions within the app. Validating those is overhead with no safety gain, and this PRD does not ask for it.

## Constraints

**Zod is wrapped, per AGENTS.md** ("Wrap third-party libs behind a thin interface owned by this project"). Schemas live in `src/lib/schemas/`, grouped by domain, and application code imports schemas and inferred types from there. Direct `from "zod"` imports outside `src/lib/schemas/` are a gate failure (Batch 4). This keeps a future Zod major — or a swap to another validator — a change to one directory.

**Failures name the value and the expected shape**, per AGENTS.md. Zod v4's `z.prettifyError(error)` produces exactly this; parse failures must surface it rather than a generic "invalid input".

**User-facing errors must stay user-facing.** A rejected import should tell the user which record failed and why, not print a schema dump. Server-function rejections return a structured error the UI can render.

---

## Batch 1: The Server Function Boundary

**Goal**: no server function accepts unvalidated input.

- Create `src/lib/schemas/` with one module per domain (`nutrition.ts`, `workout.ts`, `user.ts`, `common.ts`).
- `common.ts` holds shared primitives, at minimum: `isoDateSchema` (`YYYY-MM-DD`), `isoTimeSchema` (`HH:MM`), `positiveIntSchema`, `rowIdSchema`. `src/lib/input-values.ts` already regex-checks the first two for Astryx's branded input types — that file's patterns are the starting point, and it should consume the shared schema rather than keep its own copy.
- Replace all 47 identity validators in `src/lib/api.ts` with schema parses.
- Where a hand-written type feeds a validator, invert it: the schema becomes canonical and the type becomes `z.infer<typeof …>`.
- Numeric fields carry real bounds, not just `z.number()`. Reps, sets, weight, and macro grams are non-negative and finite; `rowIdSchema` is a positive integer.

**Acceptance criteria**

- `grep -c "\.validator(" src/lib/api.ts` equals the count of `parse` or schema references in the same file — no validator lacks a schema.
- A unit test posts a malformed payload to at least one endpoint per domain and asserts it is rejected before the handler runs (assert the DB is untouched, not merely that an error was thrown).
- `npm run typecheck` passes with zero `as` casts introduced.

## Batch 2: Persistence Rehydration

**Goal**: a corrupted or stale stored value degrades to the default state instead of propagating.

- Replace the four hand-rolled parsers (table above) with `safeParse` against domain schemas.
- On failure, fall back to the documented default and log structured JSON (per AGENTS.md logging rules) — never throw into a render path. A bad stored value must not blank the page; this mirrors the precedent already set in `src/lib/input-values.ts`.
- Validate offline outbox entries on **read** in `src/lib/sync.ts`, not just on write. Entries written by a previous app version are the realistic failure case.

**Acceptance criteria**

- A unit test writes garbage to each storage key and asserts the app returns defaults without throwing.
- A test writes an outbox entry with a payload shape from an older schema and asserts it is dropped with a structured log rather than replayed.

## Batch 3: Files, Routes, and Environment

**Goal**: the remaining boundaries.

- `parseImportFile` validates the **full** export shape, and `importData` re-validates server-side. Client validation is a UX affordance; the server must not trust it.
- Remove the `as Parameters<typeof importData>[0]["data"]` cast at `src/routes/settings/index.tsx:224` — the schema's inferred type makes it unnecessary.
- Import rejection reports the failing record path (e.g. `food_log[12].grams`) to the user, via `z.prettifyError`.
- `POST /api/cron/notifications` validates its request body and rejects with 400 before touching the database.
- Validate `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `SCHEDULER_SECRET` at first read, failing with a message naming the missing variable.

**Acceptance criteria**

- An e2e test uploads a structurally-valid-but-wrong export (correct `app` field, one malformed record) and asserts the UI names the offending field and the database is unchanged.
- A unit test asserts the cron route returns 400 on a malformed body.

## Batch 4: Enforcement

**Goal**: identity validators cannot come back.

This is the PRD 13 obligation — the rule is worthless if only the initial migration honours it.

- Add a gate test asserting **no** `.validator(` in `src/lib/api.ts` is followed by an identity function. The migration is only durable if regression is mechanically caught, since nothing about an identity validator fails typecheck, unit tests, build, or e2e.
- Add a gate test asserting `from "zod"` appears only under `src/lib/schemas/`.
- Both run in `npm run test:unit`, so the dev loop's existing gate enforces them with no change to `scripts/dev-loop.sh`.

**Acceptance criteria**

- Reintroducing `.validator((data: { id: number }) => data)` fails `npm run test:unit`.
- Adding `import { z } from "zod"` to a route component fails `npm run test:unit`.

---

## Out of Scope

- Form-level validation UX. TanStack Form is already in use; wiring these schemas into field-level error display is worthwhile but is a separate concern from trust boundaries.
- Validating internal function arguments. See Stance.
- Drizzle schema alignment. Issues #40 and #41 are migrating the data layer to Drizzle; `drizzle-zod` could later derive these schemas from table definitions. Attempting both migrations at once would couple two independent risks — this PRD targets the boundary, and the schemas can be re-derived afterwards.
