#!/usr/bin/env bash
source "$(git rev-parse --show-toplevel)/scripts/runtime/lib.sh"

get_devcontainer() {

  REPO_WIN=$(cd "$REPO_ROOT" && pwd -W 2>/dev/null)

  docker ps \
    --filter "label=devcontainer.local_folder=$REPO_WIN" \
    --format '{{.Names}}' \
    | head -n1
}

get_backend_container() {
  docker ps \
    --filter "label=com.docker.compose.service=backend" \
    --format '{{.Names}}' \
    | head -n1
}
