import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";

import type { FitTrackDatabase } from "~/db";
import * as schema from "~/db/schema";
import { user as authUserTable, users } from "~/db/schema";

import {
  AUTH_USER_ADDITIONAL_FIELDS,
  resolveGithubSocialProvider,
} from "./auth-config";

/** Default demo password for local development and e2e (issue #82). */
export const DEFAULT_SEED_DEMO_PASSWORD = "DemoSeed123!";

export const SEED_DEMO_EMAIL = "demo@fittrack.app";
export const SEED_DEMO_NAME = "Demo Athlete";

/** Demo account that owns seeded programs (issue #44, #82). */
export const SEED_DEMO_ACCOUNT = {
  email: SEED_DEMO_EMAIL,
  name: SEED_DEMO_NAME,
  password: DEFAULT_SEED_DEMO_PASSWORD,
};

/** Resolve the demo password from env, defaulting for local and e2e runs. */
export function resolveSeedDemoPassword(): string {
  return process.env.SEED_DEMO_PASSWORD ?? DEFAULT_SEED_DEMO_PASSWORD;
}

/** Refuse to seed in production without an explicit demo password. */
export function assertSeedDemoPasswordForProduction(): void {
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.SEED_DEMO_PASSWORD
  ) {
    console.error(
      "SEED_DEMO_PASSWORD must be set when NODE_ENV=production. Refusing to seed the demo account."
    );
    process.exit(1);
  }
}

function createSeedAuth(database: FitTrackDatabase) {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    secret: process.env.BETTER_AUTH_SECRET,
    socialProviders: resolveGithubSocialProvider(),
    user: {
      additionalFields: AUTH_USER_ADDITIONAL_FIELDS,
    },
  });
}

export interface SeedDemoAccount {
  authUserId: string;
  profileUserId: number;
}

/** Create the demo auth account and linked FitTrack profile (issue #82). */
export async function ensureSeedDemoAccount(
  database: FitTrackDatabase
): Promise<SeedDemoAccount> {
  const password = resolveSeedDemoPassword();
  const seedAuth = createSeedAuth(database);

  let authUser = await database.query.user.findFirst({
    where: eq(authUserTable.email, SEED_DEMO_EMAIL),
  });

  if (!authUser) {
    const signUp = await seedAuth.api.signUpEmail({
      body: {
        email: SEED_DEMO_EMAIL,
        name: SEED_DEMO_NAME,
        password,
      },
    });
    authUser = signUp.user as NonNullable<typeof authUser>;
  }

  if (!authUser) {
    throw new Error(
      `Failed to create demo auth account for ${SEED_DEMO_EMAIL}`
    );
  }

  const existingProfile = await database.query.users.findFirst({
    where: eq(users.authUserId, authUser.id),
  });

  if (existingProfile) {
    return {
      authUserId: authUser.id,
      profileUserId: existingProfile.id,
    };
  }

  const profile = database
    .insert(users)
    .values({
      activityLevel: "moderate",
      authUserId: authUser.id,
      email: SEED_DEMO_EMAIL,
      goalType: "build_muscle",
      heightCm: 178,
      name: SEED_DEMO_NAME,
      sex: "male",
    })
    .returning({ id: users.id })
    .get();

  return {
    authUserId: authUser.id,
    profileUserId: profile.id,
  };
}

/** Sign in with demo credentials (used by seed verification tests). */
export async function signInSeedDemoAccount(
  database: FitTrackDatabase
): Promise<{ userId: string }> {
  const seedAuth = createSeedAuth(database);
  const session = await seedAuth.api.signInEmail({
    body: {
      email: SEED_DEMO_EMAIL,
      password: resolveSeedDemoPassword(),
    },
  });
  return { userId: session.user.id };
}
