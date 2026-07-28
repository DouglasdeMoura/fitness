import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "~/db";
import * as schema from "~/db/schema";

import {
  AUTH_USER_ADDITIONAL_FIELDS,
  resolveGithubSocialProvider,
} from "./auth-config";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [tanstackStartCookies()],
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: resolveGithubSocialProvider(),
  user: {
    additionalFields: AUTH_USER_ADDITIONAL_FIELDS,
  },
});
