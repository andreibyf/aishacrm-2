# Backend Dockerfile - Multi-stage build for production
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production needed for backend)
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY --from=builder /app .

# Set environment
ENV NODE_ENV=production

# Expose port (Railway will set PORT env var)
EXPOSE 3001

# Health check using the port from env or default
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3001}/health || exit 1

# Start the server
CMD ["node", "server.js"]
