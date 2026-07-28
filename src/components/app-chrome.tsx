"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { IconButton } from "@astryxdesign/core/IconButton";
import { LinkProvider } from "@astryxdesign/core/Link";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  DashboardIcon,
  NutritionIcon,
  ProgressIcon,
  SettingsIcon,
  ThemeToggleIcon,
  WorkoutIcon,
} from "~/components/icons/fit-track-icons";
import { OfflineStatus } from "~/components/offline-status";
import { RouterLink } from "~/components/router-link";
import { ShortcutsHelpDialog } from "~/components/shortcuts-help-dialog";
import { RestTimer } from "~/components/workout/rest-timer";
import { useKeyboardShortcuts } from "~/hooks/use-keyboard-shortcuts";
import {
  getStoredTheme,
  isWorkoutRoute,
  navValueFromPath,
  THEME_CHANGE_EVENT,
  toggleColorMode,
} from "~/lib/app-chrome";
import { fittrackTheme } from "~/lib/fittrack-theme";
import {
  getRestTimerSnapshot,
  shouldMountRestTimer,
  subscribeRestTimer,
} from "~/lib/rest-timer";

const NAV_ITEMS = [
  { exact: true, href: "/", icon: DashboardIcon, label: "Dashboard" },
  { href: "/nutrition", icon: NutritionIcon, label: "Nutrition" },
  { href: "/workout", icon: WorkoutIcon, label: "Workout" },
  { href: "/progress", icon: ProgressIcon, label: "Progress" },
  { href: "/settings", icon: SettingsIcon, label: "Settings" },
] as const;

const NOOP = () => {
  /* intentional no-op for TabList onChange */
};

function MobileBottomNav() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <TabList
      aria-label="FitTrack mobile navigation"
      hasDivider
      layout="fill"
      onChange={NOOP}
      size="lg"
      value={navValueFromPath(pathname, NAV_ITEMS)}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Tab
            href={item.href}
            icon={<Icon />}
            isLabelHidden
            key={item.href}
            label={item.label}
            value={item.href}
          />
        );
      })}
    </TabList>
  );
}

function RestTimerMount() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const snapshot = useSyncExternalStore(
    subscribeRestTimer,
    getRestTimerSnapshot,
    getRestTimerSnapshot
  );
  if (!shouldMountRestTimer(pathname, snapshot)) {
    return null;
  }
  return <RestTimer />;
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // Keep SSR + first client render identical; hydrate preference after mount.
  const [colorMode, setColorMode] = useState<"light" | "dark">("light");
  const [themeReady, setThemeReady] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredTheme();
    setColorMode(stored);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) {
      return;
    }
    localStorage.setItem("fittrack-theme", colorMode);
  }, [colorMode, themeReady]);

  // Listen for theme changes dispatched from Settings (issue #34).
  useEffect(() => {
    const handler = (event: CustomEvent<"light" | "dark">) => {
      setColorMode(event.detail);
    };
    window.addEventListener(THEME_CHANGE_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(THEME_CHANGE_EVENT, handler as EventListener);
  }, []);

  useEffect(() => {
    if (isWorkoutRoute(pathname)) {
      document.body.dataset.fittrackRoute = "workout";
      return;
    }
    delete document.body.dataset.fittrackRoute;
  }, [pathname]);

  // Keyboard shortcuts: / for search, n for new entry, ? for help
  useKeyboardShortcuts({
    onFocusSearch: () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        '[type="search"], input[placeholder*="search" i], input[aria-label*="search" i], input[aria-label*="Search" i]'
      );
      searchInput?.focus();
    },
    onNewEntry: () => {
      // "n" opens the food-log dialog when on /nutrition
      if (pathname.startsWith("/nutrition")) {
        const logButton = document.querySelector<HTMLButtonElement>(
          'button[aria-label*="Log food" i], button:has-text("Log food")'
        );
        logButton?.click();
      }
    },
    onToggleHelp: () => {
      setShortcutsHelpOpen((prev) => !prev);
    },
  });

  // Page transition: use pathname as key to trigger CSS animation on navigation.
  // A <section> wraps the children so the CSS [data-page-transition] animation
  // fires on every mount (React unmounts/remounts when the key changes).
  const pageContent = (
    <section data-page-transition key={pathname}>
      <OfflineStatus />
      {children}
      <RestTimerMount />
      <MobileBottomNav />
    </section>
  );

  return (
    <Theme mode={colorMode} theme={fittrackTheme}>
      <LinkProvider component={RouterLink}>
        <ToastViewport maxVisible={3} position="bottomEnd">
          <AppShell
            contentPadding={4}
            height="auto"
            mobileNav={false}
            topNav={
              <TopNav
                endContent={
                  <IconButton
                    icon={<ThemeToggleIcon />}
                    label="Toggle dark mode"
                    onClick={() => {
                      setColorMode((mode) => toggleColorMode(mode));
                    }}
                    size="lg"
                    tooltip="Toggle dark mode"
                    variant="ghost"
                  />
                }
                heading={<TopNavHeading heading="FitTrack" headingHref="/" />}
                label="FitTrack navigation"
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
  );
}
