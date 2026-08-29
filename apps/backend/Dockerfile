# ── Stage 1: Build TypeScript ──
FROM node:22-alpine AS builder

WORKDIR /app

# Always install devDependencies in the build stage.
# NODE_ENV=production must never prevent TypeScript/build tooling from being installed.
ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false

COPY package.json package-lock.json tsconfig.json ./

# Do not share the npm cache with other Docker build stages.
# A corrupted/shared BuildKit npm cache was causing EEXIST/ENOENT failures.
RUN npm ci --include=dev \
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

ENV NODE_ENV=production

# Install production dependencies only, without a persistent/shared npm cache.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 \
      --fetch-timeout=300000 \
    && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Environment variables/secrets are injected by Coolify at runtime.
# Do not bake application secrets into the image.

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
