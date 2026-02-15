#!/usr/bin/env bash
set -e

echo "🚀 Installing AiSHA Autonomous Dev System"

########################################
# Folders
########################################
mkdir -p .devcontainer/planning
mkdir -p scripts
mkdir -p tasks

########################################
# Git clean check
########################################
cat > scripts/git-clean-check.sh << 'EOF'
#!/usr/bin/env bash
if [[ -n $(git status --porcelain) ]]; then
  echo "❌ Repo not clean. Commit or stash first."
  exit 1
fi
EOF
chmod +x scripts/git-clean-check.sh

########################################
# Planning container
########################################
cat > .devcontainer/planning/devcontainer.json << 'EOF'
{
  "name": "AiSHA Planning Mode (READ ONLY)",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "workspaceMount": "source=${localWorkspaceFolder},target=/workspace,type=bind,readonly,consistency=cached",
  "workspaceFolder": "/workspace",
  "mounts": ["type=tmpfs,target=/tmp"],
  "remoteEnv": { "PLANNING_MODE": "true" },
  "postStartCommand": "echo '🚧 PLANNING MODE – READ ONLY 🚧'"
}
EOF

########################################
# Mode launchers
########################################
cat > scripts/planning-mode.sh << 'EOF'
#!/usr/bin/env bash
set -e
./scripts/git-clean-check.sh
echo "🧠 PLANNING MODE"
DEVCONTAINER_CONFIG=.devcontainer/planning/devcontainer.json code .
EOF

cat > scripts/dev-mode.sh << 'EOF'
#!/usr/bin/env bash
set -e
./scripts/git-clean-check.sh
echo "🛠️ DEV MODE"
code .
EOF

chmod +x scripts/planning-mode.sh
chmod +x scripts/dev-mode.sh

########################################
# PLAN template
########################################
cat > PLAN.md << 'EOF'
# PLAN

## Root Cause

## Impacted Services

## Contracts Affected

## Ordered Steps

## Tests

## Observability Checks

## Risks

## Definition of Done
EOF

########################################
# Copilot execution prompt
########################################
cat > COPILOT_EXECUTE.md << 'EOF'
Implement PLAN.md.

Rules:
- Atomic commits
- Do not expand scope
- Preserve contracts unless specified
- Add tests listed in plan
- Show diff after each step
EOF

########################################
# Audit prompt
########################################
cat > AUDIT.md << 'EOF'
Audit this branch against PLAN.md.

Return:
- Missing items
- Regressions
- Contract violations
- Observability validation steps
EOF

########################################
# Task autopilot
########################################
cat > scripts/aisha-autopilot.sh << 'EOF'
#!/usr/bin/env bash
set -e

TASK_FILE=$(ls tasks/*.md 2>/dev/null | head -n 1)

if [ -z "$TASK_FILE" ]; then
  echo "✅ No tasks in queue"
  exit 0
fi

TASK_NAME=$(basename "$TASK_FILE" .md | tr ' ' '-' )
BRANCH="task/$TASK_NAME"

git checkout -b "$BRANCH"

echo "🧠 Planning..."
./scripts/planning-mode.sh
read -p "Create PLAN.md then press ENTER..."

echo "🛠️ Implementing..."
./scripts/dev-mode.sh
read -p "Finish implementation then press ENTER..."

git add .
git commit -m "$TASK_NAME"

echo "🔍 Auditing..."
./scripts/planning-mode.sh
read -p "Finish audit then press ENTER..."

git push -u origin "$BRANCH"

if command -v gh &> /dev/null; then
  gh pr create --title "$TASK_NAME" --body "Automated execution with PLAN.md"
fi

echo "✅ PR ready for review"
EOF

chmod +x scripts/aisha-autopilot.sh

########################################
# Task helper
########################################
cat > scripts/new-task.sh << 'EOF'
#!/usr/bin/env bash
NAME=$(echo "$1" | tr ' ' '-' )
FILE="tasks/$NAME.md"

cat > "$FILE" <<EOT
# Task
$1

## Source

## Symptoms

## Priority
EOT

echo "Created $FILE"
EOF

chmod +x scripts/new-task.sh

echo "✅ INSTALL COMPLETE"
echo ""
echo "NEXT:"
echo "1️⃣ Install VS Code 'code' CLI if missing"
echo "2️⃣ Run: ./scripts/planning-mode.sh (first container build)"
echo ""
echo "DAILY USE:"
echo "Create task:"
echo "  ./scripts/new-task.sh \"fix: issue description\""
echo ""
echo "Run loop:"
echo "  ./scripts/aisha-autopilot.sh"
