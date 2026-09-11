# API image — one image, two roles (ROLE=api | worker | all).
#
# Rewritten for M15-203 against the per-layer measurements in
# docs/DOCKER_SLIMMING.md (M14-203). Every cut below is one that document
# measured AND boot-tested; nothing it did not measure is attempted, and its
# "not worth it" list (§9) is treated as binding — the geo databases stay
# baked in, `netcat-openbsd` stays, the api's openssl/libssl3 security upgrade
# stays, and the base image is not up for discussion (see below).
#
# ADR-016 pins Bun exactly at 1.4.0 (floor >=1.2.23). Its declared home is
# `.bun-version` + this ARG; the file does not exist in the tree yet, so this
# ARG is the single home until it does. Keep the two in sync when it lands.
ARG BUN_VERSION=1.4.0

# BASE — oven/bun:${BUN_VERSION}-slim. DECIDED, not re-evaluated: Carl closed
# alpine and distroless on 2026-09-08 ("fuck it, lets keep slim"). Distroless
# has no shell and all three shipped compose files start this image with
# `sh -c "…"`; alpine is musl against a `debian-openssl-3.0.x` Prisma engine.
#
# The apt set is the one the running container needs, not the one the build
# needs: `curl` backs the CMD-SHELL HEALTHCHECKs in all three compose files and
# `netcat-openbsd` backs self-hosting/coolify.yml's `nc -z` wait loops, and
# both exec *inside* the container. `ca-certificates`, `openssl` and `libssl3`
# are already present in the base — naming them buys the Debian-Security
# upgrade of libssl3t64/openssl (measured: 3.5.6 -> 3.5.7, 3,416,908 B
# compressed). DOCKER_SLIMMING.md §8 row 4 files dropping them as a security
# decision for Carl, not a size one, and recommends keeping the upgrade.
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

# TOOLCHAIN — the full workspace, installed once WITH devDependencies, because
# codegen needs them (core's `tar` for scripts/download-geo.ts, db's `prisma`
# CLI for schema generation). Neither this stage nor `build` ships.
#
# The whole tree is copied rather than a hand-maintained list of manifests:
# a workspace install has to see every member's `package.json` anyway, Docker's
# COPY cannot glob a directory level, and the old per-package list failed
# SILENTLY when it drifted (a missing manifest omitted a package from
# node_modules and surfaced as a runtime "Cannot find module").
#
# `bunfig.toml` is copied with the tree on purpose: it carries
# `[install] ignoreScripts = true` (ADR-014 amendment 2 — no dependency build
# script has ever run in an image this repo ships) and `linker = "isolated"`.
# Both install lines name `--linker=isolated` explicitly anyway, so the layout
# is a property of the command and not only of a file.
#
# No python3/make/g++: with `ignoreScripts` nothing compiles at install time,
# and the two native addons this image needs (@node-rs/argon2, sharp) resolve
# to prebuilt packages.
FROM base AS toolchain

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --linker=isolated

# BUILD — the Prisma client and core's geo/ASN data. No JS build step: ADR-010
# deleted the backend bundler with the V1 boot, so the only thing this stage
# produces is generated *source* under packages/, which `prod-deps` inherits.
FROM toolchain AS build

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN bun run codegen

# PROD-DEPS — the node_modules that ships, and the only place anything is
# deleted. Derived from `build` so the generated output above survives, but
# with every node_modules directory removed first: a `--production` install
# must not be a filtered view of a devDependency-laden tree, it must be an
# install that was production-only from the start.
#
# `--filter '@openpanel/api'` is the closure boundary. Verified on Bun 1.4.0:
# it follows `workspace:` edges TRANSITIVELY (api -> core -> db ->
# redis/email/payments) and installs nothing outside them. It fails visibly
# rather than silently — a filter that matches nothing leaves the app unable to
# resolve its imports, and tooling/gates/p13-images.sh boots the image and
# asserts /healthz/ready before it passes.
FROM build AS prod-deps

RUN find . -maxdepth 4 -type d -name node_modules -prune -exec rm -rf {} + && \
    bun install --production --frozen-lockfile --linker=isolated --filter '@openpanel/api'

# TRIM — the four measured, boot-tested cuts from DOCKER_SLIMMING.md's
# "What chore C6 should implement" list. They run HERE, in a build stage, and
# never in the runtime stage: deleting a file in the final stage adds a
# whiteout and makes the image LARGER (§9.3), so the only way a removal shrinks
# anything is for the bytes never to be COPYed forward.
#
#   1. The musl-only native store entries. The base is glibc, so a package
#      whose name says `musl` is dead by construction on every arch this image
#      is built for; the glob is what §8 row 3 asks for instead of a list of
#      content-hashed store keys, and it is arch-independent for the same
#      reason (an arm64 build resolves `-linux-arm64`, never `-linuxmusl-*`).
#      §2.4 proved sharp and @node-rs/argon2 still load without them.
#   2/3. apps/api/scripts (97.4% of that layer: two mock fixtures, 15.5 MB,
#      whose only caller is the non-production `test:manage` script) and
#      apps/api/e2e. Removed here rather than by splitting the COPY below,
#      which is what keeps that COPY drift-proof.
#   4. `*.test.ts` under packages/, and packages/sdks — nothing in the api's
#      closure imports an SDK (grepped 2026-09-11).
RUN find /app/node_modules/.bun -maxdepth 1 -name '*musl*' -prune -exec rm -rf {} + && \
    rm -rf /app/apps/api/scripts /app/apps/api/e2e && \
    find /app/packages -type f -name '*.test.ts' -delete && \
    rm -rf /app/packages/sdks

# RUNTIME — oven/bun:${BUN_VERSION}-slim, nothing but the app: the isolated
# node_modules and the source (with `build`'s generated output baked in), both
# from `prod-deps` so the store and the per-package symlinks into it come from
# one install and stay consistent.
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

# Apps — src/ is the artifact now; there is no dist/.
COPY --from=prod-deps --chown=bun:bun /app/apps/api ./apps/api

COPY --from=prod-deps --chown=bun:bun /app/packages ./packages
COPY --from=prod-deps --chown=bun:bun /app/tooling/typescript ./tooling/typescript

# The shipped start command is
# `cd /app/packages/db && bunx prisma@6.14.0 migrate deploy`, so the schema and
# the migrations directory are load-bearing image content, not source-tree
# detail. Assert them at build time — the alternative is a self-hoster finding
# out at container start. The code migrations' entrypoint is asserted for the
# same reason: it moved to `packages/db/scripts/migrate-code.ts` in M15-204,
# and `packages/core/scripts/migrate-code.ts` — which the shipped compose files
# still name — now forwards to it, so both are load-bearing until those files
# are updated.
RUN test -f /app/packages/db/prisma/schema.prisma && \
    test -d /app/packages/db/prisma/migrations && \
    test -f /app/packages/db/scripts/migrate-code.ts && \
    test -d /app/packages/db/src/code-migrations && \
    test -f /app/packages/core/scripts/migrate-code.ts

USER bun

WORKDIR /app/apps/api

EXPOSE 3000

# ROLE picks the shape: `api` (or unset) serves HTTP only, `worker` consumes
# only, `all` does both. `config/env.ts` validates it and fails boot loudly on
# an unknown value, which is why this line no longer has a case statement of
# its own.
CMD ["bun", "run", "src/main.ts"]
