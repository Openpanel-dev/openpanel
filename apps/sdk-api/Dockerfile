# Dockerfile that builds the web app only

FROM --platform=linux/amd64 node:20-slim AS base

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG CLICKHOUSE_DB 
ENV CLICKHOUSE_DB=$CLICKHOUSE_DB

ARG CLICKHOUSE_PASSWORD 
ENV CLICKHOUSE_PASSWORD=$CLICKHOUSE_PASSWORD

ARG CLICKHOUSE_URL 
ENV CLICKHOUSE_URL=$CLICKHOUSE_URL

ARG CLICKHOUSE_USER 
ENV CLICKHOUSE_USER=$CLICKHOUSE_USER

ARG REDIS_URL
ENV REDIS_URL=$REDIS_URL

ENV PNPM_HOME="/pnpm"

ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

ARG NODE_VERSION=20

RUN apt update \
    && apt install -y curl \
    && curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n \
    && bash n $NODE_VERSION \
    && rm n \
    && npm install -g n

WORKDIR /app

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml
COPY pnpm-workspace.yaml pnpm-workspace.yaml
COPY apps/sdk-api/package.json apps/sdk-api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/redis/package.json packages/redis/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/types/package.json packages/types/package.json

# BUILD
FROM base AS build

WORKDIR /app/apps/sdk-api
RUN pnpm install --frozen-lockfile

WORKDIR  /app
COPY apps apps
COPY packages packages
COPY tooling tooling
RUN pnpm db:codegen

WORKDIR /app/apps/sdk-api
RUN pnpm run build

# PROD
FROM base AS prod

WORKDIR /app/apps/sdk-api
RUN pnpm install --frozen-lockfile --prod

# FINAL
FROM base AS runner

COPY --from=build /app/package.json /app/package.json
COPY --from=prod /app/node_modules /app/node_modules

# Apps
COPY --from=build /app/apps/sdk-api /app/apps/sdk-api

# Apps node_modules
COPY --from=prod /app/apps/sdk-api/node_modules /app/apps/sdk-api/node_modules

# Packages
COPY --from=build /app/packages/db /app/packages/db
COPY --from=build /app/packages/redis /app/packages/redis
COPY --from=build /app/packages/queue /app/packages/queue
COPY --from=build /app/packages/common /app/packages/common

# Packages node_modules
COPY --from=prod /app/packages/db/node_modules /app/packages/db/node_modules
COPY --from=prod /app/packages/redis/node_modules /app/packages/redis/node_modules
COPY --from=prod /app/packages/queue/node_modules /app/packages/queue/node_modules
COPY --from=prod /app/packages/common/node_modules /app/packages/common/node_modules

RUN pnpm db:codegen

WORKDIR /app/apps/sdk-api

EXPOSE 3000

CMD ["pnpm", "start"]