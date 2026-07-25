import { Link as TanStackLink } from '@tanstack/react-router'
import { forwardRef, type AnchorHTMLAttributes } from 'react'

/**
 * Adapts TanStack Router's Link for Astryx LinkProvider so TopNav / AppShell
 * links use client-side navigation instead of full page reloads.
 */
export const RouterLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }
>(function RouterLink({ href, children, ...props }, ref) {
  return (
    <TanStackLink to={href || '/'} ref={ref} {...props}>
      {children}
    </TanStackLink>
  )
})
