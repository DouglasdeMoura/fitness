#!/usr/bin/env bash
#
# FitTrack Self-Improving Dev Loop
#
# This script orchestrates iterative development using Oh-My-Pi (omp) models.
# It reads GitHub issues, dispatches the most powerful available model to work
# on them, learns from each iteration, and improves prompts over time.
#
# Usage:
#   npm run dev-loop                  # Run one iteration
#   npm run dev-loop -- --max 5       # Run up to 5 iterations
#   npm run dev-loop -- --dry-run     # Show what would be done
#
# Models are tried in order from most powerful to least powerful.
# When a model hits its rate limit, the script falls back to the next.
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

LEARNINGS_FILE="$REPO_DIR/.dev-loop/learnings.json"
STATE_FILE="$REPO_DIR/.dev-loop/state.json"
MAX_ITERATIONS=1
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

# Model chain: most powerful to least powerful (based on 2025/2026 benchmarks)
# References: SWE-bench, Arena-Hard, LMSYS Chatbot Arena, Aider leaderboard
MODELS=(
  "claude-opus-5-thinking-xhigh"    # Most powerful overall (extended thinking)
  "gpt-5.2-codex-xhigh"             # Best coding model (GPT-5.2 family)
  "claude-sonnet-5-xhigh"           # Excellent coding + fast
  "gemini-3-pro"                    # Strong long-context reasoning
  "gpt-5.1-codex-max"               # Strong coding model
  "claude-4-sonnet"                 # Reliable Claude 4
  "claude-fable-5-max"              # Fable variant, strong reasoning
  "gpt-5.2"                         # Base GPT-5.2
  "gemini-3-flash"                  # Fast, capable Gemini
  "claude-opus-4-8-xhigh"           # Claude 4.8 Opus
  "glm-5.2-max"                     # GLM strong model
  "gpt-5.1"                         # GPT-5.1
  "gpt-5.4-high"                    # GPT-5.4
)

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          FitTrack Self-Improving Dev Loop                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Read current model index
MODEL_INDEX=$(jq -r '.current_model_index' "$STATE_FILE")

for ((iter=1; iter<=MAX_ITERATIONS; iter++)); do
  echo ""
  echo "━━━ Iteration $iter/$MAX_ITERATIONS ━━━"
  echo ""

  # Pick an issue to work on
  if [[ -n "$ISSUE_NUMBER" ]]; then
    ISSUE_DATA=$(gh issue view "$ISSUE_NUMBER" --json number,title,body 2>/dev/null || echo "")
  else
    # Get the first open issue
    ISSUE_DATA=$(gh issue list --state open --json number,title,body --limit 1 2>/dev/null | jq -r '.[0] // empty')
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
  PROMPT=$(cat <<PROMPT_EOF
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
Title: $ISSUE_TITLE
Number: #$ISSUE_NUM
Description: $ISSUE_BODY

Instructions:
1. Read the relevant PRD files in prd/ for context
2. Read the existing code to understand patterns and conventions
3. Implement the feature following existing patterns
4. Use Astryx DS components where appropriate
5. Add or update database schema in src/lib/schema.sql if needed
6. Add server functions in src/lib/api.ts for any new data operations
7. Test that the app compiles (npm run build)
8. Commit your work with a conventional commit message
9. Do NOT push to remote

Important conventions:
- Use createServerFn from @tanstack/react-start for API calls
- Use createFileRoute for route definitions
- Use useSuspenseQuery for data fetching
- All calculations must be science-backed with citations in comments
PROMPT_EOF
)

  if $DRY_RUN; then
    echo "[DRY RUN] Would dispatch model: ${MODELS[$MODEL_INDEX]}"
    echo "[DRY RUN] Prompt length: $(echo "$PROMPT" | wc -c) chars"
    continue
  fi

  # Try models in order until one works
  SUCCESS=false
  for ((i=MODEL_INDEX; i<${#MODELS[@]}; i++)); do
    MODEL="${MODELS[$i]}"
    echo "🤖 Trying model: $MODEL (index $i)"

    # Run omp with this model
    if omp -p --model "$MODEL" --cwd "$REPO_DIR" --no-session "$PROMPT" 2>&1; then
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

      break
    else
      echo "⚠️  Model $MODEL failed (likely rate limit). Trying next..."
      MODEL_INDEX=$((i + 1))
      jq --argjson idx "$MODEL_INDEX" '.current_model_index = $idx' \
        "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

      # Track the failure
      FAIL_COUNT=$(jq -r '.failed' "$LEARNINGS_FILE")
      jq --argjson failed "$((FAIL_COUNT + 1))" \
        --arg model "$MODEL" \
        '.failed = $failed | .common_errors += ["Model " + $model + " rate limited"]' \
        "$LEARNINGS_FILE" > "$LEARNINGS_FILE.tmp" && mv "$LEARNINGS_FILE.tmp" "$LEARNINGS_FILE"

      sleep 2
    fi
  done

  if ! $SUCCESS; then
    echo "❌ All models exhausted. Please check your API quotas."
    echo "   Reset model index for next run."
    jq '.current_model_index = 0' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    break
  fi

  # Self-improvement: analyze what worked
  echo ""
  echo "📈 Self-improvement analysis..."

  # Check if the build still passes
  if npm run build 2>/dev/null; then
    echo "✅ Build passes after this iteration"
  else
    echo "⚠️  Build has errors. The next iteration should fix them."
    # Create an issue for build fixes if needed
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
echo "Remaining open issues:"
gh issue list --state open --limit 10 2>/dev/null | head -15 || echo "  (unable to fetch)"
