# ADR-016 pins Bun exactly at 1.4.0 (floor >=1.2.23). Its declared home is
# `.bun-version` + this ARG; the file does not exist in the tree yet, so this
# ARG is the single home until it does. Keep the two in sync when it lands.
ARG BUN_VERSION=1.4.0
# ADR-014: pnpm stays through P12 — this only pins the pnpm *version* used to
# install the workspace, it does not touch which tool runs installs. P9.5
# stops that installer reaching the runtime stage at all (ADR-014 Problems
# §4, option 2): pnpm and the build toolchain live only in `build`/`prod-deps`
# below, neither of which ships.
ARG PNPM_VERSION=11.23.0

# BASE — OS packages every stage needs. curl and netcat-openbsd are here for
# the docker-compose HEALTHCHECKs, which exec *inside* the running container,
# so they must reach the runtime stage too, not just the pnpm stages.
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

# TOOLCHAIN — pnpm + the native-addon build toolchain, shared by the two
# stages below. Neither of them ships, so neither does this.
FROM base AS toolchain

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ARG PNPM_VERSION
RUN bun install -g pnpm@${PNPM_VERSION}

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV npm_config_build_from_source=true

WORKDIR /app

# Workspace manifest
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Apps
COPY apps/api/package.json ./apps/api/
# Packages — @openpanel/api's workspace closure, exactly as pnpm computes it
# (verified against `pnpm --filter "@openpanel/api..." list --depth -1`: these
# 9, plus the private tooling/typescript devDependency, which --prod below
# never installs, so its manifest is deliberately not copied here). This list
# is still hand-maintained: Docker's COPY only accepts a glob for the *last*
# path segment, so `packages/*/package.json` flattens every match into one
# `packages/package.json`, overwriting instead of preserving each
# subdirectory — there is no wildcard that copies these into their own
# directories. `--filter "@openpanel/api..."` below is the actual
# closure boundary; if a manifest is missing here, the install below does
# NOT fail loud — it silently omits that package from `node_modules`
# (surfacing later as a runtime "Cannot find module", not a build failure) —
# so keep this list in sync with the filter output when api's dependency
# graph changes.
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/redis/package.json packages/redis/
COPY packages/payments/package.json packages/payments/
COPY patches ./patches

# BUILD — full install (codegen needs devDependencies: core's `tar` for
# scripts/download-geo.ts, db's `prisma` CLI for schema generation) then the
# Prisma client + geo/ASN codegen. Never ships: only its generated *source*
# output (baked into packages/db and packages/core below) reaches runtime.
FROM toolchain AS build

RUN pnpm install --frozen-lockfile && \
    pnpm store prune

COPY apps/api ./apps/api
COPY packages ./packages
COPY tooling ./tooling

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# No JS build step: ADR-010 deleted the backend bundler with the V1 boot, so
# the only thing this stage produces is the generated Prisma client and
# core's downloaded geo/ASN data, both written to disk under packages/.
RUN pnpm codegen

# PROD-DEPS — a from-scratch production-only install. Deliberately NOT
# derived from `build`'s node_modules: pnpm's --prod install does not reliably
# purge an existing devDependency-laden modules dir (verified empirically —
# it left every devDependency in place), so shipping node_modules must come
# from an install that was production-only from the start.
#
# `--filter "@openpanel/api..."` (the three-dot suffix: api plus everything it
# depends on, direct or transitive) is the actual closure boundary, chosen
# over `pnpm deploy` — deploy needs either `inject-workspace-packages=true`
# (a repo-wide install-behavior change, out of scope here) or `--legacy`
# (which re-resolves the full 26-project lockfile graph every build, ~8x
# slower than a scoped install, for the same output). Verified empirically
# against this workspace: with only the manifests above present, plain
# `pnpm install --frozen-lockfile --prod` and this filtered form produce
# byte-identical node_modules (same 1039 packages) — the manifest list
# already happened to equal the closure. The filter is kept anyway as the
# explicit, fails-closed boundary: it is what makes "only api's closure"
# a property of the command instead of an accident of which package.json
# files got copied above.
FROM toolchain AS prod-deps

RUN pnpm --filter "@openpanel/api..." install --frozen-lockfile --prod && \
    pnpm rebuild && \
    pnpm store prune

# RUNTIME — oven/bun:${BUN_VERSION}-slim, nothing but the app: node_modules
# from `prod-deps`, source (with `build`'s generated output baked in) from
# `build`. No pnpm, no python3/make/g++, no per-package COPY manifest.
FROM base AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules

# Apps — src/ is the artifact now; there is no dist/.
COPY --from=build /app/apps/api ./apps/api

# Packages — one COPY, not the per-package manifest the pnpm stages needed.
COPY --from=build /app/packages ./packages
COPY --from=build /app/tooling/typescript ./tooling/typescript

WORKDIR /app/apps/api

EXPOSE 3000

# ROLE picks the shape: `api` (or unset) serves HTTP only, `worker` consumes
# only, `all` does both. `config/env.ts` validates it and fails boot loudly on
# an unknown value, which is why this line no longer has a case statement of
# its own.
CMD ["bun", "run", "src/main.ts"]
