# Base Image
FROM node:20-alpine

# Set working dir
WORKDIR /app

# Copy package files
COPY package*.json ./

RUN npm ci --omit=dev

# Copy all source folders
COPY src/ ./src/
COPY public/ ./public/
COPY server.js ./

# Set production environment
ENV NODE_ENV=production

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 8080

# Health check against the existing /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Start server
CMD ["node", "server.js"]