'use client'

import { AppShell } from '@astryxdesign/core/AppShell'
import { IconButton } from '@astryxdesign/core/IconButton'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Theme } from '@astryxdesign/core/theme'
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav'
import { neutralTheme } from '@astryxdesign/theme-neutral'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { OfflineStatus } from '~/components/OfflineStatus'
import { RouterLink } from '~/components/RouterLink'
import { getStoredTheme, isNavSelected, toggleColorMode } from '~/lib/app-chrome'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', exact: true },
  { label: 'Nutrition', href: '/nutrition' },
  { label: 'Workout', href: '/workout' },
  { label: 'Progress', href: '/progress' },
  { label: 'Settings', href: '/settings' },
] as const

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // Keep SSR + first client render identical; hydrate preference after mount.
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light')
  const [themeReady, setThemeReady] = useState(false)

  useEffect(() => {
    const stored = getStoredTheme()
    setColorMode(stored)
    setThemeReady(true)
  }, [])

  useEffect(() => {
    if (!themeReady) return
    localStorage.setItem('fittrack-theme', colorMode)
  }, [colorMode, themeReady])

  return (
    <Theme theme={neutralTheme} mode={colorMode}>
      <LinkProvider component={RouterLink}>
        <AppShell
          contentPadding={4}
          height="auto"
          topNav={
            <TopNav
              label="FitTrack navigation"
              heading={<TopNavHeading heading="💪 FitTrack" headingHref="/" />}
              startContent={
                <>
                  {NAV_ITEMS.map((item) => (
                    <TopNavItem
                      key={item.href}
                      label={item.label}
                      href={item.href}
                      isSelected={isNavSelected(
                        pathname,
                        item.href,
                        'exact' in item ? item.exact : false,
                      )}
                    />
                  ))}
                </>
              }
              endContent={
                <IconButton
                  label="Toggle dark mode"
                  tooltip="Toggle dark mode"
                  icon={<span aria-hidden>🌓</span>}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setColorMode((mode) => toggleColorMode(mode))
                  }}
                />
              }
            />
          }
        >
          <OfflineStatus />
          {children}
        </AppShell>
      </LinkProvider>
    </Theme>
  )
}
