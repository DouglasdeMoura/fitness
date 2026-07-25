#!/usr/bin/env bash
#
# FitTrack Self-Improving Dev Loop — Claude Code Edition
#
# Uses Claude Code CLI (anthropic) instead of Oh-My-Pi.
# Claude Code has built-in --fallback-model, so no manual model chain needed.
#
# Usage:
#   bash scripts/dev-loop-claude.sh                  # Run 1 iteration
#   bash scripts/dev-loop-claude.sh --max 5          # Run 5 iterations
#   bash scripts/dev-loop-claude.sh --dry-run        # Preview only
#   bash scripts/dev-loop-claude.sh --issue 11       # Work on specific issue
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

LEARNINGS_FILE="$REPO_DIR/.dev-loop/learnings-claude.json"
MAX_ITERATIONS=1
DRY_RUN=false
ISSUE_NUMBER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --max) MAX_ITERATIONS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --issue) ISSUE_NUMBER="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

mkdir -p "$REPO_DIR/.dev-loop"

if [[ ! -f "$LEARNINGS_FILE" ]]; then
  echo '{"iterations": 0, "successful": 0, "failed": 0, "model_usage": {}, "verification_streak": 0, "verification_failures": 0}' > "$LEARNINGS_FILE"
fi

# ─── Claude Code configuration ─────────────────────────────────────
# Primary model tried first, fallback if overloaded.
# Aliases: opus (most powerful), sonnet (balanced), fable (fast), haiku (cheapest)
# Full names also work: claude-opus-5, claude-sonnet-5, claude-fable-5
PRIMARY_MODEL="${CLAUDE_MODEL:-sonnet}"
FALLBACK_MODELS="${CLAUDE_FALLBACK:-haiku}"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║    FitTrack Dev Loop — Claude Code Edition                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Primary model:  $PRIMARY_MODEL"
echo "  Fallback:       $FALLBACK_MODELS"
echo ""

for ((iter=1; iter<=MAX_ITERATIONS; iter++)); do
  echo ""
  echo "━━━ Iteration $iter/$MAX_ITERATIONS ━━━"
  echo ""

  # Pick issue
  if [[ -n "$ISSUE_NUMBER" ]]; then
    ISSUE_DATA=$(gh issue view "$ISSUE_NUMBER" --json number,title,body 2>/dev/null || echo "")
  else
    ISSUE_DATA=$(gh issue list --state open --json number,title,body --limit 20 2>/dev/null | jq -r 'sort_by(.number) | .[0] // empty')
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

  PROMPT=$(cat <<PROMPT_EOF
You are working on FitTrack, a science-backed nutrition and workout companion web app.

Tech stack:
- TanStack Start (React 19, SSR, file-based routing)
- Astryx DS (@astryxdesign/core) for ALL UI components — read AGENTS.md for the cheat sheet
- SQLite (better-sqlite3) for persistence
- Vitest for unit tests, Playwright for browser e2e tests

GitHub Issue to implement:
Title: $ISSUE_TITLE
Number: #$ISSUE_NUM
Description: $ISSUE_BODY

Instructions:
1. Read AGENTS.md for Astryx DS conventions and CLI usage
2. Read the relevant PRD files in prd/ for context
3. Read existing code in src/ to understand patterns
4. Read existing tests in tests/unit/ and tests/e2e/ for test patterns
5. Implement the feature using ONLY Astryx DS components (no custom CSS, no <div> for layout)
6. Write meaningful tests:
   - Unit tests in tests/unit/ for calculation logic
   - E2E browser tests in tests/e2e/ simulating real user interactions
7. Run ALL tests and ensure they pass:
   - npm run test:unit
   - npm run test:e2e
   - npm run build
8. Commit your work with a conventional commit message

A feature is NOT complete until all tests pass and the build succeeds.

Important:
- Use Astryx components: Card, Button, TextInput, Table, Heading, MetadataList, etc.
- Run "npm run astryx component <Name>" to check component props
- No style={{}}, no custom CSS classes, no raw hex colors
- Use createServerFn from @tanstack/react-start for API calls
- Use createFileRoute for route definitions
PROMPT_EOF
)

  if $DRY_RUN; then
    echo "[DRY RUN] Would dispatch Claude Code with model: $PRIMARY_MODEL"
    echo "[DRY RUN] Prompt length: $(echo "$PROMPT" | wc -c) chars"
    continue
  fi

  echo "🤖 Dispatching Claude Code (model: $PRIMARY_MODEL, fallback: $FALLBACK_MODELS)..."
  echo ""

  OUTPUT_FILE=$(mktemp)
  set +e
  claude -p \
    --model "$PRIMARY_MODEL" \
    --fallback-model "$FALLBACK_MODELS" \
    --permission-mode acceptEdits \
    --add-dir "$REPO_DIR" \
    "$PROMPT" 2>&1 | tee "$OUTPUT_FILE"
  EXIT_CODE=$?
  set -e

  SUCCESS=false
  if [[ $EXIT_CODE -eq 0 ]]; then
    echo ""
    echo "✅ Claude Code completed"
    SUCCESS=true

    jq --arg model "$PRIMARY_MODEL" \
      --argjson iters "$(jq -r '.iterations' "$LEARNINGS_FILE")" \
      --argjson succ "$(jq -r '.successful' "$LEARNINGS_FILE")" \
      --argjson usage "$(jq -r --arg m "$PRIMARY_MODEL" '.model_usage[$m] // 0' "$LEARNINGS_FILE")" \
      '.iterations = ($iters + 1) | .successful = ($succ + 1) | .model_usage[$model] = ($usage + 1)' \
      "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"
  else
    echo "⚠️  Claude Code exited with code $EXIT_CODE"
    FAIL_COUNT=$(jq -r '.failed' "$LEARNINGS_FILE")
    jq --argjson failed "$((FAIL_COUNT + 1))" '.failed = $failed' \
      "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"
  fi

  rm -f "$OUTPUT_FILE"

  # ─── Verification ──────────────────────────────────────────────────
  echo ""
  echo "🔬 Verification: running unit tests, browser e2e tests, and build..."

  VERIFICATION_PASSED=true
  VERIFICATION_DETAILS=""

  echo "  ▸ Unit tests (Vitest)..."
  set +e
  UNIT_OUTPUT=$(npm run test:unit 2>&1)
  UNIT_EXIT=$?
  set -e
  if [[ $UNIT_EXIT -eq 0 ]]; then
    UNIT_COUNT=$(echo "$UNIT_OUTPUT" | grep -oP 'Tests\s+\K\d+(?= passed)' || echo "?")
    echo "    ✅ $UNIT_COUNT unit tests passed"
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}unit:${UNIT_COUNT}passed "
  else
    echo "    ❌ Unit tests FAILED"
    VERIFICATION_PASSED=false
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}unit:FAILED "
  fi

  echo "  ▸ Browser e2e tests (Playwright)..."
  set +e
  E2E_OUTPUT=$(npm run test:e2e 2>&1)
  E2E_EXIT=$?
  set -e
  if [[ $E2E_EXIT -eq 0 ]]; then
    E2E_COUNT=$(echo "$E2E_OUTPUT" | grep -oP '\d+(?= passed)' | tail -1 || echo "?")
    echo "    ✅ $E2E_COUNT browser tests passed"
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}e2e:${E2E_COUNT}passed "
  else
    echo "    ❌ Browser tests FAILED"
    VERIFICATION_PASSED=false
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}e2e:FAILED "
  fi

  echo "  ▸ Production build..."
  set +e
  BUILD_OUTPUT=$(npm run build 2>&1)
  BUILD_EXIT=$?
  set -e
  if [[ $BUILD_EXIT -eq 0 ]]; then
    echo "    ✅ Build succeeded"
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}build:passed"
  else
    echo "    ❌ Build FAILED"
    VERIFICATION_PASSED=false
    VERIFICATION_DETAILS="${VERIFICATION_DETAILS}build:FAILED"
  fi

  echo ""
  if $VERIFICATION_PASSED; then
    echo "✅✅✅ FEATURE VERIFIED: $VERIFICATION_DETAILS"
    jq --arg details "$VERIFICATION_DETAILS" \
      '.last_verification = $details | .verification_streak = ((.verification_streak // 0) + 1)' \
      "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"
  else
    echo "⚠️  VERIFICATION INCOMPLETE: $VERIFICATION_DETAILS"
    jq --arg details "$VERIFICATION_DETAILS" \
      '.last_verification = $details | .verification_streak = 0 | .verification_failures = ((.verification_failures // 0) + 1)' \
      "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"
  fi

  echo ""
  echo "━━━ Iteration $iter complete ━━━"
done

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Loop Summary                              ║"
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
echo ""
echo "Remaining open issues:"
gh issue list --state open --limit 10 2>/dev/null | head -15 || echo "  (unable to fetch)"
