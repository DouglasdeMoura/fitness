import { test, expect, type Page } from '@playwright/test'
import {
  INSTALL_CARD_TITLE,
  INSTALL_BUTTON_LABEL,
  IOS_INSTALL_STEPS,
  INSTALLED_MESSAGE,
  UNAVAILABLE_MESSAGE,
} from '../../src/lib/pwa-install'

/** Read width/height from a PNG IHDR chunk. */
function pngDimensions(buf: Buffer): { width: number; height: number } {
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  }
}

async function openSettings(page: Page) {
  await page.goto('/settings')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 15000,
  })
}

test.describe('PWA install assets (issue #48)', () => {
  test('manifest.json parses and declares name, icons, start_url, display', async ({
    request,
  }) => {
    const res = await request.get('/manifest.json')
    expect(res.status()).toBe(200)
    const manifest = await res.json()
    expect(manifest.name).toMatch(/FitTrack/)
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThan(0)
    expect(Array.isArray(manifest.screenshots)).toBe(true)
    expect(manifest.screenshots.length).toBeGreaterThan(0)
  })

  test('every manifest icon and screenshot returns 200 at declared dimensions', async ({
    request,
  }) => {
    const manifest = await (await request.get('/manifest.json')).json()
    const assets = [
      ...manifest.icons.map((icon: { src: string; sizes: string }) => ({
        src: icon.src,
        sizes: icon.sizes,
      })),
      ...manifest.screenshots.map((shot: { src: string; sizes: string }) => ({
        src: shot.src,
        sizes: shot.sizes,
      })),
    ]

    for (const asset of assets) {
      const res = await request.get(asset.src)
      expect(res.status(), asset.src).toBe(200)
      const body = Buffer.from(await res.body())
      const [w, h] = asset.sizes.split('x').map(Number)
      expect(pngDimensions(body), asset.src).toEqual({ width: w, height: h })
    }
  })

  test('apple-touch-icon 180×180 is linked and served', async ({ page, request }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    expect(href).toBe('/apple-touch-icon.png')

    const res = await request.get('/apple-touch-icon.png')
    expect(res.status()).toBe(200)
    expect(pngDimensions(Buffer.from(await res.body()))).toEqual({
      width: 180,
      height: 180,
    })
  })

  test('iOS standalone meta tags are present', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    )
    await expect(
      page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute('content', 'default')
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      'content',
      'FitTrack',
    )
  })
})

test.describe('Install affordance in Settings (issue #48)', () => {
  test('renders the Install App card with browser fallback copy', async ({ page }) => {
    await openSettings(page)
    await expect(page.getByRole('heading', { name: INSTALL_CARD_TITLE })).toBeVisible()
    // Desktop Chromium in Playwright rarely gets beforeinstallprompt; show fallback.
    const fallback = page.getByText(UNAVAILABLE_MESSAGE)
    const installBtn = page.getByRole('button', { name: INSTALL_BUTTON_LABEL })
    await expect(fallback.or(installBtn).first()).toBeVisible()
  })

  test('shows Safari Share-sheet instructions under an iPhone user agent', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await openSettings(page)
    await expect(page.getByRole('heading', { name: INSTALL_CARD_TITLE })).toBeVisible()
    await expect(page.getByText(/Safari Share sheet/i)).toBeVisible()
    for (const step of IOS_INSTALL_STEPS) {
      await expect(page.getByText(step)).toBeVisible()
    }
    await expect(page.getByRole('button', { name: INSTALL_BUTTON_LABEL })).toHaveCount(0)
    await context.close()
  })

  test('shows installed confirmation when display-mode is standalone', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    await context.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (query: string) => {
        if (query.includes('display-mode: standalone')) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
              return false
            },
          } as MediaQueryList
        }
        return original(query)
      }
    })
    const page = await context.newPage()
    await openSettings(page)
    await expect(page.getByText(INSTALLED_MESSAGE)).toBeVisible()
    await context.close()
  })
})
