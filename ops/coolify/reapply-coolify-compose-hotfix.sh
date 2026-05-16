
#!/usr/bin/env bash

set -euo pipefail



CONTAINER="${1:-coolify}"

FILE="/var/www/html/app/Models/Application.php"

TS="$(date +%Y%m%d-%H%M%S)"



echo "[4VD-62] Backing up $FILE inside $CONTAINER..."

docker exec "$CONTAINER" sh -lc "cp '$FILE' '$FILE.bak-4VD-62-$TS'"



echo "[4VD-62] Applying Coolify compose-loader hotfix..."

docker exec "$CONTAINER" sh -lc "

sed -i \"s#if (\\\$isInit && \\\$this->docker_compose_raw) {#if (\\\$this->docker_compose_raw) {#g\" '$FILE'



sed -i \"s#throw new RuntimeException('Failed to read the Docker Compose file from the repository.');#throw new RuntimeException('Failed to read the Docker Compose file from the repository: '.\\\$e->getMessage());#g\" '$FILE'

"



echo "[4VD-62] Verifying patch..."

docker exec "$CONTAINER" sh -lc "grep -n \"docker_compose_raw\\|Failed to read the Docker Compose\" '$FILE' | head -20"



echo "[4VD-62] Restarting Coolify..."

docker restart "$CONTAINER"



echo "[4VD-62] Done."

