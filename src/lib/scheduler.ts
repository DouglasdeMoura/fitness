/**
 * Scheduled reminder delivery via authenticated cron HTTP endpoint (issue #67).
 * Burke et al. 2011: timely prompts support self-monitoring adherence.
 */

import type Database from "better-sqlite3";
import type {
  PushNotificationClient,
  ScheduledNotificationType,
  VapidConfig,
} from "./push";
import {
  getNotificationPreferences,
  hasPushSubscription,
  listUserIds,
  notificationSlotForNow,
  reminderPayloadForType,
  SCHEDULED_NOTIFICATION_TYPES,
  sendPushToUserSubscriptions,
  shouldDeliver,
  tryClaimNotificationDelivery,
} from "./push";

type EnvLike = Record<string, string | undefined>;

export interface SchedulerRunResult {
  delivered: number;
  skipped_duplicate: number;
  skipped_no_subscription: number;
  skipped_not_configured: number;
  skipped_not_due: number;
}

export interface RunScheduledNotificationsInput {
  client: PushNotificationClient;
  db: Database.Database;
  now: Date;
  vapid: VapidConfig | null;
}

/** Shared secret for external cron triggers; null when unset. */
export function readSchedulerSecret(env: EnvLike = process.env): string | null {
  const secret = env.SCHEDULER_SECRET?.trim();
  return secret || null;
}

/** Validates Bearer token or X-Scheduler-Secret header. */
export function verifySchedulerAuth(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization");
  if (authorization === `Bearer ${secret}`) {
    return true;
  }
  return request.headers.get("x-scheduler-secret") === secret;
}

async function deliverTypeForUser(
  input: RunScheduledNotificationsInput,
  userId: number,
  type: ScheduledNotificationType,
  slot: string
): Promise<
  "delivered" | "not_due" | "duplicate" | "no_subscription" | "not_configured"
> {
  const prefs = getNotificationPreferences(input.db, userId);
  if (!shouldDeliver(input.now, prefs, type)) {
    return "not_due";
  }
  if (!hasPushSubscription(input.db, userId)) {
    return "no_subscription";
  }
  if (!input.vapid) {
    return "not_configured";
  }
  if (!tryClaimNotificationDelivery(input.db, userId, type, slot)) {
    return "duplicate";
  }
  const payload = reminderPayloadForType(type);
  await sendPushToUserSubscriptions(
    input.db,
    input.client,
    input.vapid,
    userId,
    payload
  );
  return "delivered";
}

/**
 * Evaluate every user's scheduled reminders for the current minute.
 * @example await runScheduledNotifications({ db, now: new Date(), client, vapid })
 */
export async function runScheduledNotifications(
  input: RunScheduledNotificationsInput
): Promise<SchedulerRunResult> {
  const slot = notificationSlotForNow(input.now);
  const result: SchedulerRunResult = {
    delivered: 0,
    skipped_duplicate: 0,
    skipped_no_subscription: 0,
    skipped_not_configured: 0,
    skipped_not_due: 0,
  };

  for (const userId of listUserIds(input.db)) {
    for (const type of SCHEDULED_NOTIFICATION_TYPES) {
      const outcome = await deliverTypeForUser(input, userId, type, slot);
      switch (outcome) {
        case "delivered": {
          result.delivered += 1;
          break;
        }
        case "no_subscription": {
          result.skipped_no_subscription += 1;
          break;
        }
        case "not_due": {
          result.skipped_not_due += 1;
          break;
        }
        case "duplicate": {
          result.skipped_duplicate += 1;
          break;
        }
        case "not_configured": {
          result.skipped_not_configured += 1;
          break;
        }
        default: {
          const exhaustive: never = outcome;
          throw new Error(`Unhandled delivery outcome: ${exhaustive}`);
        }
      }
    }
  }

  return result;
}

/** HTTP entrypoint for external cron (issue #67). */
export async function handleSchedulerCronRequest(
  request: Request,
  deps: {
    db: Database.Database;
    client: PushNotificationClient;
    vapid: VapidConfig | null;
    env?: EnvLike;
    now?: Date;
  }
): Promise<Response> {
  const env = deps.env ?? process.env;
  const secret = readSchedulerSecret(env);
  if (!secret) {
    return jsonResponse({ error: "scheduler-not-configured" }, 503);
  }
  if (!verifySchedulerAuth(request, secret)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const result = await runScheduledNotifications({
    client: deps.client,
    db: deps.db,
    now: deps.now ?? new Date(),
    vapid: deps.vapid,
  });
  return jsonResponse(result, 200);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
