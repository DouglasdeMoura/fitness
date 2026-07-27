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

export const NAMED_TABLE_SCROLL_LABELS = {
  foodLog: 'food-log',
  workoutSets: 'workout-sets',
  programsList: 'programs-list',
  templatesList: 'templates-list',
} as const

export type NamedTableScrollLabel = (typeof NAMED_TABLE_SCROLL_LABELS)[keyof typeof NAMED_TABLE_SCROLL_LABELS]

/** Document stays fixed while a named table region scrolls horizontally (issue #53). */
export async function assertTableScrollsInHost(page: Page, scrollLabel: NamedTableScrollLabel): Promise<void> {
  const host = page.locator(`[data-fittrack-table-scroll="${scrollLabel}"]`)
  await expect(host).toBeVisible({ timeout: 15000 })

  const metrics = await host.evaluate((element) => {
    const doc = document.documentElement
    return {
      docOverflow: doc.scrollWidth > doc.clientWidth,
      hostClientWidth: element.clientWidth,
      hostScrollWidth: element.scrollWidth,
    }
  })

  expect(metrics.docOverflow).toBe(false)
  expect(metrics.hostScrollWidth).toBeGreaterThan(metrics.hostClientWidth)
}

const MIN_DESTRUCTIVE_GAP_PX = 8

/** Destructive controls must sit at least 8px from adjacent targets (issue #53). */
export async function findDestructiveSpacingViolations(page: Page): Promise<string[]> {
  return page.evaluate((minGap) => {
    const interactiveSelector = 'button, a[href], input, select'
    const isVisible = (element: Element): boolean => {
      const style = window.getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false
      }
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    const gapBetween = (a: DOMRect, b: DOMRect): number => {
      const horizontalGap =
        a.right <= b.left ? b.left - a.right : b.right <= a.left ? a.left - b.right : 0
      const verticalGap =
        a.bottom <= b.top ? b.top - a.bottom : b.bottom <= a.top ? a.top - b.bottom : 0
      if (horizontalGap > 0 && verticalGap > 0) {
        return Math.min(horizontalGap, verticalGap)
      }
      return Math.max(horizontalGap, verticalGap)
    }

    const destructiveButtons = [...document.querySelectorAll('button[data-variant="destructive"]')]
      .filter(isVisible)

    const violations: string[] = []
    for (const destructive of destructiveButtons) {
      const destructiveRect = destructive.getBoundingClientRect()
      const label = destructive.getAttribute('aria-label') ?? destructive.textContent?.trim() ?? 'destructive'
      for (const other of document.querySelectorAll(interactiveSelector)) {
        if (other === destructive || destructive.contains(other) || other.contains(destructive) || !isVisible(other)) continue
        const otherRect = other.getBoundingClientRect()
        const gap = gapBetween(destructiveRect, otherRect)
        if (gap > 0 && gap < minGap) {
          violations.push(`${label} is only ${Math.round(gap)}px from another target`)
        }
      }
    }
    return violations
  }, MIN_DESTRUCTIVE_GAP_PX)
}

