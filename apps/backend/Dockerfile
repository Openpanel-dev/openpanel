FROM --platform=linux/amd64 oven/bun:1.0.5-slim

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ENV PORT=3000

ENV NODE_ENV=production

# For prisma
ARG NODE_VERSION=18
RUN apt update \
    && apt install -y curl \
    && curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n \
    && bash n $NODE_VERSION \
    && rm n \
    && npm install -g n

WORKDIR /app
COPY package.json package.json
COPY apps/backend/package.json apps/backend/package.json
COPY packages/types/package.json packages/types/package.json
COPY bun.lockb bun.lockb
RUN bun install
COPY . .

WORKDIR /app/apps/backend
RUN bunx prisma generate

EXPOSE ${PORT}
CMD ["bun", "start"]

