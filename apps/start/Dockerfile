# Dashboard image.
#
# Rewritten for M15-203 against docs/DOCKER_SLIMMING.md (M14-203) §1.2 and
# §4.2. That document measured this image layer by layer and found almost
# nothing of it is ours: 84.5% is `node:${NODE_VERSION}-slim`, of which one
# layer (the Node runtime itself) is 53%, and the application `.output` is
# 9,024,064 B — 9.5%. So the only cuts available here are the two apt ones
# below, and the base is DECIDED and stays put (§9.1, §9.2 — Carl, 2026-09-08).
#
# THE TWO ROOT CAUSES THIS FILE FIXES, carried forward from M13-003 because
# both are still the reason it is shaped this way:
#
#   1. STALE COPIES OF THE DELETED `@openpanel/auth` PACKAGE. ADR-007 dissolved
#      that package into `@openpanel/core` and P11 deleted its directory, so
#      the COPYs that named it referenced a path that no longer exists. The
#      grep gate for this file asserts that neither the old installer nor that
#      path is named anywhere in it.
#
#   2. THE WORKSPACE-SUBSET INSTALL. The old base stage copied ~10 of the
#      workspace's ~20 member manifests and none of `packages/core`. P11 made
#      `apps/start` import `@openpanel/core/modules/*.constants`, and
#      `vite-tsconfig-paths` then reads `packages/core/tsconfig.json`, whose
#      `"extends": "@openpanel/tsconfig/base.json"` cannot resolve when
#      `tooling/typescript` was never installed as a workspace member. The fix
#      is not another manifest in the list — it is ONE FULL WORKSPACE INSTALL,
#      which is the shape ADR-014 Problems §4 rules for a bun-base image
#      anyway.
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
#
# NO apt BLOCK. There used to be one here mirroring the runner's. It shipped
# nothing — the runner starts `FROM node:${NODE_VERSION}-slim`, a fresh base,
# and copies only `.output` — so it bought build time and nothing else.
# Measured (§4.2): deleting it changes the image by -74 B and the build still
# succeeds. `bun install` needs TLS and `oven/bun:${BUN_VERSION}-slim` already
# ships `ca-certificates`; nothing in `bun install` or `vite build` calls
# `curl`, `openssl` or `libssl3`.
FROM oven/bun:${BUN_VERSION}-slim AS install

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
# and `.output/public` holds every asset `/login` references. So the workspace
# `node_modules` and the per-package source copies the previous image carried
# are dead weight, and dropping them is what removes the last reference to the
# deleted `@openpanel/auth` tree.
#
# apt: `curl` for the CMD-SHELL HEALTHCHECKs, `ca-certificates` for it. The
# `openssl` and `libssl3` names that used to be here were inert (§4.2, 47 B):
# `curl` pulls libssl3 through libcurl4 and `ca-certificates` pulls openssl,
# and Node needs neither — it bundles its own OpenSSL (`ldd node` shows no
# libssl) and its own CA store. `ca-certificates` itself is 1,113,308 B and is
# KEPT: §8's dashboard row 3 files removing it as Carl's call, since it would
# break any HTTPS `curl` inside the container.
FROM node:${NODE_VERSION}-slim AS runner

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/start

COPY --from=build --chown=node:node /app/apps/start/.output ./.output

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
    chown -R node:node "${node_modules}/esm-env"; \
    cd /app/apps/start/.output/server; \
    node --input-type=module -e 'const assert = await import("node:assert/strict"); const env = await import("esm-env"); assert.equal(env.BROWSER, false, "esm-env BROWSER should be false in the Node SSR runtime"); assert.equal(env.NODE, true, "esm-env NODE should be true in the Node SSR runtime"); assert.equal(env.DEV, false, "esm-env DEV should be false in the production runtime");'

# The SSR server reads `.output` and writes nothing. `node` (uid 1000) is
# created by the base image.
USER node

EXPOSE 3000

# Start the Tanstack Start server
CMD ["node", ".output/server/index.mjs"]
