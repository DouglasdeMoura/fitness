# PRD 21 — Migration 0004 cannot run against a populated database

## Overview

`npm run dev` is dead. Every request that touches `db` throws:

```
Database migration failed for /home/doug/github.com/douglasdemoura/fitness/data/fittrack.db
at migration 0004_theme_preference: FOREIGN KEY constraint failed
```

Migration `0004_theme_preference` adds `users.theme_preference` by **recreating
the `users` table** — `CREATE TABLE __new_users` → `INSERT … SELECT` →
`DROP TABLE users` → `RENAME`. The file opens with `PRAGMA foreign_keys=OFF;` to
make the `DROP` safe. That pragma never takes effect: Drizzle's migrator wraps
every migration in `BEGIN … COMMIT`
(`node_modules/drizzle-orm/sqlite-core/dialect.cjs:676`), and SQLite treats
`PRAGMA foreign_keys` as a **no-op inside an open transaction**. Foreign keys
stay enforced, ten tables hold 455 rows pointing at `users.id`, and
`DROP TABLE users` fails.

The through-line: **0004 is the first migration this project has ever shipped
that recreates a table, and the guard it relies on does not work where Drizzle
runs it.**

What the cause is *not*, because a reasonable reader would guess wrong:

- **Not** a missing journal entry. `drizzle/meta/_journal.json` lists all five
  tags with contiguous `idx`; the existing completeness gate passes.
- **Not** foreign keys being off in tests and on in production.
  `better-sqlite3` defaults `foreign_keys` to **ON**, measured below — the test
  fixture and `src/db/index.ts:45` agree.
- **Not** corrupt data. `PRAGMA foreign_key_check` on the real database returns
  `[]` and `integrity_check` returns `ok`, before and after.
- **Not** fixable by swapping in `PRAGMA defer_foreign_keys=ON`. That pragma
  *does* work inside a transaction, and the migration still fails — at `COMMIT`.
  Measured below.

## What was measured

All measurements 2026-07-29, against `data/fittrack.db` (copied to scratch
before every run) and `drizzle/` at commit `279c2d0`.

### The real database, before any migration attempt

| Fact | Value |
| --- | --- |
| `journal_mode` | `wal` |
| Rows in `__drizzle_migrations` | 4 (0000–0003 applied; 0004 pending) |
| `users` columns | `id,name,email,birth_date,sex,height_cm,activity_level,goal_type,created_at,updated_at,auth_user_id` — no `theme_preference` |
| `users` rows | 2 (ids 1, 2) |
| `PRAGMA foreign_key_check` | `[]` |

Tables holding a foreign key to `users.id`, with live rows:

| Table | Column | Rows | `on_delete` |
| --- | --- | --- | --- |
| `workout_sessions` | `user_id` | 372 | NO ACTION |
| `programs` | `user_id` | 53 | NO ACTION |
| `food_log` | `user_id` | 14 | NO ACTION |
| `meal_templates` | `user_id` | 12 | NO ACTION |
| `body_logs` | `user_id` | 1 | NO ACTION |
| `meal_plans` | `user_id` | 1 | NO ACTION |
| `push_subscriptions` | `user_id` | 1 | NO ACTION |
| `notification_preferences` | `user_id` | 1 | NO ACTION |
| `sync_queue` | `user_id` | 0 | NO ACTION |
| `notification_deliveries` | `user_id` | 0 | NO ACTION |
| **Total** | | **455** | |

### Reproduction through the app's own migration path

`new Database(copy)` → `pragma("foreign_keys = ON")` → `drizzle()` →
`migrate(db, { migrationsFolder: "drizzle" })`:

| Observation | Value |
| --- | --- |
| `foreign_keys` before migrate | `1` |
| Result | `DrizzleError` thrown |
| Failing statement | `` DROP TABLE `users`; `` |
| `error.cause.message` | `FOREIGN KEY constraint failed` |
| `users` columns after | unchanged — still no `theme_preference` |
| `__new_users` after | absent (transaction rolled back) |

10 of 10 attempts, identical.

### Why the pragma does not work — four controlled probes

In-memory database, `foreign_keys = ON`, `users(id)` with one child row in
`programs(user_id REFERENCES users(id))`:

| Probe | Setup | `foreign_keys` reads | `DROP TABLE users` |
| --- | --- | --- | --- |
| A | `BEGIN` then `PRAGMA foreign_keys=OFF` — **what Drizzle does** | `1` | **`FOREIGN KEY constraint failed`** |
| C | `PRAGMA foreign_keys=OFF`, no transaction — **what the unit fixture does** | `0` | ok |
| D | bare `new Database()`, no pragma set | `1` | — |

Probe A is the defect in one line: inside the transaction the pragma is
silently ignored and `foreign_keys` still reads `1`.

Probe D disproves the natural hypothesis that the tests pass because foreign
keys are off in them. `better-sqlite3` enables them by default, so
`tests/unit/db-migration-fixture.ts:78` (`new Database(dbPath)`, no pragma) runs
with enforcement **on**, exactly like `src/db/index.ts:45`.

`PRAGMA defer_foreign_keys=ON`, statement by statement inside the transaction:

| Statement | Result |
| --- | --- |
| `BEGIN` | ok |
| `PRAGMA defer_foreign_keys=ON` | ok — reads `1`, unlike probe A |
| `CREATE TABLE __new_users` | ok |
| `INSERT INTO __new_users SELECT …` | ok |
| `DROP TABLE users` | ok |
| `ALTER TABLE __new_users RENAME TO users` | ok |
| `COMMIT` | **`FOREIGN KEY constraint failed`** |

The deferred-violation counter incremented by the implicit `DELETE` inside
`DROP TABLE` is never decremented by the `RENAME`, so the commit is refused and
SQLite rolls back. `PRAGMA foreign_key_check` reads `[]` at that moment — the
check disagrees with the commit. **The one-line pragma swap does not work.**

The canonical SQLite 12-step form (pragma *before* `BEGIN`) does work — but it
cannot be expressed in a Drizzle migration file, because Drizzle has already
opened the transaction before the file's first statement runs.

### Why the existing gate passed

`tests/unit/drizzle-migration.test.ts:290`, *"applies migration 0004 cleanly to
a database at 0003"*, does drive the real transactional `runMigrations`. It
inserts two rows into `users` (lines 300, 312) and **not one row into any table
that references `users`**.

Same fixture, same migration, one row added to `programs`:

| Child rows in `programs` | `migrate()` |
| --- | --- |
| 0 — what the gate does today | **SUCCEEDED**, `theme_preference = system` |
| 1 | **THREW** — `` DROP TABLE `users`; `` / `FOREIGN KEY constraint failed` |

One row flips the gate. The same hole is in *"migrates a 0003 user without
losing profile data"* (line 201).

### Recovery does not recover

`npm run db:reset-dev` is the documented escape hatch (PRD 17).

| Input database | Result |
| --- | --- |
| Copy of the real `data/fittrack.db` | `Database migration failed … at migration 0004_theme_preference: FOREIGN KEY constraint failed` |
| Schema at 0003, empty `__drizzle_migrations` | `Database migration failed … at migration **0000_jazzy_zaran**: duplicate column name: user_id` |

The second row is two faults. `APPLIED_MIGRATION_MARKERS`
(`src/db/recover-dev-database.ts:20-33`) has entries for 0000, 0001 and 0002 and
stops there, so a database already at 0003 gets a journal backfilled only to
0002 and then re-runs 0003 onto a column that exists. And the reported tag is
wrong: `src/db/migration-diagnostics.ts:96` picks the **first migration whose
SQL text contains the extracted object name**, and `"user_id"` appears
throughout `0000_jazzy_zaran.sql`, so the developer is pointed at 0000 when the
failing statement is in 0003.

`--force` does not change either outcome: all four recorded hashes are known, so
`resolveRecoveryAction` returns `"repair"` regardless.

### The snapshot chain skips 0003

`drizzle/meta/` contains `0000_`, `0001_`, `0002_` and `0004_snapshot.json`.
There is no `0003_snapshot.json`.

| Snapshot | `id` | `prevId` |
| --- | --- | --- |
| 0000 | `612d5cc3…` | `00000000-…` |
| 0001 | `f914a61c…` | `612d5cc3…` |
| 0002 | `af522299…` | `f914a61c…` |
| 0004 | `7a7b0cbc…` | **`af522299…` — 0002** |

`0004_snapshot.json` chains directly to 0002. The journal-completeness gate
(issue #89, `tests/unit/drizzle-migration.test.ts:150`) checks `*.sql` against
`_journal.json` and never looks at `meta/*_snapshot.json`, so the gap is
invisible.

### The fix, measured

Replace the whole of `0004_theme_preference.sql` with a single statement:

```sql
ALTER TABLE `users` ADD COLUMN `theme_preference` text DEFAULT 'system' NOT NULL
  CONSTRAINT "users_theme_preference_check"
  CHECK("theme_preference" in ('light', 'dark', 'system'));
```

SQLite permits a named `CHECK` in `ADD COLUMN`, and `ADD COLUMN` never touches
child tables, so it runs inside Drizzle's transaction with child rows present.

Against a copy of the real `data/fittrack.db`:

| Table | Rows before | Rows after |
| --- | --- | --- |
| users | 2 | 2 |
| programs | 53 | 53 |
| workout_sessions | 372 | 372 |
| food_log | 14 | 14 |
| meal_templates | 12 | 12 |
| body_logs | 1 | 1 |
| meal_plans | 1 | 1 |
| push_subscriptions | 1 | 1 |
| notification_preferences | 1 | 1 |

| Assertion | Result |
| --- | --- |
| `migrate()` | SUCCEEDED |
| `theme_preference` per user | `[{id:1,"system"},{id:2,"system"}]` |
| `PRAGMA foreign_key_check` | `[]` |
| `PRAGMA integrity_check` | `ok` |
| `UPDATE … SET theme_preference='sepia'` | throws `CHECK constraint failed: users_theme_preference_check` |
| `__drizzle_migrations` rows | 5 |

Across the three shapes the current tests and the developer care about:

| Shape | Current 0004 | `ADD COLUMN` 0004 |
| --- | --- | --- |
| Fresh database, 0000→0004 | ok | ok — `notnull: 1`, `dflt_value: "'system'"` |
| At 0003, users only | ok | ok |
| At 0003, users **+ one child row** | **FK failure** | ok, child row preserved |

The column metadata the existing tests assert (`notnull: 1`,
`dflt_value: "'system'"`) and the constraint name they match
(`/users_theme_preference_check/`) are both unchanged. Only the column's
ordinal position moves, which no test asserts.

Editing 0004 in place is safe for databases that already applied it: Drizzle
skips a migration by comparing `folderMillis` from `_journal.json`, not the SQL
hash (`dialect.cjs:679`), and `_journal.json` is untouched.

## Problem 1 — `PRAGMA foreign_keys=OFF` is inert inside Drizzle's transaction

`drizzle/0004_theme_preference.sql:1` is `PRAGMA foreign_keys=OFF;`. Drizzle
runs it after `BEGIN`, where SQLite ignores it. `drizzle/0004_theme_preference.sql:20`
(`` DROP TABLE `users`; ``) then fails against any database with a row
referencing `users.id`. Evidence: probe A, and the reproduction against the real
file with 455 dependent rows.

0004 is the only migration in `drizzle/` that recreates a table; 0000–0003 use
`CREATE TABLE` and `ALTER TABLE … ADD` only. `drizzle/0003_sync_queue_user_id.sql`
is the repo's established convention and is a plain `ADD` — the fix follows it.

## Problem 2 — the 0004 gate never creates a dependent row

`tests/unit/drizzle-migration.test.ts:290` runs the real transactional migrator
against a database at 0003 with two `users` rows and no children, which is the
one population where the defect cannot fire. Adding a single `programs` row
turns the assertion red. The defect and the reason it was invisible are separate
problems, and this is the second one.

## Problem 3 — recovery stops at migration 0002

`src/db/recover-dev-database.ts:20-33` declares markers for 0000, 0001 and 0002.
A database whose schema is at 0003 or 0004 with a truncated journal cannot be
backfilled past 0002, so recovery replays 0003 and dies on
`duplicate column name: user_id`. Measured above.

## Problem 4 — the failing migration is identified by substring match

`src/db/migration-diagnostics.ts:96` returns the first migration whose SQL text
`.includes(objectName)`. For `duplicate column name: user_id` that is
`0000_jazzy_zaran`, not `0003_sync_queue_user_id`. The developer-facing error
names the wrong file. (The 0004 report in this incident happened to be correct,
because `` DROP TABLE `users` `` appears in no earlier migration — the resolver
was lucky, not right.)

## Problem 5 — `drizzle/meta/0003_snapshot.json` is missing

The snapshot chain runs 0000 → 0001 → 0002 → 0004, skipping 0003 entirely, and
no gate covers it. `drizzle-kit generate` diffs against the newest snapshot, so
the recorded lineage of the schema is wrong by one migration.

## Stance

The one-line patch is to change `PRAGMA foreign_keys=OFF` to
`PRAGMA defer_foreign_keys=ON`. It was tried and it fails at `COMMIT` — see the
statement-by-statement table. The second one-line patch is to wrap `migrate()`
in `foreign_keys = OFF` / `ON` inside `src/db/index.ts`. That would work, and it
is worse: it disables referential integrity for every migration this project
will ever run, to accommodate one migration that did not need to recreate a
table at all. The column is nullable-free, defaulted, and constrained — SQLite
adds it in place.

So the fix is to make 0004 stop recreating `users`. But shipping only that
leaves the repo in the state that produced the outage: a migration gate that
green-lights a destructive table recreate because it forgot to insert a child
row, a recovery command that cannot recover anything newer than 0002 and names
the wrong migration when it fails, and a snapshot chain missing a link. Each is
independently able to produce the next incident.

## Constraints

- No weakening of an existing gate to make a new one pass. In particular the
  assertions on `notnull: 1`, `dflt_value: "'system'"`, and
  `/users_theme_preference_check/` in `tests/unit/drizzle-migration.test.ts`
  stay exactly as they are.
- `drizzle/meta/_journal.json` is not edited. Changing a `when` value would make
  every already-migrated database re-run 0004.
- No migration may be deleted or renumbered. 0004 is edited in place.
- No `PRAGMA foreign_keys=OFF` around `migrate()` in `src/db/index.ts`.
  `src/db/index.ts:45` keeps enforcement on.
- No solution may require deleting `data/fittrack.db`. The 455 rows are the
  thing being protected.
- Nothing routes to human review or manual smoke testing.

## Batch 1 — Add `users.theme_preference` in place (#107)

Replace the contents of `drizzle/0004_theme_preference.sql` with the single
`ALTER TABLE … ADD COLUMN` statement measured above. No other file changes.
This is the batch a human is blocked on; it ships alone.

## Batch 2 — Gate migration 0004 against dependent rows (#108)

Add a test that builds a database at 0003, inserts a user **and at least one row
in each table holding a foreign key to `users.id`**, runs the real
`runMigrations`, and asserts every child row survives with
`PRAGMA foreign_key_check` empty. Demonstrated failing on `279c2d0`.

## Batch 3 — Recover databases at 0003 and later (#109)

Extend `APPLIED_MIGRATION_MARKERS` with detectors for `0003_sync_queue_user_id`
(`sync_queue.user_id` exists) and `0004_theme_preference`
(`users.theme_preference` exists).

## Batch 4 — Identify the failing migration by execution order (#110)

Replace the substring match at `src/db/migration-diagnostics.ts:96` with a match
on the statement that actually failed.

## Batch 5 — Gate recovery and tag attribution past 0002 (#111)

One gate batch covering batches 3 and 4: recovery succeeds from a 0003-schema
and a 0004-schema database with an empty journal, and a failure inside 0003
reports `0003_sync_queue_user_id`. Demonstrated failing on `279c2d0`.

## Batch 6 — Restore `drizzle/meta/0003_snapshot.json` (#112)

Insert the missing snapshot and repoint `0004_snapshot.json`'s `prevId` at it.

## Batch 7 — Gate snapshot-chain completeness (#113)

Extend the journal-completeness test to assert one snapshot per journal entry
and an unbroken `prevId` chain. Demonstrated failing on `279c2d0`.

## Sequencing

Batch 1 unblocks the human and is the only urgent item — it ships first and
alone, with the `priority` label. Batch 2 lands immediately after it and must
never be bundled with it.

Batches 3, 4, 6 are independent of batch 1 and of each other, and may land in
any order. Batch 5 depends on 3 and 4. Batch 7 depends on 6.

## Out of scope

- **`src/lib/theme-preference-persistence.ts`.** It is modified in the working
  tree by an in-flight dev-loop run and is not part of this PRD. Do not stage,
  revert, or edit it.
- **The theme feature itself** — the server functions from `f806e97`, the
  first-paint work from `ba1f4c7`, the Settings control from `5dcce94`. All of
  it is correct and none of it is implicated. This PRD is not closable by
  changing how theme preference is read, written, or rendered.
- **`data/e2e-fittrack.db`, `data/e2e-visual.db`, `data/measure-theme.db`.**
  Test databases. Deleting or regenerating one is not a fix for this PRD, and a
  batch that makes a gate pass by recreating a fixture database has fixed
  nothing.
- **Adding `ON DELETE CASCADE` to the ten foreign keys.** It would make
  `DROP TABLE users` succeed by deleting all 455 rows. Naming it explicitly to
  close it: no batch here may add or change a foreign key action.
- **Migrating off Drizzle's migrator, or introducing a custom runner** that
  executes migrations outside a transaction. The transaction is a feature — it
  is why the failed migration rolled back cleanly and left the database intact.
- **Widening `THEME_PREFERENCE_CHECK_VALUES` or dropping the `CHECK`
  constraint** to sidestep the table recreate. The constraint and its name are
  asserted by existing tests and stay.
- **`resolveRecoveryAction`'s destructive-reset path.** Its `--force` semantics
  are unchanged by this PRD; batch 3 only adds detectors.
