import { getRequest } from "@tanstack/react-start/server";

import { db as drizzleDb } from "~/db";
import { ensureSessionUserRecord } from "~/db/user-body-queries";
import type { UserRecord } from "~/db/user-body-queries";

import { auth } from "./auth";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AuthenticatedContext {
  authUserId: string;
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  user: UserRecord;
  userId: number;
}

/**
 * Resolve the signed-in Better Auth user and linked FitTrack profile.
 * @example const { userId } = await requireAuth();
 */
export async function requireAuth(): Promise<AuthenticatedContext> {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new UnauthorizedError();
  }

  const user = await ensureSessionUserRecord(drizzleDb, session.user);

  return {
    authUserId: session.user.id,
    session,
    user,
    userId: user.id,
  };
}
