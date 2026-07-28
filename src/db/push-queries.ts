import { count, desc, eq } from "drizzle-orm";

import type { FitTrackDatabase } from "./index";
import { notificationDeliveries, pushSubscriptions, users } from "./schema";

export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;

export function toLegacyPushSubscriptionRow(record: PushSubscriptionRecord): {
  auth: string;
  created_at: string;
  endpoint: string;
  id: number;
  p256dh: string;
  user_id: number;
} {
  return {
    auth: record.auth,
    created_at: record.createdAt,
    endpoint: record.endpoint,
    id: record.id,
    p256dh: record.p256dh,
    user_id: record.userId,
  };
}

export function upsertPushSubscription(
  database: FitTrackDatabase,
  userId: number,
  input: {
    endpoint: string;
    keys: { auth: string; p256dh: string };
  }
): void {
  const createdAt = new Date().toISOString();
  database
    .insert(pushSubscriptions)
    .values({
      auth: input.keys.auth,
      createdAt,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      userId,
    })
    .onConflictDoUpdate({
      set: {
        auth: input.keys.auth,
        createdAt,
        p256dh: input.keys.p256dh,
        userId,
      },
      target: pushSubscriptions.endpoint,
    })
    .run();
}

export function deletePushSubscriptionByEndpoint(
  database: FitTrackDatabase,
  endpoint: string
): boolean {
  const result = database
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .run();
  return result.changes > 0;
}

export function listPushSubscriptionsForUser(
  database: FitTrackDatabase,
  userId: number
) {
  return database
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt))
    .all()
    .map(toLegacyPushSubscriptionRow);
}

export function hasPushSubscription(
  database: FitTrackDatabase,
  userId: number
): boolean {
  const row = database
    .select({ count: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .get();
  return (row?.count ?? 0) > 0;
}

export function tryClaimNotificationDelivery(
  database: FitTrackDatabase,
  userId: number,
  type: string,
  slot: string
): boolean {
  const deliveredAt = new Date().toISOString();
  const result = database
    .insert(notificationDeliveries)
    .values({ deliveredAt, slot, type, userId })
    .onConflictDoNothing()
    .run();
  return result.changes > 0;
}

export function listUserIds(database: FitTrackDatabase): number[] {
  return database
    .select({ id: users.id })
    .from(users)
    .orderBy(users.id)
    .all()
    .map((row) => row.id);
}
