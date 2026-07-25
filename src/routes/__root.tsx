import {
  HeadContent,
  Link,
  Scripts,
  Outlet,
  createRootRoute,
} from '@tanstack/react-router'
import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineStatus } from '~/components/OfflineStatus'
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
        <header className="app-header">
          <nav className="app-nav">
            <Link to="/" className="app-nav-brand" activeProps={{}} activeOptions={{ exact: true }}>
              💪 FitTrack
            </Link>
            <Link
              to="/"
              activeProps={{ className: 'app-nav-link active' }}
              inactiveProps={{ className: 'app-nav-link' }}
              activeOptions={{ exact: true }}
            >
              Dashboard
            </Link>
            <Link
              to="/nutrition"
              activeProps={{ className: 'app-nav-link active' }}
              inactiveProps={{ className: 'app-nav-link' }}
            >
              Nutrition
            </Link>
            <Link
              to="/workout"
              activeProps={{ className: 'app-nav-link active' }}
              inactiveProps={{ className: 'app-nav-link' }}
            >
              Workout
            </Link>
            <Link
              to="/progress"
              activeProps={{ className: 'app-nav-link active' }}
              inactiveProps={{ className: 'app-nav-link' }}
            >
              Progress
            </Link>
            <Link
              to="/settings"
              activeProps={{ className: 'app-nav-link active' }}
              inactiveProps={{ className: 'app-nav-link' }}
            >
              Settings
            </Link>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: '8px', padding: '6px 10px' }}
              onClick={() => {
                const current = document.documentElement.getAttribute('data-theme') || 'light'
                const next = current === 'dark' ? 'light' : 'dark'
                document.documentElement.setAttribute('data-theme', next)
                localStorage.setItem('fittrack-theme', next)
              }}
              aria-label="Toggle dark mode"
            >
              🌓
            </button>
          </nav>
        </header>
        <main className="app-main">
          <div className="app-container">
            <OfflineStatus />
            {children}
          </div>
        </main>
        <Scripts />
        </QueryClientProvider>
      </body>
    </html>
  )
}
