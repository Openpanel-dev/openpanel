ARG NODE_VERSION=20.15.1

FROM --platform=linux/amd64 node:${NODE_VERSION}-slim AS base

ENV SKIP_ENV_VALIDATION="1"

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG ENABLE_INSTRUMENTATION_HOOK
ENV ENABLE_INSTRUMENTATION_HOOK=$ENABLE_INSTRUMENTATION_HOOK

ENV PNPM_HOME="/pnpm"

ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

RUN apt update \
    && apt install -y curl \
    && curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n \
    && bash n $NODE_VERSION \
    && rm n \
    && npm install -g n

WORKDIR /app

ARG CACHE_BUST
RUN echo "CACHE BUSTER: $CACHE_BUST"

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml
COPY pnpm-workspace.yaml pnpm-workspace.yaml
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/redis/package.json packages/redis/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/constants/package.json packages/constants/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/sdks/sdk/package.json packages/sdks/sdk/package.json

# BUILD
FROM base AS build

WORKDIR /app/apps/dashboard
RUN pnpm install --frozen-lockfile --ignore-scripts

WORKDIR  /app
COPY apps/dashboard apps/dashboard
COPY packages packages
COPY tooling tooling
RUN pnpm db:codegen

WORKDIR /app/apps/dashboard

# Will be replaced on runtime
ENV NEXT_PUBLIC_DASHBOARD_URL="__NEXT_PUBLIC_DASHBOARD_URL__"
ENV NEXT_PUBLIC_API_URL="__NEXT_PUBLIC_API_URL__"
# Check entrypoint for this little fellow
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_eW9sby5jb20k"

RUN pnpm run build

# PROD
FROM base AS prod

WORKDIR /app/apps/dashboard
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# FINAL
FROM base AS runner

COPY --from=build /app/package.json /app/package.json
COPY --from=prod /app/node_modules /app/node_modules
# Apps
COPY --from=build /app/apps/dashboard /app/apps/dashboard
# Apps node_modules
COPY --from=prod /app/apps/dashboard/node_modules /app/apps/dashboard/node_modules
# Packages
COPY --from=build /app/packages/db /app/packages/db
COPY --from=build /app/packages/redis /app/packages/redis
COPY --from=build /app/packages/common /app/packages/common
COPY --from=build /app/packages/queue /app/packages/queue
COPY --from=build /app/packages/constants /app/packages/constants
COPY --from=build /app/packages/validation /app/packages/validation
COPY --from=build /app/packages/sdks/sdk /app/packages/sdks/sdk
# Packages node_modules
COPY --from=prod /app/packages/db/node_modules /app/packages/db/node_modules
COPY --from=prod /app/packages/redis/node_modules /app/packages/redis/node_modules
COPY --from=prod /app/packages/common/node_modules /app/packages/common/node_modules
COPY --from=prod /app/packages/validation/node_modules /app/packages/validation/node_modules
COPY --from=prod /app/packages/queue/node_modules /app/packages/queue/node_modules

RUN pnpm db:codegen

WORKDIR /app/apps/dashboard

EXPOSE 3000

# CMD ["pnpm", "start"]
COPY --from=build /app/apps/dashboard/entrypoint.sh /usr/bin/
RUN chmod +x /usr/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh", "pnpm", "start"]