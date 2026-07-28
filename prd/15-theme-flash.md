# PRD: Eliminate the Theme Flash

## Overview

A user who has chosen dark mode sees a light-coloured frame before the dark one. On a phone-first PWA opened many times a day, that flash is the first thing the app does. This PRD removes it, and fixes the two correctness bugs sitting underneath it.

## Problem

Three independent mechanisms decide what colour the app is, and they run at three different times.

### 1. React's first render is hardcoded to light

`src/components/app-chrome.tsx:100`:

```ts
// Keep SSR + first client render identical; hydrate preference after mount.
const [colorMode, setColorMode] = useState<"light" | "dark">("light");
```

The comment is honest about the trade it makes, and the hydration-safety reasoning is sound — React cannot read `localStorage` during SSR. But the consequence is that **every dark-mode user gets one full React render in light mode**, then a re-render after the mount effect reads storage. That is the flash.

The blocking script at `src/routes/__root.tsx:52-62` already sets `data-theme` on `<html>` before paint, so the *CSS* is correct from the first frame. React then disagrees with it for one cycle.

### 2. `color-scheme` is unset for the whole first paint

Astryx derives `color-scheme` from `data-theme`, in `@astryxdesign/core/dist/astryx.umd.js`:

```js
n==="light"||n==="dark" ? e.style.colorScheme=n : e.style.removeProperty("color-scheme")
… new MutationObserver(t).observe(document.documentElement,{attributes:!0,…})
```

That observer only exists once the Astryx bundle has executed. Until then `color-scheme` is `normal`, which has two effects:

- Every UA-painted surface — the canvas behind the document, scrollbars, form controls, the overscroll area — renders **light**. This is the white flash, and it happens before any of our CSS matters.
- `light-dark()` resolves to its **light** branch. `src/lib/fittrack-theme.ts:12-13` uses `light-dark()` for error-badge colours, so those are not merely late, they are wrong until the observer fires.

Nothing in `src/`, `public/`, `@astryxdesign/core/reset.css`, `astryx.css`, or `@astryxdesign/theme-neutral/theme.css` declares `color-scheme`. The inline script that already runs at the right moment sets only `data-theme`.

### 3. The custom theme is injected at runtime

Every page load logs:

```
[Astryx] Theme "fittrack-neutral" is using runtime style injection.
For better performance, use the pre-built theme.
```

`src/styles/app.css` statically imports `theme-neutral/theme.css`, but `fittrackTheme` (`src/lib/fittrack-theme.ts`) is a `defineTheme` extending it at runtime, so the overrides — including the contrast-tuned `--color-text-secondary` that issue #49's a11y gates depend on — arrive after JS. `npm run astryx theme` builds these ahead of time.

### 4. System preference is ignored

`src/lib/app-chrome.ts:6` and `src/routes/__root.tsx:56` both default to `'light'` when nothing is stored. A user whose OS is set to dark and who has never opened Settings gets a light app. Astryx's own theme context already supports a `"system"` mode backed by `prefers-color-scheme`; the app does not use it.

### 5. Browser chrome does not follow the theme

`src/routes/__root.tsx:41` pins `<meta name="theme-color" content="#6741d9">`. Installed as a PWA, the status bar and address bar keep that colour in both themes, leaving a mismatched band above a dark app.

### 6. The mismatch is already being logged

Every e2e run records it:

```
A tree hydrated but some attributes of the server rendered HTML didn't match…
  <html lang="en"
-   data-theme="light"
  >
```

`This won't be patched up` — React's words. The attribute survives because the inline script set it, but React has flagged the document as diverged on its very first act.

## Stance

> The first painted frame must be the final frame. A theme is not "applied on load"; it is decided before the first paint and never revised.

This follows PRD 13's rule that a design requirement must be expressed as a measurable assertion. "No flash" is measurable exactly: **a screenshot taken at first paint and a screenshot taken after hydration must be pixel-identical.** If they differ, there was a flash. That is the gate, not a description of one.

There must be exactly one owner of the resolved theme, and it must be the pre-paint inline script. Everything else — React state, Astryx's observer, the Settings toggle — reads from it or writes through it.

## Constraints

**The inline script is the only code allowed to run before first paint**, so it must stay small, dependency-free, and synchronous. It cannot import the shared resolver; it must be generated from the same source of truth so the two cannot drift. A duplicated `'light'` default in two files is what produced problem 4.

**Do not remove the SSR-safety property.** `useState("light")` exists for a real reason: SSR has no `localStorage`. The fix is not to read storage during render — it is to stop React from owning the initial value at all, taking it instead from the DOM attribute the inline script has already set.

**Astryx's MutationObserver must not be fought.** It sets `style.colorScheme` from `data-theme`. Setting the same value earlier is complementary; the observer will re-set it to the same thing and no conflict arises. Do not remove `data-theme` or bypass the observer.

---

## Batch 1: Make the First Paint Correct

**Goal**: the frame the user sees first is already right.

- Extend the inline script in `src/routes/__root.tsx` to set `style.colorScheme` alongside `data-theme`, from the same resolved value.
- Resolve as: stored preference → else `prefers-color-scheme` → else `light`. One expression, generated from one shared constant so `__root.tsx` and `src/lib/app-chrome.ts` cannot diverge.
- `AppChrome` must initialise `colorMode` from `document.documentElement.dataset.theme` rather than the literal `"light"`, using a lazy initialiser so SSR is unaffected.
- Keep the SSR markup and the pre-hydration DOM in agreement so the hydration warning stops.

**Acceptance criteria**

- With `localStorage.fittrack-theme = "dark"`, a screenshot captured at `domcontentloaded` is pixel-identical to one captured after hydration settles.
- Zero console messages matching `/hydrat/i` on any route, light or dark.
- `getComputedStyle(document.documentElement).colorScheme` is `"dark"` when the resolved theme is dark, asserted before the Astryx bundle has run.
- The raw SSR HTML (fetched with JS disabled) contains the theme script **before** the first `<link rel="stylesheet">`.

## Batch 2: Pre-build the Theme

**Goal**: no theme CSS arrives after JS.

- Run `npm run astryx theme` to build `fittrack-neutral`, import the built artifacts per the Astryx setup contract, and drop the runtime `defineTheme` from the render path.
- Keep `src/lib/fittrack-theme.ts` as the source the build consumes — the contrast overrides it carries are load-bearing for issue #49's axe gates and must not be lost.

**Acceptance criteria**

- The `runtime style injection` warning does not appear in any e2e run.
- `--color-text-secondary` resolves to the tuned value in the first paint, not only after hydration.
- Existing axe contrast gates still pass in both themes.

## Batch 3: System Preference and Browser Chrome

**Goal**: honour what the user already told their OS.

- With no stored preference, follow `prefers-color-scheme`, and keep following it while the user has not made an explicit choice.
- Drive `<meta name="theme-color">` from the resolved theme so installed PWA chrome matches.

**Acceptance criteria**

- With storage empty and `prefers-color-scheme: dark` emulated, the resolved theme is dark and Batch 1's first-paint equality still holds.
- An explicit choice in Settings continues to win over the system preference across a reload.
- `theme-color` content differs between the two themes.

## Batch 4: Gates

**Goal**: the flash cannot come back.

- `tests/e2e/theme-flash.spec.ts`: the first-paint-equals-settled-paint assertion, run for both themes and both projects (`chromium`, `pixel-7`).
- A unit test asserting the light/dark default appears exactly once in the codebase, so the two-defaults bug cannot recur.
- A gate asserting `color-scheme` is set on `<html>` before hydration.

**Acceptance criteria**

- Reintroducing `useState("light")` in `AppChrome` fails `npm run test:e2e`.
- Adding a second hardcoded theme default fails `npm run test:unit`.

---

## Dependency

The e2e suite is currently **red — 76 failures** from stale selectors left by the redesigns that shipped while `--no-e2e` was active. Batch 4's gates are only trustworthy once that is repaired; adding them to a failing suite proves nothing. Batches 1–3 are independently verifiable by unit test and by hand.

## Out of Scope

- Redesigning the theme toggle UI. Issue #34 owns that surface.
- Per-route or per-component theme overrides.
- Replacing Astryx's theme context. The problem is ordering, not the library.
