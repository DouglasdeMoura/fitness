import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { getDb } from "../lib/db";
import * as schema from "./schema";

export type FitTrackDatabase = BetterSQLite3Database<typeof schema>;

export const db: FitTrackDatabase = drizzle(getDb(), { schema });
