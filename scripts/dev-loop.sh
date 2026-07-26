#!/usr/bin/env bash
#
# FitTrack Self-Improving Dev Loop
#
# This script orchestrates iterative development using Oh-My-Pi (omp) models.
# It reads GitHub issues, dispatches the most powerful available model to work
# on them, learns from each iteration, and improves prompts over time.
#
# Usage:
#   npm run dev-loop                        # Run until all issues closed
#   npm run dev-loop -- --max 5             # Run up to 5 iterations
#   npm run dev-loop -- --dry-run           # Show what would be done
#   npm run dev-loop -- --issue 11          # Work on specific issue
#
# Without --max, the loop runs indefinitely until one of these:
#   1. No open issues remain (everything is done)
#   2. All models fail (no tokens left or quota exhausted)
#   3. The script is killed (Ctrl+C)
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

LEARNINGS_FILE="$REPO_DIR/.dev-loop/learnings.json"
STATE_FILE="$REPO_DIR/.dev-loop/state.json"
MAX_ITERATIONS=0  # 0 = unlimited (run until done or killed)
DRY_RUN=false
ISSUE_NUMBER=""

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --max) MAX_ITERATIONS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --issue) ISSUE_NUMBER="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

mkdir -p "$REPO_DIR/.dev-loop"

# Initialize learnings file if it doesn't exist
if [[ ! -f "$LEARNINGS_FILE" ]]; then
  echo '{"iterations": 0, "successful": 0, "failed": 0, "model_usage": {}, "prompt_improvements": [], "common_errors": []}' > "$LEARNINGS_FILE"
fi

# Initialize state file
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{"current_model_index": 0, "completed_issues": []}' > "$STATE_FILE"
fi

# Model chain: user-specified order, most powerful to least powerful.
# When a model is rate-limited, the script falls back to the next.
# Rate limit info is fetched via `omp usage` before each iteration.
MODELS=(
  "openai-codex/gpt-5.6-sol"            # GPT-5.6 Sol via OpenAI Codex provider
  "cursor/gpt-5.6-sol-high"             # GPT-5.6 Sol High via Cursor
  "cursor/claude-opus-5-high"           # Claude Opus 5 High via Cursor
  "cursor/cursor-grok-4.5-high"          # Grok 4.5 High via Cursor
  "zai/glm-5.2"                         # GLM 5.2 via ZAI (most quota available)
  "cursor/kimi-k2.7-code"              # Kimi K2.7 Code via Cursor
  "cursor/composer-2.5"                # Composer 2.5 via Cursor (known working)
  "cursor/default"                     # Default via Cursor
  "nvidia/deepseek-ai/deepseek-v4-pro" # DeepSeek V4 Pro via NVIDIA
  "nvidia/z-ai/glm-5.2"               # GLM 5.2 via NVIDIA
)

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          FitTrack Self-Improving Dev Loop                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Show rate limit status before starting
echo "📊 Provider Usage Status:"
omp usage 2>/dev/null | grep -E "(account|resets|capacity)" | head -20 || echo "  (unable to fetch usage)"
echo ""

# Always start from the most powerful model. Rate limits reset over time,
# so a model that was exhausted yesterday may work today.
MODEL_INDEX=0

iter=0
while true; do
  iter=$((iter + 1))
  if [[ $MAX_ITERATIONS -gt 0 && $iter -gt $MAX_ITERATIONS ]]; then
    break
  fi
  echo ""
  if [[ $MAX_ITERATIONS -gt 0 ]]; then
    echo "━━━ Iteration $iter/$MAX_ITERATIONS ━━━"
  else
    echo "━━━ Iteration $iter (unlimited — Ctrl+C to stop) ━━━"
  fi
  echo ""

  # Pick an issue to work on
  if [[ -n "$ISSUE_NUMBER" ]]; then
    ISSUE_DATA=$(gh issue view "$ISSUE_NUMBER" --json number,title,body,state 2>/dev/null || echo "")
    # gh issue view returns closed issues too — without this check the loop
    # would re-work the same issue forever after closing it.
    if [[ -n "$ISSUE_DATA" && $(echo "$ISSUE_DATA" | jq -r '.state') != "OPEN" ]]; then
      echo "✅ Issue #$ISSUE_NUMBER is closed. Nothing left to do."
      break
    fi
  else
    # Pick the next issue to work on (PRD 13 Batch 5).
    #
    # The limit must exceed the open-issue count: gh returns newest-first, so
    # sort_by(.number) only sees the fetched window. At --limit 20 with 26 open
    # issues the window was #26..#47, making #13/#16/#18/#23 permanently
    # unreachable — the loop could never pick them.
    OPEN_ISSUES=$(gh issue list --state open --json number,title,body,labels --limit 500 2>/dev/null)

    # Issue number encodes creation order, which has no relationship to value —
    # so newly-filed high-value work would queue behind every historical
    # refactor. Prefer 'priority'-labelled issues, then fall back to the
    # lowest-numbered issue overall. Ordering stays deterministic either way.
    ISSUE_DATA=$(echo "$OPEN_ISSUES" | jq -r '
      [.[] | select(any(.labels[]?; .name == "priority"))] as $p
      | (if ($p | length) > 0 then $p else . end)
      | sort_by(.number) | .[0] // empty')
  fi

  if [[ -z "$ISSUE_DATA" ]]; then
    echo "✅ No open issues remaining. All goals complete!"
    break
  fi

  ISSUE_NUM=$(echo "$ISSUE_DATA" | jq -r '.number')
  ISSUE_TITLE=$(echo "$ISSUE_DATA" | jq -r '.title')
  ISSUE_BODY=$(echo "$ISSUE_DATA" | jq -r '.body // "No description"')

  echo "📋 Issue #$ISSUE_NUM: $ISSUE_TITLE"
  echo ""

  # Build the prompt with context
  # Write to a temp file to avoid heredoc variable expansion issues
  PROMPT_FILE=$(mktemp)
  cat > "$PROMPT_FILE" <<'TEMPLATE_END'
You are working on FitTrack, a science-backed nutrition and workout companion web app.

Tech stack:
- TanStack Start (React 19, SSR, file-based routing)
- Astryx DS (@astryxdesign/core) for UI components
- SQLite (better-sqlite3) for persistence
- TypeScript throughout

Current project structure:
- src/routes/ - File-based routes (dashboard, nutrition, workout, progress, settings)
- src/lib/ - Database layer, API server functions, nutrition/workout calculations
- src/styles/app.css - Global styles with Astryx theme
- prd/ - Product requirements documents
- scripts/ - Seed data and dev tools

GitHub Issue to implement:
Title: __ISSUE_TITLE__
Number: #__ISSUE_NUM__
Description: __ISSUE_BODY__

Instructions:
1. Read AGENTS.md for Astryx DS conventions and CLI usage
2. Read the relevant PRD files in prd/ for context
3. Read the existing code in src/routes/__root.tsx and src/routes/index.tsx to see the Astryx pattern already established
4. Read existing tests in tests/unit/ and tests/e2e/ for test patterns
5. Implement the feature using ONLY Astryx DS components (no custom CSS, no <div> for layout, no style={{}})
6. Write meaningful tests for the feature you implement:
   - Unit tests in tests/unit/ for any calculation logic (Vitest)
   - E2E browser tests in tests/e2e/ that simulate real user interactions (Playwright)
   - Tests must verify the feature actually works as a user would experience it
   - Avoid useless tests - each test should verify meaningful behavior
7. Run ALL tests and ensure they pass before committing:
   - npm run test:unit  (Vitest)
   - npm run build      (production build)
   - npm run test:e2e   (Playwright — the loop now verifies this too, so a
                         failure here blocks the push and leaves the issue open)
8. Commit your work with a conventional commit message.
   Include "Closes #__ISSUE_NUM__" in the commit body so GitHub links the issue.
   Example commit body format:
   ```
   refactor(astryx): migrate dashboard to Card and MetadataList

   Replaced custom CSS classes with Astryx DS components.

   Closes #10
   ```
9. Do NOT push — the loop handles pushing after verification

Important conventions:
- Use Astryx components: Card, Button, TextInput, Table, Heading, MetadataList, etc.
- Run "npm run astryx component <Name>" to check component props
- Use createServerFn from @tanstack/react-start for API calls
- Use createFileRoute for route definitions
- Use useSuspenseQuery for data fetching
- All calculations must be science-backed with citations in comments

Mobile and accessibility requirements (PRD 12, PRD 13):
- The primary device is a PHONE, installed as a PWA on the home screen.
  Desktop is secondary. Verify your work at 390px viewport width.
- No horizontal page scroll at 390px on any route. Wide tables scroll inside
  their own container, never the document.
- Every interactive element must be at least 44x44px (WCAG 2.5.5).
- Zero critical or serious axe violations, in BOTH light and dark themes.
- Use inputmode="decimal" for weight fields and inputmode="numeric" for reps.
- Respect prefers-reduced-motion: no transitions when it is set.
- Apply safe-area insets to fixed/sticky elements — the app sets
  viewport-fit=cover, so content can otherwise sit under the notch.

There is no human reviewing this work. Design requirements are enforced by
tests, not by inspection:
- No raw hex colours, no style={{}}, no layout <div>, no className in routes
  or components. Use Astryx component props or token-backed utilities.
- If a requirement in the issue is subjective ("premium", "calm", "hero
  numbers"), implement it AND add a test asserting the measurable version of
  it (computed font-size ratio, computed gap, contrast ratio). State in the
  commit body which assertion covers which criterion.
TEMPLATE_END

  # Substitute placeholders with bash pattern substitution — sed breaks on
  # multiline issue bodies ("unterminated s command") and mangles &, \ in
  # titles. Quoted replacement keeps & literal (bash 5.2+ patsub_replacement).
  PROMPT=$(cat "$PROMPT_FILE")
  rm -f "$PROMPT_FILE"
  PROMPT=${PROMPT//__ISSUE_TITLE__/"$ISSUE_TITLE"}
  PROMPT=${PROMPT//__ISSUE_NUM__/"$ISSUE_NUM"}
  PROMPT=${PROMPT//__ISSUE_BODY__/"$ISSUE_BODY"}

  if $DRY_RUN; then
    echo "[DRY RUN] Would dispatch model: ${MODELS[$MODEL_INDEX]}"
    echo "[DRY RUN] Prompt length: $(echo "$PROMPT" | wc -c) chars"
    # continue would re-pick the same issue forever (nothing changes in dry run)
    break
  fi

  # Try models in order until one works
  SUCCESS=false
  for ((i=MODEL_INDEX; i<${#MODELS[@]}; i++)); do
    MODEL="${MODELS[$i]}"
    echo "🤖 Trying model: $MODEL (index $i)"

    # Run omp with this model
    # Capture output to check for connect errors (omp exits 0 even on provider errors)
    # Disable set -e for this block since omp may return non-zero
    OUTPUT_FILE=$(mktemp)
    set +e
    # No timeout — let the model work as long as it needs. omp has its own
    # internal timeouts. Killing a working model mid-refactor is worse than
    # waiting. The verification step after will catch incomplete work.
    #
    # tee shows live output on the terminal while saving to file for error detection.
    echo "    ⏳ Working... (live output below)"
    echo "    ─────────────────────────────────────────────────────────"
    omp -p --model "$MODEL" --cwd "$REPO_DIR" --no-session "$PROMPT" 2>&1 | tee "$OUTPUT_FILE"
    EXIT_CODE=${PIPESTATUS[0]}
    set -e
    echo "    ─────────────────────────────────────────────────────────"

    # ─── Merge any feature branch the model may have created ─────────
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" != "main" ]]; then
      echo "    📌 Model created branch '$CURRENT_BRANCH'. Merging to main..."
      # Guard each step: under set -e a failed checkout (dirty tree) or a
      # merge conflict would kill the whole loop with stderr suppressed.
      if git checkout main && git merge "$CURRENT_BRANCH" --no-edit; then
        git branch -d "$CURRENT_BRANCH" 2>/dev/null || true
        echo "    ✅ Merged to main"
      else
        git merge --abort 2>/dev/null || true
        echo "    ⚠️  Could not merge '$CURRENT_BRANCH' to main — left as-is for manual review"
      fi
    fi

    # Check if the output contains error indicators
    # Check output content for errors
    OUTPUT_CONTENT=$(cat "$OUTPUT_FILE")
    if echo "$OUTPUT_CONTENT" | grep -qiE "resource_exhausted|rate.limit|quota"; then
      ERROR_TYPE="rate_limited"
    elif echo "$OUTPUT_CONTENT" | grep -qiE "invalid_argument|bad.request"; then
      ERROR_TYPE="invalid_argument"
    elif echo "$OUTPUT_CONTENT" | grep -qiE "Use /login|API key"; then
      ERROR_TYPE="needs_auth"
    elif [[ $EXIT_CODE -eq 124 ]]; then
      # Timeout - check if there's useful output despite timeout
      if echo "$OUTPUT_CONTENT" | grep -qiE "feat\(|fix\(|refactor\(|commit|add"; then
        ERROR_TYPE=""  # Model made progress, treat as success
      else
        ERROR_TYPE="timeout"
      fi
    elif [[ $EXIT_CODE -ne 0 ]]; then
      # Non-zero exit but check if output has useful content
      if echo "$OUTPUT_CONTENT" | grep -qiE "feat\(|fix\(|refactor\(|Error:|error:"; then
        ERROR_TYPE=""  # Model produced output, treat as success
      else
        ERROR_TYPE="exit_code_$EXIT_CODE"
      fi
    else
      ERROR_TYPE=""
    fi

    if [[ -z "$ERROR_TYPE" ]]; then
      echo "✅ Model $MODEL succeeded"
      SUCCESS=true

      # Update state
      jq --arg model "$MODEL" --argjson idx "$i" \
        '.current_model_index = $idx | .last_successful_model = $model' \
        "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

      # Update learnings
      ITER_COUNT=$(jq -r '.iterations' "$LEARNINGS_FILE")
      SUCC_COUNT=$(jq -r '.successful' "$LEARNINGS_FILE")
      MODEL_USAGE=$(jq -r --arg model "$MODEL" '.model_usage[$model] // 0' "$LEARNINGS_FILE")

      jq --arg model "$MODEL" \
        --argjson iters "$((ITER_COUNT + 1))" \
        --argjson succ "$((SUCC_COUNT + 1))" \
        --argjson usage "$((MODEL_USAGE + 1))" \
        '.iterations = $iters | .successful = $succ | .model_usage[$model] = $usage' \
        "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"

      rm -f "$OUTPUT_FILE"
      break
    else
      echo "⚠️  Model $MODEL failed ($ERROR_TYPE). Trying next..."
      MODEL_INDEX=$((i + 1))
      jq --argjson idx "$MODEL_INDEX" '.current_model_index = $idx' \
        "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

      # Track the failure
      FAIL_COUNT=$(jq -r '.failed' "$LEARNINGS_FILE")
      jq --argjson failed "$((FAIL_COUNT + 1))" \
        --arg model "$MODEL" --arg etype "$ERROR_TYPE" \
        '.failed = $failed | .common_errors += ["Model " + $model + ": " + $etype]' \
        "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"

      rm -f "$OUTPUT_FILE"
      sleep 1
    fi
  done

  if ! $SUCCESS; then
    echo "❌ All models exhausted. Please check your API quotas."
    echo "   Reset model index for next run."
    jq '.current_model_index = 0' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    break
  fi

  # ─── Verification: A feature is only "complete" if tests + build pass ───
  echo ""
  echo "🔬 Verification: running unit tests and build..."
  echo ""

  VERIFICATION_PASSED=true
  VERIFICATION_DETAILS=""

  # 1. Unit tests
  echo "  ▸ Running unit tests (Vitest)..."
  # pipefail inside the substitution: PIPESTATUS of the inner pipeline is not
  # visible out here, and without it $? would be tee's exit code (always 0),
  # silently passing verification on failing tests.
  set +e
  UNIT_OUTPUT=$(set -o pipefail; npm run test:unit 2>&1 | tee /dev/stderr)
  UNIT_EXIT=$?
  set -e
  if [[ $UNIT_EXIT -eq 0 ]]; then
    UNIT_COUNT=$(echo "$UNIT_OUTPUT" | grep -oP 'Tests\s+\K\d+(?= passed)' || echo "?")
    echo "    ✅ Unit tests passed ($UNIT_COUNT tests)"
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}unit:${UNIT_COUNT}passed "
  else
    echo "    ❌ Unit tests FAILED"
    VERIFICATION_PASSED=false
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}unit:FAILED "
    echo "$UNIT_OUTPUT" | grep -E "FAIL|×|✗" | head -5
  fi

  # 2. Production build
  echo "  ▸ Running production build..."
  set +e
  BUILD_OUTPUT=$(set -o pipefail; npm run build 2>&1 | tee /dev/stderr)
  BUILD_EXIT=$?
  set -e
  if [[ $BUILD_EXIT -eq 0 ]]; then
    echo "    ✅ Build succeeded"
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}build:passed "
  else
    echo "    ❌ Build FAILED"
    VERIFICATION_PASSED=false
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}build:FAILED "
  fi

  # 3. Browser e2e suite (PRD 13 Batch 1).
  #
  # This was previously skipped as "too slow", which left the Playwright specs
  # the loop writes completely unexecuted — no interaction, mobile, or a11y
  # regression could be caught before pushing to main. The rationale did not
  # hold: the model call above has no timeout by design and runs for minutes,
  # so the suite is rounding error against it.
  #
  # Only run when unit tests and build already passed — e2e against a broken
  # build produces noise, not signal.
  if $VERIFICATION_PASSED; then
    echo "  ▸ Running browser e2e suite (Playwright)..."
    set +e
    E2E_OUTPUT=$(set -o pipefail; npm run test:e2e 2>&1 | tee /dev/stderr)
    E2E_EXIT=$?
    set -e
    if [[ $E2E_EXIT -eq 0 ]]; then
      E2E_COUNT=$(echo "$E2E_OUTPUT" | grep -oP '\K\d+(?= passed)' | tail -1 || echo "?")
      echo "    ✅ E2E passed ($E2E_COUNT tests)"
      VERIFICATION_DETAILS="${VERIFICATION_DETAILS}e2e:${E2E_COUNT}passed"
    else
      echo "    ❌ E2E FAILED"
      VERIFICATION_PASSED=false
      VERIFICATION_DETAILS="${VERIFICATION_DETAILS}e2e:FAILED"
      echo "$E2E_OUTPUT" | grep -E "✘|failed|Error:" | head -8
    fi
  else
    echo "  ▸ Skipping e2e (unit tests or build already failed)"
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}e2e:skipped"
  fi

  echo ""
  if $VERIFICATION_PASSED; then
    echo "✅✅✅ FEATURE VERIFIED: $VERIFICATION_DETAILS"
    echo "   Unit tests and build pass."

    # Update learnings with verification success
    jq --arg details "$VERIFICATION_DETAILS" \
      '.last_verification = $details | .verification_streak = ((.verification_streak // 0) + 1)' \
      "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"

    # Push only verified work. Pushing on failure would land broken code on
    # main AND auto-close the issue via "Closes #N" in the commit body.
    echo ""
    echo "  ▸ Pushing to origin/main..."
    set +e
    git push origin main 2>&1 | tail -3
    PUSH_EXIT=${PIPESTATUS[0]}
    set -e

    if [[ $PUSH_EXIT -eq 0 ]]; then
      COMMIT_SHA=$(git rev-parse --short HEAD)
      COMMIT_SUBJECT=$(git log -1 --format="%s")
      COMMIT_BODY=$(git log -1 --format="%B")

      # Close the issue now that its deliverable is verified and pushed.
      # Without this the loop re-picks completed issues every iteration — issue
      # #15 was being re-selected after its Astryx migration already landed.
      # GitHub auto-closes when the pushed commit BODY (not just the subject,
      # which is all %s shows) references the issue with a closing keyword.
      if echo "$COMMIT_BODY" | grep -qiE "(closes?|closed|fixes?|fixed|resolves?|resolved) #$ISSUE_NUM\b"; then
        echo "    ✅ Issue #$ISSUE_NUM will auto-close (commit body references it)"
      else
        echo "  ▸ Closing issue #$ISSUE_NUM with commit $COMMIT_SHA..."
        gh issue close "$ISSUE_NUM" \
          --comment "Completed in commit [$COMMIT_SHA](https://github.com/DouglasdeMoura/fitness/commit/$COMMIT_SHA): $COMMIT_SUBJECT

Verification: $VERIFICATION_DETAILS

Closed by the self-improving dev loop." 2>/dev/null && \
          echo "    ✅ Issue #$ISSUE_NUM closed with commit reference" || \
          echo "    ⚠️  Could not close issue #$ISSUE_NUM (may lack permissions)"
      fi
    else
      echo "    ⚠️  Push failed — leaving issue #$ISSUE_NUM open for the next run"
    fi
  else
    echo "⚠️  VERIFICATION INCOMPLETE: $VERIFICATION_DETAILS"
    echo "   Feature committed but tests/build need attention."
    echo "   Next iteration should fix failing tests or create a bug-fix issue."

    # Record the verification failure for self-improvement
    jq --arg details "$VERIFICATION_DETAILS" \
      '.last_verification = $details | .verification_streak = 0 | .verification_failures = ((.verification_failures // 0) + 1)' \
      "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"

    # Create a GitHub issue for the failing tests if build or e2e failed
    if gh issue list --state open --search "fix failing tests in:title" --json number --limit 1 2>/dev/null | jq -e '.[0]' > /dev/null 2>&1; then
      echo "   (Bug fix issue already exists)"
    else
      echo "   Creating bug-fix issue..."
      gh issue create \
        --title "fix: failing tests after iteration (self-improvement loop)" \
        --label "bug" \
        --body "The dev loop detected failing tests during verification.

Details: $VERIFICATION_DETAILS

Run \`npm run test:unit && npm run test:e2e && npm run build\` to see failures.

This issue was auto-created by the self-improving dev loop." 2>/dev/null || true
    fi
  fi

  echo ""
  echo "━━━ Iteration $iter complete ━━━"
done

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                      Loop Summary                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
ITER_COUNT=$(jq -r '.iterations' "$LEARNINGS_FILE")
SUCC_COUNT=$(jq -r '.successful' "$LEARNINGS_FILE")
FAIL_COUNT=$(jq -r '.failed' "$LEARNINGS_FILE")
echo "  Total iterations: $ITER_COUNT"
echo "  Successful:       $SUCC_COUNT"
echo "  Failed:           $FAIL_COUNT"
echo ""
echo "  Model usage:"
jq -r '.model_usage | to_entries[] | "    \(.key): \(.value) runs"' "$LEARNINGS_FILE" 2>/dev/null || echo "    (no data yet)"
echo ""
echo "  Verification:"
echo "    Streak:    $(jq -r '.verification_streak // 0' "$LEARNINGS_FILE") consecutive passes"
echo "    Failures:  $(jq -r '.verification_failures // 0' "$LEARNINGS_FILE") total"
echo "    Last:      $(jq -r '.last_verification // "none"' "$LEARNINGS_FILE")"
echo ""
echo "Remaining open issues:"
gh issue list --state open --limit 10 2>/dev/null | head -15 || echo "  (unable to fetch)"
