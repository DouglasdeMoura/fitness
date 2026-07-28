'use client'

import { AppShell } from '@astryxdesign/core/AppShell'
import { IconButton } from '@astryxdesign/core/IconButton'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Theme } from '@astryxdesign/core/theme'
import { ToastViewport } from '@astryxdesign/core/Toast'
import { Toolbar } from '@astryxdesign/core/Toolbar'
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav'
import { fittrackTheme } from '~/lib/fittrack-theme'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { OfflineStatus } from '~/components/OfflineStatus'
import { RestTimer } from '~/components/workout/RestTimer'
import { getRestTimerSnapshot, shouldMountRestTimer, subscribeRestTimer } from '~/lib/rest-timer'
import { RouterLink } from '~/components/RouterLink'
import {
  getStoredTheme,
  isNavSelected,
  isWorkoutRoute,
  navValueFromPath,
  THEME_CHANGE_EVENT,
  toggleColorMode,
} from '~/lib/app-chrome'
import {
  DashboardIcon,
  NutritionIcon,
  WorkoutIcon,
  ProgressIcon,
  SettingsIcon,
  ThemeToggleIcon,
} from '~/components/icons/FitTrackIcons'
import { useKeyboardShortcuts } from '~/hooks/use-keyboard-shortcuts'
import { ShortcutsHelpDialog } from '~/components/ShortcutsHelpDialog'


const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', exact: true, icon: DashboardIcon },
  { label: 'Nutrition', href: '/nutrition', icon: NutritionIcon },
  { label: 'Workout', href: '/workout', icon: WorkoutIcon },
  { label: 'Progress', href: '/progress', icon: ProgressIcon },
  { label: 'Settings', href: '/settings', icon: SettingsIcon },
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
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <Tab
            key={item.href}
            value={item.href}
            label={item.label}
            href={item.href}
            isLabelHidden
            icon={<Icon />}
          />
        )
      })}
    </TabList>
  )
}


function RestTimerMount() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const snapshot = useSyncExternalStore(subscribeRestTimer, getRestTimerSnapshot, getRestTimerSnapshot)
  if (!shouldMountRestTimer(pathname, snapshot)) {
    return null
  }
  return <RestTimer />
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // Keep SSR + first client render identical; hydrate preference after mount.
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light')
  const [themeReady, setThemeReady] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)

  useEffect(() => {
    const stored = getStoredTheme()
    setColorMode(stored)
    setThemeReady(true)
  }, [])

  useEffect(() => {
    if (!themeReady) return
    localStorage.setItem('fittrack-theme', colorMode)
  }, [colorMode, themeReady])

  // Listen for theme changes dispatched from Settings (issue #34).
  useEffect(() => {
    const handler = (event: CustomEvent<'light' | 'dark'>) => {
      setColorMode(event.detail)
    }
    window.addEventListener(THEME_CHANGE_EVENT, handler as EventListener)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handler as EventListener)
  }, [])

  useEffect(() => {
    if (isWorkoutRoute(pathname)) {
      document.body.dataset.fittrackRoute = 'workout'
      return
    }
    delete document.body.dataset.fittrackRoute
  }, [pathname])

  // Keyboard shortcuts: / for search, n for new entry, ? for help
  useKeyboardShortcuts({
    onFocusSearch: () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        '[type="search"], input[placeholder*="search" i], input[aria-label*="search" i], input[aria-label*="Search" i]',
      )
      searchInput?.focus()
    },
    onNewEntry: () => {
      // "n" opens the food-log dialog when on /nutrition
      if (pathname.startsWith('/nutrition')) {
        const logButton = document.querySelector<HTMLButtonElement>(
          'button[aria-label*="Log food" i], button:has-text("Log food")',
        )
        logButton?.click()
      }
    },
    onToggleHelp: () => {
      setShortcutsHelpOpen((prev) => !prev)
    },
  })

  // Page transition: use pathname as key to trigger CSS animation on navigation.
  // A <section> wraps the children so the CSS [data-page-transition] animation
  // fires on every mount (React unmounts/remounts when the key changes).
  const pageContent = (
    <section key={pathname} data-page-transition>
      <OfflineStatus />
      {children}
      <RestTimerMount />
      <MobileBottomNav />
    </section>
  )

  return (
    <Theme theme={fittrackTheme} mode={colorMode}>
      <LinkProvider component={RouterLink}>
        <ToastViewport position="bottomEnd" maxVisible={3}>
          <AppShell
            contentPadding={4}
            height="auto"
            mobileNav={false}
            topNav={
              <TopNav
                label="FitTrack navigation"
                heading={<TopNavHeading heading="FitTrack" headingHref="/" />}
                startContent={<PrimaryRouteToolbar />}
                endContent={
                  <IconButton
                    label="Toggle dark mode"
                    tooltip="Toggle dark mode"
                    icon={<ThemeToggleIcon />}
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
            {pageContent}
          </AppShell>
        </ToastViewport>
      </LinkProvider>
      <ShortcutsHelpDialog
        isOpen={shortcutsHelpOpen}
        onOpenChange={setShortcutsHelpOpen}
      />
    </Theme>
  )
}
