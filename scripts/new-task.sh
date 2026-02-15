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
