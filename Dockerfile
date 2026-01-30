# Update to Dockerfile to set environment variables for braid-llm-kit

# Base image
FROM node:14

# Set working directory
WORKDIR /app

# Copy braid-llm-kit
COPY braid-llm-kit /app/braid-llm-kit

# Install backend dependencies
COPY backend/package.json /app/backend/package.json
RUN cd backend && npm install

# Additional steps...
# (Your current Dockerfile instructions)

# Ensure that braid-llm-kit is properly accessible at runtime
# Environment variables (if needed)
ENV BRAID_LLM_KIT_PATH /app/braid-llm-kit

# Exposing ports and other configurations as needed
EXPOSE 3000
CMD ["node", "backend/index.js"]