import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Asset,
  createRootRoute,
  Scripts,
  useHydrated,
  useRouter,
  useTags,
} from "@tanstack/react-router";
import { DEV_STYLES_ATTR } from "@tanstack/router-core";
import type { RouterManagedTag } from "@tanstack/router-core";
import * as React from "react";

import { AppChrome } from "~/components/app-chrome";
import {
  DARK_COLOR_SCHEME_QUERY,
  DEFAULT_COLOR_MODE,
  THEME_STORAGE_KEY,
} from "~/lib/app-chrome";

import appCss from "~/styles/app.css?url";
import focusVisibleCss from "~/styles/focus-visible.css?url";
import pageTransitionsCss from "~/styles/page-transitions.css?url";
import reducedMotionCss from "~/styles/reduced-motion.css?url";

const QUERY_CLIENT_OPTIONS = {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60,
    },
  },
} as const;

const PRESERVE_STYLESHEET_ORDER = () => {
  // An event prop opts out of React 19 resource hoisting so the theme script runs first.
};

const THEME_BOOTSTRAP_SCRIPT = `
  (function() {
    var storedTheme = localStorage.getItem("${THEME_STORAGE_KEY}");
    var prefersDark = typeof matchMedia === "function"
      && matchMedia("${DARK_COLOR_SCHEME_QUERY}").matches;
    var theme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : prefersDark
        ? "dark"
        : "${DEFAULT_COLOR_MODE}";
    var root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  })();
`;

const THEME_PROVIDER_SYNC_SCRIPT = `
  (function() {
    var theme = document.documentElement.dataset.theme;
    var provider = document.body.querySelector("[data-astryx-theme]");
    if (!provider || (theme !== "light" && theme !== "dark")) {
      return;
    }
    provider.dataset.theme = theme;
    provider.style.colorScheme = theme;
  })();
`;

export const Route = createRootRoute({
  head: () => ({
    links: [
      { href: appCss, rel: "stylesheet" },
      { href: reducedMotionCss, rel: "stylesheet" },
      { href: pageTransitionsCss, rel: "stylesheet" },
      { href: focusVisibleCss, rel: "stylesheet" },
      { href: "/manifest.json", rel: "manifest" },
      {
        href: "/apple-touch-icon.png",
        rel: "apple-touch-icon",
        sizes: "180x180",
      },
    ],
    meta: [
      { charSet: "utf-8" },
      {
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
        name: "viewport",
      },
      { content: "#6741d9", name: "theme-color" },
      {
        content: "Science-backed nutrition and workout companion",
        name: "description",
      },
      { title: "FitTrack - Nutrition & Workout Companion" },
      // iOS standalone / home-screen install meta (PRD 12 Batch 1 / issue #48)
      { content: "yes", name: "apple-mobile-web-app-capable" },
      { content: "default", name: "apple-mobile-web-app-status-bar-style" },
      { content: "FitTrack", name: "apple-mobile-web-app-title" },
    ],
  }),
  shellComponent: RootDocument,
});

function ThemeHeadAsset({
  nonce,
  tag,
}: {
  nonce?: string;
  tag: RouterManagedTag;
}) {
  if (tag.tag === "link" && tag.attrs?.rel === "stylesheet") {
    const stylesheetAttrs = {
      ...tag.attrs,
      onLoad: PRESERVE_STYLESHEET_ORDER,
    };
    return <link {...stylesheetAttrs} suppressHydrationWarning />;
  }
  return <Asset {...tag} nonce={nonce} />;
}

function useVisibleThemeHeadTags(): RouterManagedTag[] {
  const hydrated = useHydrated();
  const tags = useTags();
  React.useEffect(() => {
    if (!hydrated) {
      return;
    }
    document
      .querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
      .forEach((element) => element.remove());
  }, [hydrated]);
  if (!hydrated) {
    return tags;
  }
  return tags.filter(
    (tag) => tag.tag !== "link" || tag.attrs?.[DEV_STYLES_ATTR] !== true
  );
}

function ThemeFirstHeadContent() {
  const nonce = useRouter().options.ssr?.nonce;
  const tags = useVisibleThemeHeadTags();
  return tags.map((tag) => (
    <ThemeHeadAsset
      key={`fittrack-head-${JSON.stringify(tag)}`}
      nonce={nonce}
      tag={tag}
    />
  ));
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const queryClient = React.useMemo(
    () => new QueryClient(QUERY_CLIENT_OPTIONS),
    []
  );
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__fittrackQueryClient = queryClient;
    }
  }, [queryClient]);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script>{THEME_BOOTSTRAP_SCRIPT}</script>
        <ThemeFirstHeadContent />
      </head>
      <body data-viewport-fit="cover">
        <QueryClientProvider client={queryClient}>
          <AppChrome>{children}</AppChrome>
          <script>{THEME_PROVIDER_SYNC_SCRIPT}</script>
          <Scripts />
        </QueryClientProvider>
      </body>
    </html>
  );
}
