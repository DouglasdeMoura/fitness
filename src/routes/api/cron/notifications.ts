import { createFileRoute } from "@tanstack/react-router";

import { db } from "~/db";
import { readVapidConfig } from "~/lib/push";
import { webPushClient } from "~/lib/push-server";
import { handleSchedulerCronRequest } from "~/lib/scheduler";

export const Route = createFileRoute("/api/cron/notifications")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        handleSchedulerCronRequest(request, {
          client: webPushClient,
          db,
          vapid: readVapidConfig(),
        }),
    },
  },
});
