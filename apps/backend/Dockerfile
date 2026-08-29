# ── Stage 1: Build TypeScript ──
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./

# npm registry/network can occasionally reset during Docker builds.
# Use BuildKit cache + npm retries/timeouts so transient ECONNRESET errors
# do not fail the deployment immediately.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 \
      --fetch-timeout=300000

COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build

# ── Stage 2: Production runtime ──
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 \
      --fetch-timeout=300000 \
    && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Environment variables are injected by Coolify at runtime.
# Do not copy production secrets into the image.

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
