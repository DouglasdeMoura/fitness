export function getStoredTheme(): 'light' | 'dark' {
  if (typeof localStorage === 'undefined') return 'light'
  const stored = localStorage.getItem('fittrack-theme')
  return stored === 'dark' ? 'dark' : 'light'
}

export function toggleColorMode(mode: 'light' | 'dark'): 'light' | 'dark' {
  return mode === 'light' ? 'dark' : 'light'
}

/** Matches TopNavItem selection to the current route (exact for Dashboard). */
export function isNavSelected(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** TabList value for the active primary route (issue #52 mobile bottom nav). */
export function navValueFromPath(
  pathname: string,
  items: ReadonlyArray<{ href: string }>,
): string {
  if (pathname === '/') return '/'
  const match = items.find(
    (item) =>
      item.href !== '/' &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  )
  return match?.href ?? '/'
}

/** Workout routes reserve space for the PRD 10 Batch 2 rest timer. */
export function isWorkoutRoute(pathname: string): boolean {
  return pathname === '/workout' || pathname.startsWith('/workout/')
}
