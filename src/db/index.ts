import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { getDb } from "../lib/db";
import * as relations from "./relations";
import * as schema from "./schema";

const fullSchema = { ...schema, ...relations };

export type FitTrackDatabase = BetterSQLite3Database<typeof fullSchema>;

export const db: FitTrackDatabase = drizzle(getDb(), { schema: fullSchema });
