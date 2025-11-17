#!/usr/bin/env sh
set -e

# No runtime env.js generation - environment variables are injected at build time
: "${PORT:=3000}"

# Start static server
exec sh -c "serve -s dist -l ${PORT}"
