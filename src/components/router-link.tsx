import { Link as TanStackLink } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, RefObject } from "react";

/**
 * Adapts TanStack Router's Link for Astryx LinkProvider so TopNav / AppShell
 * links use client-side navigation instead of full page reloads.
 */
export const RouterLink = ({
  href,
  children,
  ref,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string } & {
  ref?: RefObject<HTMLAnchorElement | null>;
}) => (
  <TanStackLink ref={ref} to={href || "/"} {...props}>
    {children}
  </TanStackLink>
);
