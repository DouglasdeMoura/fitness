# PRD: Autonomous Verification Harness

## Overview

Every issue in this project is implemented and verified by `scripts/dev-loop.sh`
with no human in the path. This PRD makes that safe by giving the loop enough
verification to actually judge the work it is asked to do — including the
design-quality work.

## Problem

The loop's verification gate is two commands:

```
npm run test:unit
npm run build
```

That is the entire definition of "feature verified" before it pushes to `main`
and closes the issue. Three consequences:

### 1. The e2e suite never runs

`scripts/dev-loop.sh:343` — `# 2. Production build (skip e2e in the loop — too
slow; run separately)`. Playwright specs exist and are actively being written by
the loop (the prompt explicitly instructs it to write them), but nothing executes
them before push. They are unexecuted code accumulating in the repository, and no
interaction regression can be caught.

The "too slow" rationale does not hold: the loop places **no timeout on the model
call** (`dev-loop.sh:208-216`, deliberately), and those calls run for many
minutes. A two-minute Playwright suite is rounding error against that.

### 2. Nothing checks mobile or accessibility

`grep -ciE "accessib|a11y|mobile|viewport|touch|screen reader" scripts/dev-loop.sh`
returns `0`. The prompt never mentions them and verification never tests them, on
a product whose primary device is a phone.

### 3. Aesthetic issues are given to a process with no eyes

Issues #30–#35 carry criteria like "premium-feeling dark mode", "storytelling
charts", and "calm". `npm run build` passing says nothing about any of them. The
loop will mark them verified and close them regardless of outcome.

## Stance

Taste is not machine-verifiable, and pretending otherwise would be dishonest. But
**every criterion a design PRD actually states can be made checkable** — and
where it cannot, the criterion is too vague to implement or to review, by human or
machine.

So the rule for this project is:

> A design requirement must be expressed as a measurable assertion. If it cannot
> be, it is rewritten until it can, or dropped.

"Numbers are heroes" is not checkable. "The primary metric's computed font size is
at least 2.5× the body text size" is. This PRD builds the harness; the design PRDs
inherit the obligation to state criteria in those terms.

---

## Batch 1: Run the Full Suite in the Loop

**Goal**: verification means what it claims.

- Add `npm run test:e2e` to `dev-loop.sh` verification, after unit tests and
  build, gated on both passing first.
- Capture its exit code with the same `set -o pipefail` subshell idiom already
  used for unit tests (`dev-loop.sh:325`) — the existing comment explains exactly
  why `tee`'s exit code must not be read, and the same trap applies here.
- Include the e2e result in `VERIFICATION_DETAILS` so `learnings.json` records it.
- Shard across workers to keep wall-clock down; do not reduce coverage to buy speed.
- On e2e failure, do not push and do not close the issue — identical handling to a
  unit-test failure.

Files: `scripts/dev-loop.sh`

## Batch 2: Design Gates as Tests

**Goal**: make PRD 06's criteria enforceable.

Each of these replaces a subjective criterion with an assertion:

| Stated design goal | Machine-checkable gate |
|---|---|
| No raw hex / no custom CSS | Source scan: no hex literals, no `style={{`, no layout `<div>`, no `className` in routes/components |
| "Numbers are heroes" | Hero metric computed `font-size` ≥ 2.5× body computed size |
| "Generous spacing" | Computed gap between top-level page sections ≥ 24 px |
| "Dark mode is premium" | Zero critical/serious axe violations **and** all text ≥ 4.5:1 contrast, in both themes |
| "Motion uses Astryx tokens" | Computed `transition-duration` matches a token value; zero transitions under `prefers-reduced-motion` |
| "Respect reduced motion" | With the media feature emulated, no element reports a non-zero animation/transition duration |
| Consistent number formatting | Unit test on the formatting helper; one helper, asserted as the only formatter used |

- Implement source scans as unit tests (fast, no browser) in
  `tests/unit/token-compliance.test.ts`.
- Implement computed-style gates as Playwright tests using
  `getComputedStyle`, in `tests/e2e/design-gates.spec.ts`.
- Contrast: use `@axe-core/playwright`, which reports contrast violations
  directly, plus explicit assertions on the key metric text.

Files: `tests/unit/token-compliance.test.ts` (new),
`tests/e2e/design-gates.spec.ts` (new)

## Batch 3: Visual Regression Baselines

**Goal**: catch unintended visual drift without judging taste.

- Use Playwright's `toHaveScreenshot()` on each route, at mobile and desktop
  widths, in light and dark themes.
- Commit baselines. A diff **fails the build**, which forces the loop to either
  fix the regression or deliberately update the baseline in the same commit as the
  intended redesign.
- Mask genuinely dynamic regions (dates, live timers) so the tests are repeatable
  (AGENTS.md: F.I.R.S.T).
- This does not assess quality. It assesses *change*, which is the half of the
  problem that can be automated.

Files: `playwright.config.ts`, `tests/e2e/visual.spec.ts` (new)

## Batch 4: Loop Prompt Hardening

**Goal**: the model is told the standards it is being measured against.

The prompt in `dev-loop.sh:126-180` never mentions mobile, accessibility, or the
design gates. Add to it:

- The primary device is a phone; verify at 390 px width.
- Interactive elements ≥ 44×44 px.
- Zero critical/serious axe violations, light and dark.
- Safe-area insets on fixed elements.
- Run `npm run test:e2e` before committing, not only unit tests and build.
- State that the design gates in Batch 2 exist and will fail the build.
- Keep the existing Astryx-only, no-raw-CSS instruction — it is now enforced
  rather than merely requested.

Files: `scripts/dev-loop.sh`

## Batch 5: Priority-Ordered Issue Selection

**Goal**: the loop works on the most valuable thing available, not the oldest.

The loop selects the lowest-numbered open issue. Issue number encodes creation
order, which has no relationship to value — so newly-identified high-value work
sits behind every historical refactor. With 26 open issues, feature work created
today would not begin until every polish issue was finished.

- Prefer the lowest-numbered issue carrying the `priority` label; fall back to the
  lowest-numbered issue overall when none is labelled.
- This keeps the ordering deterministic and the existing behaviour intact as the
  fallback, while making the queue steerable by labelling rather than by editing
  the script.

Files: `scripts/dev-loop.sh`

---

## Acceptance Criteria

- [ ] `dev-loop.sh` runs `npm run test:e2e` as part of verification
- [ ] e2e failure blocks both push and issue close
- [ ] e2e result appears in `VERIFICATION_DETAILS` and `learnings.json`
- [ ] Token-compliance unit test fails on an introduced raw hex, `style={{`, or
      layout `<div>`
- [ ] Design-gate e2e asserts hero-metric font scale and section spacing
- [ ] axe reports zero critical/serious violations on every route, light and dark
- [ ] Reduced-motion emulation yields no non-zero transition durations
- [ ] Visual regression baselines committed; an intentional pixel change fails
      until the baseline is updated
- [ ] Loop prompt states mobile width, touch target, a11y, and e2e requirements
- [ ] Loop prefers `priority`-labelled issues and falls back to lowest-numbered
- [ ] `npm run test:unit` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run build` passes

## Note on scope

Batches 1, 4, and 5 are changes to `scripts/dev-loop.sh` — the harness modifying
itself. They are small and should land before the batches that depend on them
(Batch 2 and 3 gates are only meaningful once Batch 1 actually runs e2e).

## References

- WCAG 2.2 SC 1.4.3 Contrast (Minimum) — 4.5:1 for body text
- WCAG 2.2 SC 2.5.5 Target Size — 44×44 CSS px
- axe-core rule descriptions — https://dequeuniversity.com/rules/axe/
