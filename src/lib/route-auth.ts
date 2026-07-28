import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "./auth";
import { AUTH_SUCCESS_PATH } from "./auth-form";

const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/nutrition",
  "/workout",
  "/progress",
  "/settings",
  "/review",
] as const;

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

/** Route beforeLoad guard: unauthenticated visitors go to sign-in. */
export async function requireAuthenticatedRoute(): Promise<void> {
  const session = await fetchServerSession();
  if (!session) {
    throw redirect({ to: "/sign-in" });
  }
}

/** Landing and auth pages redirect signed-in users to the dashboard. */
export async function redirectAuthenticatedToDashboard(): Promise<void> {
  const session = await fetchServerSession();
  if (session) {
    throw redirect({ to: AUTH_SUCCESS_PATH });
  }
}
