"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
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
  WorkoutIcon,
} from "~/components/icons/fit-track-icons";
import { OfflineStatus } from "~/components/offline-status";
import { RouterLink } from "~/components/router-link";
import { ShortcutsHelpDialog } from "~/components/shortcuts-help-dialog";
import { UserMenu } from "~/components/user-menu";
import { RestTimer } from "~/components/workout/rest-timer";
import { useKeyboardShortcuts } from "~/hooks/use-keyboard-shortcuts";
import {
  DEFAULT_COLOR_MODE,
  isMinimalChromeRoute,
  isWorkoutRoute,
  navValueFromPath,
  subscribeToSystemTheme,
  THEME_CHANGE_EVENT,
} from "~/lib/app-chrome";
import type { ColorMode } from "~/lib/app-chrome";
import { fittrackNeutralTheme } from "~/lib/generated/fittrack-neutral/fittrack-neutral";
import {
  getRestTimerSnapshot,
  shouldMountRestTimer,
  subscribeRestTimer,
} from "~/lib/rest-timer";

const NAV_ITEMS = [
  { exact: true, href: "/dashboard", icon: DashboardIcon, label: "Dashboard" },
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
  // The blocking head script owns pre-paint resolution; React reads its result.
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    if (typeof document === "undefined") {
      return DEFAULT_COLOR_MODE;
    }
    return document.documentElement.dataset.theme === "dark"
      ? "dark"
      : DEFAULT_COLOR_MODE;
  });
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  // Listen for theme changes dispatched from Settings (issue #34).
  useEffect(() => {
    const handler = (event: CustomEvent<ColorMode>) => {
      setColorMode(event.detail);
    };
    window.addEventListener(THEME_CHANGE_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(THEME_CHANGE_EVENT, handler as EventListener);
  }, []);

  // Follow OS colour scheme until the user makes an explicit Settings choice.
  useEffect(() => subscribeToSystemTheme(setColorMode), []);

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
  if (isMinimalChromeRoute(pathname)) {
    return (
      <Theme mode={colorMode} theme={fittrackNeutralTheme}>
        <LinkProvider component={RouterLink}>{children}</LinkProvider>
      </Theme>
    );
  }

  const pageContent = (
    <section data-page-transition key={pathname}>
      <OfflineStatus />
      {children}
      <RestTimerMount />
      <MobileBottomNav />
    </section>
  );

  return (
    <Theme mode={colorMode} theme={fittrackNeutralTheme}>
      <LinkProvider component={RouterLink}>
        <ToastViewport maxVisible={3} position="bottomEnd">
          <AppShell
            contentPadding={4}
            height="auto"
            mobileNav={false}
            topNav={
              <TopNav
                endContent={<UserMenu />}
                heading={
                  <TopNavHeading heading="FitTrack" headingHref="/dashboard" />
                }
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
