#!/usr/bin/env bash
# scripts/test-changed.sh
#
# Runs only the Vitest projects that are affected by files changed since the
# merge-base with main (or since HEAD~1 when already on main).
#
# Usage:
#   npm run test:changed              # auto-detect changed files vs main
#   CHANGED_FILES="src/foo.js" npm run test:changed   # explicit override
#
# Projects: aisha | crm | reports | workflows | integrations | platform
# CARE backend tests are handled separately via Docker/node --test

set -euo pipefail

# ── Determine changed files ───────────────────────────────────────────────────
if [[ -n "${CHANGED_FILES:-}" ]]; then
  files="$CHANGED_FILES"
else
  base=$(git merge-base HEAD main 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || echo "")
  if [[ -z "$base" ]]; then
    echo "⚠️  Cannot determine base commit — running ALL tests."
    exec npx vitest run
  fi
  files=$(git diff --name-only "$base" HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null || echo "")
fi

if [[ -z "$files" ]]; then
  echo "✅ No changed files detected — nothing to test."
  exit 0
fi

echo "🔍 Changed files:"
echo "$files" | sed 's/^/   /'
echo ""

# ── Map changed files → projects ─────────────────────────────────────────────
declare -A projects=()

while IFS= read -r f; do
  # AiSHA / AI engine / voice
  if echo "$f" | grep -qE "^src/ai/|^src/__tests__/ai/|processChatCommand|useAiSidebarState|BraidSDKMonitor|useAiSidebar|useRealtime|useSpeech|useVoice|usePushToTalk|realtimeTelemetry"; then
    projects["aisha"]=1
  fi

  # CRM entities: leads, contacts, accounts, opportunities, activities, bizdev, employees
  if echo "$f" | grep -qE "^src/components/(leads|contacts|accounts|opportunities|activities|bizdev|employees)/|^src/pages/__tests__/.*\.smoke\.|^src/api/entities"; then
    projects["crm"]=1
  fi

  # Reports & analytics (including PEP query node)
  if echo "$f" | grep -qE "^src/components/reports/|pepQuery|PEP|pep|^backend/routes/reports"; then
    projects["reports"]=1
  fi

  # Workflows and automation
  if echo "$f" | grep -qE "^src/components/workflows/|^backend/routes/workflows|carePlaybook|careWorkflow"; then
    projects["workflows"]=1
  fi

  # Integrations (file upload, WhatsApp, webhooks, Twilio, etc.)
  if echo "$f" | grep -qE "^src/__tests__/integrations|^src/api/functions|whatsapp|webhook|twilio|callfluent|thoughtly"; then
    projects["integrations"]=1
  fi

  # Platform (shared components, hooks, utils, lib, settings, test infra)
  if echo "$f" | grep -qE "^src/components/(shared|settings)/|^src/hooks/|^src/utils/|^src/lib/|^src/test/|^tests/test-utils|^src/__tests__/package-validation|vitest\.config|vite\.config|package\.json"; then
    projects["platform"]=1
  fi

  # CARE engine (backend — uses node --test runner, not vitest)
  if echo "$f" | grep -qE "^backend/lib/care/|careState|careAudit|careEscalation|careSignal|isCareAutonomy|isCareState|isCareWorkflow"; then
    projects["care"]=1
  fi

  # Backend lib changes that have frontend test coverage
  if echo "$f" | grep -qE "^backend/lib/(braid|healthMonitor|callFlow|supabase)"; then
    projects["crm"]=1
    projects["reports"]=1
  fi

  # Backend entity routes → CRM project
  if echo "$f" | grep -qE "^backend/routes/(leads|contacts|accounts|opportunities|activities|bizdev)"; then
    projects["crm"]=1
  fi

done <<< "$files"

if [[ ${#projects[@]} -eq 0 ]]; then
  echo "ℹ️  No test-mapped files changed (docs, migrations, CI config, etc.)."
  echo "   Skipping tests. Run 'npm run test:run' to run everything."
  exit 0
fi

# ── Build vitest command ──────────────────────────────────────────────────────
project_flags=""
run_care=false

for p in "${!projects[@]}"; do
  if [[ "$p" == "care" ]]; then
    run_care=true
  else
    project_flags="$project_flags --project=$p"
  fi
done

echo "🚀 Running test projects: $(echo "${!projects[@]}" | tr ' ' '\n' | grep -v '^care$' | sort | tr '\n' ' ')"
[[ "$run_care" == true ]] && echo "   + CARE backend tests (Docker)"
echo ""

# Run vitest projects (frontend)
if [[ -n "$project_flags" ]]; then
  # shellcheck disable=SC2086
  npx vitest run $project_flags
fi

# Run CARE backend tests separately via Docker (Node native test runner)
if [[ "$run_care" == true ]]; then
  echo ""
  echo "🔬 Running CARE backend tests..."
  if docker compose exec -T backend echo "ok" &>/dev/null; then
    docker compose exec -T backend node --test \
      backend/lib/care/__tests__/careAuditEmitter.test.js \
      backend/lib/care/__tests__/careCallSignalAdapter.test.js \
      backend/lib/care/__tests__/careEscalationDetector.test.js \
      backend/lib/care/__tests__/careStateEngine.test.js \
      backend/lib/care/__tests__/careTriggerSignalAdapter.test.js \
      backend/lib/care/__tests__/isCareAutonomyEnabled.test.js \
      backend/lib/care/__tests__/carePlaybookExecutor.test.js \
      backend/lib/care/__tests__/carePlaybooks.routes.test.js
  else
    echo "⚠️  Docker not running — skipping CARE backend tests."
    echo "   Run manually: docker compose exec backend node --test backend/lib/care/__tests__/*.test.js"
  fi
fi
