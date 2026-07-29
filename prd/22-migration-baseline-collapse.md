# PRD 22 — Collapse the Drizzle migration history into one generated baseline

## Overview

The project carries five Drizzle migrations (`0000_jazzy_zaran` …
`0004_theme_preference`) and 1 112 lines of test code that replay them
tag-by-tag. Nothing depends on that history: this app has one database per
developer machine, no production deployment, and no consumer of intermediate
schema states. The incremental history has become pure liability — PRD 21 exists
entirely because `0004_theme_preference` recreated a table and could not run
against a populated database.

The ask: regenerate `drizzle/` from `src/db/schema.ts` as a single baseline
migration with `drizzle-kit`, and delete the migration-replay tests.

The through-line: **the migration history is being deleted, and everything that
knows the old tag names by heart has to go with it — including the recovery
markers in `src/db/recover-dev-database.ts:17-41`, which fail silently rather
than loudly when their tags stop existing.**

What the work is *not*, because a reasonable reader would guess wrong:

- **Not** a schema change. The regenerated migration produces a byte-for-byte
  equivalent schema: 21 tables, 0 differences in columns, types, defaults,
  nullability, primary keys, foreign keys, or indexes. Measured below.
- **Not** free of consequences for existing databases. All three local `.db`
  files carry migration hashes that no longer exist after the collapse, and
  `migrate()` against them fails hard. Measured below.
- **Not** a licence to delete every test whose filename contains `migration`.
  `tests/unit/migration-sql.ts` has 24 downstream consumers and
  `tests/unit/drizzle-migration.test.ts:214-238` hosts a gate that has nothing
  to do with migrations.
- **Not** blocked on anything. Working tree is clean at `491559f`, dev boots,
  and the unit suite is green at 69 files / 727 tests.

## What was measured

All measurements 2026-07-29 against commit `491559f`, with
`drizzle-kit generate --dialect sqlite --schema ./src/db/schema.ts` writing to a
scratch directory. Every run used a copy of the real database file, never the
original.

### Regeneration output

| Fact | Value |
| --- | --- |
| Migrations before | 5 (`0000_jazzy_zaran`, `0001_busy_misty_knight`, `0002_conscious_doomsday`, `0003_sync_queue_user_id`, `0004_theme_preference`) |
| Migrations after | 1 (`0000_initial_schema.sql`, 13 105 bytes) |
| `drizzle/meta/` snapshots before → after | 5 → 1 |
| `_journal.json` entries before → after | 5 → 1 |
| Re-running `npm run db:generate` on the regenerated folder | `No schema changes, nothing to migrate 😴` |

### Schema equivalence — old five vs. regenerated one

Both folders applied to a fresh in-memory SQLite database, then compared with
`PRAGMA table_info` / `foreign_key_list` / `index_list` per table.

| Comparison | Result |
| --- | --- |
| Tables | old 21, new 21 |
| Columns (name, type, notnull, default, pk) | **0 differences** across all 21 tables |
| Foreign keys (from, table, to, on_update, on_delete) | **0 differences** |
| Indexes (name, uniqueness, columns) | **0 differences** |
| `sqlite_master` objects | old 43, new 43 |
| Tables whose **column order** differs | **21 / 21** |

Tables: `account, body_logs, exercises, food_log, foods, meal_plans,
meal_template_items, meal_templates, notification_deliveries,
notification_preferences, program_days, program_exercises, programs,
push_subscriptions, session, sync_queue, user, users, verification,
workout_sessions, workout_sets`.

Column order changes because `src/db/schema.ts` object keys are now
alphabetically sorted by the formatter, while `0000_jazzy_zaran.sql` was
generated before that sort. Two cosmetic textual differences accompany it, both
semantically inert:

- `sync_queue.user_id`: old emits inline ``REFERENCES `users`(`id`)``, new emits
  `FOREIGN KEY … ON UPDATE no action ON DELETE no action` — `no action` is the
  SQLite default, and `PRAGMA foreign_key_list` reports both identically.
- `users_theme_preference_check`: old `CHECK("theme_preference" in …)`, new
  `CHECK("users"."theme_preference" in …)`.

### Existing databases against the regenerated folder

| Database | `__drizzle_migrations` rows | Result of `migrate()` with regenerated folder |
| --- | --- | --- |
| `data/fittrack.db` (dev) | 4 | **FAILS** — ``table `account` already exists`` |
| `data/e2e-fittrack.db` | 5 | 5 recorded hashes, none recognized |
| `data/e2e-visual.db` | 3 | 3 recorded hashes, none recognized |
| fresh empty file | 0 | **succeeds** — 22 tables, 1 journal row |

Control: the same `data/fittrack.db` copy against the **current** five-migration
folder succeeds. The failure is caused by the collapse, not by the database.

### `npm run db:reset-dev` after the collapse

Against a copy of `data/fittrack.db` (372 `workout_sessions` rows, 53 `programs`,
2 `users`):

| Invocation | Outcome |
| --- | --- |
| `db:reset-dev` | Refuses: `__drizzle_migrations has 4 unrecognized row(s).` |
| `db:reset-dev --force` | `Database recovered` — and `workout_sessions` goes **372 → 0** |

### Recovery markers after the collapse

```
markers : ["0000_jazzy_zaran","0001_busy_misty_knight","0002_conscious_doomsday","0003_sync_queue_user_id","0004_theme_preference"]
journal : ["0000_initial_schema"]
markers with no journal entry: all 5
journal tags with no marker  : ["0000_initial_schema"]
```

`backfillAppliedMigrationJournal` (`src/db/recover-dev-database.ts:115-143`)
resolves each marker with `tags.indexOf(marker.tag)` and `continue`s on `-1`.
With zero overlap it becomes a **silent no-op** — no error, no log, no backfill.

### Test suite

| Tree | Files | Tests | Duration |
| --- | --- | --- | --- |
| Baseline `491559f` | 69 | 727 | 32.8 s |
| Migration tests deleted, migrations untouched | 65 | 697 | 32.6 s |
| Migration tests deleted **and** migrations regenerated | 65 | 697 | 43.9 s |

`npx tsc --noEmit` exits 0 and `npx oxlint src/ tests/ scripts/` is clean in the
regenerated tree.

## Problem 1 — The migration-replay tests encode tag names that are about to stop existing

1 112 lines across four files assert the behaviour of specific tags:

- `tests/unit/drizzle-migration.test.ts:255` — `"applies migration 0003 cleanly to a database at 0002"`
- `tests/unit/drizzle-migration.test.ts:472` — `"applies migration 0004 cleanly to a database at 0003"`
- `tests/unit/migration-tag-resolution.test.ts:58` — `"reports 0000_jazzy_zaran when the first migration fails on an existing schema"`
- `tests/unit/db-migration-recovery.test.ts:278` — `"reports 0003_sync_queue_user_id when replaying that migration onto an existing column"`

After the collapse there is no 0002, 0003, or 0004 to replay. These tests do not
merely become redundant — they become unrunnable.

`tests/unit/db-migration-fixture.ts` (326 lines) is imported by exactly those
four files and nothing else, so it goes with them.

## Problem 2 — Deleting `drizzle-migration.test.ts` silently drops a gate that is not about migrations

`tests/unit/drizzle-migration.test.ts:213-238` holds:

```ts
describe("Drizzle-only data layer (issue #41)", () => {
  it("has no db.prepare calls under src/", () => {
```

This scans every file under `src/` for `db.prepare` and is the only enforcement
of the Drizzle-only data-layer rule from issue #41. It lives in the migration
test file for historical reasons alone. A blanket `rm` of the file removes it
with no test turning red — the measured drop from 727 to 697 includes these two
tests.

## Problem 3 — Recovery markers fail silently, and the gate that would catch it is on the deletion list

`src/db/recover-dev-database.ts:17-41` hardcodes the five tag names.
`tests/unit/db-migration-recovery.test.ts:234` —
`"declares recovery markers for every journal migration tag"` — is precisely the
gate that asserts marker tags and journal tags agree.

That gate is inside a file this PRD deletes. If markers and tests are removed in
the wrong order, or the markers are left untouched, `db:reset-dev` degrades from
"repairs the database" to "does nothing, then fails" with no test coverage
noticing. This is the defect and the reason the defect would be invisible, and
both need addressing.

## Problem 4 — Every local database is stranded by the collapse

Measured above: dev, e2e, and visual databases all carry hashes that vanish. The
only paths currently available are *refuse* or *destroy 372 workout sessions*.

`resolveRecoveryAction` (`src/db/recover-dev-database.ts:145-175`) already has a
non-destructive `clear-unrecognized-journal` action, but it is unreachable here:
the `countApplicationRows(sqlite) > 0` branch at line 166 returns
`destructive-reset` first. That ordering is correct for its original purpose
(issue #88: unrecognized rows mean an unknown schema) but wrong for a journal
collapse, where the live schema provably already matches the target migration.

## Stance

The obvious patch is two `rm -rf`s and a `db:generate`. Measured, that patch
leaves three broken databases, a silently dead recovery routine, and a deleted
architecture gate — with a green suite the whole way, because the tests that
would have complained are the tests being deleted.

The distinction this PRD holds onto: **migration-replay testing is what is being
removed; dev-tooling testing is not.** Asserting that `0003` applies cleanly on
top of `0002` is testing a history that will not exist. Asserting that
`npm run db:reset-dev` repairs a developer's database is testing a command a
human runs. Batch 4 adds a test to a file adjacent to ones Batch 1 deletes, and
that is deliberate, not a contradiction.

Ordering matters for a second reason: the tests must go **before** the
regeneration, so that every commit is green at its own boundary. Regenerating
first would leave `drizzle-migration.test.ts` red for one commit.

## Constraints

- No weakening of an existing gate to make a new one pass.
- `src/db/schema.ts` may not be modified. The collapse is schema-neutral; if
  `db:generate` output looks wrong, the fix is not to edit the schema.
- The migration SQL must be produced by `npm run db:generate` and left
  unedited. No hand-written `IF NOT EXISTS`, no manual reordering, no
  post-processing.
- `tests/unit/migration-sql.ts` and `tests/unit/drizzle-test-db.ts` may not be
  deleted or have their exported signatures changed — 24 test files depend on
  them.
- `src/db/migration-diagnostics.ts` may not be deleted — `src/db/index.ts:8`
  imports `runMigrations` and `DatabaseMigrationError` at runtime.
- `npm run typecheck` and `npm run test:unit` must be green at every batch
  boundary, not only at the end.

## Batch 1 (#114) — Remove the migration-replay tests, preserving the issue-#41 gate

Delete `tests/unit/drizzle-migration.test.ts`,
`tests/unit/db-migration-recovery.test.ts`,
`tests/unit/migration-tag-resolution.test.ts`,
`tests/unit/migration-tag-unknown.test.ts`, and
`tests/unit/db-migration-fixture.ts`.

Relocate the `Drizzle-only data layer (issue #41)` describe block to its own
file before deleting its host.

Independent of Batches 2–4 in the sense that it is green on the current tree,
but it must land first.

## Batch 2 (#115) — Regenerate `drizzle/` as a single baseline and collapse the recovery markers

Delete `drizzle/*.sql` and `drizzle/meta/`, run `npm run db:generate`, and
reduce `APPLIED_MIGRATION_MARKERS` to one entry matching the new tag.

Depends on Batch 1.

## Batch 3 (#116) — Repair local databases across the journal collapse

Make `resolveRecoveryAction` prefer `clear-unrecognized-journal` over
`destructive-reset` when the live schema already satisfies every marker for the
target migration folder, so a developer keeps their 372 workout sessions.

Depends on Batch 2.

## Batch 4 (#117) — Gate the collapse-recovery path

A test that constructs a database carrying pre-collapse hashes and asserts
`recoverDevDatabase` repairs it without dropping rows. Demonstrated failing on
the Batch 2 commit.

Depends on Batch 3.

## Sequencing

1 → 2 → 3 → 4, strictly. Nobody is blocked today: dev boots and the suite is
green, so this sequence optimises for every commit being independently green
rather than for unblocking a human.

Batch 2 is the commit after which a developer must run `npm run db:reset-dev`
before `npm run dev` works again. Batch 3 is what makes that command
non-destructive. Landing 2 without 3 costs the developer their local training
history — which is why they are adjacent.

## Out of scope

- **Changing `src/db/schema.ts`.** The measured 0-difference schema equivalence
  is the point. A PRD "satisfied" by tweaking the schema so the generated SQL
  reads better has fixed the wrong thing.
- **Reordering schema keys to preserve column order.** Column order differs in
  21/21 tables and that is accepted. Drizzle emits explicit column lists in every
  generated query, and the codebase has no `SELECT *` against these tables. Do
  not chase this.
- **PRD 21's `0004_theme_preference` foreign-key defect.** It stops existing when
  `0004` stops existing. Do not open it, do not re-fix it, do not cite it as
  done.
- **Deleting `tests/unit/drizzle-schema.test.ts`.** It asserts the shape of
  `src/db/schema.ts`, not migration behaviour, and 3 of its tests must still
  pass afterwards.
- **Deleting `tests/unit/migration-sql.ts`.** Its name matches the theme; its
  role does not. `readAllMigrationSql()` globs `drizzle/*.sql` and keeps working
  unchanged with one file instead of five. 15 test files import it directly and
  9 more reach it through `drizzle-test-db.ts`.
- **Deleting `src/db/migration-diagnostics.ts` or `src/db/index.ts`'s use of
  `runMigrations`.** Runtime boot depends on it.
- **The e2e suite.** It is disabled and red with 42+ pre-existing failures
  (`package.json` `test:e2e`). Re-seeding `data/e2e-fittrack.db` is a developer
  action, not a code change, and no batch here may be closed by editing e2e
  specs or selectors.
- **Squashing or rewriting git history.** The migration *files* collapse; the
  repository history does not.
