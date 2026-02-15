#!/usr/bin/env bash
if [[ -n $(git status --porcelain) ]]; then
  echo "❌ Repo not clean. Commit or stash first."
  exit 1
fi
