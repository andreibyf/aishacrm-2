FROM postgres:15-alpine

# Bake the Cal.com bootstrap SQL into the image. Previously this was bind-mounted
# from the repo (./scripts/calcom-db-init.sql), but Coolify v4 in compose
# deployment mode renders only the compose file to <app_dir>/docker-compose.yaml
# without cloning the working tree, so any compose `volumes:` source pointing at
# a repo file resolves to a non-existent path. Docker auto-creates an empty
# directory at the source and postgres-entrypoint then fails to source the
# script. Same defect that crashed litellm with IsADirectoryError on staging.
#
# postgres-entrypoint.sh runs everything in /docker-entrypoint-initdb.d/ on
# first cluster init (empty PGDATA). On subsequent restarts the existing volume
# is reused and the script is NOT re-run, so this stays idempotent.
#
# Production docker-compose.prod.yml continues to bind-mount from
# /opt/aishacrm/scripts/calcom-db-init.sql (SCP'd by docker-release.yml). That
# overlay supplies identical content; the baked-in copy here matches by SHA.
COPY scripts/calcom-db-init.sql /docker-entrypoint-initdb.d/calcom-db-init.sql
