# Frontend Dockerfile - Multi-stage build for production
FROM node:22-alpine AS builder

# Install Doppler CLI
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

WORKDIR /app

# Accept Doppler token as build arg for accessing secrets during build
ARG DOPPLER_TOKEN
ENV DOPPLER_TOKEN=$DOPPLER_TOKEN
ENV DOPPLER_PROJECT=aishacrm
ENV DOPPLER_CONFIG=dev

# Accept build arguments for environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_AISHACRM_BACKEND_URL
ARG VITE_CURRENT_BRANCH=main
ARG VITE_SYSTEM_TENANT_ID
ARG VITE_USER_HEARTBEAT_INTERVAL_MS
ARG APP_BUILD_VERSION=dev-local

# Make them available to the build process
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_AISHACRM_BACKEND_URL=$VITE_AISHACRM_BACKEND_URL
ENV VITE_CURRENT_BRANCH=$VITE_CURRENT_BRANCH
ENV VITE_SYSTEM_TENANT_ID=$VITE_SYSTEM_TENANT_ID
ENV VITE_USER_HEARTBEAT_INTERVAL_MS=$VITE_USER_HEARTBEAT_INTERVAL_MS
ENV APP_BUILD_VERSION=$APP_BUILD_VERSION


# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev deps needed for Vite build)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the app with increased memory limit
ENV NODE_OPTIONS=--max-old-space-size=896
RUN npm run build

# Production stage - serve static files
FROM node:22-alpine AS runner

WORKDIR /app

# Install serve globally
RUN npm install -g serve@14.2.5

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Remove placeholder env-config.js so entrypoint can generate fresh one
RUN rm -f /app/dist/env-config.js

# Bake build version into image (will be picked up by entrypoint if env var not set)
ARG VITE_APP_BUILD_VERSION=dev-local
RUN echo "${VITE_APP_BUILD_VERSION}" > /app/VERSION

# Copy frontend entrypoint
COPY frontend-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/ || exit 1

# Start entrypoint (serves static files)
CMD ["/entrypoint.sh"]
