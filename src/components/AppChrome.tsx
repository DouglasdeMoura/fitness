'use client'

import { AppShell } from '@astryxdesign/core/AppShell'
import { IconButton } from '@astryxdesign/core/IconButton'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Section } from '@astryxdesign/core/Section'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Theme } from '@astryxdesign/core/theme'
import { ToastViewport } from '@astryxdesign/core/Toast'
import { Toolbar } from '@astryxdesign/core/Toolbar'
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav'
import { fittrackTheme } from '~/lib/fittrack-theme'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { OfflineStatus } from '~/components/OfflineStatus'
import { RouterLink } from '~/components/RouterLink'
import {
  getStoredTheme,
  isNavSelected,
  isWorkoutRoute,
  navValueFromPath,
  toggleColorMode,
} from '~/lib/app-chrome'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', exact: true, icon: '🏠' },
  { label: 'Nutrition', href: '/nutrition', icon: '🍎' },
  { label: 'Workout', href: '/workout', icon: '🏋️' },
  { label: 'Progress', href: '/progress', icon: '📈' },
  { label: 'Settings', href: '/settings', icon: '⚙️' },
] as const

function PrimaryRouteToolbar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <Toolbar
      label="FitTrack primary routes"
      startContent={NAV_ITEMS.map((item) => (
        <TopNavItem
          key={item.href}
          label={item.label}
          href={item.href}
          isSelected={isNavSelected(pathname, item.href, 'exact' in item ? item.exact : false)}
        />
      ))}
    />
  )
}

function MobileBottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <TabList
      aria-label="FitTrack mobile navigation"
      value={navValueFromPath(pathname, NAV_ITEMS)}
      onChange={() => undefined}
      layout="fill"
      size="lg"
      hasDivider
    >
      {NAV_ITEMS.map((item) => (
        <Tab
          key={item.href}
          value={item.href}
          label={item.label}
          href={item.href}
          isLabelHidden
          icon={<span aria-hidden>{item.icon}</span>}
        />
      ))}
    </TabList>
  )
}

function RestTimerReserve() {
  return (
    <Section
      data-fittrack-rest-timer-slot=""
      variant="transparent"
      padding={0}
      minHeight="var(--app-rest-timer-reserved-height)"
      aria-hidden
    />
  )
}

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

  useEffect(() => {
    if (isWorkoutRoute(pathname)) {
      document.body.dataset.fittrackRoute = 'workout'
      return
    }
    delete document.body.dataset.fittrackRoute
  }, [pathname])

  return (
    <Theme theme={fittrackTheme} mode={colorMode}>
      <LinkProvider component={RouterLink}>
        {/* ToastViewport hosts useToast() stacks for mutation feedback (issue #24). */}
        <ToastViewport position="bottomEnd" maxVisible={3}>
          <AppShell
            contentPadding={4}
            height="auto"
            mobileNav={false}
            topNav={
              <TopNav
                label="FitTrack navigation"
                heading={<TopNavHeading heading="💪 FitTrack" headingHref="/" />}
                startContent={<PrimaryRouteToolbar />}
                endContent={
                  <IconButton
                    label="Toggle dark mode"
                    tooltip="Toggle dark mode"
                    icon={<span aria-hidden>🌓</span>}
                    variant="ghost"
                    size="lg"
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
            {isWorkoutRoute(pathname) ? <RestTimerReserve /> : null}
            <MobileBottomNav />
          </AppShell>
        </ToastViewport>
      </LinkProvider>
    </Theme>
  )
}
