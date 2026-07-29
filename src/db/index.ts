import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { DatabaseMigrationError, runMigrations } from "./migration-diagnostics";
import { resolveDbPath } from "./paths";
import * as relations from "./relations";
import * as schema from "./schema";

const fullSchema = { ...schema, ...relations };

export type FitTrackDatabase = BetterSQLite3Database<typeof fullSchema>;

let sqliteInstance: Database.Database | null = null;
let drizzleInstance: FitTrackDatabase | null = null;
let migrationBootFailure: {
  dbPath: string;
  migrationTag: string;
  sqliteMessage: string;
} | null = null;

function throwStoredMigrationFailure(): void {
  if (migrationBootFailure === null) {
    return;
  }

  throw new DatabaseMigrationError(
    migrationBootFailure.dbPath,
    migrationBootFailure.migrationTag,
    migrationBootFailure.sqliteMessage,
    null
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
  throwStoredMigrationFailure();

  if (!drizzleInstance) {
    const dbPath = resolveDbPath();
    const sqlite = initSqlite();
    const instance = drizzle(sqlite, { schema: fullSchema });
    try {
      runMigrations(instance, { dbPath });
    } catch (error) {
      if (error instanceof DatabaseMigrationError) {
        migrationBootFailure = {
          dbPath: error.dbPath,
          migrationTag: error.migrationTag,
          sqliteMessage: error.sqliteMessage,
        };
        throw error;
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error), { cause: error });
    }
    drizzleInstance = instance;
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
