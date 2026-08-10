# Naksha GeoSphere - Frontend Dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Development stage (compose.dev.yaml -> web build.target: dev).
# Reuses the `deps` stage so /app/node_modules (incl. `next`) is present.
# Source is bind-mounted by the dev overlay; DO NOT bind-mount ./frontend/node_modules
# here or it would hide this stage's installed dependencies (root cause of "next: not found").
FROM deps AS dev
ENV NODE_ENV=development
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Production runtime
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
