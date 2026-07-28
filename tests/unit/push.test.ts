import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import type { PushSubscriptionRow } from "~/lib/push";
import {
  FakePushNotificationClient,
  getPushUiMode,
  hasPushSubscription,
  listPushSubscriptionsForUser,
  readVapidConfig,
  readVapidPublicKey,
  sendPushToSubscription,
  sendPushToUserSubscriptions,
  upsertPushSubscription,
} from "~/lib/push";

import type { FitTrackDatabase } from "../../src/db";
import * as relations from "../../src/db/relations";
import * as dbSchema from "../../src/db/schema";
import { pushSubscriptions } from "../../src/db/schema";
import { readAllMigrationSql } from "./migration-sql";

const SAMPLE_SUBSCRIPTION = {
  endpoint: "https://push.example.test/device-1",
  keys: {
    auth: "auth-key",
    p256dh: "p256dh-key",
  },
};

function createTestDb(): FitTrackDatabase {
  const migrationSql = readAllMigrationSql();
  const sqlite = new Database(":memory:");
  sqlite.exec(migrationSql);
  const db = drizzle(sqlite, { schema: { ...dbSchema, ...relations } });
  db.insert(dbSchema.users)
    .values({
      activityLevel: "moderate",
      goalType: "build_muscle",
      heightCm: 178,
      name: "Athlete",
      sex: "male",
    })
    .run();
  return db;
}

describe(readVapidConfig, () => {
  it("throws naming a missing VAPID variable when push is partially configured", () => {
    expect(() =>
      readVapidConfig({
        VAPID_PUBLIC_KEY: "public-key",
      })
    ).toThrow(/VAPID_PRIVATE_KEY/);
  });

  it("returns null when push is not configured", () => {
    expect(readVapidConfig({})).toBeNull();
  });
});

describe(readVapidPublicKey, () => {
  it("returns null when VAPID_PUBLIC_KEY is absent", () => {
    expect(readVapidPublicKey({})).toBeNull();
    expect(readVapidPublicKey({ VAPID_PUBLIC_KEY: "  " })).toBeNull();
  });

  it("returns the trimmed public key when configured", () => {
    expect(readVapidPublicKey({ VAPID_PUBLIC_KEY: " abc " })).toBe("abc");
  });
});

describe(upsertPushSubscription, () => {
  it("updates an existing endpoint instead of duplicating rows", () => {
    const db = createTestDb();
    upsertPushSubscription(db, 1, SAMPLE_SUBSCRIPTION);
    upsertPushSubscription(db, 1, {
      ...SAMPLE_SUBSCRIPTION,
      keys: { auth: "rotated-auth", p256dh: "rotated" },
    });

    const rows = listPushSubscriptionsForUser(db, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.p256dh).toBe("rotated");
    expect(rows[0]?.auth).toBe("rotated-auth");
  });
});

describe("sendPushToSubscription with FakePushNotificationClient", () => {
  it("deletes a subscription when the push service returns 410 Gone", async () => {
    const db = createTestDb();
    upsertPushSubscription(db, 1, SAMPLE_SUBSCRIPTION);
    const row = listPushSubscriptionsForUser(db, 1)[0] as PushSubscriptionRow;
    const client = new FakePushNotificationClient(410);

    const result = await sendPushToSubscription(
      client,
      {
        privateKey: "priv",
        publicKey: "pub",
        subject: "mailto:test@example.com",
      },
      row,
      { body: "Body", title: "Test" },
      (endpoint) => {
        db.delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, endpoint))
          .run();
        return true;
      }
    );

    expect(result.status).toBe("gone");
    expect(hasPushSubscription(db, 1)).toBeFalsy();
    expect(client.calls).toHaveLength(1);
  });
});

describe(sendPushToUserSubscriptions, () => {
  it("prunes gone endpoints from the database", async () => {
    const db = createTestDb();
    upsertPushSubscription(db, 1, SAMPLE_SUBSCRIPTION);
    const client = new FakePushNotificationClient(410);

    const results = await sendPushToUserSubscriptions(
      db,
      client,
      {
        privateKey: "priv",
        publicKey: "pub",
        subject: "mailto:test@example.com",
      },
      1,
      { body: "Body", title: "Test" }
    );

    expect(results[0]?.status).toBe("gone");
    expect(hasPushSubscription(db, 1)).toBeFalsy();
  });
});

describe(getPushUiMode, () => {
  const baseEnv = {
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    isStandalone: false,
    isSubscribed: false,
    maxTouchPoints: 0,
    permission: "default" as NotificationPermission,
    platform: "Linux x86_64",
    userAgent: "Mozilla/5.0",
  };

  it("renders not-configured when the public key is missing", () => {
    expect(getPushUiMode({ ...baseEnv, vapidConfigured: false })).toBe(
      "not-configured"
    );
  });

  it("shows install guidance on iOS before the PWA is installed", () => {
    expect(
      getPushUiMode({
        ...baseEnv,
        maxTouchPoints: 5,
        platform: "iPhone",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        vapidConfigured: true,
      })
    ).toBe("ios-install-required");
  });
});
