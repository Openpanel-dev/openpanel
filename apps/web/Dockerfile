FROM --platform=linux/amd64 node:20-slim AS base

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG NEXTAUTH_SECRET
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET

ARG NEXTAUTH_URL
ENV NEXTAUTH_URL=$NEXTAUTH_URL

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

FROM base AS build
COPY . /app
WORKDIR /app/apps/web
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm dlx prisma generate
RUN pnpm run build

FROM base AS prod
COPY . /app
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS runner
COPY --from=build /app/package.json /app/package.json
COPY --from=prod /app/node_modules /app/node_modules
COPY --from=build /app/apps/web /app/apps/web
COPY --from=prod /app/apps/web/node_modules /app/apps/web/node_modules
WORKDIR /app/apps/web
RUN pnpm dlx prisma generate
EXPOSE 3000
CMD [ "pnpm", "start" ]