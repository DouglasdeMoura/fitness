# PRD 19 — A System option for the theme

## Overview

FitTrack's theme control is binary. A user who wants "follow my OS" has no way to
say so, and — once they touch the control — no way back.

The cause is **not** missing resolution logic. Measured below: storing the literal
string `"system"` already resolves correctly through the pre-paint bootstrap, the
`colorScheme` property, the PWA `theme-color` meta tag, and live OS changes with
no reload — with zero changes to `src/routes/__root.tsx:41-62`, `resolveTheme`,
`hasExplicitThemeChoice` or `subscribeToSystemTheme`. The whole resolution layer
was built to fall through to the OS for any value it does not recognise, and
`"system"` is such a value.

What is missing is a **representation and a control**. The type
`ColorMode = "light" | "dark"` (`src/lib/app-chrome.ts:1`, 20 call sites) is used
for two different things — what the user chose, and what is currently rendered —
and only the second one is genuinely binary. The through-line: **split preference
from resolved mode, then give preference a three-way control.**

## What was measured

Measured 2026-07-29 against a **production build** (`npm run build && npm run
start`, Playwright `chromium`, seeded `data/e2e-fittrack.db`), signed in as the
demo account, on `d2aa338` (application code identical to `36f40be`).

### The resolution layer already supports System, completely

Stored value set to the literal `"system"`, page reloaded under each OS scheme:

| stored | OS scheme | `data-theme` | `style.colorScheme` | `meta[theme-color]` |
| --- | --- | --- | --- | --- |
| `system` | dark | `dark` | `dark` | `#1b1b1b` |
| `system` | light | `light` | `light` | `#6741d9` |

Both correct, including the PWA status-bar colour. Live OS changes with `"system"`
stored, **no reload**:

| step | `data-theme` |
| --- | --- |
| initial (OS light) | `light` |
| OS → dark | `dark` |
| OS → light | `light` |

An absent key behaves identically (OS dark → `dark`; live OS → light → `light`).

This works because the bootstrap at `src/routes/__root.tsx:46-50` treats anything
that is not exactly `"light"` or `"dark"` as "ask the OS", and
`hasExplicitThemeChoice` (`src/lib/app-chrome.ts:36-42`) returns `false` for the
same set, which keeps `subscribeToSystemTheme` live.

### The UI has no System affordance, and cannot reach one

Control inventory of `/settings` — every `role=switch`, `role=radiogroup`,
`role=radio`:

| finding | value |
| --- | --- |
| controls mentioning system / auto / OS | `[]` |
| page text matching `\bsystem\b` | `false` |
| `radiogroup`s present | 1 (`Activity Level`) |

Clicking the `Dark Mode` switch four times, collecting every value it can write:

```
MEASURE stored-values-reachable-by-clicking-switch = ["dark","light"]
```

`"system"` is unreachable. And an explicit choice is permanent — explicit `light`
stored, OS forced to dark and toggled:

| step | `data-theme` | stored |
| --- | --- | --- |
| explicit `light`, OS dark | `light` | `light` |
| after toggling OS light → dark | `light` | `light` |

Correct behaviour for an explicit choice, and there is no UI path back.

### The existing three-way control pattern

`/settings` already renders a `SegmentedControl` for Activity Level
(`src/routes/settings/index.tsx:373-386`). Its measured DOM:

```html
<div role="radiogroup" aria-label="Activity Level" class="astryx-segmented-control md ...">
  <button type="button" role="radio" aria-checked="false" data-value="active" tabindex="-1" ...>
```

`role=radiogroup` of `role=radio` buttons with `aria-checked` — directly
assertable, and an in-repo precedent to follow rather than a new component.

## Problem 1 — One type is doing two jobs

`src/lib/app-chrome.ts:1`:

```ts
export type ColorMode = "light" | "dark";
```

20 call sites, split across two distinct meanings:

- **Preference** — what the user chose: `getStoredTheme` (line 56),
  `persistTheme` (line 95).
- **Resolved mode** — what is on screen right now: `applyResolvedTheme` (line 76),
  `getThemeColor` (line 32), `THEME_COLOR_BY_MODE` (line 12), and the
  `<Theme mode={colorMode}>` provider (`src/components/app-chrome.tsx:184`).

Only preference gains a third value. `applyResolvedTheme("system")` is
meaningless — the document must always be `light` or `dark`. Widening `ColorMode`
to include `"system"` would push an impossible state into every renderer.

## Problem 2 — There is no way to express or reach "follow the OS"

Measured above: the switch writes exactly `["dark", "light"]`, nothing on
`/settings` mentions System, and an explicit choice cannot be cleared. The
OS-following code path is fully implemented, fully working, and unreachable
through the UI after first use.

## Problem 3 — `hasExplicitThemeChoice` will become a misnomer

`src/lib/app-chrome.ts:36-42` returns `true` only for `"light"`/`"dark"`. Its
behaviour is correct and must not change — it gates whether the OS listener
applies. But once System is a thing a user actively picks, "has an explicit
choice" describes the `"system"` case too, and the name will read as a bug to the
next person. It means *has a fixed choice*.

## Stance

The tempting shortcut is to add a third segment to the control and store
`"system"` in the existing `ColorMode`. Measured evidence says storage and
resolution need no work at all — which makes that shortcut look almost free, and
it is exactly the wrong place to economise. Widening `ColorMode` puts
`"system"` into the type consumed by `applyResolvedTheme`, `getThemeColor` and
the `<Theme>` provider, none of which can render it. The compiler would stop
catching the one class of bug that matters here.

Preference and resolved mode are two types. That split is the work; the control
is the easy part that follows from it.

## Constraints

- No weakening of an existing gate to make a new one pass.
- `ColorMode` must remain exactly `"light" | "dark"`. Nothing that reaches the
  DOM may accept `"system"`.
- The pre-paint bootstrap (`src/routes/__root.tsx:41-62`) must not regress —
  PRD 15 exists because of that flash. It already handles `"system"` correctly
  (measured); prefer leaving it untouched.
- No storage migration. Existing `"light"`/`"dark"` values stay valid, and an
  absent key must keep behaving as System (measured identical today).
- `hasExplicitThemeChoice` must keep returning `false` for `"system"`, or live
  OS-following breaks.
- The dev loop's e2e gate is **off** (`scripts/dev-loop.sh:44-49`), so every batch
  carries a unit-level gate as well.

## Relationship to PRD 18

PRD 18 is filed and unstarted (#91–#95). It is not superseded — its measured
defects (the Settings switch reading wrong on 10 of 10 SSR loads) are real and
independent of this PRD.

One correction propagates backward. PRD 18 #91 binds the Settings control to the
**resolved mode**, and #92 gates that binding. Under System, control state and
resolved mode diverge: preference `system` with OS dark resolves to `dark`, but
the control must read *System*, not *Dark*. Left alone, #91 would build a store
whose contract is wrong within days, and #92 would gate the conflation in place.

Both issue bodies are amended to state the preference/mode split as a
forward-compatibility requirement, without growing their scope — #91 still ships
the binary switch and still fixes exactly the defects it measured.

## Amended by PRD 20

This PRD originally scoped the preference to `localStorage` and declared a
database column out of scope. That is reversed: `prd/20-theme-preference-persistence.md`
makes the user's settings row the source of truth, defaulting to `system`.

What stays here: `ThemePreference` as a type (#96), its gate (#97), the
three-way control (#98) and its gate (#99). What moves to PRD 20: the column,
the migration, the server functions, server-side rendering of the preference,
and the precedence rule between the server's answer and the `localStorage` cache.

Consequences, after the design was clarified to three states / `system` default /
database source of truth / no flicker / signed-out visitors are `system`:

- `localStorage` is **deleted**, not demoted to a cache. Authenticated users get
  the preference from the server on every document load; signed-out visitors are
  always `system` and have nothing to store. There is no cache and therefore no
  precedence rule.
- #96 adds the type and resolution helpers only — no `localStorage` reader or
  writer, since #104 removes the storage key outright.
- #98 sources the selected segment from #104's root-loader data and writes
  through #102's server function. It gains dependencies on #102 and #104, and
  drops its dependency on #91.
- PRD 18 #91 and #92 are closed as superseded; their SSR-correctness assertions
  are folded into #99.

One correction to the model worth stating here, because it constrains the
control: **the server cannot resolve `system`.** `prefers-color-scheme` is a
client media query. The server renders the *preference*; the pre-paint inline
script resolves `system` against `matchMedia` before paint, as it already does
today. So `system` selected with a dark OS means `data-theme="dark"` and a
segment reading **System** — the distinction #99 exists to guard.

## Batch 1 — Split `ThemePreference` from `ColorMode`

Introduce `ThemePreference = "light" | "dark" | "system"` in
`src/lib/app-chrome.ts`, alongside an unchanged `ColorMode`. Add a preference
read and a preference write; keep `resolveTheme`, `applyResolvedTheme`,
`getThemeColor` and `subscribeToSystemTheme` on `ColorMode`. Rename
`hasExplicitThemeChoice` to say what it means. No UI change.

## Batch 2 — Gate the split

Unit tests over the preference/mode boundary, including the type-level assertion
that `ColorMode` still excludes `"system"`. Must fail on `d2aa338`.

## Batch 3 — Three-way control on Settings

Replace the `Switch` at `src/routes/settings/index.tsx:393-398` with a
`SegmentedControl` of Light / System / Dark, bound to preference, following the
Activity Level precedent at lines 373-386.

## Batch 4 — Gate the control

E2E over all three segments including the round trip back to System, plus a
source scan that the binary switch is gone. Must fail on the pre-fix commit.

## Sequencing

Batches 1 → 2 → 3 → 4. Batches 1 and 2 are lib-only and independent of PRD 18;
they can land at any time.

Batch 3 depends on PRD 18 #91 (a control that reflects state at all) and PRD 18
#94 (removal of the header toggle). The #94 dependency is not cosmetic: the
header toggle calls `toggleColorMode` on the *resolved* mode
(`src/components/app-chrome.tsx:200`), so with System selected and the OS dark,
one click would silently overwrite the preference with explicit `light`. A
three-way preference and a two-way header toggle cannot coexist correctly.

## Out of scope

- **Where the preference is stored.** Superseded — see "Amended by PRD 20" below.
  This PRD owns the type and the control; PRD 20 owns persistence and the
  `system` default at the column level.
- **Theme for signed-out visitors.** `/`, `/sign-in` and `/blog` have no theme
  control and still will. They follow the OS.
- **The theme flash.** PRD 15 owns `src/routes/__root.tsx:41-62`. Measured to
  already handle `"system"`; this PRD requires only that it not regress, and is
  not closable by touching pre-paint behaviour.
- **PRD 18's defects.** The SSR hydration bug is #91's job. This PRD is not
  closable by fixing it, and #91 is not closable by adding a System segment.
- **Scheduled / time-based theme switching.** Not requested, not measured.
