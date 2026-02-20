# Backend Dockerfile for AiSHA CRM
# Node.js backend with Braid integration

# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files for dependency installation
COPY backend/package*.json ./

# Install ALL dependencies (including dev dependencies for potential build steps)
RUN npm ci

# Copy backend source code
COPY backend/ ./

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -S app && adduser -S app -G app

# Install Chromium for Puppeteer PDF generation + Doppler CLI for runtime secret injection
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler wget chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy package files and install production dependencies only
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev

# Copy backend application files from build stage
COPY --from=build /app ./

# Copy shared contracts (repo root) for runtime imports
COPY shared /shared

# Cache-busting mechanism for braid-llm-kit
# This ARG will be set to the git commit SHA during GitHub Actions build
# Changing this value will invalidate Docker cache from this point forward
ARG CACHE_BUST=default
RUN echo "Cache bust value: ${CACHE_BUST}" > /tmp/cache-bust.txt

# Copy braid-llm-kit to /app for route imports (../../braid-llm-kit from /app/routes/)
COPY braid-llm-kit ./braid-llm-kit

# Copy braid-llm-kit to root level for lib/braid imports (../../../braid-llm-kit from /app/lib/braid/)
COPY braid-llm-kit /braid-llm-kit

# Copy PEP runtime to root level for route imports (../../pep from /app/routes/)
COPY pep /pep

# Verify braid-llm-kit was copied correctly in both locations
RUN ls -la ./braid-llm-kit/sdk/index.js || { echo "ERROR: /app/braid-llm-kit/sdk/index.js not found!"; exit 1; }
RUN ls -la /braid-llm-kit/sdk/index.js || { echo "ERROR: /braid-llm-kit/sdk/index.js not found!"; exit 1; }

# Verify PEP runtime exists
RUN ls -la /pep/runtime/pepRuntime.js || { echo "ERROR: /pep/runtime/pepRuntime.js not found!"; exit 1; }

# Symlink /backend → /app so that pep/runtime imports (../../backend/lib/...) resolve correctly
RUN ln -s /app /backend

# Verify shared contracts exist for agent registry imports
RUN ls -la /shared/contracts/agents.js || { echo "ERROR: /shared/contracts/agents.js not found!"; exit 1; }

# Copy entrypoint script and make it executable
COPY backend/docker-entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Change ownership to non-root user
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Expose backend port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

# Use entrypoint for Doppler integration
# Use sh to execute entrypoint to avoid permission issues after symlink changes
ENTRYPOINT ["sh", "./entrypoint.sh"]

# Default command to start the server
CMD ["node", "server.js"]
