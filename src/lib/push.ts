/**
 * Web Push subscription storage and delivery (issue #65 / PRD 11 Batch 3).
 *
 * Server code signs outgoing pushes with VAPID keys from the environment.
 * Client helpers decide which Settings UI to render without throwing when
 * VAPID_PUBLIC_KEY is absent.
 */

import type Database from "better-sqlite3";

import type { NotificationType } from "./notification-preferences";
import { isIosDevice } from "./pwa-install";

// --- Types ---

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export type PushSendResult =
  | { status: "sent"; endpoint: string }
  | { status: "gone"; endpoint: string }
  | { status: "failed"; endpoint: string; error: string };

export type PushUiMode =
  | "not-configured"
  | "unsupported"
  | "ios-install-required"
  | "prompt-enable"
  | "subscribed"
  | "denied";

export interface PushEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  isStandalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  vapidConfigured: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
}

// --- UI copy ---

export const PUSH_CARD_TITLE = "Push Notifications";
export const PUSH_NOT_CONFIGURED_MESSAGE =
  "Push notifications are not configured on this server.";
export const PUSH_IOS_INSTALL_MESSAGE =
  "On iPhone and iPad, add FitTrack to your Home Screen to enable push notifications.";
export const PUSH_UNSUPPORTED_MESSAGE =
  "This browser does not support Web Push notifications.";
export const PUSH_ENABLE_BUTTON = "Enable notifications";
export const PUSH_DISABLE_BUTTON = "Disable notifications";
export const PUSH_TEST_BUTTON = "Send test notification";
export const PUSH_DENIED_MESSAGE =
  "Notifications are blocked. Enable them in your browser settings to receive alerts.";
export const PUSH_SUBSCRIBED_MESSAGE =
  "Notifications are enabled for this device.";
export const PUSH_TEST_SUCCESS_MESSAGE = "Test notification sent.";
export const PUSH_TEST_FAILURE_MESSAGE =
  "Could not send the test notification.";

export const TEST_PUSH_PAYLOAD: PushPayload = {
  body: "Push notifications are working.",
  tag: "fittrack-test",
  title: "FitTrack test",
  url: "/settings",
};

// --- VAPID config ---

type EnvLike = Record<string, string | undefined>;

/** Public key for the client, or null when push is not configured. */
export function readVapidPublicKey(env: EnvLike = process.env): string | null {
  const key = env.VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

/** Full VAPID config for signing pushes, or null when keys are missing. */
export function readVapidConfig(
  env: EnvLike = process.env
): VapidConfig | null {
  const publicKey = readVapidPublicKey(env);
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    return null;
  }
  const subject = env.VAPID_SUBJECT?.trim() || "mailto:fittrack@example.com";
  return { privateKey, publicKey, subject };
}

// --- Database ---

export function upsertPushSubscription(
  db: Database.Database,
  userId: number,
  input: PushSubscriptionInput
): void {
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       created_at = excluded.created_at`
  ).run(userId, input.endpoint, input.keys.p256dh, input.keys.auth, createdAt);
}

export function deletePushSubscriptionByEndpoint(
  db: Database.Database,
  endpoint: string
): boolean {
  const result = db
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .run(endpoint);
  return result.changes > 0;
}

export function listPushSubscriptionsForUser(
  db: Database.Database,
  userId: number
): PushSubscriptionRow[] {
  return db
    .prepare(
      "SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as PushSubscriptionRow[];
}

export function hasPushSubscription(
  db: Database.Database,
  userId: number
): boolean {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?"
    )
    .get(userId) as { count: number };
  return row.count > 0;
}

// --- Delivery ---

export interface PushNotificationClient {
  sendNotification(
    subscription: PushSubscriptionInput,
    payload: PushPayload,
    vapid: VapidConfig
  ): Promise<{ statusCode: number }>;
}

/** Production client backed by the web-push library. */

/** Named fake for unit tests — returns a fixed HTTP status (issue #65). */
export class FakePushNotificationClient implements PushNotificationClient {
  readonly calls: { endpoint: string; payload: PushPayload }[] = [];

  constructor(private readonly statusCode = 200) {}

  async sendNotification(
    subscription: PushSubscriptionInput,
    payload: PushPayload,
    _vapid: VapidConfig
  ): Promise<{ statusCode: number }> {
    this.calls.push({ endpoint: subscription.endpoint, payload });
    return { statusCode: this.statusCode };
  }
}

function rowToInput(row: PushSubscriptionRow): PushSubscriptionInput {
  return {
    endpoint: row.endpoint,
    keys: { auth: row.auth, p256dh: row.p256dh },
  };
}

function isGoneStatus(statusCode: number): boolean {
  return statusCode === 410 || statusCode === 404;
}

/** Send one push; prune the subscription when the push service returns 410 Gone. */
export async function sendPushToSubscription(
  client: PushNotificationClient,
  vapid: VapidConfig,
  row: PushSubscriptionRow,
  payload: PushPayload,
  pruneGone: (endpoint: string) => boolean
): Promise<PushSendResult> {
  try {
    const { statusCode } = await client.sendNotification(
      rowToInput(row),
      payload,
      vapid
    );
    if (isGoneStatus(statusCode)) {
      pruneGone(row.endpoint);
      return { endpoint: row.endpoint, status: "gone" };
    }
    if (statusCode < 200 || statusCode >= 300) {
      return {
        endpoint: row.endpoint,
        error: `Push service responded with HTTP ${statusCode}`,
        status: "failed",
      };
    }
    return { endpoint: row.endpoint, status: "sent" };
  } catch (error) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : null;
    if (statusCode != null && isGoneStatus(statusCode)) {
      pruneGone(row.endpoint);
      return { endpoint: row.endpoint, status: "gone" };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { endpoint: row.endpoint, error: message, status: "failed" };
  }
}

export async function sendPushToUserSubscriptions(
  db: Database.Database,
  client: PushNotificationClient,
  vapid: VapidConfig,
  userId: number,
  payload: PushPayload
): Promise<PushSendResult[]> {
  const rows = listPushSubscriptionsForUser(db, userId);
  const prune = (endpoint: string) =>
    deletePushSubscriptionByEndpoint(db, endpoint);
  const results: PushSendResult[] = [];
  for (const row of rows) {
    results.push(
      await sendPushToSubscription(client, vapid, row, payload, prune)
    );
  }
  return results;
}

// --- Client helpers ---

/**
 * Decide which push UI Settings should render.
 *
 * @example
 * getPushUiMode({ vapidConfigured: false, ... }) // 'not-configured'
 */
export function getPushUiMode(env: PushEnvironment): PushUiMode {
  if (!env.vapidConfigured) {return "not-configured";}
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return "unsupported";
  }
  if (isIosDevice(env) && !env.isStandalone) {return "ios-install-required";}
  if (env.permission === "denied") {return "denied";}
  if (env.isSubscribed) {return "subscribed";}
  return "prompt-enable";
}

/** Decode a URL-safe base64 VAPID public key for PushManager.subscribe. */
export function urlBase64ToUint8Array(
  base64String: string
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll(/-/g, "+").replaceAll(/_/g, "/");
  const raw = atob(base64);
  // Backed by a concrete ArrayBuffer so it satisfies BufferSource for
  // pushManager.subscribe's applicationServerKey.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.codePointAt(index);
  }
  return output;
}

export function subscriptionInputFromJson(
  json: PushSubscriptionJSON
): PushSubscriptionInput {
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error(
      `Push subscription JSON missing endpoint or keys; got ${JSON.stringify(json)}`
    );
  }
  return {
    endpoint: json.endpoint,
    keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
  };
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser");
  }
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) {
    await navigator.serviceWorker.ready;
    return existing;
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return registration;
}

export async function subscribeBrowserPush(
  publicKey: string
): Promise<PushSubscriptionInput> {
  await registerPushServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    applicationServerKey: urlBase64ToUint8Array(publicKey),
    userVisibleOnly: true,
  });
  return subscriptionInputFromJson(subscription.toJSON());
}

export async function unsubscribeBrowserPush(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return null;
  }
  const {endpoint} = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

// --- Scheduled reminder delivery (issue #67) ---

export type ScheduledNotificationType = Exclude<NotificationType, "rest_timer">;

export const SCHEDULED_NOTIFICATION_TYPES: ScheduledNotificationType[] = [
  "meal_reminder",
  "workout_reminder",
  "weekly_review",
];

export const MEAL_REMINDER_PAYLOAD: PushPayload = {
  body: "Log what you ate to keep your nutrition streak going.",
  tag: "fittrack-meal-reminder",
  title: "Meal reminder",
  url: "/nutrition",
};

export const WORKOUT_REMINDER_PAYLOAD: PushPayload = {
  body: "Time to train — open FitTrack to start your session.",
  tag: "fittrack-workout-reminder",
  title: "Workout reminder",
  url: "/workout",
};

export const WEEKLY_REVIEW_PAYLOAD: PushPayload = {
  body: "See how last week went — adherence, volume, and PRs.",
  tag: "fittrack-weekly-review",
  title: "Weekly review ready",
  url: "/review",
};

/** Push body for a scheduled reminder type. */
export function reminderPayloadForType(
  type: ScheduledNotificationType
): PushPayload {
  switch (type) {
    case "meal_reminder": {
      return MEAL_REMINDER_PAYLOAD;
    }
    case "workout_reminder": {
      return WORKOUT_REMINDER_PAYLOAD;
    }
    case "weekly_review": {
      return WEEKLY_REVIEW_PAYLOAD;
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown scheduled notification type: ${exhaustive}`);
    }
  }
}

/**
 * Stable idempotency key for the current schedule minute.
 * @example notificationSlotForNow(new Date('2026-01-05T12:00:00')) // '2026-01-05:12:00'
 */
export function notificationSlotForNow(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}:${hours}:${minutes}`;
}

/**
 * Claim a delivery slot before sending. Returns false when another run already claimed it.
 */
export function tryClaimNotificationDelivery(
  db: Database.Database,
  userId: number,
  type: ScheduledNotificationType,
  slot: string
): boolean {
  const deliveredAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO notification_deliveries (user_id, type, slot, delivered_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, type, slot) DO NOTHING`
    )
    .run(userId, type, slot, deliveredAt);
  return result.changes > 0;
}

export function listUserIds(db: Database.Database): number[] {
  const rows = db.prepare("SELECT id FROM users ORDER BY id").all() as {
    id: number;
  }[];
  return rows.map((row) => row.id);
}

// --- Reminder preferences (issue #66) ---

export {
  REMINDERS_CARD_TITLE,
  WEEKDAY_OPTIONS,
  defaultNotificationPreferences,
  getNotificationPreferences,
  upsertNotificationPreferences,
  isInQuietHours,
  shouldDeliver,
  minutesSinceMidnight,
  type NotificationType,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
} from "./notification-preferences";
