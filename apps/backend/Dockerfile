# ── Stage 1: Build TypeScript ──
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --include=dev

COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build

# ── Stage 2: Production runtime ──
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Environment variables are injected by Coolify at runtime.
# Do not copy production secrets into the image.

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
