# Dashboard image.
#
# THE TWO ROOT CAUSES THIS FILE FIXES. Measured at 4925d2f7 (2026-09-07) this
# image did not build, and neither break came from P13:
#
#   1. STALE COPIES OF THE DELETED `@openpanel/auth` PACKAGE. Two lines copied
#      its manifest and its whole directory out of the build stage. ADR-007
#      dissolved that package into `@openpanel/core` and P11 deleted its
#      directory, so both COPYs referenced a path that no longer exists and
#      the build would have died on them. The grep gate for this file asserts
#      that neither the old installer nor that path is named anywhere in it.
#
#   2. THE WORKSPACE-SUBSET INSTALL. The old base stage copied ~10 of the
#      workspace's ~20 member manifests and none of `packages/core`, which was
#      fine while the dashboard imported nothing from it. P11 made
#      `apps/start` import `@openpanel/core/modules/*.constants`, and
#      `vite-tsconfig-paths` then reads `packages/core/tsconfig.json`, whose
#      `"extends": "@openpanel/tsconfig/base.json"` cannot resolve when
#      `tooling/typescript` was never installed as a workspace member:
#      `failed to resolve "extends":"@openpanel/tsconfig/base.json" in
#      /app/packages/core/tsconfig.json`. The fix is not another manifest in
#      the list — it is ONE FULL WORKSPACE INSTALL, which is the shape ADR-014
#      Problems §4 rules for a bun-base image anyway. A subset install is what
#      the deleted `verifyDepsBeforeRun: false` setting existed to paper over;
#      that setting has no successor, so the subset it protected has to go.
#
# ADR-014 scopes P13 to the INSTALLER only. The build runs on bun; the runtime
# deliberately stays Node — nothing here decides otherwise.
ARG BUN_VERSION=1.4.0
ARG NODE_VERSION=24.19.0

# INSTALL — one full workspace install, exactly what bun.lock was resolved
# against. `bunfig.toml` rides along with the tree and carries
# `[install] ignoreScripts = true` (ADR-014 amendment 2) and
# `linker = "isolated"`; `--linker=isolated` is named here too so the layout is
# a property of the command, not only of a file.
FROM oven/bun:${BUN_VERSION}-slim AS install

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    libssl3 \
    curl \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# The tracking script the self-hosted dashboard serves.
COPY apps/public/public/op1.js ./apps/start/public/op1.js

RUN bun install --frozen-lockfile --linker=isolated

# BUILD — Nitro's standalone server output. NITRO=1 selects the node-server
# preset over the Cloudflare one; SELF_HOSTED=1 is read at build time.
#
# No codegen step: verified on this tree (2026-09-07) that the build succeeds
# with `packages/db/src/generated` absent — every `@openpanel/db` import in
# apps/start is `import type`, and the `@openpanel/core` imports are all
# `*.constants` subpaths.
FROM install AS build

ENV NITRO=1
ENV SELF_HOSTED=1

RUN cd apps/start && NITRO=1 SELF_HOSTED=1 bun run build

# RUNNER — node:${NODE_VERSION}-slim, and only `.output`.
#
# The Nitro output is standalone: it ships its own `.output/server/node_modules`
# (222 packages) and `.output/public` holds every asset `/login` references.
# Verified by running `.output/server/index.mjs` from an otherwise empty
# directory on 2026-09-07: `/api/healthcheck` 200, `/login` 200 / 136710 bytes,
# no resolution errors. So the workspace `node_modules` and the per-package
# source copies the previous image carried are dead weight, and dropping them
# is what removes the last reference to the deleted `@openpanel/auth` tree.
FROM node:${NODE_VERSION}-slim AS runner

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    libssl3 \
    curl \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/start

COPY --from=build /app/apps/start/.output ./.output

# The standalone Nitro output preserves the target package name for the
# esm-env -> esm-env-runtime override. @number-flow/react imports "esm-env"
# at runtime, so keep that package name resolvable inside the SSR bundle.
RUN set -eux; \
    node_modules="/app/apps/start/.output/server/node_modules"; \
    test -d "${node_modules}/esm-env-runtime"; \
    if [ ! -d "${node_modules}/esm-env" ]; then \
        mkdir -p "${node_modules}/esm-env"; \
        cp "${node_modules}/esm-env-runtime/node.js" "${node_modules}/esm-env/index.js"; \
        printf '%s\n' \
            '{' \
            '  "name": "esm-env",' \
            '  "version": "1.1.4",' \
            '  "type": "module",' \
            '  "exports": "./index.js"' \
            '}' \
            > "${node_modules}/esm-env/package.json"; \
    fi; \
    cd /app/apps/start/.output/server; \
    node --input-type=module -e 'const assert = await import("node:assert/strict"); const env = await import("esm-env"); assert.equal(env.BROWSER, false, "esm-env BROWSER should be false in the Node SSR runtime"); assert.equal(env.NODE, true, "esm-env NODE should be true in the Node SSR runtime"); assert.equal(env.DEV, false, "esm-env DEV should be false in the production runtime");'

EXPOSE 3000

# Start the Tanstack Start server
CMD ["node", ".output/server/index.mjs"]
