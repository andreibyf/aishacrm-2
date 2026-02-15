#!/usr/bin/env bash
set -e
./scripts/git-clean-check.sh
echo "🛠️ DEV MODE"
code .
