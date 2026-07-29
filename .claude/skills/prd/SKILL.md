---
name: prd
description: Turn a bug report or feature request into a measured PRD under prd/ plus one GitHub issue per batch, sized for scripts/dev-loop.sh to implement unattended. Use when the user says "new prd", "new issue", reports something broken, or asks for a feature.
---

# Writing a PRD and its issues

Produces exactly three artifacts:

1. `prd/NN-slug.md` — the reasoning, the measurements, the batches
2. One GitHub issue per batch, each independently shippable
3. One commit, path-scoped to the PRD file

The issues are consumed by `scripts/dev-loop.sh`, which implements them with no
human in the path. Write for that reader: it cannot see the app, cannot ask a
follow-up question, and will close the issue when its own gates go green.

## Step 1 — Measure before writing a word

When the request is related to design or product feeling, always take into consideration
Apple's design guidelines.

When the request is related to new features, follow the stablished practices from the repo. 

**Do not write a PRD from reading source.**
Reproduce the thing first, in the real runtime, and record what actually happened.

- Take the reported symptom **literally**. "Nothing happens" is not "shows an
  error" — it is a claim about the absence of a request, a banner, and a
  navigation, and all three are checkable. The wording is data.
- Drive the real surface: a real browser against the real server, a real
  database file, a real build. Not a unit test standing in for it.
- Record the numbers you will cite: status codes, response bodies, table
  contents, console errors, request lists, counts and their denominators
  ("10 of 10 attempts", not "consistently").
- When a measurement disproves your working hypothesis, say so in one line and
  follow the measurement. A PRD built on a plausible story that was never
  reproduced is worse than no PRD.
- Check both modes when the defect could be mode-specific — `vite dev` and a
  production build behave differently, and a green suite may only mean the
  suite never ran the broken mode.

The PRD's credibility rests on a **What was measured** section with real
observations in a table. If you cannot fill that section, you are not ready to
write.

## Step 2 — Write the PRD

Next number: `ls prd/` and take the highest + 1. Filename `NN-short-slug.md`.

Structure, in this order:

- **Overview** — what is broken or wanted, in plain language, and the
  through-line in one sentence. State up front what the cause is *not*, when
  a reasonable reader would guess wrong.
- **What was measured** — tables of real observations, dated. Both modes when
  relevant.
- **Problem 1..N** — one per distinct fault, each with the file:line that
  carries it and the evidence it is real. Distinguish the defect from the
  reason the defect was invisible; both are problems.
- **Stance** — why the obvious one-line patch is not the whole job. This is
  where a PRD earns its existence.
- **Constraints** — what a solution may not do. Always include: no weakening of
  an existing gate to make a new one pass.
- **Batch 1..N** — the work, one batch per issue.
- **Sequencing** — order, and what unblocks a human soonest.
- **Out of scope** — see below.

### Every criterion must be machine-checkable

Per `prd/13-autonomous-verification.md`:

> A design requirement must be expressed as a measurable assertion. If it cannot
> be, it is rewritten until it can, or dropped.

Standing project rule: **nothing routes to human review or manual smoke
testing.** No "verify it looks right", no "confirm the flow feels smooth". If a
requirement resists being written as an assertion, that is a signal it is too
vague to implement, not a licence to hand it to a person.

"Numbers are heroes" is not checkable. "The primary metric's computed font size
is at least 2.5× the body text" is.

### Out of scope is load-bearing

List the adjacent, plausible-looking problems that are **not** this PRD, and say
why. Without it, the loop can satisfy the PRD by fixing the wrong thing — a
hydration PRD closed by repairing e2e selectors. Name the specific escape hatch
you are closing.

## Step 3 — Cut into batches

- One batch = one issue = one commit-sized, independently shippable change.
- Ship the batch a human is blocked on first, and alone.
- When a fix has a matching **gate** (a test that would have caught it), the
  gate is its own batch, landing immediately after — never bundled into the fix.
- Independent batches say so, so they can land in any order.

**Anti-vacuity rule for every gate batch:** the new test must be demonstrated
failing on the pre-fix commit, and that demonstration is an acceptance
criterion. State it in the issue:

> A gate that has never been observed failing is not evidence of anything.

Also forbid reproducing whatever filter or narrowing let the defect through the
first time — quote the offending line.

## Step 4 — File the issues

Create them in batch order, so issue numbers ascend with sequencing — the loop
picks the lowest-numbered open issue. Add `priority` only when the batch must
jump the existing queue.

Title: conventional-commit form, matching the commit the loop will write —
`fix(db): register migration 0003 and assert journal completeness`.

Labels (pick one): `bug`, `enhancement`, `refactor`, `tooling`, `documentation`,
`astryx`, `pwa`. Gates and harness work are `tooling`, not `bug`.

Body template:

```markdown
PRD NN Batch M — `prd/NN-slug.md`

Depends on #X.            <!-- omit when independent -->

## Measured                <!-- or "## Why" for a non-bug -->

The evidence, with file:line and real output. Quote the offending code.

## Scope

What to change, naming the files. What to preserve. Existing conventions in
the repo to follow, by path — e.g. `tests/unit/server-fn-auth-scan.ts` for a
compiler-API scan, `*.server.ts` for a server-only boundary.

## Acceptance

- [ ] One assertion per line, each independently checkable
- [ ] Include the negative case: what must still fail after this lands
- [ ] For a gate: it fails on commit <sha> and passes on the fixed tree

One closing line on ordering or independence.
```

Command:

```bash
gh issue create --title "..." --label bug --body-file <path>
```

Write the body to a file in the scratchpad first — heredocs mangle backticks
and checkboxes.

## Step 5 — Commit

```bash
git add prd/NN-slug.md && git commit -m "docs(prd): <one line>"
```

Path-scope the commit to the PRD alone. If the dev loop is running, lefthook
will format and lint the whole tree and collide with its in-flight edits — use
`--no-verify` and record that reason in the commit body. Do not use it
otherwise.

## Failure modes

- Writing the PRD from source reading and calling a hypothesis a finding.
- An acceptance criterion a person has to judge.
- A gate batch that never demonstrated a failure.
- Missing **Out of scope**, leaving the PRD closable by adjacent work.
- Bundling the fix and its gate into one issue — the gate then lands green and
  proves nothing.
- Vague file references. Always `path:line`.
