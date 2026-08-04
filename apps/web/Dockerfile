# syntax=docker/dockerfile:1.7

################################################################################
# Naksha GeoSphere — Frontend (apps/web) multi-stage Dockerfile
#
# Targets:
#   dev     — hot-reload development server (used by compose.dev.yaml)
#   runner  — minimal production runtime using Next.js standalone output
################################################################################

ARG NODE_VERSION=22.13.1-alpine3.21

# ---------------------------------------------------------------------------
# base — shared OS-level setup
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /workspace

# ---------------------------------------------------------------------------
# deps — install workspace dependencies (cached by lockfile)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @naksha/web...

# ---------------------------------------------------------------------------
# dev — development target with hot reload (source is bind-mounted by
# compose.dev.yaml; this image just carries the toolchain + deps)
# ---------------------------------------------------------------------------
FROM deps AS dev
WORKDIR /workspace/apps/web
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

# ---------------------------------------------------------------------------
# builder — production build
# ---------------------------------------------------------------------------
FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
RUN pnpm --filter @naksha/web build

# ---------------------------------------------------------------------------
# runner — minimal production runtime (non-root)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
