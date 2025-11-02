# Frontend Dockerfile - Multi-stage build for production
FROM node:22-alpine AS builder

WORKDIR /app

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

# Copy frontend entrypoint that injects runtime env into env.js then runs server
COPY scripts/frontend-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/ || exit 1

# Start entrypoint (generates /dist/env.js from container env, then serves)
CMD ["/entrypoint.sh"]
