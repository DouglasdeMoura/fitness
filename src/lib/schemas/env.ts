import { z } from "zod";

const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const vapidPublicKeySchema = z
  .string()
  .trim()
  .length(
    87,
    "VAPID_PUBLIC_KEY must be an 87-character URL-safe Base64 P-256 public key"
  )
  .regex(
    BASE64_URL_PATTERN,
    "VAPID_PUBLIC_KEY must contain only URL-safe Base64 characters"
  )
  .startsWith("B", "VAPID_PUBLIC_KEY must encode an uncompressed P-256 key");

const vapidPrivateKeySchema = z
  .string()
  .trim()
  .length(
    43,
    "VAPID_PRIVATE_KEY must be a 43-character URL-safe Base64 P-256 private key"
  )
  .regex(
    BASE64_URL_PATTERN,
    "VAPID_PRIVATE_KEY must contain only URL-safe Base64 characters"
  );

function isVapidSubjectUri(subject: string): boolean {
  try {
    const url = new URL(subject);
    if (url.protocol === "https:") {
      return url.hostname.length > 0;
    }
    return url.protocol === "mailto:" && /^[^@\s]+@[^@\s]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

const vapidSubjectSchema = z
  .string()
  .trim()
  .refine(
    isVapidSubjectUri,
    "VAPID_SUBJECT must be a valid mailto: or https: URI"
  );

const vapidConfigSchema = z
  .object({
    VAPID_PRIVATE_KEY: vapidPrivateKeySchema,
    VAPID_PUBLIC_KEY: vapidPublicKeySchema,
    VAPID_SUBJECT: vapidSubjectSchema,
  })
  .transform((config) => ({
    privateKey: config.VAPID_PRIVATE_KEY,
    publicKey: config.VAPID_PUBLIC_KEY,
    subject: config.VAPID_SUBJECT,
  }));

const schedulerSecretSchema = z.object({
  SCHEDULER_SECRET: z
    .string()
    .trim()
    .min(1, "SCHEDULER_SECRET must not be blank"),
});

type EnvLike = Record<string, string | undefined>;

export type VapidConfig = z.infer<typeof vapidConfigSchema>;

function parseEnvironment<T extends z.ZodType>(
  schema: T,
  env: EnvLike
): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  return result.data;
}

/** Validate a configured public VAPID key, or return null when push is disabled. */
export function parseVapidPublicKey(env: EnvLike): string | null {
  return parseVapidConfig(env)?.publicKey ?? null;
}

/** Validate all VAPID variables at their first read. */
export function parseVapidConfig(env: EnvLike): VapidConfig | null {
  const values = [
    env.VAPID_PRIVATE_KEY,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_SUBJECT,
  ];
  if (values.every((value) => !value?.trim())) {
    return null;
  }
  return parseEnvironment(vapidConfigSchema, env);
}

/** Require and validate the scheduler secret at its first read. */
export function parseSchedulerSecret(env: EnvLike): string {
  return parseEnvironment(schedulerSecretSchema, env).SCHEDULER_SECRET;
}
