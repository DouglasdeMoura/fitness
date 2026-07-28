import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import type { FitTrackDatabase } from ".";
import { bodyLogs, users } from "./schema";

export type UserRecord = typeof users.$inferSelect;
export type BodyLogRecord = typeof bodyLogs.$inferSelect;
export type UserProfileUpdate = Partial<
  Pick<
    UserRecord,
    | "activityLevel"
    | "birthDate"
    | "email"
    | "goalType"
    | "heightCm"
    | "name"
    | "sex"
  >
>;

export interface BodyweightRecordInput {
  bodyFatPct?: number;
  date: string;
  notes?: string;
  weightKg: number;
}

/** Find or create FitTrack's single local user. Example: `await ensureDefaultUserRecord(db)`. */
export async function ensureDefaultUserRecord(
  database: FitTrackDatabase
): Promise<UserRecord> {
  const existingUser = await database.query.users.findFirst();
  if (existingUser) {
    return existingUser;
  }
  return database.insert(users).values({ heightCm: 178 }).returning().get();
}

/** Update one user's mutable profile fields. Example: `await updateUserRecord(db, 1, { name: "A" })`. */
export async function updateUserRecord(
  database: FitTrackDatabase,
  userId: number,
  profileUpdate: UserProfileUpdate
): Promise<UserRecord> {
  return database
    .update(users)
    .set({ ...profileUpdate, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .returning()
    .get();
}

/** List one user's body logs newest-first. Example: `await listBodyLogRecords(db, 1, 30)`. */
export async function listBodyLogRecords(
  database: FitTrackDatabase,
  userId: number,
  limit: number
): Promise<BodyLogRecord[]> {
  return database.query.bodyLogs.findMany({
    limit,
    orderBy: desc(bodyLogs.date),
    where: eq(bodyLogs.userId, userId),
  });
}

/** Insert or update a daily weigh-in. Example: `await upsertBodyweightRecord(db, 1, input)`. */
export async function upsertBodyweightRecord(
  database: FitTrackDatabase,
  userId: number,
  input: BodyweightRecordInput
): Promise<BodyLogRecord> {
  return database
    .insert(bodyLogs)
    .values({
      bodyFatPct: input.bodyFatPct ?? null,
      date: input.date,
      notes: input.notes ?? null,
      userId,
      weightKg: input.weightKg,
    })
    .onConflictDoUpdate({
      set: {
        bodyFatPct: sql`coalesce(excluded.body_fat_pct, ${bodyLogs.bodyFatPct})`,
        notes: sql`excluded.notes`,
        weightKg: sql`excluded.weight_kg`,
      },
      target: [bodyLogs.userId, bodyLogs.date],
    })
    .returning()
    .get();
}

/** Return the newest body log containing weight. Example: `await findLatestBodyweightRecord(db, 1)`. */
export async function findLatestBodyweightRecord(
  database: FitTrackDatabase,
  userId: number
): Promise<BodyLogRecord | undefined> {
  return database.query.bodyLogs.findFirst({
    orderBy: desc(bodyLogs.date),
    where: and(eq(bodyLogs.userId, userId), isNotNull(bodyLogs.weightKg)),
  });
}
