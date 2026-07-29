import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import type { FitTrackDatabase } from ".";
import type { UserProfileUpdate } from "../lib/schemas/user";
import { bodyLogs, users } from "./schema";

export type UserRecord = typeof users.$inferSelect;
export type BodyLogRecord = typeof bodyLogs.$inferSelect;
export type { UserProfileUpdate } from "../lib/schemas/user";

export interface AuthSessionUser {
  activityLevel?: string | null;
  birthDate?: string | null;
  email: string;
  goalType?: string | null;
  heightCm?: number | null;
  id: string;
  name: string;
  sex?: string | null;
}

export interface BodyweightRecordInput {
  bodyFatPct?: number;
  date: string;
  notes?: string;
  weightKg: number;
}

/** Link a Better Auth user to a legacy FitTrack profile row (issue #44). */
export async function ensureSessionUserRecord(
  database: FitTrackDatabase,
  authUser: AuthSessionUser
): Promise<UserRecord> {
  const linkedUser = await database.query.users.findFirst({
    where: eq(users.authUserId, authUser.id),
  });
  if (linkedUser) {
    return linkedUser;
  }

  return database
    .insert(users)
    .values({
      activityLevel:
        (authUser.activityLevel as UserRecord["activityLevel"] | undefined) ??
        "moderate",
      authUserId: authUser.id,
      birthDate: authUser.birthDate ?? null,
      email: authUser.email,
      goalType:
        (authUser.goalType as UserRecord["goalType"] | undefined) ??
        "build_muscle",
      heightCm: authUser.heightCm ?? null,
      name: authUser.name,
      sex: (authUser.sex as UserRecord["sex"] | undefined) ?? "male",
    })
    .returning()
    .get();
}

/** Attach legacy seed rows to a demo auth account during migration (issue #44). */
export async function linkLegacyUserToAuthAccount(
  database: FitTrackDatabase,
  legacyUserId: number,
  authUserId: string,
  email: string
): Promise<UserRecord> {
  return database
    .update(users)
    .set({ authUserId, email })
    .where(eq(users.id, legacyUserId))
    .returning()
    .get();
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

/** Persist one user's theme preference (issue #102). */
export async function updateThemePreferenceRecord(
  database: FitTrackDatabase,
  userId: number,
  themePreference: UserRecord["themePreference"]
): Promise<UserRecord> {
  return database
    .update(users)
    .set({ themePreference, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .returning()
    .get();
}
