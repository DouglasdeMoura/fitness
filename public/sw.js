/**
 * FitTrack service worker.
 *
 * Handles the parts of offline support that only a worker can: serving the app
 * shell and static assets when the network is gone, and keeping a copy of the
 * last successful reference-data responses.
 *
 * Mutations are deliberately not intercepted here. They are queued by the app
 * itself (src/lib/offline.ts) as typed entries with idempotency keys, which
 * survives a replay far more safely than replaying opaque POST bodies.
 */

const VERSION = 'v1'
const SHELL_CACHE = `fittrack-shell-${VERSION}`
const ASSET_CACHE = `fittrack-assets-${VERSION}`
const DATA_CACHE = `fittrack-data-${VERSION}`
const OWNED_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE]

const OFFLINE_URL = '/offline.html'
const APP_SHELL_ROUTES = ['/', '/nutrition', '/workout', '/progress', '/settings']
const SYNC_TAG = 'fittrack-sync'

const ASSET_PATH_PREFIXES = ['/assets/', '/_build/', '/_serverFn/assets/']
const ASSET_EXTENSIONS = ['.js', '.css', '.woff', '.woff2', '.png', '.svg', '.ico', '.webp']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE)

      // The fallback page is the one response the worker cannot do without.
      await shell.add(new Request(OFFLINE_URL, { cache: 'reload' }))

      // Warm the server-rendered routes. Settled individually so a route that
      // errors (empty database on a fresh install, say) cannot abort install
      // and leave the app with no worker at all.
      await Promise.allSettled(
        APP_SHELL_ROUTES.map((route) => shell.add(new Request(route, { cache: 'reload' })))
      )

      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('fittrack-') && !OWNED_CACHES.includes(key))
          .map((key) => caches.delete(key))
      )

      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }

      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Mutations belong to the outbox; letting them fall through means a failed
  // POST surfaces as a network error the app can catch and queue.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event))
    return
  }

  if (url.pathname.startsWith('/_serverFn/')) {
    event.respondWith(networkFirst(request, DATA_CACHE))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
  }
})

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type
  if (type === 'fittrack:skip-waiting') {
    self.skipWaiting()
  }
})

// Fires when the browser regains connectivity, including while the app is
// closed. The worker cannot replay typed mutations itself, so it wakes any
// open client and lets the app drain its own outbox.
self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return
  event.waitUntil(broadcast({ type: 'fittrack:sync-requested' }))
})

async function handleNavigation(event) {
  const cache = await caches.open(SHELL_CACHE)

  try {
    const preloaded = await event.preloadResponse
    const response = preloaded || (await fetch(event.request))
    if (response && response.ok) {
      cache.put(event.request, response.clone())
    }
    return response
  } catch {
    return (
      (await cache.match(event.request, { ignoreSearch: true })) ||
      (await cache.match('/')) ||
      (await cache.match(OFFLINE_URL)) ||
      Response.error()
    )
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response && response.ok) {
    cache.put(request, response.clone())
  }
  return response
}

function isStaticAsset(url) {
  if (ASSET_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true
  return ASSET_EXTENSIONS.some((extension) => url.pathname.endsWith(extension))
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  for (const client of clients) client.postMessage(message)
}
