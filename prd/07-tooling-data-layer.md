# PRD: Tooling & Data Layer — Ultracite/Oxc, Lefthook, Drizzle ORM

## Overview

Two parallel improvements:

1. **Linting & Formatting**: Replace ad-hoc tooling with Ultracite (Oxfmt + Oxlint) enforced by Lefthook git hooks.
2. **Data Layer**: Replace all 96 raw SQL queries with Drizzle ORM for type-safe database access, schema-as-code migrations, and an excellent developer experience.

## Part 1: Linting & Formatting

### Problem

No formatter or linter is configured. Code style is inconsistent across files (different indentation patterns, unused imports, etc.). Nothing prevents bad code from being committed.

### Solution: Ultracite + Oxc + Lefthook

**Ultracite** is an "AI-ready formatter" that configures **Oxfmt** (formatter) and **Oxlint** (linter) with opinionated, battle-tested defaults. It's designed to be zero-config — install and run.

**Lefthook** is a fast Git hooks manager (alternative to Husky) that runs formatting and linting on every commit via a pre-commit hook.

### Setup

```bash
# Install
npm install -D ultracite oxlint oxfmt lefthook

# Initialize Ultracite (generates .oxlintrc.json, .oxfmtrc.json)
npx ultracite init

# Initialize Lefthook (generates lefthook.yml)
npx lefthook install
```

### Lefthook Configuration (`lefthook.yml`)

```yaml
pre-commit:
  parallel: true
  commands:
    format:
      run: npx oxfmt --write src/ tests/ scripts/
      glob: "*.{ts,tsx,mjs}"
    lint:
      run: npx oxlint --fix src/ tests/ scripts/
      glob: "*.{ts,tsx,mjs}"
      stage_fixed: true
```

### package.json Scripts

```json
{
  "scripts": {
    "lint": "oxlint src/ tests/ scripts/",
    "lint:fix": "oxlint --fix src/ tests/ scripts/",
    "format": "oxfmt --write src/ tests/ scripts/",
    "format:check": "oxfmt --check src/ tests/ scripts/",
    "prepare": "lefthook install"
  }
}
```

### Rules

- Every commit triggers Oxfmt formatting + Oxlint linting via Lefthook
- The `prepare` script installs Lefthook hooks automatically on `npm install`
- CI should run `npm run lint && npm run format:check` to enforce
- Oxfmt handles all formatting (indentation, semicolons, quotes, etc.)
- Oxlint handles code quality (unused imports, unsafe patterns, etc.)

## Part 2: Drizzle ORM Migration

### Problem

All database access uses raw SQL strings via `better-sqlite3` directly:

- **96 raw SQL queries** across `src/lib/api.ts` and `src/lib/db.ts`
- No type safety on query results (manual casting with `as Type`)
- No schema-as-code — schema lives in `schema.sql`, disconnected from the app
- No migration system — schema changes require manual SQL editing
- IDE autocomplete doesn't work for table/column names
- Renaming a column requires grepping SQL strings

### Solution: Drizzle ORM

**Drizzle** provides:

- **Type-safe queries** — autocomplete for tables, columns, and results
- **Schema-as-code** — TypeScript definitions are the source of truth
- **Migration system** — `drizzle-kit` generates and applies SQL migrations
- **Query builder** — composable, type-safe query construction
- **Raw SQL escape hatch** — `sql` template tag for complex queries when needed

### Setup

```bash
npm install drizzle-orm
npm install -D drizzle-kit
```

### Schema Definition (`src/db/schema.ts`)

Replace `src/lib/schema.sql` with TypeScript:

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default("Athlete"),
  email: text("email").unique(),
  birthDate: text("birth_date"),
  sex: text("sex", { enum: ["male", "female", "other"] })
    .notNull()
    .default("male"),
  heightCm: real("height_cm"),
  activityLevel: text("activity_level").notNull().default("moderate"),
  goalType: text("goal_type").notNull().default("build_muscle"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const foods = sqliteTable("foods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  brand: text("brand"),
  servingSize: real("serving_size").notNull().default(100),
  servingUnit: text("serving_unit").notNull().default("g"),
  caloriesPerServing: real("calories_per_serving").notNull(),
  proteinG: real("protein_g").notNull().default(0),
  carbsG: real("carbs_g").notNull().default(0),
  fatG: real("fat_g").notNull().default(0),
  fiberG: real("fiber_g").default(0),
  sugarG: real("sugar_g").default(0),
  sodiumMg: real("sodium_mg").default(0),
  source: text("source").notNull().default("user"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ... (all tables defined in schema.sql)
```

### Database Connection (`src/db/index.ts`)

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("data/fittrack.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
```

### Migration Workflow

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Studio (visual database browser)
npx drizzle-kit studio
```

### Drizzle Config (`drizzle.config.ts`)

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: "./data/fittrack.db" },
});
```

### Query Migration Examples

**Before (raw SQL):**

```typescript
const user = db.prepare("SELECT * FROM users LIMIT 1").get() as
  User | undefined;
```

**After (Drizzle):**

```typescript
const result = await db.query.users.findFirst();
// Fully typed — result is { id: number, name: string, ... } | undefined
```

**Before:**

```typescript
db.prepare(
  `INSERT INTO foods (name, brand, serving_size, ...) VALUES (?, ?, ?, ...)`
).run(name, brand, serving, ...)
```

**After:**

```typescript
await db.insert(foods).values({ name, brand, servingSize: serving, ... })
// Type-checked — wrong column names are compile errors
```

**Before:**

```typescript
db
  .prepare("SELECT * FROM food_log WHERE user_id = ? AND date = ?")
  .all(userId, date) as FoodLogEntry[];
```

**After:**

```typescript
await db.query.foodLog.findMany({
  where: and(eq(foodLog.userId, userId), eq(foodLog.date, date)),
  orderBy: [foodLog.mealType, foodLog.createdAt],
});
// Result is fully typed — no manual casting
```

## Batches

### Batch 1: Install and Configure Ultracite + Lefthook

- Install ultracite, oxlint, oxfmt, lefthook
- Run `npx ultracite init` to generate configs
- Create `lefthook.yml` with pre-commit hooks
- Add `lint`, `format`, `prepare` scripts to package.json
- Run formatter on entire codebase (one big formatting commit)
- Fix any lint errors

### Batch 2: Install Drizzle + Define Schema

- Install drizzle-orm, drizzle-kit
- Create `src/db/schema.ts` with all tables from `schema.sql`
- Create `src/db/index.ts` with Drizzle connection
- Create `drizzle.config.ts`
- Generate initial migration from schema
- Keep existing `schema.sql` as reference during transition

### Batch 3: Migrate User/Body Log Queries to Drizzle

- Migrate all user-related queries (getUser, updateUser, ensureDefaultUser)
- Migrate body log queries (getBodyLogs, logBodyweight, getLatestBodyweight)
- Migrate dashboard stats queries
- Remove manual TypeScript types (use Drizzle's inferred types instead)

### Batch 4: Migrate Food/FoodLog Queries to Drizzle

- Migrate food queries (searchFoods, getAllFoods, addFood)
- Migrate food log queries (getFoodLog, addFoodLogEntry, deleteFoodLogEntry)
- Migrate nutrition summary and weekly nutrition queries

### Batch 5: Migrate Workout/Exercise Queries to Drizzle

- Migrate exercise queries
- Migrate workout session queries (CRUD)
- Migrate workout set queries (CRUD)
- Migrate weekly volume analysis query
- Migrate program-related queries

### Batch 6: Cleanup — Remove Raw SQL + Schema.sql

- Delete `src/lib/schema.sql` (schema is now TypeScript)
- Delete `src/lib/db.ts` (replaced by `src/db/index.ts`)
- Remove all `as Type` casts from api.ts (using Drizzle inferred types)
- Update seed script to use Drizzle
- Update any test helpers that reference raw DB

## Acceptance Criteria

### Linting & Formatting

- [ ] `npm run format` formats the entire codebase
- [ ] `npm run lint` passes with zero errors
- [ ] Lefthook runs format + lint on every commit
- [ ] `npm run prepare` installs hooks on `npm install`
- [ ] No eslint configs remain (replaced by oxlint)

### Drizzle ORM

- [ ] All 96 raw SQL queries replaced with Drizzle query builder
- [ ] Zero `as Type` manual castsings on query results
- [ ] `src/db/schema.ts` is the single source of truth for schema
- [ ] `schema.sql` deleted
- [ ] `npx drizzle-kit generate` produces correct migrations
- [ ] `npx drizzle-kit studio` works for visual DB browsing
- [ ] Seed script uses Drizzle
- [ ] All unit tests pass
- [ ] All e2e tests pass
- [ ] Build succeeds
