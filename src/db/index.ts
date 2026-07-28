import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as relations from "./relations";
import * as schema from "./schema";

const fullSchema = { ...schema, ...relations };

export type FitTrackDatabase = BetterSQLite3Database<typeof fullSchema>;

let sqliteInstance: Database.Database | null = null;
let drizzleInstance: FitTrackDatabase | null = null;

function resolveDbPath(): string {
  return (
    process.env.DATABASE_PATH || join(process.cwd(), "data", "fittrack.db")
  );
}

function initSqlite(): Database.Database {
  if (!sqliteInstance) {
    const dbPath = resolveDbPath();
    // Synchronous on purpose — deferring mkdir to a microtask races `new Database()`.
    mkdirSync(dirname(dbPath), { recursive: true });
    sqliteInstance = new Database(dbPath);
    sqliteInstance.pragma("journal_mode = WAL");
    sqliteInstance.pragma("foreign_keys = ON");
  }
  return sqliteInstance;
}

function initDrizzle(): FitTrackDatabase {
  if (!drizzleInstance) {
    const sqlite = initSqlite();
    drizzleInstance = drizzle(sqlite, { schema: fullSchema });
    migrate(drizzleInstance, {
      migrationsFolder: join(process.cwd(), "drizzle"),
    });
  }
  return drizzleInstance;
}

/** Lazily opened SQLite handle — only used inside this module. */
export function getSqlite(): Database.Database {
  initDrizzle();
  return initSqlite();
}

/** Shared Drizzle database for server functions and scripts. */
export const db: FitTrackDatabase = new Proxy({} as FitTrackDatabase, {
  get(_target, prop, receiver) {
    const instance = initDrizzle();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type {
  BodyLog,
  Exercise,
  Food,
  FoodLogEntry,
  MealPlan,
  MealTemplate,
  MealTemplateItem,
  MealType,
  NotificationDeliveryRow,
  NotificationPreferencesRow,
  PeriodizationType,
  Program,
  ProgramDay,
  ProgramExercise,
  PushSubscription,
  User,
  WorkoutSession,
  WorkoutSet,
} from "./types";
