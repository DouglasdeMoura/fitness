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
