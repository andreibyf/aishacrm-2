# Backend Dockerfile - Multi-stage build for production
FROM node:22-alpine AS builder

# Install Doppler CLI
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

WORKDIR /app

# Note: Build context is the repo root (set in docker-compose). Use explicit paths.

# Copy backend package files and install production deps
COPY backend/package*.json ./backend/
# Ensure production-only dependencies and faster, reproducible installs
RUN cd backend && npm ci --omit=dev --prefer-offline --no-audit --fund=false

# Copy backend source code
COPY backend ./backend

# Copy Braid SDK sources into image
COPY braid-llm-kit ./braid-llm-kit

# Install local Braid SDK into backend (provides @braid/sdk in node_modules)
RUN cd backend && npm install --omit=dev ../braid-llm-kit

# Production stage
FROM node:22-alpine AS runner

# Install Doppler CLI in production stage
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

# Build-time flags to control Chromium/Puppeteer footprint
ARG USE_SYSTEM_CHROMIUM=false
ARG PUPPETEER_SKIP_DOWNLOAD=1

# App lives in /app/backend for clarity
WORKDIR /app/backend

# Install system Chromium only when explicitly requested
RUN if [ "$USE_SYSTEM_CHROMIUM" = "true" ]; then \
    apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont; \
  fi

# Hint Puppeteer to use system Chromium when present; otherwise skip bundled download
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=${PUPPETEER_SKIP_DOWNLOAD}

# Copy backend node_modules from builder
COPY --from=builder /app/backend/node_modules ./node_modules

# Copy backend application files
COPY --from=builder /app/backend .

# Also include Braid SDK sources for runtime access to .braid files
COPY --from=builder /app/braid-llm-kit /app/braid-llm-kit

# Set environment
ENV NODE_ENV=production

# Force IPv4-only DNS resolution (Railway doesn't support IPv6 for external connections)
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

# Expose port (Railway will set PORT env var)
EXPOSE 3001

# Health check using the port from env or default
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3001}/health || exit 1

# Start the server
CMD ["node", "server.js"]
