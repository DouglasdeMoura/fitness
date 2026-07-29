# PRD 18 — Consolidate the theme control into Settings

## Overview

The light/dark toggle should live in Settings, not the header. Today it lives in
both: an `IconButton` in the `TopNav` (`src/components/app-chrome.tsx:196-207`)
and a `Switch` on the Settings page (`src/routes/settings/index.tsx:393-398`).

The cause of the mess is **not** that two controls exist. It is that neither
control is derived from the theme — both hold a private `useState` snapshot
taken once at mount, and neither subscribes to the change event the other
dispatches. Two independent copies of one piece of state.

**The Settings switch is already broken on its own.** On every server-rendered
load of `/settings` with `dark` stored, the page renders dark and the switch
renders OFF — 10 of 10 attempts. Clicking it then does nothing: the switch flips
to ON, the page stays dark, `localStorage` stays `dark` (5 of 5). A user who
wants light has to click twice, and the first click is dead.

So the one-line change the request implies — delete the `IconButton` — would
leave FitTrack with exactly one theme control, and that control lies. The
through-line: **make the Settings switch a derived view of the theme, then make
it the only control.**

## What was measured

Measured 2026-07-29 against a **production build** (`npm run build && npm run
start`, the `chromium` Playwright project, seeded `data/e2e-fittrack.db`), signed
in as the seeded demo account. Not a unit test standing in for the browser.

### Both controls exist; the header one is on every authenticated route

| Route | `getByRole("button", {name: "Toggle dark mode"})` count |
| --- | --- |
| `/dashboard` | 1 |
| `/nutrition` | 1 |
| `/workout` | 1 |
| `/settings` | 1 |
| `/` (marketing) | 0 |
| `/sign-in` | 0 |
| `/blog` | 0 |

`TopNav` buttons on `/dashboard`: `["Demo Athlete", "Toggle dark mode"]`.
Toggle bounding box: 36×36 at 1280px and 36×36 at 390px.

### Defect A — the two controls disagree, on the same page

Procedure: open `/settings`, force `localStorage.fittrack-theme = "light"`,
reload, click the header toggle, then read the Settings switch.

| Attempts | `document.documentElement.dataset.theme` | Settings switch `isChecked()` |
| --- | --- | --- |
| 10 of 10 | `dark` | `false` |

The page turns dark while the only labelled dark-mode control on screen still
reads OFF.

### Defect B — the switch ignores the OS

Procedure: open `/settings`, clear the stored preference, `emulateMedia`
light → dark.

| OS scheme | doc theme | Settings switch |
| --- | --- | --- |
| light | `light` | `false` |
| dark | `dark` | `false` ← stale |

The document follows the OS correctly (`subscribeToSystemTheme`,
`src/lib/app-chrome.ts:112-133`). The switch does not subscribe to anything.

### Defect C — the switch is wrong on every SSR load, and the click is dead

Procedure: store `dark`, hard-reload `/settings`, wait 1.5 s for the page to
settle, read the switch.

| Attempts | doc theme | Settings switch |
| --- | --- | --- |
| 10 of 10 | `dark` | `false` |

Navigation path decides the outcome — this is the measurement that identifies
the cause:

| How `/settings` was reached | doc theme | Settings switch |
| --- | --- | --- |
| `page.goto("/settings")` (SSR + hydration) | `dark` | **`false`** |
| client-side nav from `/dashboard` (no SSR) | `dark` | **`true`** |

Then clicking the switch in the broken SSR state, 5 of 5:

| Before | After click |
| --- | --- |
| doc=`dark`, stored=`dark`, checked=`false` | doc=`dark`, stored=`dark`, checked=`true` |

Nothing changed but the switch itself. The click is a no-op.

### Why nobody noticed

Console output on that same hard load of `/settings`, capturing every `error`
and `warning`:

```
MEASURE console-on-settings-dark = []
```

React emitted **no hydration warning**. The mismatch is silent.

### Replacement hydration probe is viable

`tests/e2e/dev-runtime-integrity.spec.ts:98` uses the header toggle as its
hydration probe for every protected route. The `UserMenu` button is a candidate
replacement — measured present and functional on all five:

| Route | `Demo Athlete` button count | click opens `role=menu` |
| --- | --- | --- |
| `/dashboard` | 1 | true |
| `/nutrition` | 1 | true |
| `/workout` | 1 | true |
| `/progress` | 1 | true |
| `/settings` | 1 | true |

Settings stays reachable without the header: the mobile bottom nav renders one
`Settings` link at 390px, 70×36.

## Problem 1 — Two uncoordinated copies of one piece of state

`src/components/app-chrome.tsx:110-117` and `src/routes/settings/index.tsx:133-138`
each own a `useState` seeded once at mount. `AppChrome` at least subscribes
(`app-chrome.tsx:121-131`, listening for `THEME_CHANGE_EVENT` and OS changes).
Settings subscribes to nothing. Evidence: Defect A (10/10), Defect B.

## Problem 2 — The Settings switch's initial state is unknowable on the server

`src/routes/settings/index.tsx:133-138`:

```tsx
const [isDark, setIsDark] = useState<boolean>(() => {
  if (typeof window === "undefined") {
    return false;
  }
  return getStoredTheme() === "dark";
});
```

The server has no `localStorage`, so it renders `false` and ships
`<input type="checkbox" role="switch">` unchecked. React does not repair a
checked-state mismatch on an input during hydration, so the DOM keeps the
server's answer regardless of what the client initializer computes. The SSR vs.
client-nav contrast above isolates this: same stored value, same document theme,
opposite switch state, decided purely by whether the markup came from the server.

This is why the pre-paint script at `src/routes/__root.tsx:41-62` exists for the
`<html>` element — the same problem, already solved once for the document, never
solved for this control.

## Problem 3 — The mismatch is invisible

No console warning (measured empty). No unit test covers the switch's rendered
state. `tests/e2e/settings.spec.ts:86` (`dark mode toggle changes theme`) only
ever exercises the light→dark direction from a light start, which is the one
path where a switch stuck at `false` behaves correctly. The gate and the defect
never intersect.

## Problem 4 — The header toggle is load-bearing in an unrelated gate

`tests/e2e/dev-runtime-integrity.spec.ts:98-108` clicks `Toggle dark mode` as its
hydration probe on every protected route, and `tests/e2e/app.spec.ts:626-687`
holds three tests that assert the header button exists and works. Deleting the
button without replacing the probe silently removes PRD 17's protected-route
hydration coverage. That is gate weakening disguised as a UI change.

## Stance

The request is one line of JSX. Shipping only that line would:

1. leave the app with a single theme control that reads wrong on 10 of 10
   server-rendered loads and eats the user's first click;
2. delete the hydration probe for every protected route.

The header toggle has been masking Problem 2 — with two controls, the working
one covered for the broken one. Removing the mask before fixing what it hides
makes the app worse than it is today. Therefore the switch is repaired first
(Batch 1), the probe is re-homed (Batch 3), and the button comes out last
(Batch 4).

## Constraints

- No weakening of an existing gate to make a new one pass. Specifically:
  `tests/e2e/dev-runtime-integrity.spec.ts` must still assert post-hydration
  interactivity on every route in `APP_ROUTE_PREFIXES`, with the same
  `clickHydratedControl` treatment, after its probe changes.
- Theme state must have exactly one source of truth. No component may hold a
  private `useState` copy of the current mode after Batch 1.
- The existing pre-paint behaviour of `src/routes/__root.tsx:41-62` must not
  regress — PRD 15 exists because of that flash. `tests/unit/theme-flash.test.ts`
  and `tests/e2e/theme-flash.spec.ts` must stay green.
- "No explicit choice → follow the OS" must survive
  (`hasExplicitThemeChoice`, `src/lib/app-chrome.ts:36-42`).
- The dev loop's e2e gate is **off** (`scripts/dev-loop.sh:44-49`). Any assertion
  that only exists as a Playwright spec is not enforced on push. Every batch
  below therefore carries a unit-level gate as well, following the source-scan
  precedent in `tests/unit/theme-flash.test.ts` and
  `tests/unit/client-import-graph-scan.ts`.

## Batch 1 — Derive the Settings switch from the theme

Replace the private `useState` in `src/routes/settings/index.tsx:133-138` with a
subscription to a single store exported from `src/lib/app-chrome.ts`, in the
`useSyncExternalStore` shape already used for the rest timer
(`src/components/app-chrome.tsx:94-98`, `subscribeRestTimer`/`getRestTimerSnapshot`).

The store must expose a server snapshot and a client snapshot, and the switch
must be given a stable rendered state on the server that hydration will not
contradict — the checked state has to be reconciled after mount rather than
assumed at render, because React will not patch it.

Acceptance is defined by the measurements above: hard load with `dark` stored
must produce a checked switch, and OS changes must move it.

## Batch 2 — Gate the derived switch

An e2e spec reproducing Defect A, B and C, plus a unit test over the new store.
Must be demonstrated failing on `36f40be`.

## Batch 3 — Re-home the dev-runtime hydration probe

Move `tests/e2e/dev-runtime-integrity.spec.ts:98-108` off the header toggle and
onto the `UserMenu` button (measured present and functional on all five
protected routes). Lands before Batch 4 so the removal never crosses a window
where protected-route hydration is unchecked. Independent of Batches 1–2.

## Batch 4 — Remove the header toggle

Delete the `IconButton` at `src/components/app-chrome.tsx:196-207` and its now
unused imports, and migrate the three tests at `tests/e2e/app.spec.ts:626-687`
onto the Settings switch rather than deleting them.

## Batch 5 — Gate single-source-of-truth

A source-scan unit test asserting the theme control exists in exactly one place,
plus an e2e sweep asserting zero `Toggle dark mode` buttons across every
authenticated route at both viewports. Must be demonstrated failing on `36f40be`.

## Sequencing

1 → 2 → 4 → 5, with 3 landing any time before 4. Batch 3 is independent of
Batches 1–2 and may land first.

A human is blocked on Batch 4 — that is the change that was actually asked for.
It ships fourth anyway, because Defect C means shipping it first hands the user
a single control that is wrong on every hard load. Batches 1–3 are the price of
Batch 4 being safe, and 1 and 3 can proceed in parallel.

## Out of scope

- **Adding a "System" option.** The control stays binary. Today the switch has no
  way to express "follow the OS", so first use permanently opts out of
  OS-following. That is a real design gap and it is not this PRD; do not grow the
  Switch into a three-way SegmentedControl here.
- **The 44×44 touch-target failures.** `findUndersizedInteractiveElements`
  reports 21 undersized controls on `/settings` and 18 on `/workout` at 390px.
  Removing the 36×36 header toggle removes exactly one entry from each list.
  Those lists do not reach zero as a result, and this PRD must not be closed by
  resizing unrelated controls to make `mobile-layout.spec.ts` green.
- **The red e2e suite.** 42+ pre-existing failures (`scripts/dev-loop.sh:44-49`).
  This PRD does not turn the e2e gate back on and is not closable by triaging
  unrelated specs.
- **Theme flash / pre-paint.** PRD 15 owns `src/routes/__root.tsx:41-62`. This
  PRD only requires that it not regress.
- **Theme for signed-out visitors.** `/`, `/sign-in` and `/blog` measured 0
  theme controls today and will still have 0 after Batch 4; they follow the OS.
  Giving marketing pages a theme control is a separate request.
