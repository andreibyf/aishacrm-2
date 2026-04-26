FROM ghcr.io/berriai/litellm:v1.81.3-stable

# Install Doppler CLI so LiteLLM can load secrets at runtime.
RUN apk add --no-cache wget ca-certificates && \
    wget -q -t3 "https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key" -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo "https://packages.doppler.com/public/cli/alpine/any-version/main" >> /etc/apk/repositories && \
    apk add --no-cache doppler

COPY litellm/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Bake the litellm proxy config into the image. Previously this was bind-mounted
# from the repo root via docker-compose, but Coolify v4 (used in staging) only
# clones the rendered compose file — not the working tree — so any compose
# `volumes:` source pointing at a repo file resolves to a non-existent path,
# Docker auto-creates an empty directory there, and litellm crashes on startup
# with `IsADirectoryError [Errno 21] '/app/config.yaml'`. Production prod-compose
# can keep its bind mount; that overlay supplies identical content.
COPY litellm_config.yaml /app/config.yaml

ENTRYPOINT ["/entrypoint.sh"]
