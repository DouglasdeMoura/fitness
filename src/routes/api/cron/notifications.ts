import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '~/lib/db'
import { handleSchedulerCronRequest } from '~/lib/scheduler'
import { readVapidConfig } from '~/lib/push'
import { webPushClient } from '~/lib/push-server'

export const Route = createFileRoute('/api/cron/notifications')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const db = getDb()
        return handleSchedulerCronRequest(request, {
          db,
          client: webPushClient,
          vapid: readVapidConfig(),
        })
      },
    },
  },
})
