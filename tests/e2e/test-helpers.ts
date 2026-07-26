import { expect, type Page } from '@playwright/test'

/** Main app routes verified for mobile layout and accessibility (issue #49). */
export const APP_ROUTES = [
  '/',
  '/nutrition',
  '/workout',
  '/progress',
  '/settings',
  '/nutrition/templates',
  '/nutrition/planning',
  '/workout/programs',
] as const

export type AppRoute = (typeof APP_ROUTES)[number]
export type ColorMode = 'light' | 'dark'

/** Fixed calendar date so nutrition/workout pages render deterministically. */
export const FIXED_E2E_DATE = '2020-01-01'

/** Frozen clock instant matching FIXED_E2E_DATE (AGENTS.md: F.I.R.S.T). */
export const FIXED_E2E_TIME = new Date('2020-01-01T12:00:00Z')

export function routeWithStableQuery(path: AppRoute | string): string {
  if (path === '/nutrition' || path === '/workout') {
    return `${path}?date=${FIXED_E2E_DATE}`
  }
  return path
}

export async function installDeterministicClock(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_E2E_TIME })
}

export async function prepareTheme(page: Page, colorMode: ColorMode): Promise<void> {
  await page.addInitScript((theme) => {
    localStorage.setItem('fittrack-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, colorMode)
}

export async function openAppRoute(page: Page, path: AppRoute | string): Promise<void> {
  await page.goto(routeWithStableQuery(path))
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('navigation', { name: 'FitTrack navigation' })).toBeVisible({
    timeout: 15000,
  })
}

export async function assertNoHorizontalDocumentScroll(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement
    return root.scrollWidth > root.clientWidth
  })
  expect(hasOverflow).toBe(false)
}

const INTERACTIVE_SELECTOR = 'button, a[href], input, select'
const MIN_TOUCH_TARGET_PX = 44

export async function findUndersizedInteractiveElements(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ selector, minSize }) => {
      const isVisible = (element: Element): boolean => {
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false
        }
        const rect = element.getBoundingClientRect()
        return rect.width > 0 || rect.height > 0
      }

      const label = (element: Element): string => {
        const aria = element.getAttribute('aria-label')
        if (aria) return `${element.tagName.toLowerCase()}[aria-label="${aria}"]`
        const name = 'name' in element ? (element as HTMLInputElement).name : ''
        if (name) return `${element.tagName.toLowerCase()}[name="${name}"]`
        const text = element.textContent?.trim().slice(0, 40)
        if (text) return `${element.tagName.toLowerCase()}("${text}")`
        return element.tagName.toLowerCase()
      }

      const undersized: string[] = []
      for (const element of document.querySelectorAll(selector)) {
        if (!isVisible(element)) continue
        const rect = element.getBoundingClientRect()
        if (rect.width < minSize || rect.height < minSize) {
          undersized.push(
            `${label(element)}: ${Math.round(rect.width)}×${Math.round(rect.height)}`,
          )
        }
      }
      return undersized
    },
    { selector: INTERACTIVE_SELECTOR, minSize: MIN_TOUCH_TARGET_PX },
  )
}

export function formatAxeViolations(
  violations: Array<{ id: string; impact?: string | null; description: string; nodes: unknown[] }>,
): string {
  if (violations.length === 0) return ''
  return violations
    .map(
      (violation) =>
        `[${violation.impact}] ${violation.id}: ${violation.description} (${violation.nodes.length} nodes)`,
    )
    .join('\n')
}
