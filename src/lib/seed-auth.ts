import { eq, isNull } from "drizzle-orm";

import type { FitTrackDatabase } from "~/db";
import { user as authUserTable, users } from "~/db/schema";
import { linkLegacyUserToAuthAccount } from "~/db/user-body-queries";

import { auth } from "./auth";

/** Demo account that owns migrated seed data (issue #44). */
export const SEED_DEMO_ACCOUNT = {
  email: "demo@fittrack.app",
  name: "Demo Athlete",
  password: "DemoSeed123!",
} as const;

/** Create the demo auth account and attach legacy seed rows (issue #44). */
export async function linkSeedDemoAccount(
  database: FitTrackDatabase
): Promise<void> {
  let authUser = await database.query.user.findFirst({
    where: eq(authUserTable.email, SEED_DEMO_ACCOUNT.email),
  });

  if (!authUser) {
    const signUp = await auth.api.signUpEmail({
      body: {
        email: SEED_DEMO_ACCOUNT.email,
        name: SEED_DEMO_ACCOUNT.name,
        password: SEED_DEMO_ACCOUNT.password,
      },
    });
    authUser = signUp.user as NonNullable<typeof authUser>;
  }

  if (!authUser) {
    throw new Error(
      `Failed to create demo auth account for ${SEED_DEMO_ACCOUNT.email}`
    );
  }

  const legacyUser = await database.query.users.findFirst({
    where: isNull(users.authUserId),
  });

  if (!legacyUser) {
    return;
  }

  await linkLegacyUserToAuthAccount(
    database,
    legacyUser.id,
    authUser.id,
    SEED_DEMO_ACCOUNT.email
  );
}
