#!/usr/bin/env bash
set -e
source "$(git rev-parse --show-toplevel)/scripts/_task-lib.sh"

mkdir -p "$TASK_DIR"

RAW_NAME="$1"
SLUG=$(echo "$RAW_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[: ]/-/g')
FILE="$TASK_DIR/$SLUG.md"

cat > "$FILE" <<EOT
# Task
$RAW_NAME

## Status
PLANNED

## Branch
$SLUG
EOT

git checkout -b "$SLUG"

echo "✅ Created $FILE"
