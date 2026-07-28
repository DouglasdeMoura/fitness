# PRD: Mobile and PWA Hardening

## Overview

FitTrack is a web app used on a phone, in a gym, one-handed, installed to the home screen. Make that the case it is actually built and tested for.

## Problem

The PWA foundation is real — `public/manifest.json`, `public/sw.js`, `public/offline.html`, `viewport-fit=cover`, `theme-color`, and an offline mutation outbox with idempotency keys in `src/lib/offline.ts`. But three verified defects block the stated requirement of installing to a phone:

### 1. The app cannot be installed correctly — the icons do not exist

`public/manifest.json` declares:

```json
{ "src": "/icon-192.png", "sizes": "192x192", "purpose": "any maskable" },
{ "src": "/icon-512.png", "sizes": "512x512", "purpose": "any maskable" }
```

`public/` contains only `manifest.json`, `offline.html`, and `sw.js`. Both icons are **missing**, and `src/routes/__root.tsx:32` points `apple-touch-icon` at the same absent file. Chrome suppresses the install prompt when manifest icons fail to load, and iOS falls back to a screenshot of the page. This is a hard blocker, not a polish item.

### 2. `viewport-fit=cover` is set, but no safe-area insets are used

`src/routes/__root.tsx:24` opts the app into the display cutout area. Zero uses of `env(safe-area-inset-*)` exist anywhere in `src/`. On any notched device the header sits under the status bar and bottom content under the home indicator. Opting into the unsafe area without compensating is worse than not opting in.

### 3. Nothing is tested at phone size

`playwright.config.ts` defines one project: `devices['Desktop Chrome']`. Every e2e test runs at desktop width. The primary target device is untested, so mobile layout regressions cannot be caught.

Additionally, `scripts/dev-loop.sh` contains zero references to accessibility, mobile, viewport, or touch (`grep -ciE` → `0`), so none of this is verified before work is pushed.

---

## Batch 1: Make It Installable

**Goal**: the install prompt appears and the home-screen icon is correct.

- Generate `public/icon-192.png` and `public/icon-512.png` from a committed SVG source at `public/icon.svg`, so the raster assets are reproducible rather than mystery binaries.
- Maskable icons need a safe zone: keep all meaningful content within the central 80% circle, or Android will crop the logo. Ship separate `purpose: "any"` and `purpose: "maskable"` entries rather than one combined `"any maskable"` — the padding requirements genuinely conflict.
- Add `apple-touch-icon` at 180×180 (iOS ignores the manifest for this).
- Add iOS standalone meta: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`.
- Add a `screenshots` array to the manifest so Android shows a richer install UI.
- Add an in-app install affordance: listen for `beforeinstallprompt`, store the event, and offer "Add to home screen" in Settings. On iOS, where that event does not fire, render Share-sheet instructions instead.
- `display: "standalone"` and `orientation: "portrait-primary"` are already correct — leave them.

Files: `public/icon.svg` (new), `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `public/manifest.json`, `src/routes/__root.tsx`, `src/components/InstallPrompt.tsx` (new)

## Batch 2: Safe Areas and Thumb Reach

**Goal**: usable one-handed on a notched phone.

- Apply `env(safe-area-inset-*)` to the app header, any fixed/sticky element, and the bottom of scrollable page content.
- Because AGENTS.md forbids raw CSS values, express insets as CSS custom properties in `src/styles/app.css` and consume them via Astryx component props or token-backed utilities.
- Primary actions belong in the lower half of the screen. The current top-anchored navigation is the hardest region to reach one-handed on a large phone; evaluate a bottom navigation bar for the five main routes.
- The rest timer (PRD 10 Batch 2) must remain visible and reachable without scrolling while logging sets.

Files: `src/styles/app.css`, `src/components/AppChrome.tsx`, `src/routes/__root.tsx`

## Batch 3: Gym-Grade Touch Targets

**Goal**: works with imprecise, sweaty fingers, at arm's length.

- Every interactive element ≥ 44×44 px (WCAG 2.5.5 / Apple HIG minimum).
- Number entry for weight and reps gets large tap targets and increment/decrement steppers — typing a decimal weight mid-set is the wrong interaction.
- `inputmode="decimal"` on weight, `inputmode="numeric"` on reps, so phones show the right keypad.
- No horizontal page scroll at 390 px width on any route. Wide tables scroll inside their own container (this overlaps issue #29 — coordinate, do not duplicate).
- Tap targets must not sit within 8 px of each other where one is destructive.

Files: all `src/routes/**`, `src/components/**`

## Batch 4: Mobile and Accessibility Test Infrastructure

**Goal**: the loop can prove batches 1-3 without a human looking.

- Add a `mobile` Playwright project using `devices['Pixel 7']` and a second using `devices['iPhone 14']`; run the existing suite against both.
- Add `@axe-core/playwright`; assert zero critical or serious violations on every route, in **both** light and dark themes.
- Add automated checks expressed as tests, not review notes:
  - no horizontal document overflow at 390 px on every route
  - every interactive element's bounding box ≥ 44×44
  - manifest icons return 200 and decode to their declared dimensions
  - `manifest.json` parses and declares required fields
  - service worker registers and the app shell loads with the network offline
- Add a token-compliance test: no raw hex colours, no `style={{`, no layout `<div>` in `src/routes` or `src/components`. This makes PRD 06's "no raw hex" criterion machine-enforced rather than aspirational.

Files: `playwright.config.ts`, `tests/e2e/pwa-install.spec.ts` (new), `tests/e2e/mobile-layout.spec.ts` (new), `tests/e2e/a11y.spec.ts` (new), `tests/unit/token-compliance.test.ts` (new)

---

## Acceptance Criteria

All criteria are machine-verifiable — this PRD is built entirely by the autonomous loop.

- [ ] `public/icon-192.png` and `public/icon-512.png` exist, return 200, and decode to their declared sizes
- [ ] Icons are generated from a committed `public/icon.svg`
- [ ] Separate `any` and `maskable` icon entries; maskable content within the central 80%
- [ ] `apple-touch-icon` 180×180 exists and is referenced
- [ ] iOS standalone meta tags present
- [ ] Manifest declares `screenshots`
- [ ] Install affordance appears in Settings, with iOS Share-sheet fallback
- [ ] `env(safe-area-inset-*)` applied to header, fixed elements, and content bottom
- [ ] No horizontal document scroll at 390 px on every route (e2e)
- [ ] All interactive elements ≥ 44×44 px (e2e)
- [ ] `inputmode` set correctly on weight and reps inputs
- [ ] Playwright runs the suite on Pixel 7 and iPhone 14 projects
- [ ] Zero critical/serious axe violations on every route in light and dark
- [ ] Token-compliance test passes: no raw hex, no `style={{`, no layout `<div>`
- [ ] App shell loads with the network offline (e2e)
- [ ] `npm run test:unit` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run build` passes

## References

- W3C Web App Manifest — https://www.w3.org/TR/appmanifest/
- WCAG 2.2 SC 2.5.5 Target Size (Enhanced) — 44×44 CSS px minimum
- Apple Human Interface Guidelines — Layout, minimum 44pt tap target
- Maskable icons and the safe zone — https://w3c.github.io/manifest/#icon-masks
