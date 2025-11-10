# Backend Dockerfile - Multi-stage build for production
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files from backend directory
COPY backend/package*.json ./

# Install dependencies (only production needed for backend)
RUN npm ci --omit=dev

# Copy backend source code
COPY backend/ .

# Copy braid-llm-kit from root (needed for module loader)
COPY braid-llm-kit/ ../braid-llm-kit/

# Copy root package.json and install dependencies for braid-llm-kit tools
WORKDIR /braid-llm-kit
COPY package*.json ./
RUN npm ci

WORKDIR /app

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY --from=builder /app .

# Copy braid-llm-kit toolkit with dependencies
COPY --from=builder /braid-llm-kit ../braid-llm-kit

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
