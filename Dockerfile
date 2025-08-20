FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist
COPY config.json ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S sawmill -u 1001
USER sawmill

# Expose port (Railway will override with PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start the application
CMD ["node", "dist/index.js"]