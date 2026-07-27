import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Phone-viewport coverage. Deliberately scoped to the mobile-specific
      // specs rather than the whole suite: app.spec and toasts.spec encode a
      // DESKTOP interaction model (top nav, "navigate via header"), and PRD 12
      // Batch 2 replaces that with a bottom nav below 768px. Running them
      // unchanged at 390px asserts affordances the mobile design does not have,
      // which is why 11 of them failed here rather than finding real bugs.
      // Mobile navigation specs belong with the bottom-nav change itself.
      name: 'pixel-7',
      use: { ...devices['Pixel 7'] },
      testMatch: /(mobile-layout|mobile-nav|a11y|pwa-install|push-notifications|gym-mobile)\.spec\.ts/,
    },
    {
      // iOS Safari coverage. NOT part of `npm run test:e2e` — it is excluded
      // from the default run via `--project` selection in that script, because
      // Playwright's WebKit cannot launch on this host: the binary installs but
      // needs libicu74 (Arch ships 78, and ICU breaks ABI between majors) plus
      // libxml2.so.2 and libjxl 0.8, none available as official Arch packages.
      // Playwright itself reports "your OS is not officially supported".
      //
      // Run it in the official container instead, which has every dep:
      //     npm run test:e2e:webkit
      //
      // The image tag must track the @playwright/test version or the driver
      // mismatches. All 94 iphone-14 "failures" seen before this split were
      // `browserType.launch: Executable doesn't exist` — environmental noise,
      // not defects, and they blocked the dev loop's e2e gate.
      name: 'iphone-14',
      use: { ...devices['iPhone 14'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    env: {
      E2E_PUSH_MOCK: '1',
    },
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
