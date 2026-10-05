# API image — one image, two roles (ROLE=api, worker or all).
#
# Bun is pinned exactly; keep this ARG in sync with `.bun-version`.
ARG BUN_VERSION=1.4.0

# BASE — oven/bun:${BUN_VERSION}-slim. Not distroless (no shell, and the compose files start this image with
# `sh -c "…"`) and not alpine (musl against a `debian-openssl-3.0.x` Prisma engine).
#
# The apt set is what the running container needs: `curl` backs the compose HEALTHCHECKs and `netcat-openbsd` backs
# self-hosting/coolify.yml's `nc -z` wait loops, both exec inside the container. `ca-certificates`, `openssl` and
# `libssl3` are already in the base; naming them pulls the Debian-Security libssl3t64/openssl upgrade.
FROM oven/bun:${BUN_VERSION}-slim AS base

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    libssl3 \
    curl \
    netcat-openbsd \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# TOOLCHAIN — the full workspace, installed once WITH devDependencies, because codegen needs them (core's `tar` for
# scripts/download-geo.ts, db's `prisma` CLI for schema generation). Neither this stage nor `build` ships.
#
# The whole tree is copied rather than a list of manifests: a workspace install has to see every member's
# `package.json`, Docker's COPY cannot glob a directory level, and a hand-maintained list failed SILENTLY when it
# drifted (a missing manifest surfaced as a runtime "Cannot find module").
#
# `bunfig.toml` is copied with the tree on purpose: it carries `[install] ignoreScripts = true` and
# `linker = "isolated"`. Both install lines name `--linker=isolated` too, so the layout is a property of the command.
#
# No python3/make/g++: with `ignoreScripts` nothing compiles at install time, and the native addons this image needs
# (@node-rs/argon2, sharp) resolve to prebuilt packages.
FROM base AS toolchain

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --linker=isolated

# BUILD — the Prisma client and core's geo/ASN data. There is no JS build step: the only output is generated
# *source* under packages/, which `prod-deps` inherits.
FROM toolchain AS build

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN bun run codegen

# PROD-DEPS — the node_modules that ships, and the only place anything is deleted. Derived from `build` so the
# generated output survives, with every node_modules removed first: a `--production` install must be production-only
# from the start, not a filtered view of a devDependency-laden tree.
#
# `--filter '@openpanel/api'` is the closure boundary: it follows `workspace:` edges transitively (api -> core -> db ->
# redis/email/payments) and installs nothing outside them. A filter that matches nothing leaves the app unable to
# resolve its imports, which tooling/gates/p13-images.sh catches by booting the image.
FROM build AS prod-deps

RUN find . -maxdepth 4 -type d -name node_modules -prune -exec rm -rf {} + && \
    bun install --production --frozen-lockfile --linker=isolated --filter '@openpanel/api'

# TRIM — cuts that run HERE, in a build stage, never in the runtime stage: deleting a file in the final stage adds a
# whiteout and makes the image LARGER, so a removal only shrinks anything if the bytes are never COPYed forward.
#
#   1. The musl-only native store entries. The base is glibc, so a package whose name says `musl` is dead on every
#      arch this image is built for; the glob is arch-independent (an arm64 build resolves `-linux-arm64`).
#   2/3. apps/api/scripts (two mock fixtures, 15.5 MB, only used by the non-production `test:manage` script) and
#      apps/api/e2e. Removed here rather than by splitting the COPY below, which keeps that COPY drift-proof.
#   4. `*.test.ts` under packages/, and packages/sdks: nothing in the api's closure imports an SDK.
RUN find /app/node_modules/.bun -maxdepth 1 -name '*musl*' -prune -exec rm -rf {} + && \
    rm -rf /app/apps/api/scripts /app/apps/api/e2e && \
    find /app/packages -type f -name '*.test.ts' -delete && \
    rm -rf /app/packages/sdks

# RUNTIME — oven/bun:${BUN_VERSION}-slim, nothing but the app: the isolated node_modules and the source (with
# `build`'s generated output), both from `prod-deps` so the store and the per-package symlinks come from one install.
FROM base AS runtime

ENV NODE_ENV=production

# The image runs as `bun` (uid 1000, created by the base image), so HOME must
# point somewhere that user owns. Docker does not move HOME with USER, and the
# start command in all three compose files runs `bunx prisma@6.14.0 migrate
# deploy`, which writes to bun's install cache under HOME.
ENV HOME=/home/bun

WORKDIR /app

COPY --from=prod-deps --chown=bun:bun /app/package.json ./
COPY --from=prod-deps --chown=bun:bun /app/node_modules ./node_modules

# Apps — src/ is the artifact; there is no dist/.
COPY --from=prod-deps --chown=bun:bun /app/apps/api ./apps/api

COPY --from=prod-deps --chown=bun:bun /app/packages ./packages
COPY --from=prod-deps --chown=bun:bun /app/tooling/typescript ./tooling/typescript

# The shipped start command is `cd /app/packages/db && bunx prisma@6.14.0 migrate deploy`, so the schema and the
# migrations directory are load-bearing image content. Assert them at build time rather than let a self-hoster find
# out at container start. The code migrations' entrypoint is asserted too: `packages/core/scripts/migrate-code.ts`,
# which the shipped compose files name, forwards to `packages/db/scripts/migrate-code.ts`, so both are load-bearing.
RUN test -f /app/packages/db/prisma/schema.prisma && \
    test -d /app/packages/db/prisma/migrations && \
    test -f /app/packages/db/scripts/migrate-code.ts && \
    test -d /app/packages/db/src/code-migrations && \
    test -f /app/packages/core/scripts/migrate-code.ts

USER bun

WORKDIR /app/apps/api

EXPOSE 3000

# ROLE picks the shape: `api` (or unset) serves HTTP only, `worker` consumes only, `all` does both. `config/env.ts`
# fails boot loudly on an unknown value.
CMD ["bun", "run", "src/main.ts"]
