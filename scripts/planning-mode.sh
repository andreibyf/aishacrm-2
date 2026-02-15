#!/usr/bin/env bash
set -e
./scripts/git-clean-check.sh
echo "🧠 PLANNING MODE"
DEVCONTAINER_CONFIG=.devcontainer/planning/devcontainer.json code .
