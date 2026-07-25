import {
  HeadContent,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppChrome } from '~/components/AppChrome'
import appCss from '~/styles/app.css?url'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#6741d9' },
      { name: 'description', content: 'Science-backed nutrition and workout companion' },
      { title: 'FitTrack - Nutrition & Workout Companion' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'apple-touch-icon', href: '/icon-192.png' },
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
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <AppChrome>{children}</AppChrome>
          <Scripts />
        </QueryClientProvider>
      </body>
    </html>
  )
}
