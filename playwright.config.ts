import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

// Port, server command and database are all env-driven so a run can be fully
// isolated from anything else on the machine. They default to the previous
// hardcoded behaviour, so a plain `npm run test:e2e` is unchanged.
const PORT = process.env.E2E_PORT ?? "3000";

// Default builds first because `node .output/server/index.mjs` needs an
// artifact that may be absent or stale. The dev loop overrides this with
// `npm run start` — it has just run `npm run build` as its own gate, so
// rebuilding here would pay for the same build twice.
//
// Serving the build rather than `vite dev` also removes per-route compilation
// from the measured suite: vite dev compiles each route on first navigation,
// which is charged to whichever test happens to touch it first.
const WEB_SERVER_COMMAND =
  process.env.E2E_WEB_SERVER_COMMAND ?? "npm run build && npm run start";

const E2E_DATABASE_PATH =
  process.env.DATABASE_PATH ??
  join(process.cwd(), "data", "e2e-fittrack.db");

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  // Both stay off until every spec can be given its own database.
  //
  // Six specs seed and clear rows by opening the SQLite file directly, and all
  // of them share one file and one server, so file-level parallelism alone
  // would have (say) nutrition-meal-layout deleting the food_log rows that
  // nutrition-copy just wrote. Real parallelism needs one database AND one
  // server per shard — openE2eDatabase()/e2eDatabasePath() and the env-driven
  // PORT above are the groundwork for that; the shard driver is not written
  // yet. Check .dev-loop/timings.jsonl before deciding it is worth it.
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Phone-viewport coverage. Deliberately scoped to the mobile-specific
      // specs rather than the whole suite: app.spec and toasts.spec encode a
      // DESKTOP interaction model (top nav, "navigate via header"), and PRD 12
      // Batch 2 replaces that with a bottom nav below 768px. Running them
      // unchanged at 390px asserts affordances the mobile design does not have,
      // which is why 11 of them failed here rather than finding real bugs.
      // Mobile navigation specs belong with the bottom-nav change itself.
      name: "pixel-7",
      testMatch:
        /(mobile-layout|mobile-nav|a11y|pwa-install|push-notifications|gym-mobile|visual)\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
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
      name: "iphone-14",
      use: { ...devices["iPhone 14"] },
    },
  ],
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 0,
    },
  },
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: WEB_SERVER_COMMAND,
    env: {
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "dev-only-change-me-before-production",
      // Better Auth validates the request origin against baseURL — keep in sync
      // with E2E_PORT so sign-in works when the suite uses a non-default port.
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      E2E_PUSH_MOCK: "1",
      PORT,
      // Forwarded explicitly so the server opens the same file the specs seed
      // through openE2eDatabase(). Without it a run with DATABASE_PATH set
      // would have the specs writing one database and the app reading another.
      DATABASE_PATH: E2E_DATABASE_PATH,
    },
    // Reuse is convenient locally (keep `npm run dev` open, re-run specs), but
    // it silently tests whatever is already listening on the port — including a
    // stale dev server from another checkout serving different code. The dev
    // loop sets this to "false" so its gate always tests the build it just
    // produced.
    reuseExistingServer: process.env.E2E_REUSE_SERVER !== "false",
    // Generous because the default command builds before serving.
    timeout: 240_000,
    url: `http://localhost:${PORT}`,
  },
  workers: 1,
});
