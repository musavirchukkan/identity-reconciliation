# Multi-stage Docker build for production optimization
FROM node:18-alpine AS base

# Install security updates and dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create app directory and user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S identity -u 1001

WORKDIR /app
CHOWN identity:nodejs /app

# Copy package files for dependency installation
COPY package*.json ./
COPY prisma ./prisma/

# Development stage
FROM base AS development
ENV NODE_ENV=development

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY --chown=identity:nodejs . .

# Generate Prisma client
RUN npx prisma generate

# Switch to non-root user
USER identity

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start development server
CMD ["dumb-init", "npm", "run", "dev"]

# Production dependencies stage
FROM base AS production-deps
ENV NODE_ENV=production

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS build
ENV NODE_ENV=production

# Install all dependencies for building
RUN npm ci

# Copy source code
COPY --chown=identity:nodejs . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production stage
FROM base AS production
ENV NODE_ENV=production
ENV PORT=3000

# Copy production dependencies
COPY --from=production-deps --chown=identity:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=build --chown=identity:nodejs /app/dist ./dist
COPY --from=build --chown=identity:nodejs /app/prisma ./prisma
COPY --from=build --chown=identity:nodejs /app/package*.json ./

# Generate Prisma client for production
RUN npx prisma generate

# Switch to non-root user
USER identity

# Expose port
EXPOSE 3000

# Add labels for better container management
LABEL maintainer=""
LABEL version="1.0.0"
LABEL description="Identity Reconciliation Service"

# Health check with proper timeout and retries
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/app.js"]