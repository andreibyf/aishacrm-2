# Coolify Compose Loader Hotfix — 4vd-62

## Scope

Applies ONLY to VPS-2 (Coolify server).

Does NOT apply to VPS-1.

## Topology

| Layer | Purpose |

|---|---|

| Local repo | Source of truth |

| GitHub/Gitea | Git remotes |

| VPS-2 | Coolify orchestration |

| VPS-1 | Runtime containers |

## Patch Location

/var/www/html/app/Models/Application.php

## Recovery Scripts

/data/coolify/patches/4vd-62/check.sh

/data/coolify/patches/4vd-62/reapply.sh

## Cron Self-Healing

/etc/cron.d/coolify-4vd-62-patch-check

## Failure Signature

Failed to read the Docker Compose file from the repository

## Validation

docker exec -it coolify sh -lc "grep -n \"docker_compose_raw\" /var/www/html/app/Models/Application.php"

## Linear

4vd-62
