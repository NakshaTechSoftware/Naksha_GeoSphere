# Naksha GeoSphere - Frontend Dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
# next@15.5.22 declares peerOptional @playwright/test@^1.51.1 but the lockfile
# pins 1.49.1 (used only for e2e tests), so strict resolution fails in the
# clean container build. legacy-peer-deps matches how the local install works.
RUN npm ci --legacy-peer-deps

# Development target (hot reload; source is bind-mounted by compose.dev.yaml)
FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}

# MSG91 OTP Widget client-side identifiers — safe to inline into the
# browser bundle (they are NOT secrets; the server-side MSG91 Authkey is
# never passed to this image).
ARG NEXT_PUBLIC_MSG91_WIDGET_ID
ARG NEXT_PUBLIC_MSG91_WIDGET_TOKEN
ENV NEXT_PUBLIC_MSG91_WIDGET_ID=${NEXT_PUBLIC_MSG91_WIDGET_ID}
ENV NEXT_PUBLIC_MSG91_WIDGET_TOKEN=${NEXT_PUBLIC_MSG91_WIDGET_TOKEN}

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
