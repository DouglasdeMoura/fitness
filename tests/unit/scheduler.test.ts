import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import {
  FakePushNotificationClient,
  upsertNotificationPreferences,
  upsertPushSubscription,
  type VapidConfig,
} from '~/lib/push'
import * as push from '~/lib/push'
import {
  handleSchedulerCronRequest,
  readSchedulerSecret,
  runScheduledNotifications,
  verifySchedulerAuth,
} from '~/lib/scheduler'

const SAMPLE_SUBSCRIPTION = {
  endpoint: 'https://push.example.test/device-1',
  keys: {
    p256dh: 'p256dh-key',
    auth: 'auth-key',
  },
}

const TEST_VAPID: VapidConfig = {
  subject: 'mailto:test@fittrack.test',
  publicKey: 'test-public-key',
  privateKey: 'test-private-key',
}

function createTestDb(): Database.Database {
  const schema = readFileSync(join(process.cwd(), 'src/lib/schema.sql'), 'utf8')
  const db = new Database(':memory:')
  db.exec(schema)
  db.prepare(
    `INSERT INTO users (name, sex, height_cm, activity_level, goal_type)
     VALUES ('Athlete', 'male', 178, 'moderate', 'build_muscle')`,
  ).run()
  return db
}

function enableMealReminderAtNoon(db: Database.Database): void {
  upsertNotificationPreferences(db, 1, {
    meal_reminders: true,
    meal_times: ['12:00'],
    quiet_start: null,
    quiet_end: null,
  })
  upsertPushSubscription(db, 1, SAMPLE_SUBSCRIPTION)
}

describe('readSchedulerSecret', () => {
  it('returns null when SCHEDULER_SECRET is absent', () => {
    expect(readSchedulerSecret({})).toBeNull()
  })

  it('returns the trimmed secret when configured', () => {
    expect(readSchedulerSecret({ SCHEDULER_SECRET: ' cron-secret ' })).toBe('cron-secret')
  })
})

describe('verifySchedulerAuth', () => {
  const secret = 'cron-secret'

  it('accepts Authorization Bearer token', () => {
    const request = new Request('http://localhost/api/cron/notifications', {
      headers: { authorization: 'Bearer cron-secret' },
    })
    expect(verifySchedulerAuth(request, secret)).toBe(true)
  })

  it('accepts X-Scheduler-Secret header', () => {
    const request = new Request('http://localhost/api/cron/notifications', {
      headers: { 'x-scheduler-secret': 'cron-secret' },
    })
    expect(verifySchedulerAuth(request, secret)).toBe(true)
  })

  it('rejects missing or wrong credentials', () => {
    const request = new Request('http://localhost/api/cron/notifications')
    expect(verifySchedulerAuth(request, secret)).toBe(false)
  })
})

describe('runScheduledNotifications', () => {
  it('delegates delivery timing to shouldDeliver', async () => {
    const db = createTestDb()
    enableMealReminderAtNoon(db)
    const client = new FakePushNotificationClient()
    const shouldDeliverSpy = vi.spyOn(push, 'shouldDeliver')

    await runScheduledNotifications({
      db,
      now: new Date('2026-01-05T12:00:00'),
      client,
      vapid: TEST_VAPID,
    })

    expect(shouldDeliverSpy).toHaveBeenCalled()
    shouldDeliverSpy.mockRestore()
  })

  it('delivers a due meal reminder once per overlapping cron run', async () => {
    const db = createTestDb()
    enableMealReminderAtNoon(db)
    const client = new FakePushNotificationClient()
    const input = {
      db,
      now: new Date('2026-01-05T12:00:00'),
      client,
      vapid: TEST_VAPID,
    }

    const [first, second] = await Promise.all([
      runScheduledNotifications(input),
      runScheduledNotifications(input),
    ])

    expect(client.calls).toHaveLength(1)
    expect(first.delivered + second.delivered).toBe(1)
    expect(first.delivered + second.skipped_duplicate).toBeGreaterThanOrEqual(1)
  })

  it('respects quiet hours via shouldDeliver', async () => {
    const db = createTestDb()
    upsertNotificationPreferences(db, 1, {
      meal_reminders: true,
      meal_times: ['03:00'],
      quiet_start: '22:00',
      quiet_end: '07:00',
    })
    upsertPushSubscription(db, 1, SAMPLE_SUBSCRIPTION)
    const client = new FakePushNotificationClient()

    const result = await runScheduledNotifications({
      db,
      now: new Date('2026-01-05T03:00:00'),
      client,
      vapid: TEST_VAPID,
    })

    expect(result.delivered).toBe(0)
    expect(client.calls).toHaveLength(0)
  })

  it('skips disabled reminder types without erroring', async () => {
    const db = createTestDb()
    upsertNotificationPreferences(db, 1, {
      meal_reminders: false,
      meal_times: ['12:00'],
    })
    upsertPushSubscription(db, 1, SAMPLE_SUBSCRIPTION)
    const client = new FakePushNotificationClient()

    const result = await runScheduledNotifications({
      db,
      now: new Date('2026-01-05T12:00:00'),
      client,
      vapid: TEST_VAPID,
    })

    expect(result.delivered).toBe(0)
    expect(result.skipped_not_due).toBeGreaterThan(0)
    expect(client.calls).toHaveLength(0)
  })

  it('skips users without a push subscription without erroring', async () => {
    const db = createTestDb()
    enableMealReminderAtNoon(db)
    db.prepare('DELETE FROM push_subscriptions').run()
    const client = new FakePushNotificationClient()

    const result = await runScheduledNotifications({
      db,
      now: new Date('2026-01-05T12:00:00'),
      client,
      vapid: TEST_VAPID,
    })

    expect(result.delivered).toBe(0)
    expect(result.skipped_no_subscription).toBeGreaterThan(0)
    expect(client.calls).toHaveLength(0)
  })

  it('delivers workout and weekly review reminders on schedule', async () => {
    const db = createTestDb()
    upsertNotificationPreferences(db, 1, {
      workout_reminders: true,
      workout_days: [1],
      workout_time: '09:00',
      weekly_review: true,
      weekly_review_day: 1,
      weekly_review_time: '09:00',
    })
    upsertPushSubscription(db, 1, SAMPLE_SUBSCRIPTION)
    const client = new FakePushNotificationClient()

    const mondayMorning = new Date('2026-01-05T09:00:00')
    const result = await runScheduledNotifications({
      db,
      now: mondayMorning,
      client,
      vapid: TEST_VAPID,
    })

    expect(result.delivered).toBe(2)
    expect(client.calls).toHaveLength(2)
  })
})

describe('handleSchedulerCronRequest', () => {
  it('rejects unauthenticated cron requests', async () => {
    const db = createTestDb()
    const client = new FakePushNotificationClient()
    const request = new Request('http://localhost/api/cron/notifications', {
      method: 'POST',
    })

    const response = await handleSchedulerCronRequest(request, {
      db,
      client,
      vapid: TEST_VAPID,
      env: { SCHEDULER_SECRET: 'cron-secret' },
    })

    expect(response.status).toBe(401)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('unauthorized')
  })

  it('runs delivery when the cron secret matches', async () => {
    const db = createTestDb()
    enableMealReminderAtNoon(db)
    const client = new FakePushNotificationClient()
    const request = new Request('http://localhost/api/cron/notifications', {
      method: 'POST',
      headers: { authorization: 'Bearer cron-secret' },
    })

    const response = await handleSchedulerCronRequest(request, {
      db,
      client,
      vapid: TEST_VAPID,
      env: { SCHEDULER_SECRET: 'cron-secret' },
      now: new Date('2026-01-05T12:00:00'),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { delivered: number }
    expect(body.delivered).toBe(1)
    expect(client.calls).toHaveLength(1)
  })
})
