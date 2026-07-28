/**
 * Server-only Web Push delivery (issue #65).
 * Kept separate from push.ts so client bundles never pull in web-push.
 */

import webpush from "web-push";

import { sendPushToUserSubscriptions } from './push';
import type { PushNotificationClient, PushPayload, PushSubscriptionInput, VapidConfig } from './push';

class WebPushNotificationClient implements PushNotificationClient {
  async sendNotification(
    subscription: PushSubscriptionInput,
    payload: PushPayload,
    vapid: VapidConfig
  ): Promise<{ statusCode: number }> {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const response = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload)
    );
    return { statusCode: response.statusCode };
  }
}

export const webPushClient = new WebPushNotificationClient();

export async function deliverPushToUser(
  db: import("better-sqlite3").Database,
  vapid: VapidConfig,
  userId: number,
  payload: PushPayload
) {
  return sendPushToUserSubscriptions(db, webPushClient, vapid, userId, payload);
}
