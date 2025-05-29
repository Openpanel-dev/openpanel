ARG NODE_VERSION=20.15.1

FROM node:${NODE_VERSION}-slim AS base

# FIX: Bad workaround (https://github.com/nodejs/corepack/issues/612)
ENV COREPACK_INTEGRITY_KEYS=0

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG REDIS_URL
ENV REDIS_URL=$REDIS_URL

ARG CLICKHOUSE_URL
ENV CLICKHOUSE_URL=$CLICKHOUSE_URL

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

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml
COPY pnpm-workspace.yaml pnpm-workspace.yaml
COPY apps/public/package.json apps/public/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/redis/package.json packages/redis/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/constants/package.json packages/constants/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/sdks/sdk/package.json packages/sdks/sdk/package.json
COPY packages/sdks/_info/package.json packages/sdks/_info/package.json

# BUILD
FROM base AS build

WORKDIR /app
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/public apps/public
COPY packages packages
COPY tooling tooling
RUN pnpm db:codegen

WORKDIR /app/apps/public
RUN pnpm run build

# PROD
FROM base AS prod

WORKDIR /app
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# FINAL
FROM base AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=prod /app/node_modules ./node_modules

# Apps
COPY --from=build /app/apps/public ./apps/public

# Packages
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/redis ./packages/redis
COPY --from=build /app/packages/common ./packages/common
COPY --from=build /app/packages/queue ./packages/queue
COPY --from=build /app/packages/constants ./packages/constants
COPY --from=build /app/packages/validation ./packages/validation
COPY --from=build /app/packages/sdks/sdk ./packages/sdks/sdk
COPY --from=build /app/packages/sdks/_info ./packages/sdks/_info

RUN pnpm db:codegen

WORKDIR /app/apps/public

EXPOSE 3000

CMD ["pnpm", "start"]
