import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import type { FitTrackDatabase } from "../../src/db";
import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import { readAllMigrationSql } from "./migration-sql";

export interface DrizzleTestDb {
  close: () => void;
  db: FitTrackDatabase;
  exerciseId: number;
  foodId: number;
  sqlite: Database.Database;
  userId: number;
}

/**
 * In-memory database seeded with one user, one exercise, and one food.
 *
 * Relations are registered alongside the schema so `with:` joins resolve —
 * without them `findFirst({ with: { sets: ... } })` throws at query build time.
 *
 * @example
 * let fixture: DrizzleTestDb;
 * beforeEach(() => { fixture = createDrizzleTestDb(); });
 * afterEach(() => fixture.close());
 */
export function createDrizzleTestDb(): DrizzleTestDb {
  const sqlite = new Database(":memory:");
  sqlite.exec(readAllMigrationSql());

  const db = drizzle(sqlite, { schema: { ...schema, ...relations } });

  const userId = db.insert(schema.users).values({}).returning().get().id;
  const exerciseId = db
    .insert(schema.exercises)
    .values({ muscleGroup: "chest", name: "Bench Press" })
    .returning()
    .get().id;
  const foodId = db
    .insert(schema.foods)
    .values({
      caloriesPerServing: 100,
      carbsG: 10,
      fatG: 2,
      name: "Test Food",
      proteinG: 8,
    })
    .returning()
    .get().id;

  return {
    close: () => sqlite.close(),
    db,
    exerciseId,
    foodId,
    sqlite,
    userId,
  };
}

/** In-memory Drizzle DB with migrations applied and one default user. */
export function createDrizzleMemoryDb(): DrizzleTestDb {
  return createDrizzleTestDb();
}
