import { z } from "zod";

/** Cron trigger bodies must be an empty JSON object (no extra keys). */
export const schedulerCronRequestBodySchema = z.object({}).strict();
