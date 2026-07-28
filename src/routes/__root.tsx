import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import * as React from "react";

import { AppChrome } from "~/components/app-chrome";

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
    scripts: [
      {
        children: `
          (function() {
            var theme = localStorage.getItem('fittrack-theme') || 'light';
            document.documentElement.setAttribute('data-theme', theme);
          })();
        `,
        type: "text/javascript",
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () => new QueryClient(QUERY_CLIENT_OPTIONS)
  );
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__fittrackQueryClient = queryClient;
    }
  }, [queryClient]);
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body data-viewport-fit="cover">
        <QueryClientProvider client={queryClient}>
          <AppChrome>{children}</AppChrome>
          <Scripts />
        </QueryClientProvider>
      </body>
    </html>
  );
}
