import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "./auth";
import { AUTH_SUCCESS_PATH } from "./auth-form";

/** Protected app route prefixes guarded by requireAuthenticatedRoute (issue #83). */
export const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/nutrition",
  "/workout",
  "/progress",
  "/settings",
  "/review",
] as const;

export type ServerSession = Awaited<ReturnType<typeof auth.api.getSession>>;

/** True for authenticated app surfaces that require a session (issue #44). */
export function isProtectedAppPath(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Server-only session lookup exposed to route beforeLoad guards. */
export const fetchServerSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    return auth.api.getSession({ headers: request.headers });
  }
);

/** Throws a router redirect when no session is present (issue #83). */
export function assertRouteHasSession(session: ServerSession): void {
  if (!session) {
    throw redirect({ to: "/sign-in" });
  }
}

/** Throws a router redirect when a session is present (issue #83). */
export function assertRouteHasNoSession(session: ServerSession): void {
  if (session) {
    throw redirect({ to: AUTH_SUCCESS_PATH });
  }
}

/** Route beforeLoad guard: unauthenticated visitors go to sign-in. */
export async function requireAuthenticatedRoute(): Promise<void> {
  assertRouteHasSession(await fetchServerSession());
}

/** Landing and auth pages redirect signed-in users to the dashboard. */
export async function redirectAuthenticatedToDashboard(): Promise<void> {
  assertRouteHasNoSession(await fetchServerSession());
}
