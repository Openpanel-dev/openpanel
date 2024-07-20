FROM --platform=linux/amd64 node:20-slim AS base

ENV PNPM_HOME="/pnpm"

ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

ARG NODE_VERSION=20.15.1

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
COPY apps/docs/package.json apps/docs/package.json
COPY patches patches

# BUILD
FROM base AS build

WORKDIR /app/apps/docs
RUN pnpm install --frozen-lockfile --ignore-scripts

WORKDIR  /app
COPY apps apps
RUN mkdir packages
COPY tooling tooling

WORKDIR /app/apps/docs
RUN pnpm run build

# PROD
FROM base AS prod

WORKDIR /app/apps/docs
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# FINAL
FROM base AS runner

COPY --from=build /app/package.json /app/package.json
COPY --from=prod /app/node_modules /app/node_modules
# Apps
COPY --from=build /app/apps/docs /app/apps/docs
# Apps node_modules
COPY --from=prod /app/apps/docs/node_modules /app/apps/docs/node_modules

WORKDIR /app/apps/docs

EXPOSE 3000

CMD ["pnpm", "start"]