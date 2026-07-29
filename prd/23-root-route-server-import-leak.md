# PRD 23 — Sign-up does nothing: the root route ships SQLite to the browser

## Overview

A human fills in the sign-up form, clicks "Create account", and nothing
happens. Not an error — nothing. No network request, no banner, no navigation.

The cause is not the sign-up form, not Better Auth, and not the database. The
server-side endpoint is healthy: `POST /api/auth/sign-up/email` returns `200`
with a session cookie and a real user row when called directly with `curl`.

React never hydrates on **any** route. `src/routes/__root.tsx` imports `~/db`
at module top level, which drags `better-sqlite3`, `drizzle-orm/migrator`,
`node:fs`, `node:path` and `node:util` into the client module graph. Vite
replaces those with stubs that throw on property access, the throw escapes
during hydration, and React abandons the tree. Every page is server-rendered
HTML with dead controls. Sign-up is simply the first place a person notices.

This is PRD 17 recurring. Same symptom, same mechanism, new source module —
and worse in one respect: PRD 17's leak was dev-only because Rollup tree-shook
it out of the production bundle. This one **survives into production**.

PRD 17 built a gate designed to catch exactly this. The gate exists, runs on
every `npm run test:unit`, and is green.

The through-line: **the gate that was built to catch this defect exempts the
directory the defect came from.**

## What was measured

All observations on 2026-07-29 against commit `8fe8b15`, real Chromium
(Playwright), real server, real `data/fittrack.db`.

### The server is not the problem

```
$ curl -i -X POST http://localhost:3000/api/auth/sign-up/email \
    -H 'Content-Type: application/json' \
    -d '{"email":"...","name":"PRD Probe","password":"Passw0rdTest"}'
HTTP/1.1 200
set-cookie: better-auth.session_token=...; Max-Age=604800; HttpOnly; SameSite=Lax
{"token":"...","user":{"name":"PRD Probe","email":"...","id":"rIThfq8brnnFIaZfuBcpw6QdodSYkCKu"}}
```

### The client is

`/sign-up`, fields filled from the accessible labels, "Create account" clicked:

| Observation | `vite dev` | production build |
| --- | --- | --- |
| Field values before click | all three correct | all three correct |
| Button found and enabled | yes | yes |
| Requests to `/api/auth/*` after click | **none** | **none** |
| Error banner rendered | none | none |
| URL after click | unchanged | unchanged |
| `pageerror` | `TypeError: promisify is not a function` | `TypeError: i is not a function` |

The `pageerror` fires at **+1392 ms during page load**, not on click. By the
time the button is clicked there is no handler attached to it. Nothing happens
because nothing is listening.

### It is not specific to sign-up

Hydration probed by checking for a `__reactFiber$`/`__reactProps$` key on the
first element in `<body>`:

| Route | dev hydrated | prod hydrated | `pageerror` |
| --- | --- | --- | --- |
| `/` | **false** | **false** | yes |
| `/sign-up` | **false** | **false** | yes |
| `/sign-in` | **false** | **false** | yes |
| `/blog` | **false** | **false** | yes |

Sign-**in** is equally dead: filling the form and clicking "Sign in" produces
zero `/api/auth/*` requests in both modes. Every interactive control in the
application is inert.

### The client bundle really does contain the database layer

Strings found in `.output/public/assets/index-1jR82RQm.js`:

| String | Present in production client bundle |
| --- | --- |
| `better-sqlite3` | **yes** |
| `promisify` | **yes** |
| `__drizzle_migrations` | **yes** |

Not a finding, checked and cleared: `BETTER_AUTH_SECRET` appears in
`auth-client-Xp1BbVGS.js`, but only as the key of Better Auth's own lazy
`process.env` getter. The 36-character secret value from `.env` appears in
**0** client files. No secret leaks.

### The build knew

`npm run build` prints **14** `has been externalized for browser
compatibility` warnings, naming the offending files, and **exits 0**:

```
Module "node:fs" has been externalized for browser compatibility,
  imported by ".../src/db/index.ts".
Module "node:path" ... imported by ".../src/db/paths.ts".
Module "node:fs" ... imported by ".../src/db/migration-diagnostics.ts".
Module "fs" ... imported by ".../node_modules/better-sqlite3/lib/database.js".
Module "util" ... imported by ".../node_modules/better-sqlite3/lib/methods/backup.js".
Module "node:crypto" ... imported by ".../node_modules/drizzle-orm/migrator.js".
```

### Every gate is green

| Gate | Result on `8fe8b15` |
| --- | --- |
| `npm run test:unit` | **702 passed / 702**, 67 files |
| `tests/unit/client-import-graph.test.ts` | **6 passed / 6** |
| `npm run build` | **exit 0** |
| `npm run test:e2e` | prints a message, **runs 0 specs** |
| `npm run test:e2e:dev-smoke` | **5 failed / 5** — not run by any routine command |

702 unit assertions pass while no button on any page works.

### The fix was validated, then reverted

Moving the three server-only imports in `src/routes/__root.tsx` behind a
`createServerFn` handler (dynamic `import()` inside the handler body) and
changing nothing else:

| Observation | before | after |
| --- | --- | --- |
| `has been externalized` warnings from `npm run build` | 14 | **0** |
| `better-sqlite3` in production client bundle | yes | **no** |
| `promisify` in production client bundle | yes | **no** |
| `/sign-in`, `/blog` hydrated (dev and prod) | false | **true** |
| Sign-up click → request | none | `POST /api/auth/sign-up/email` |
| Sign-up click → URL | `/sign-up` | **`/dashboard`** |
| Sign-in click → URL | `/sign-in` | **`/dashboard`** |

This measurement also settles the scope. A static walk of the client-reachable
graph finds **23** value-imports from client-reachable modules into server-only
modules, but patching only `__root.tsx` took the build warnings to zero. The
other 22 edges live inside `createServerFn` handler bodies and the TanStack
Start compiler strips them. `__root.tsx` is the only surviving leak.

The tree has been returned to its broken state; every number above is
reproducible at `8fe8b15`.

## Problem 1 — the root route imports the database at module scope

`src/routes/__root.tsx:15`, `:16`, `:26`:

```ts
import { db } from "~/db";
import { ensureSessionUserRecord } from "~/db/user-body-queries";
import { getStoredThemePreference } from "~/lib/theme-preference-persistence";
```

consumed at `src/routes/__root.tsx:84`:

```ts
async function loadRootThemePreference(): Promise<ThemePreference> {
  const session = await fetchServerSession();
  if (!session) {
    return "system";
  }
  const user = await ensureSessionUserRecord(db, session.user);
  return getStoredThemePreference(db, user.id);
}
```

`loadRootThemePreference` is a plain async function, called from the root
route's `loader` at `src/routes/__root.tsx:126`. It is not a server-function
body, so the TanStack Start compiler cannot strip its imports.
`src/routeTree.gen.ts` statically imports `./routes/__root`, and the route tree
loads on every page, so the chain

```
src/routeTree.gen.ts -> src/routes/__root.tsx -> src/db/index.ts -> node:fs
```

is present in the client graph for all 119 client-reachable modules.

Introduced by `ba1f4c7` ("feat(theme): server-render stored preference before
first paint", PRD 20). The feature is correct and must be preserved; only its
module boundary is wrong.

## Problem 2 — PRD 17's gate exempts the directory the leak came from

`tests/unit/client-import-graph-scan.ts:91`:

```ts
function isServerOnlyModule(filePath: string): boolean {
  return filePath.endsWith(".server.ts") || filePath.startsWith("src/db/");
}
```

The scanner walks outward from `src/routeTree.gen.ts` and reports Node-builtin
imports in the modules it reaches. It **does** reach `src/db/index.ts`. It then
declines to report it, because the file's path starts with `src/db/`.

The exemption is applied to the file holding the builtin import instead of to
the edge that made it reachable. `src/db/**` genuinely is server-only code —
that is not in dispute. What no assertion checks is whether client-reachable
code is allowed to import it. Re-running the same traversal with only that one
predicate removed reports exactly the five imports the Vite build warns about:

```
src/db/index.ts:1                 imports node:fs
src/db/index.ts:2                 imports node:path
src/db/migration-diagnostics.ts:1 imports node:fs
src/db/migration-diagnostics.ts:2 imports node:path
src/db/paths.ts:1                 imports node:path
```

The static scan and the build warnings independently name the same three files.
`ALLOWED_NODE_BUILTIN_IMPORTS` at line 10 is `{}` — the allowlist is not
involved. The path prefix is the whole hole.

## Problem 3 — a unit test pins the loader to the shape that leaks

`tests/unit/theme-root-loader.test.ts:92` and `:110` locate the loader by
source-text search:

```ts
const loaderStart = rootRouteSource.indexOf("async function loadRootThemePreference");
```

and `:117`–`:119` assert that `getStoredThemePreference` and
`ensureSessionUserRecord` appear inside that slice.

The test reads `__root.tsx` as a string; it never imports the module, never
renders the route, and never crosses the boundary it is nominally about. Its
literal requires the loader to stay a plain `async function` — the one shape
that guarantees the imports are not stripped. A correct fix breaks this test.
It must be rewritten to assert the behaviour, not the syntax.

## Problem 4 — nothing runs the hydration gate that already works

`tests/e2e/dev-runtime-integrity.spec.ts` asserts, on `/`, `/sign-in`,
`/sign-up`, `/blog` and every `APP_ROUTE_PREFIXES` entry, that no `pageerror`
fired and that hydration completed — proven by polling for `__reactProps$` on
a real control before clicking it. It is precisely the right gate. It fails
5-of-5 today.

Nothing routine runs it.

`package.json` — the documented test command from `AGENTS.md` is
`npm run test:unit && npm run test:e2e`, and `test:e2e` is:

```json
"test:e2e": "echo 'e2e is DISABLED — the suite is red (42+ pre-existing failures). No specs ran. Use `npm run test:e2e:run` to run it anyway.'"
```

That command runs zero specs and exits 0. The escape hatch, `test:e2e:run`, is:

```json
"test:e2e:run": "npx playwright test --project=chromium --project=pixel-7"
```

`dev-runtime` is declared as a project at `playwright.config.ts:39` but is in
neither `--project` selection. The only way to run it is
`npm run test:e2e:dev-smoke`, which no other command calls.

So the gate PRD 17 built to prevent this exact regression has been unreachable
by any routine invocation, and the regression landed.

Partial corroboration, honestly bounded: `npx playwright test
--project=chromium` was started and stopped after 6 of 291 tests (each failing
test burns 15 s of timeout). All 7 failures recorded in that window failed at
the same line — `test-helpers.ts:204`, `page.waitForURL(/\/dashboard/)` inside
`signInAsDemoUser` — which is the hydration defect, because sign-in cannot
submit. **The full 291-test suite was not run**, so no claim is made here about
how many of the "42+ pre-existing failures" this bug accounts for. Batch 1
landing is what makes that measurable.

## Problem 5 — `npm run build` reports the defect and passes anyway

14 warnings naming `src/db/index.ts`, `src/db/paths.ts` and
`src/db/migration-diagnostics.ts` are printed on stdout, and the build exits 0.
A build that can identify server-only code in the client graph by file path,
print it, and then succeed is not a gate. The information was available on
every build since `ba1f4c7`.

Note also `tanstack-start-core:import-protection` consuming 66–79% of build
time. Whatever that plugin protects against, it did not object to
`better-sqlite3` in the browser bundle.

## Stance

Batch 1 is a three-line import move. That is not what this PRD is for.

PRD 17 diagnosed this defect class, fixed its instance, and built a scanner
specifically to stop it recurring. Six months of gates later the same defect
recurred through `src/db/` instead of `src/lib/`, reached production this time
rather than dev only, and was caught by a human clicking a button — after
passing 702 unit assertions, a dedicated import-graph scanner, `tsc`, and a
build that printed the answer 14 times.

Three separate controls each had the evidence and each declined to act on it: a
scanner with a path-prefix exemption over the offending directory, a hydration
spec no command runs, and a build that warns without failing. Fixing the import
and leaving those three intact means the next server-only import into a route
module ships to production too.

Per PRD 13, every criterion below is a machine-checkable assertion. Nothing
routes to human review or manual smoke testing. "Someone will notice the app is
broken" is the control that failed — twice.

## Constraints

- No weakening of any existing gate to make a new one pass.
- The scan fix must not be a new entry in `ALLOWED_NODE_BUILTIN_IMPORTS`, and
  must not reproduce the `filePath.startsWith("src/db/")` narrowing at
  `tests/unit/client-import-graph-scan.ts:92`. That line is why this escaped.
- PRD 20's behaviour is preserved: the stored theme preference is still
  server-rendered before first paint, with no flash. Deleting the feature to
  remove the import is not a fix.
- Batch 1 must not move database access into the client. The theme read stays
  on the server; only its module boundary changes.
- Batch 4 must not require the 42+ red `chromium` specs to pass. Making the
  hydration gate reachable must not be achieved by turning the broken suite on
  wholesale, and `test:e2e`'s disabled state is not itself in scope.

## Batch 1 (#118) — get the database out of the client graph

Move the server-only work behind the existing server-function boundary in
`src/routes/__root.tsx`. Remove the top-level `~/db`, `~/db/user-body-queries`
and `~/lib/theme-preference-persistence` imports; perform the session lookup
and theme read inside a `createServerFn` handler, following
`fetchServerSession` in `src/lib/route-auth.ts:28`. Dynamic `import()` inside
the handler body is the validated approach.

Update `tests/unit/theme-root-loader.test.ts` (Problem 3) so it no longer
requires the literal `async function loadRootThemePreference`. Assert that the
theme read happens server-side and is gated on a session, without pinning the
declaration syntax.

Acceptance:

- [ ] `npm run build` emits zero `has been externalized for browser compatibility` warnings.
- [ ] `better-sqlite3`, `promisify` and `__drizzle_migrations` each appear in 0 files under `.output/public/assets/`.
- [ ] `/`, `/sign-in`, `/sign-up` and `/blog` each hydrate and log zero `pageerror`, in `vite dev` and against a production build.
- [ ] Filling and submitting the sign-up form issues `POST /api/auth/sign-up/email` and lands on `/dashboard`.
- [ ] Filling and submitting the sign-in form issues `POST /api/auth/sign-in/email` and lands on `/dashboard`.
- [ ] A signed-in user's stored theme is still applied on the server-rendered HTML before first paint; existing theme-flash specs and `tests/unit/theme-flash.test.ts` still pass.
- [ ] `npm run test:unit` stays at 702+ passing with zero failures.

This is the only batch a human is blocked on. Ship it alone.

## Batch 2 (#119) — make the scanner assert the edge, not the file

Depends on Batch 1.

Fix `tests/unit/client-import-graph-scan.ts` so the invariant it enforces is
the one that matters: **no client-reachable module may import a server-only
module at value scope.** Server-only means `.server.ts` or `src/db/**`. Keep
the existing Node-builtin check; the two are complementary.

The traversal already walks the graph from `src/routeTree.gen.ts` and already
computes both endpoints of every edge — the change is where the exemption is
applied, not new machinery. Imports used only inside a `createServerFn` handler
body are stripped by the compiler and must not be flagged; the measured graph
has 22 such edges (`src/lib/api.ts`, `src/lib/push.ts`,
`src/lib/require-auth.ts`, `src/routes/api/cron/notifications.ts`, and others)
and every one of them is legitimate. Type-only imports are already skipped and
must stay skipped. Follow the compiler-API pattern in
`tests/unit/server-fn-auth-scan.ts`; an allowlist with a per-entry reason
string is permitted, in the style of `PUBLIC_SERVER_FUNCTIONS`.

Acceptance:

- [ ] The scan fails on `8fe8b15`, naming `src/routes/__root.tsx` and the `~/db` specifier.
- [ ] The scan passes on the Batch 1 tree.
- [ ] Adding a top-level `import { db } from "~/db"` to any route module fails the scan.
- [ ] Adding a top-level import of any `.server.ts` module to a route module fails the scan.
- [ ] A `~/db` import used only inside a `createServerFn` handler body does **not** fail the scan — assert this explicitly, with `src/lib/api.ts` as the live case.
- [ ] `type`-only imports of `~/db` types do **not** fail the scan.
- [ ] `ALLOWED_NODE_BUILTIN_IMPORTS` gains no entry for `src/db/**`, and no predicate in the file tests `filePath.startsWith("src/db/")` to suppress a violation.

A gate that has never been observed failing is not evidence of anything. The
first criterion is the batch.

## Batch 3 (#120) — fail the build on server-only code in the client bundle

Independent of Batches 1, 2 and 4; needs Batch 1 landed to pass.

`npm run build` must exit non-zero when a Node builtin is externalized for the
client build. The warning text and the offending file path are already
produced (Problem 5) — the work is turning them into a failure with a message
naming the importing file.

Acceptance:

- [ ] `npm run build` exits non-zero on `8fe8b15`, and its output names `src/db/index.ts`.
- [ ] `npm run build` exits 0 on the Batch 1 tree.
- [ ] Adding a top-level `node:fs` import to a route module makes `npm run build` exit non-zero.
- [ ] The server build is unaffected: `node .output/server/index.mjs` still boots and serves `/` with `200`.

## Batch 4 (#121) — make the hydration gate reachable

Independent of Batches 2 and 3; needs Batch 1 landed to pass.

`tests/e2e/dev-runtime-integrity.spec.ts` works and catches this defect (5-of-5
failures today). It is reachable only via `npm run test:e2e:dev-smoke`. Give it
a routine invocation that does not depend on the red `chromium` suite —
per the Constraints, do not switch the disabled `test:e2e` back on to achieve
this.

Acceptance:

- [ ] A single documented command runs the `dev-runtime` project and nothing that is currently red.
- [ ] That command exits non-zero on `8fe8b15` with 5 failures.
- [ ] That command exits 0 on the Batch 1 tree.
- [ ] The spec still asserts on **all** page errors — no substring filter is introduced. `sub-pages.spec.ts:135`'s `error.message.includes(...)` filter is the pattern PRD 17 forbade and must not reappear.
- [ ] `npm run test:e2e:run`'s project selection is unchanged, and no currently-passing spec is skipped or deleted.

## Sequencing

Batch 1 first and alone — it is the only thing a human is waiting on, and
Batches 2, 3 and 4 all need it landed before they can go green.

Batch 2 is the batch that matters. It must land immediately after Batch 1, and
must be demonstrated failing on `8fe8b15` first. Without that demonstration
there is no evidence the scanner detects anything — which is the precise
failure being corrected.

Batches 3 and 4 are independent of Batch 2 and of each other, and may land in
any order after Batch 1.

## Out of scope

- **The 42+ red `chromium` e2e failures, and re-enabling `npm run test:e2e`.**
  Named explicitly because it is the obvious escape hatch: this PRD must not be
  closable by repairing stale selectors or by flipping the disabled `test:e2e`
  script. Batch 4 is about making one working spec reachable, nothing more.
  How many of those failures are downstream of this bug becomes measurable once
  Batch 1 lands; that measurement is a separate PRD.
- **The theme-preference feature from PRD 20.** `ba1f4c7` introduced the leak,
  but server-rendering the stored preference before first paint is correct and
  is protected by a Batch 1 acceptance criterion. Reverting it is not a fix.
- **`src/lib/route-auth.ts:5`'s top-level `import { auth } from "./auth"`.** It
  reaches `~/db` on paper, but patching `__root.tsx` alone took the build
  warnings to zero, so the compiler is stripping it. Changing it would be
  speculative; Batch 2's scanner is what will flag it if that ever stops being
  true.
- **The 22 other client→server-only edges** (`src/lib/api.ts` and friends).
  Measured, and all inside server-function handler bodies. Batch 2 must
  explicitly assert they stay legal; "fixing" them is not work.
- **`BETTER_AUTH_SECRET` in `auth-client-Xp1BbVGS.js`.** Investigated and
  cleared: it is Better Auth's own lazy env getter, and the real secret value
  appears in 0 client files. Recorded so it is not rediscovered as a security
  finding.
- **`tanstack-start-core:import-protection`'s 66–79% build-time share.** A
  performance question, and possibly a correctness one, but Batch 3 makes the
  build fail regardless of what that plugin does.
- **Restructuring `src/routeTree.gen.ts` eager imports.** Generated by TanStack
  Router; the defect is the server-only import, not the route tree. Unchanged
  from PRD 17.
