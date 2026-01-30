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

# Install Doppler CLI for runtime secret injection
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler wget

# Copy package files and install production dependencies only
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev

# Copy backend application files from build stage
COPY --from=build /app ./

# Cache-busting mechanism for braid-llm-kit
# This ARG will be set to the git commit SHA during GitHub Actions build
# Changing this value will invalidate Docker cache from this point forward
ARG CACHE_BUST=default
RUN echo "Cache bust value: ${CACHE_BUST}" > /tmp/cache-bust.txt

# Copy braid-llm-kit directory from repository root
# This step will be re-executed whenever CACHE_BUST changes
COPY braid-llm-kit ./braid-llm-kit

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
ENTRYPOINT ["./entrypoint.sh"]

# Default command to start the server
CMD ["node", "server.js"]
