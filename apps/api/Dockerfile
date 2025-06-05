ARG NODE_VERSION=20.15.1

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

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Apps
COPY apps/api/package.json ./apps/api/
# Packages
COPY packages/db/package.json packages/db/
COPY packages/geo/package.json packages/geo/
COPY packages/trpc/package.json packages/trpc/
COPY packages/auth/package.json packages/auth/
COPY packages/json/package.json packages/json/
COPY packages/email/package.json packages/email/
COPY packages/queue/package.json packages/queue/
COPY packages/redis/package.json packages/redis/
COPY packages/logger/package.json packages/logger/
COPY packages/common/package.json packages/common/
COPY packages/payments/package.json packages/payments/
COPY packages/sdks/sdk/package.json packages/sdks/sdk/
COPY packages/constants/package.json packages/constants/
COPY packages/validation/package.json packages/validation/
COPY packages/integrations/package.json packages/integrations/
COPY packages/sdks/sdk/package.json packages/sdks/sdk/

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

RUN pnpm codegen && \
    pnpm --filter api run build

# PROD
FROM base AS prod

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# FINAL
FROM base AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=prod /app/node_modules ./node_modules

# Apps
COPY --from=build /app/apps/api ./apps/api

# Packages
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/geo ./packages/geo
COPY --from=build /app/packages/auth ./packages/auth
COPY --from=build /app/packages/trpc ./packages/trpc
COPY --from=build /app/packages/json ./packages/json
COPY --from=build /app/packages/email ./packages/email
COPY --from=build /app/packages/queue ./packages/queue
COPY --from=build /app/packages/redis ./packages/redis
COPY --from=build /app/packages/logger ./packages/logger
COPY --from=build /app/packages/common ./packages/common
COPY --from=build /app/packages/payments ./packages/payments
COPY --from=build /app/packages/sdks/sdk ./packages/sdks/sdk
COPY --from=build /app/packages/constants ./packages/constants
COPY --from=build /app/packages/validation ./packages/validation
COPY --from=build /app/packages/integrations ./packages/integrations
RUN pnpm db:codegen

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["pnpm", "start"]