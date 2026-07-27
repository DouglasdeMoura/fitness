import {
  HeadContent,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppChrome } from '~/components/AppChrome'
import appCss from '~/styles/app.css?url'
import reducedMotionCss from '~/styles/reduced-motion.css?url'

const QUERY_CLIENT_OPTIONS = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
    },
  },
} as const

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#6741d9' },
      { name: 'description', content: 'Science-backed nutrition and workout companion' },
      { title: 'FitTrack - Nutrition & Workout Companion' },
      // iOS standalone / home-screen install meta (PRD 12 Batch 1 / issue #48)
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-title', content: 'FitTrack' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'stylesheet', href: reducedMotionCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
    ],
    scripts: [
      {
        type: 'text/javascript',
        children: `
          (function() {
            var theme = localStorage.getItem('fittrack-theme') || 'light';
            document.documentElement.setAttribute('data-theme', theme);
          })();
        `,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient(QUERY_CLIENT_OPTIONS))
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
  )
}
