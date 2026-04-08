FROM ghcr.io/berriai/litellm:main-latest

# Install Doppler CLI so LiteLLM can load secrets at runtime.
RUN apk add --no-cache wget ca-certificates && \
    wget -q -t3 "https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key" -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo "https://packages.doppler.com/public/cli/alpine/any-version/main" >> /etc/apk/repositories && \
    apk add --no-cache doppler

COPY litellm/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
