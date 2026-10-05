# Dashboard image. The build runs on bun; the runtime deliberately stays Node.
#
# Almost nothing of this image is ours: 84.5% is `node:${NODE_VERSION}-slim` (the Node runtime alone is 53%) and the
# application `.output` is 9 MB, so the only cuts available are the two apt ones below.
#
# The install is ONE FULL WORKSPACE INSTALL, not a list of member manifests: `apps/start` imports
# `@openpanel/core/modules/*.constants`, and `vite-tsconfig-paths` then reads `packages/core/tsconfig.json`, whose
# `"extends": "@openpanel/tsconfig/base.json"` cannot resolve unless `tooling/typescript` is installed as a workspace member.
ARG BUN_VERSION=1.4.0
ARG NODE_VERSION=24.19.0

# INSTALL — one full workspace install, exactly what bun.lock was resolved against. `bunfig.toml` rides along with the
# tree and carries `[install] ignoreScripts = true` and `linker = "isolated"`; `--linker=isolated` is named here too so
# the layout is a property of the command, not only of a file.
#
# No apt block: the runner starts `FROM node:${NODE_VERSION}-slim` and copies only `.output`, so an apt block here
# shipped nothing. `bun install` needs TLS and `oven/bun:${BUN_VERSION}-slim` already ships `ca-certificates`.
FROM oven/bun:${BUN_VERSION}-slim AS install

WORKDIR /app

COPY . .

# The tracking script the self-hosted dashboard serves.
COPY apps/public/public/op1.js ./apps/start/public/op1.js

RUN bun install --frozen-lockfile --linker=isolated

# BUILD — Nitro's standalone server output. NITRO=1 selects the node-server
# preset over the Cloudflare one; SELF_HOSTED=1 is read at build time.
#
# No codegen step: the build succeeds with `packages/db/src/generated` absent, because every `@openpanel/db` import in
# apps/start is `import type` and the `@openpanel/core` imports are all `*.constants` subpaths.
FROM install AS build

ENV NITRO=1
ENV SELF_HOSTED=1

RUN cd apps/start && NITRO=1 SELF_HOSTED=1 bun run build

# RUNNER — node:${NODE_VERSION}-slim, and only `.output`.
#
# The Nitro output is standalone: it ships its own `.output/server/node_modules` and `.output/public` holds every asset
# `/login` references, so the workspace `node_modules` and source copies are dead weight.
#
# apt: `curl` for the CMD-SHELL HEALTHCHECKs, `ca-certificates` for it. `openssl` and `libssl3` are not named: `curl`
# pulls libssl3 and `ca-certificates` pulls openssl, and Node bundles its own OpenSSL and CA store.
# `ca-certificates` is kept because removing it would break any HTTPS `curl` inside the container.
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
