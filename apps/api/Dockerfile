# Dockerfile that builds the web app only
ARG NODE_VERSION=20.15.1
FROM --platform=linux/amd64 node:${NODE_VERSION}-slim AS base

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ENV PNPM_HOME="/pnpm"

ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

RUN apt update \
    && apt install -y curl python3 make g++ \
    && curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n \
    && bash n $NODE_VERSION \
    && rm n \
    && npm install -g n \
    && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml
COPY pnpm-workspace.yaml pnpm-workspace.yaml
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/redis/package.json packages/redis/package.json
COPY packages/trpc/package.json packages/trpc/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/constants/package.json packages/constants/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/sdks/sdk/package.json packages/sdks/sdk/package.json
COPY patches patches

# BUILD
FROM base AS build

WORKDIR /app/apps/api
RUN pnpm install --frozen-lockfile

WORKDIR  /app
COPY apps/api apps/api
COPY packages packages
COPY tooling tooling
RUN pnpm db:codegen

WORKDIR /app/apps/api
RUN pnpm run build

# PROD
FROM base AS prod

WORKDIR /app/apps/api
RUN pnpm install --frozen-lockfile --prod

# FINAL
FROM base AS runner

COPY --from=build /app/package.json /app/package.json
COPY --from=prod /app/node_modules /app/node_modules

# Apps
COPY --from=build /app/apps/api /app/apps/api

# Apps node_modules
COPY --from=prod /app/apps/api/node_modules /app/apps/api/node_modules

# Packages
COPY --from=build /app/packages/db /app/packages/db
COPY --from=build /app/packages/redis /app/packages/redis
COPY --from=build /app/packages/trpc /app/packages/trpc
COPY --from=build /app/packages/queue /app/packages/queue
COPY --from=build /app/packages/common /app/packages/common

# Packages node_modules
COPY --from=prod /app/packages/db/node_modules /app/packages/db/node_modules
COPY --from=prod /app/packages/redis/node_modules /app/packages/redis/node_modules
COPY --from=prod /app/packages/trpc/node_modules /app/packages/trpc/node_modules
COPY --from=prod /app/packages/queue/node_modules /app/packages/queue/node_modules
COPY --from=prod /app/packages/common/node_modules /app/packages/common/node_modules

RUN pnpm db:codegen

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["pnpm", "start"]