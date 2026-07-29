import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import type { FitTrackDatabase } from "../../src/db";
import * as relations from "../../src/db/relations";
import * as schema from "../../src/db/schema";
import {
  bodyLogs,
  foodLog,
  mealPlans,
  notificationPreferences,
  programDays,
  programs,
  pushSubscriptions,
  syncQueue,
  workoutSessions,
  workoutSets,
} from "../../src/db/schema";
import type { UserRecord } from "../../src/db/user-body-queries";
import { readAllMigrationSql } from "./migration-sql";

const LOG_DATE = "2026-07-28";

export interface DataIsolationFixture {
  close: () => void;
  db: FitTrackDatabase;
  exerciseId: number;
  foodId: number;
  owner: UserRecord;
  ownerBodyLogId: number;
  ownerClientId: string;
  ownerEndpoint: string;
  ownerFoodLogId: number;
  ownerMealPlanDate: string;
  ownerMealPlanMealType: "lunch";
  ownerProgramDayId: number;
  ownerProgramId: number;
  ownerSessionId: number;
  ownerSetId: number;
  ownerTemplateId: number;
  other: UserRecord;
  otherClientId: string;
  otherEndpoint: string;
  otherProgramDayId: number;
  otherProgramId: number;
  otherSessionId: number;
  otherSetId: number;
  otherTemplateId: number;
  sqlite: Database.Database;
}

/** Two users with rows across every user-owned table (issue #84). */
export function seedDataIsolationFixture(): DataIsolationFixture {
  const sqlite = new Database(":memory:");
  sqlite.exec(readAllMigrationSql());
  const db = drizzle(sqlite, {
    schema: { ...schema, ...relations },
  }) as unknown as FitTrackDatabase;

  const ownerId = db.insert(schema.users).values({}).returning().get().id;
  const otherId = db.insert(schema.users).values({}).returning().get().id;
  const exerciseId = db
    .insert(schema.exercises)
    .values({ muscleGroup: "chest", name: "Bench Press" })
    .returning()
    .get().id;
  const foodId = db
    .insert(schema.foods)
    .values({
      caloriesPerServing: 200,
      carbsG: 10,
      fatG: 5,
      name: "Isolation Food",
      proteinG: 20,
    })
    .returning()
    .get().id;

  const ownerProgramId = db
    .insert(programs)
    .values({
      frequencyPerWeek: 3,
      isActive: 1,
      name: "Owner Program",
      periodizationType: "linear",
      userId: ownerId,
    })
    .returning()
    .get().id;
  const otherProgramId = db
    .insert(programs)
    .values({
      frequencyPerWeek: 3,
      isActive: 1,
      name: "Other Program",
      periodizationType: "linear",
      userId: otherId,
    })
    .returning()
    .get().id;

  const ownerProgramDayId = db
    .insert(programDays)
    .values({
      dayName: "Owner Push",
      programId: ownerProgramId,
      sortOrder: 1,
    })
    .returning()
    .get().id;
  const otherProgramDayId = db
    .insert(programDays)
    .values({
      dayName: "Other Push",
      programId: otherProgramId,
      sortOrder: 1,
    })
    .returning()
    .get().id;

  const ownerSessionId = db
    .insert(workoutSessions)
    .values({ date: LOG_DATE, name: "Owner Push", userId: ownerId })
    .returning()
    .get().id;
  const otherSessionId = db
    .insert(workoutSessions)
    .values({ date: LOG_DATE, name: "Other Push", userId: otherId })
    .returning()
    .get().id;

  const ownerSetId = db
    .insert(workoutSets)
    .values({
      exerciseId,
      reps: 8,
      rpe: 7,
      sessionId: ownerSessionId,
      setNumber: 1,
      weightKg: 60,
    })
    .returning()
    .get().id;
  const otherSetId = db
    .insert(workoutSets)
    .values({
      exerciseId,
      reps: 8,
      rpe: 7,
      sessionId: otherSessionId,
      setNumber: 1,
      weightKg: 60,
    })
    .returning()
    .get().id;

  const ownerTemplateId = db
    .insert(schema.mealTemplates)
    .values({ name: "Owner Template", userId: ownerId })
    .returning()
    .get().id;
  const otherTemplateId = db
    .insert(schema.mealTemplates)
    .values({ name: "Other Template", userId: otherId })
    .returning()
    .get().id;

  db.insert(schema.mealTemplateItems)
    .values({
      foodId,
      servings: 1,
      sortOrder: 1,
      templateId: ownerTemplateId,
    })
    .run();
  db.insert(schema.mealTemplateItems)
    .values({
      foodId,
      servings: 1,
      sortOrder: 1,
      templateId: otherTemplateId,
    })
    .run();

  db.insert(mealPlans)
    .values({
      date: LOG_DATE,
      mealType: "lunch",
      templateId: ownerTemplateId,
      userId: ownerId,
    })
    .run();

  const ownerFoodLogId = db
    .insert(foodLog)
    .values({
      calories: 200,
      carbsG: 10,
      date: LOG_DATE,
      fatG: 5,
      foodId,
      mealType: "lunch",
      proteinG: 20,
      servings: 1,
      userId: ownerId,
    })
    .returning()
    .get().id;

  const ownerBodyLogId = db
    .insert(bodyLogs)
    .values({
      date: LOG_DATE,
      userId: ownerId,
      weightKg: 80,
    })
    .returning()
    .get().id;

  db.insert(notificationPreferences)
    .values({
      mealReminders: 1,
      userId: ownerId,
      workoutReminders: 0,
    })
    .run();
  db.insert(notificationPreferences)
    .values({
      mealReminders: 0,
      userId: otherId,
      workoutReminders: 1,
    })
    .run();

  const ownerClientId = "owner-sync-client";
  const otherClientId = "other-sync-client";
  db.insert(syncQueue)
    .values({
      clientId: ownerClientId,
      kind: "addFoodLogEntry",
      payload: "{}",
      queuedAt: "2026-07-28T12:00:00.000Z",
      status: "applied",
      userId: ownerId,
    })
    .run();
  db.insert(syncQueue)
    .values({
      clientId: otherClientId,
      kind: "addFoodLogEntry",
      payload: "{}",
      queuedAt: "2026-07-28T12:00:00.000Z",
      status: "applied",
      userId: otherId,
    })
    .run();

  const ownerEndpoint = "https://push.example.test/owner-user";
  const otherEndpoint = "https://push.example.test/other-user";
  db.insert(pushSubscriptions)
    .values({
      auth: "owner-auth",
      createdAt: "2026-07-28T12:00:00.000Z",
      endpoint: ownerEndpoint,
      p256dh: "owner-p256dh",
      userId: ownerId,
    })
    .run();
  db.insert(pushSubscriptions)
    .values({
      auth: "other-auth",
      createdAt: "2026-07-28T12:00:00.000Z",
      endpoint: otherEndpoint,
      p256dh: "other-p256dh",
      userId: otherId,
    })
    .run();

  const owner: UserRecord = {
    activityLevel: "moderate",
    authUserId: "auth-owner",
    birthDate: null,
    createdAt: "2026-01-01",
    email: "owner@example.com",
    goalType: "build_muscle",
    heightCm: 180,
    id: ownerId,
    name: "Owner",
    sex: "male",
    updatedAt: "2026-01-01",
  };
  const other: UserRecord = {
    activityLevel: "moderate",
    authUserId: "auth-other",
    birthDate: null,
    createdAt: "2026-01-01",
    email: "other@example.com",
    goalType: "build_muscle",
    heightCm: 175,
    id: otherId,
    name: "Other",
    sex: "female",
    updatedAt: "2026-01-01",
  };

  return {
    close: () => sqlite.close(),
    db,
    exerciseId,
    foodId,
    other,
    otherClientId,
    otherEndpoint,
    otherProgramDayId,
    otherProgramId,
    otherSessionId,
    otherSetId,
    otherTemplateId,
    owner,
    ownerBodyLogId,
    ownerClientId,
    ownerEndpoint,
    ownerFoodLogId,
    ownerMealPlanDate: LOG_DATE,
    ownerMealPlanMealType: "lunch",
    ownerProgramDayId,
    ownerProgramId,
    ownerSessionId,
    ownerSetId,
    ownerTemplateId,
    sqlite,
  };
}
