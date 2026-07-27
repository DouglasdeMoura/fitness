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
      testMatch: /(mobile-layout|mobile-nav|a11y|pwa-install|gym-mobile)\.spec\.ts/,
    },
    // No iphone-14 / WebKit project: Playwright's WebKit build cannot run on
    // this host. The binary installs, but launching it needs libicu74 and
    // friends via `sudo apt-get`, and this is Arch — Playwright itself reports
    // "your OS is not officially supported". All 94 iphone-14 "failures" in the
    // first run were `browserType.launch: Executable doesn't exist`, not real
    // defects. WebKit coverage needs a container or CI image; tracked
    // separately so it cannot silently block the dev loop.
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
