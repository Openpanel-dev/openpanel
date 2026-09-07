# ADR-016 pins Bun exactly at 1.4.0 (floor >=1.2.23). Its declared home is
# `.bun-version` + this ARG; the file does not exist in the tree yet, so this
# ARG is the single home until it does. Keep the two in sync when it lands.
ARG BUN_VERSION=1.4.0

# P13 (ADR-014) made `bun install` the installer for the whole repo, so this
# image installs with bun and nothing else: no second package manager, no
# Node-side installer shim, no lockfile or workspace file bun does not read.
# ADR-014 Problems §4 already ruled that a bun-base image cannot bootstrap
# another installer, and its answer is the shape below — ONE full-workspace
# install per image, from the root manifest bun.lock was resolved against.
#
# `bunfig.toml` is copied with the tree on purpose: it carries
# `[install] ignoreScripts = true` (ADR-014 amendment 2 — no dependency build
# script has ever run in an image this repo ships) and `linker = "isolated"`.
# The two install lines below name `--linker=isolated` explicitly anyway, so
# the layout is a property of the command and not only of a file.

# BASE — OS packages every stage needs. curl and netcat-openbsd are here for
# the docker-compose HEALTHCHECKs, which exec *inside* the running container,
# so they must reach the runtime stage too, not just the install stages.
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

# TOOLCHAIN — the full workspace, installed once with devDependencies, because
# codegen needs them (core's `tar` for scripts/download-geo.ts, db's `prisma`
# CLI for schema generation). Neither this stage nor `build` ships.
#
# The whole tree is copied rather than a hand-maintained list of manifests:
# a workspace install has to see every member's `package.json` anyway, Docker's
# COPY cannot glob a directory level, and the old per-package list failed
# SILENTLY when it drifted (a missing manifest omitted a package from
# node_modules and surfaced as a runtime "Cannot find module"). The cost is
# that a source edit invalidates the install layer; the gate builds from
# scratch regardless.
#
# No python3/make/g++: with `ignoreScripts` nothing compiles at install time,
# and the two native addons this image needs (@node-rs/argon2, sharp) resolve
# to prebuilt linux-x64 packages.
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

# PROD-DEPS — the node_modules that ships. Derived from `build` so the
# generated output above survives, but with every node_modules directory
# deleted first: a `--production` install must not be a filtered view of a
# devDependency-laden tree, it must be an install that was production-only
# from the start.
#
# `--filter '@openpanel/api'` is the closure boundary, and it is the
# "equivalent" a bare `bun install --production --frozen-lockfile` is traded
# for. The bare form installs every workspace member's production closure —
# apps/start's React/Nitro tree included, ~1.1GB the API never loads
# (docs/TECH_DEBT.md §5d). Verified on Bun 1.4.0: `--filter` follows
# `workspace:` edges TRANSITIVELY (api -> core -> db -> redis/email/payments)
# and installs nothing outside them, which is exactly the boundary the
# previous image expressed with its own installer's `...` filter suffix. It
# fails visibly rather than silently: a filter that matches nothing leaves the
# app unable to resolve its imports, and tooling/gates/p13-images.sh boots the
# image and asserts /healthz/ready before it passes.
FROM build AS prod-deps

RUN find . -maxdepth 4 -type d -name node_modules -prune -exec rm -rf {} + && \
    bun install --production --frozen-lockfile --linker=isolated --filter '@openpanel/api'

# RUNTIME — oven/bun:${BUN_VERSION}-slim, nothing but the app: the isolated
# node_modules and the source (with `build`'s generated output baked in), both
# from `prod-deps` so the store and the per-package symlinks into it come from
# one install and stay consistent.
FROM base AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules

# Apps — src/ is the artifact now; there is no dist/.
COPY --from=prod-deps /app/apps/api ./apps/api

COPY --from=prod-deps /app/packages ./packages
COPY --from=prod-deps /app/tooling/typescript ./tooling/typescript

WORKDIR /app/apps/api

EXPOSE 3000

# ROLE picks the shape: `api` (or unset) serves HTTP only, `worker` consumes
# only, `all` does both. `config/env.ts` validates it and fails boot loudly on
# an unknown value, which is why this line no longer has a case statement of
# its own.
CMD ["bun", "run", "src/main.ts"]
