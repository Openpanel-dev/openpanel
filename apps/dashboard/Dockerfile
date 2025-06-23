ARG NODE_VERSION=20.15.1

FROM node:${NODE_VERSION}-slim AS base

# FIX: Bad workaround (https://github.com/nodejs/corepack/issues/612)
ENV COREPACK_INTEGRITY_KEYS=0

ENV SKIP_ENV_VALIDATION="1"

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG ENABLE_INSTRUMENTATION_HOOK
ENV ENABLE_INSTRUMENTATION_HOOK=$ENABLE_INSTRUMENTATION_HOOK

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install necessary dependencies for prisma
RUN apt-get update && apt-get install -y \
    openssl \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

ARG CACHE_BUST
RUN echo "CACHE BUSTER: $CACHE_BUST"

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml
COPY pnpm-workspace.yaml pnpm-workspace.yaml
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/json/package.json packages/json/package.json
COPY packages/redis/package.json packages/redis/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/constants/package.json packages/constants/package.json
COPY packages/payments/package.json packages/payments/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/sdks/sdk/package.json packages/sdks/sdk/package.json

# BUILD
FROM base AS build

WORKDIR /app
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/dashboard apps/dashboard
COPY packages packages
COPY tooling tooling
RUN pnpm db:codegen

WORKDIR /app/apps/dashboard

# Will be replaced on runtime
ENV NEXT_PUBLIC_DASHBOARD_URL="__NEXT_PUBLIC_DASHBOARD_URL__"
ENV NEXT_PUBLIC_API_URL="__NEXT_PUBLIC_API_URL__"
ENV NEXT_PUBLIC_SELF_HOSTED="__NEXT_PUBLIC_SELF_HOSTED__"

RUN pnpm run build

# RUNNER
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Set the correct permissions for the entire /app directory
COPY --from=build --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

# Copy and set permissions for the entrypoint script
COPY --from=build --chown=nextjs:nodejs /app/apps/dashboard/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT [ "/app/entrypoint.sh", "node", "/app/apps/dashboard/server.js"]