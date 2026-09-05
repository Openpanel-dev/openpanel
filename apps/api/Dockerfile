ARG NODE_VERSION=24.19.0
# ADR-016 pins Bun exactly at 1.4.0 (floor >=1.2.23). Its declared home is
# `.bun-version` + this ARG; the file does not exist in the tree yet, so this
# ARG is the single home until it does. Keep the two in sync when it lands.
ARG BUN_VERSION=1.4.0

FROM oven/bun:${BUN_VERSION}-slim AS bun

FROM node:${NODE_VERSION}-slim AS base

# FIX: Bad workaround (https://github.com/nodejs/corepack/issues/612)
ENV COREPACK_INTEGRITY_KEYS=0

RUN corepack enable && apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    libssl3 \
    curl \
    netcat-openbsd \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# M9-003 deleted apps/worker and M9-004 deleted the V1 Fastify boot: this image
# is now ONE process in three shapes, `bun run src/main.ts` under
# ROLE=api|worker|all, running from source with no bundle (ADR-010). The node
# base layer stays only because `pnpm`, `pnpm codegen` and `pnpm rebuild` run in
# it; making the image bun-only is P9.5's "one image" step, with the measured
# before/after it owes.
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Apps
COPY apps/api/package.json ./apps/api/
# Packages — @openpanel/api's workspace closure, exactly.
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/trpc/package.json packages/trpc/
COPY packages/json/package.json packages/json/
COPY packages/email/package.json packages/email/
COPY packages/queue/package.json packages/queue/
COPY packages/redis/package.json packages/redis/
COPY packages/common/package.json packages/common/
COPY packages/payments/package.json packages/payments/
COPY packages/constants/package.json packages/constants/
COPY packages/validation/package.json packages/validation/
COPY patches ./patches

# BUILD
FROM base AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++

WORKDIR /app
RUN pnpm install --frozen-lockfile && \
    pnpm store prune

COPY apps/api ./apps/api
COPY packages ./packages
COPY tooling ./tooling

# No build step: ADR-010 deleted the backend bundler with the V1 boot, so the
# only thing this stage produces is the generated Prisma client.
RUN pnpm codegen

# PROD
FROM base AS prod

ENV npm_config_build_from_source=true

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && \
    pnpm rebuild && \
    pnpm store prune

# FINAL
FROM base AS runner

ENV NODE_ENV=production
ENV npm_config_build_from_source=true

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=prod /app/node_modules ./node_modules

# Apps — src/ is the artifact now; there is no dist/.
COPY --from=build /app/apps/api ./apps/api

# Packages
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/trpc ./packages/trpc
COPY --from=build /app/packages/json ./packages/json
COPY --from=build /app/packages/email ./packages/email
COPY --from=build /app/packages/queue ./packages/queue
COPY --from=build /app/packages/redis ./packages/redis
COPY --from=build /app/packages/common ./packages/common
COPY --from=build /app/packages/payments ./packages/payments
COPY --from=build /app/packages/constants ./packages/constants
COPY --from=build /app/packages/validation ./packages/validation
COPY --from=build /app/tooling/typescript ./tooling/typescript
RUN pnpm db:codegen

WORKDIR /app/apps/api

EXPOSE 3000

# ROLE picks the shape: `api` (or unset) serves HTTP only, `worker` consumes
# only, `all` does both. `config/env.ts` validates it and fails boot loudly on
# an unknown value, which is why this line no longer has a case statement of
# its own.
CMD ["bun", "run", "src/main.ts"]
