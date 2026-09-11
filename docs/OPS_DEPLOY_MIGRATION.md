# Ops deploy migration — one image, ROLE-driven

> SPEC FOR A HUMAN. Nothing in this file touches live infra. It describes the
> change an operator must make to the cloud stack definition at cutover; no
> agent has applied it. Source facts are `docs/ANSWERS.md §1.1` and `§1.3`
> (Carl-authored, authoritative).

> **SUPERSEDED, 2026-09-11 (M15-203) — the migration commands only.** Every
> `./node_modules/.bin/prisma` / `./node_modules/.bin/jiti` invocation below is
> a record of what a past attempt verified, and neither binary is in the image
> any more. The shipped commands are now
> `cd /app/packages/db && bunx prisma@6.14.0 migrate deploy` and
> `cd /app/packages/core && bun scripts/migrate-code.ts`; see
> `docs/DOCKER_IMAGES.md`. Since M15-204 that second path is a forwarder — the
> migrations themselves live in `packages/db/src/code-migrations`, run by
> `packages/db/scripts/migrate-code.ts`. Everything else in this file stands.

## What changed in the repo

`apps/worker` is deleted (M9-003) and `apps/api/Dockerfile` now builds a
single `oven/bun:1-slim` image with no Node anywhere in it (M9-002/M9-005).
`bun run src/main.ts` boots in one of three shapes, picked at runtime by the
`ROLE` env var:

- `ROLE=api` (or unset) — HTTP only
- `ROLE=worker` — queue consumers only
- `ROLE=all` — both

CI (`.github/workflows/docker-build.yml`) already publishes exactly one image,
`ghcr.io/openpanel-dev/api`, from `apps/api/Dockerfile`. There is no
`build-worker` job and no `ghcr.io/openpanel-dev/worker` image built from this
repo going forward.

## Current cloud stack (pre-cutover, from `docs/ANSWERS.md §1.3`)

```
openpanel_api            replicated  10/10 (max 4 per node)  ghcr.io/openpanel-dev/api:main-6639     *:3030->3000/tcp
openpanel_event_workers  replicated  4/4  (max 1 per node)   ghcr.io/openpanel-dev/worker:main-6639  *:3050->3000/tcp
openpanel_workers        replicated  6/6  (max 2 per node)   ghcr.io/openpanel-dev/worker:main-6639  *:3040->3000/tcp
```

Two images (`api`, `worker`) back three service definitions.

## Target cloud stack (post-cutover)

One image, `ghcr.io/openpanel-dev/api:<new-tag>`, backs all three service
definitions. Only the env vars differ per service — replica counts and node
placement caps are unchanged, they are a capacity decision independent of
this migration:

| Service                 | Replicas | Max/node | Image                              | `ROLE`   | `ENABLED_QUEUES` |
|--------------------------|---------:|---------:|-------------------------------------|----------|------------------|
| `openpanel_api`          | 10       | 4        | `ghcr.io/openpanel-dev/api:<tag>`   | `api`    | n/a              |
| `openpanel_event_workers`| 4        | 1        | `ghcr.io/openpanel-dev/api:<tag>`   | `worker` | `events`         |
| `openpanel_workers`      | 6        | 2        | `ghcr.io/openpanel-dev/api:<tag>`   | `worker` | *(unset — runs everything except `events`)* |

Notes an operator needs before flipping this over:

1. **`ENABLED_QUEUES` naming ruling (ANSWERS.md §1.3, 2026-08-30):** V2 does
   not accept the `events_kafka` alias the current `openpanel_event_workers`
   service uses — the queue is named `events`, full stop. The cloud env
   var for that service must be updated to `ENABLED_QUEUES=events` in the
   same change that swaps the image, not before (a V1 image with the old
   alias must keep running until this cutover lands).
2. **Unknown `ENABLED_QUEUES` values now fail boot loudly.** V1 silently
   ignored a stale/misspelled value and ran an idle worker; V2 rejects it at
   startup. If the manifest still carries a typo'd or removed queue name
   (e.g. leftover GroupMQ sharding config), the container will not come up —
   treat that as the migration doing its job, not a regression.
3. **`OP_WORKER_REPLICAS` is a self-hosting-only knob** (ANSWERS.md §1.3) —
   it does not apply to this cloud stack and needs no change here.
4. **Ports (`3030`/`3040`/`3050`) and node placement caps are unchanged** —
   only the image reference and the two env vars above move.
5. **Retire the `ghcr.io/openpanel-dev/worker` image** from the registry's
   retention/promotion pipeline once the cutover is confirmed stable; CI no
   longer publishes it, so it will otherwise silently stop updating rather
   than erroring, which is easy to miss.

## Local build proof

Built on this box from repo root with the workflow's own invocation:

```
docker build -f apps/api/Dockerfile -t openpanel-v2:test .
```

Result: success, single image, no separate worker image produced.

```
$ docker images openpanel-v2:test
IMAGE               ID             DISK USAGE   CONTENT SIZE
openpanel-v2:test   a9b3a680ed55        2.1GB          420MB
```

`CONTENT SIZE` (420MB / ~401MiB, confirmed via `docker image inspect
--format '{{.Size}}'` → 420032938 bytes, and `docker save | wc -c` →
420077056 bytes) is what actually gets pushed/pulled. `DISK USAGE` (2.1GB) is
this daemon's on-disk footprint including the buildx attestation/manifest-list
layers and is not what a registry pull transfers — reported here so the two
numbers aren't confused for a regression against the old two-image setup.
No image-size baseline for the old node+bun two-stage `api` image or the old
`worker` image was captured before this migration, so there is no before/after
delta to report — only this absolute number.

## P9.5 slim-down (M9-006): pnpm and the build toolchain leave the runtime image

> **Superseded by *P13 (M13-003)* at the end of this file.** Both Dockerfiles
> now install with bun and this section's stage list no longer matches the tree.
> Kept as the record of what M9-006 did.

`apps/api/Dockerfile` is now five stages: `base` (shared OS packages) →
`toolchain` (pnpm + python3/make/g++, never ships) → `build` (full install,
runs `pnpm codegen` — Prisma client + core's geo/ASN data — never ships) and
`prod-deps` (a **from-scratch** production-only `pnpm install --frozen-lockfile
--prod`, never ships) in parallel → `runtime` (`oven/bun:${BUN_VERSION}-slim`,
COPYs `node_modules` from `prod-deps` and source, generated output included,
from `build`). ADR-014 stays satisfied: pnpm is still the installer, it just
never reaches a container that serves traffic (ADR-014 Problems §4, option 2).

`prod-deps` is deliberately **not** derived from `build`'s already-installed
`node_modules` — an earlier attempt in this task tried reinstalling `--prod`
on top of a full install in place, and it measurably failed to purge
devDependencies (`tar`, `typescript`, `prisma` CLI, `@biomejs/biome`,
`ultracite`, `vitest`, … — package count went **1041 → 2257**, node_modules
**1.1G → 2.0G**, all still empirically verified inside the built image). A
from-scratch `--prod` install is what actually ships a production-only tree.

**docker-compose.template.yml / coolify.yml / .github/smoke/docker-compose.yml**
ran `CI=true pnpm -r run migrate:deploy` and `pnpm start` *inside* the api
image at container start (ADR-014 Problems §4's named consequence). All three
now call the installed tools directly instead of through pnpm's script
runner: `./node_modules/.bin/prisma migrate deploy` and
`./node_modules/.bin/jiti src/code-migrations/migrate.ts` (both are pnpm's
`#!/bin/sh` shims; `node` on `$PATH` resolves to Bun's node-fallback symlink,
so they run unmodified) and `bun run start` for `apps/api`'s own script —
`jiti` itself is untouched (ADR-019 row 7b schedules its removal for P12, not
here). Verified directly against this box's local Postgres/ClickHouse (all
already migrated, so both commands are confirmed no-ops): `prisma migrate
deploy` → `"No pending migrations to apply."`; `jiti
src/code-migrations/migrate.ts` → all 24 recorded migrations print `Already
Migrated`.

### Measured sizes — all four via `docker image inspect <tag> --format '{{.Size}}'`

Same command run against every tag in this attempt (2026-09-05), so the
numbers are apples to apples. V1 images were pulled from Docker Hub, measured,
then `docker rmi`'d immediately (disk on this box is ~16G free) — they are not
left on this box. V2 "before" is the **pre-existing** `openpanel-v2:test` tag
(built by an earlier task, M9-005) — not rebuilt in this attempt, per the
task's instruction not to invent a rebuild when the tag already exists. V2
"after" is `openpanel-v2:slim`, built in this attempt from the Dockerfile
above via `docker build -f apps/api/Dockerfile -t openpanel-v2:slim .`.

| Image | Tag | `.Size` (bytes) | ≈MB | ≈GiB |
|---|---|---:|---:|---:|
| V1 api (Docker Hub `lindesvard/openpanel-api:latest`) | pulled, measured, removed | 476,399,142 | 476.4 | 0.444 |
| V1 worker (Docker Hub `lindesvard/openpanel-worker:latest`) | pulled, measured, removed | 465,663,118 | 465.7 | 0.434 |
| V2 before (`openpanel-v2:test`, pre-existing, not rebuilt) | existing tag | 420,032,938 | 420.0 | 0.391 |
| V2 after (`openpanel-v2:slim`, this attempt) | built this attempt | 341,044,603 | 341.0 | 0.318 |

(Docker Hub's own reported compressed sizes as of 2026-08-18 were api 0.48GB /
worker 0.47GB — consistent with the `.Size` figures measured here, which is
the expected cross-check: `docker image inspect --format '{{.Size}}'` on this
Docker version (29.7.2, containerd image store) reports compressed content
size, the same quantity Docker Hub publishes. `docker images`' `DISK USAGE`
column is a different, larger, uncompressed-on-this-daemon number — 1.79GB for
`openpanel-v2:slim`, 2.1GB for `openpanel-v2:test` — and is not what a
registry pull transfers; do not compare it to the table above.)

### Verdict

**V2 slimmed (341.0MB) is now smaller than either V1 image (476.4MB api,
465.7MB worker)** — this task's specific improvement is V2-before → V2-after:
420.0MB → 341.0MB content size (−18.8%), 2.1GB → 1.79GB on-disk (−14.8%),
entirely from getting pnpm, python3/make/g++ and the per-package COPY manifest
out of the runtime stage (the dependency graph itself is unchanged — this is
not a `bun install` swap, ADR-014 stays P13).

**Fleet arithmetic, stated separately so it isn't hidden by the per-image
number:** V1 ships two images to the registry (api + worker, ~942MB combined
pulled once each) backing three cloud service definitions (`openpanel_api`,
`openpanel_event_workers`, `openpanel_workers` — see the target stack table
above). V2 ships **one** 341.0MB image backing all three. A node that used to
need both V1 images pulls one V2 image instead — that is the bigger win, but
it rides on top of the per-image win being real too, not in place of it.

**A real lever left on the table, out of this task's scope.** `openpanel-v2:slim`'s
`node_modules` is still ~1.1G on disk, dominated by packages with zero runtime
relationship to `apps/api` — `next` + `@next/swc-linux-x64-gnu` (~265MB),
`react-email` (~179MB), `@polar-sh/sdk` (~35MB), `effect` (~33MB), `mathjs`
(~18MB) — because the workspace-root `pnpm install --frozen-lockfile --prod`
installs the **entire monorepo's** production dependency graph (all 23
workspace projects, `apps/start`/`apps/public` included), not just
`@openpanel/api`'s closure, regardless of which package.json files were
selectively `COPY`'d for pnpm's own resolution. Filtering the install (e.g.
`pnpm install --filter` or `pnpm deploy`) would be a substantially bigger size
win than this task's stage restructuring, but it is a different, riskier
change (frozen-lockfile + filter interaction, unverified on this repo) and is
not what this task's acceptance criteria asked for — recorded here as a
follow-up, not attempted.

### Boot proof

Both roles booted from `openpanel-v2:slim` against this box's local
Postgres/Redis/ClickHouse/Redpanda (`--network host`, this attempt,
2026-09-05):

```
$ docker run -d --network host --env-file <env> openpanel-v2:slim            # ROLE=api (via API_PORT=3333)
{"...","msg":"API listening","role":"api","port":3333}
$ curl -s http://127.0.0.1:3333/healthcheck
{"ready":true,"redis":true,"db":true,"ch":true,"failedDependencies":[],"workingDependencies":["redis","db","ch"]}

$ docker run -d --network host --env-file <env> -e ROLE=worker openpanel-v2:slim
{"...","msg":"worker started","queue":"sessions"} … (all 7 queues) …
{"...","msg":"kafka events consumer running","topic":"events"}
{"...","msg":"API listening","role":"worker","port":3333}
$ curl -s http://127.0.0.1:3333/healthz/ready
{"ready":true}
```

`bun run start` (apps/api's own package.json script, the `pnpm start`
replacement) was also exercised directly and shut down cleanly on `SIGTERM`
("Graceful shutdown completed").

## M10-008: closure-scoped install (TECH_DEBT §5d)

TECH_DEBT §5d, sourced from M9-006's own "real lever left on the table" note,
claimed the `prod-deps` stage's workspace-root `pnpm install --frozen-lockfile
--prod` installed all 23 workspace projects' production dependencies —
`next`, `react-email`, `@polar-sh/sdk`, `effect`, `mathjs`, ~1.1GB total —
because it runs at the repo root regardless of which `package.json` files were
selectively `COPY`'d.

**That diagnosis does not survive `pnpm why`.** Rechecked in this attempt: the
`toolchain` stage's manifest list already limits pnpm's visible workspace to
14 projects (root + api + the 11 packages + `tooling/typescript` — `apps/start`
and `apps/public` are never copied in, so pnpm's workspace glob simply cannot
see them, confirmed via `Scope: all 14 workspace projects` in the install log
and by reproducing the exact stage in a scratch directory). Every package named
in TECH_DEBT §5d is a genuine transitive **production** dependency already
inside `@openpanel/api`'s real closure, not workspace leakage:

| Package | `pnpm why` chain |
|---|---|
| `next`, `react-email` | `@openpanel/email → responsive-react-email → react-email → next` |
| `effect` | `@openpanel/db → @prisma/client`/`prisma-json-types-generator → @prisma/config → effect` |
| `mathjs` | `@openpanel/common`, `@openpanel/core`, `@openpanel/trpc` (all direct) |
| `@polar-sh/sdk` | `@openpanel/payments` (direct) |

`pnpm --filter "@openpanel/api..." list --depth -1` (the real dependency-graph
closure) returns exactly the same 13 projects (12 packages + `apps/api`) the
Dockerfile's manifest list already names — confirmed by diffing the resulting
`node_modules/.pnpm` entries between the current (manifest-only) install and a
`--filter`-scoped install run against the **full** 26-project manifest set:
byte-identical, 1039 packages both ways.

### What changed and why

**Command chosen: `pnpm --filter "@openpanel/api..." install --frozen-lockfile
--prod`**, not `pnpm deploy`. Tested both: `pnpm deploy` needs either
`inject-workspace-packages=true` (a repo-wide `.npmrc` behavior change, out of
this task's scope — it would flip every install in the monorepo from symlinked
to hard-copied workspace deps) or `--legacy` (which works, but re-resolves the
*entire* 26-project lockfile graph every build — measured 27.6s vs the filtered
install's 3–15s in-container — for byte-identical output). The filtered
`install` keeps the existing workspace layout the runtime stage already expects
(`node_modules` at the project root, symlinks into `packages/*`), so the
`runtime` stage's `COPY --from=prod-deps` lines needed no changes. ADR-014
stands: still pnpm, no bun install.

**The per-package `COPY packages/*/package.json` manifest (lines ~51-74) is
kept, not replaced** — stated plainly per the task's instruction, not silently
carried over. Docker's `COPY` only globs the final path segment:
`COPY packages/*/package.json packages/` flattens every match into one
`packages/package.json`, overwriting rather than preserving each package's own
directory (verified with a throwaway `alpine` Dockerfile). There is no
wildcard-COPY that reproduces per-directory manifests, so reaching a
manifest-free build would mean copying full source before installing
(`COPY . .`) and losing the existing manifest-only Docker cache layer for the
dependency-install step entirely — a real regression in iteration speed for a
correctness property (`--filter` on an already-correct closure) that measures
as a no-op today. Not taken.

What the `--filter` **does** buy, since the manifest list turned out to
already be correct: the closure is now a property the install command asserts
(`--filter "@openpanel/api..."`), not an accident of which files happened to be
`COPY`'d. If a future PR adds a new package to `apps/api`'s dependency graph
without adding its manifest line, the install now silently omits it from
`node_modules` exactly as before (Docker's per-file COPY still requires the
manifest to exist on disk — `--filter` cannot discover a manifest that was
never copied) — this is an unfixed, pre-existing risk, called out at the top
of the `toolchain` stage's comment block, not solved by this task.

### Measured sizes — BEFORE and AFTER, both built in this attempt (2026-09-06)

Command run identically for both: `docker build -f apps/api/Dockerfile -t
<tag> .`. BEFORE is a **fresh rebuild** of the Dockerfile as it stood at
`49a6388e` (M10-007's `HEAD`, unchanged since M9-006 — confirmed via `git log
-- apps/api/Dockerfile`), not the pre-existing `openpanel-v2:slim` tag, so
both numbers below come from builds this attempt actually ran. Compressed via
`docker image inspect <tag> --format '{{.Size}}'` (this box's containerd
snapshotter reports compressed content size, per M9-006); uncompressed via
`docker images` `DISK USAGE`.

| Image | Tag | Compressed (bytes) | Compressed (MB) | Uncompressed (`docker images` DISK USAGE) |
|---|---|---:|---:|---:|
| Before (root `--prod` install, unchanged Dockerfile, rebuilt this attempt) | `openpanel-v2:before` | 341,068,228 | 341.1 | 1.79GB |
| After (`--filter "@openpanel/api..."` install, this attempt) | `openpanel-v2:closure` | 341,063,856 | 341.1 | 1.79GB |

**Verdict: no measurable size change (−4,372 bytes, noise).** This is the
correct, honestly-reported result given the `pnpm why` findings above — the
image was already scoped to `@openpanel/api`'s real closure before this task,
so there was no apps/start/apps/public dependency bloat to remove. TECH_DEBT
§5d's premise was wrong; this task's value is making the closure boundary an
explicit property of the install command instead of an implicit consequence of
the manifest list, which is a correctness/robustness improvement, not a size
one. `docs/TECH_DEBT.md` §5d should be corrected to reflect this the next time
it's touched — not done here, out of this task's scope (register the finding,
don't edit the register's narrative text as a side effect of closing it).

### Boot proof (2026-09-06, this attempt, against `openpanel-v2:closure`)

```
$ docker run -d --network host --env-file <env> openpanel-v2:closure          # ROLE=api (API_PORT=3333)
{"...","msg":"API listening","role":"api","port":3333}
$ curl -s http://127.0.0.1:3333/healthcheck
{"ready":true,"redis":true,"db":true,"ch":true,"failedDependencies":[],"workingDependencies":["redis","db","ch"]}

$ docker run -d --network host --env-file <env> -e ROLE=worker -e API_PORT=3334 openpanel-v2:closure
{"...","msg":"worker started","queue":"sessions"} … (all 7 queues) …
{"...","msg":"kafka consumer joined group (rebalance complete)"}
{"...","msg":"kafka events consumer running","topic":"events"}
{"...","msg":"API listening","role":"worker","port":3334}
$ curl -s http://127.0.0.1:3334/healthcheck
{"ready":true,"redis":true,"db":true,"ch":true,"failedDependencies":[],"workingDependencies":["redis","db","ch"]}
```

Self-hosting compose commands (M9-006's `docker-compose.template.yml` /
`coolify.yml` / `.github/smoke/docker-compose.yml`), run inside
`openpanel-v2:closure` against this box's local Postgres/ClickHouse:

```
$ docker exec <container> sh -c "cd /app/packages/db && ./node_modules/.bin/prisma migrate deploy"
153 migrations found in prisma/migrations
No pending migrations to apply.

$ docker exec <container> sh -c "cd /app/packages/core && ./node_modules/.bin/jiti src/code-migrations/migrate.ts"
… ✅ Already Migrated ✅ …
Migrations finished

$ docker run --entrypoint sh openpanel-v2:closure -c "cd /app/apps/api && bun run start"
{"...","msg":"API listening","role":"api","port":3335}
$ curl -s http://127.0.0.1:3335/healthcheck
{"ready":true,"redis":true,"db":true,"ch":true,"failedDependencies":[],"workingDependencies":["redis","db","ch"]}
```

All three commands resolve and run unmodified inside the closure-scoped image.

### Cleanup

Tags created in this attempt beyond the required before/after pair: none —
only `openpanel-v2:before` and `openpanel-v2:closure` were built. Both are
kept on disk per the task's acceptance (the before/after pair); no other tag
was created. Pre-existing tags `openpanel-v2:slim` and `openpanel-v2:test`
(from M9-005/M9-006, untouched by this task) were left as found. This box had
~16G free before this attempt; four `openpanel-v2:*` tags at ~1.8GB on-disk
each is within that budget, but if disk pressure appears, `openpanel-v2:slim`
and `openpanel-v2:test` are the pre-existing tags to reclaim first (this task
did not create them and does not need them kept).

---

## P13 (M13-003, 2026-09-07): both Dockerfiles move onto `bun install`

Supersedes the *P9.5 slim-down (M9-006)* section above wherever the two
disagree. That section is left in place as the record of what M9-006 did; the
image shape it describes no longer exists.

**What changed.**

| | before (M9-006) | now |
|---|---|---|
| `apps/api/Dockerfile` stages | `base` → `toolchain` (a second package manager + python3/make/g++) → `build` / `prod-deps` in parallel → `runtime` | `base` → `toolchain` → `build` → `prod-deps` → `runtime`, all on `oven/bun:${BUN_VERSION}-slim` except nothing |
| api install | root install, then a from-scratch `--prod` install filtered to api's closure | `bun install --frozen-lockfile --linker=isolated`, then a from-scratch `bun install --production --frozen-lockfile --linker=isolated --filter '@openpanel/api'` |
| api codegen | `pnpm codegen` | `bun run codegen` |
| manifest COPYs | a hand-maintained list of `packages/*/package.json` | `COPY . .` — one full workspace install per image (ADR-014 Problems §4) |
| native build toolchain | `python3 make g++` in two stages | gone: `[install] ignoreScripts = true` means nothing compiles at install time, and `@node-rs/argon2` / `sharp` resolve to prebuilt linux-x64 packages |
| `apps/start/Dockerfile` | did not build at all — see below | install + build on `oven/bun:1.4.0-slim`, runtime unchanged at `node:24-slim` running `.output/server/index.mjs` |

**The dashboard image was already broken before P13**, for two reasons neither
of which is the installer, both now fixed and named in that file's header:
stale COPYs of the `@openpanel/auth` package P11 deleted, and a workspace-subset
install that left `@openpanel/tsconfig` unresolvable for
`packages/core/tsconfig.json` once P11 made `apps/start` import
`@openpanel/core`. The fix for the second is the full workspace install, which
is the shape a bun-base image has to take anyway.

The dashboard runner stage now copies **only** `.output`. The Nitro output is
standalone — 222 bundled packages of its own, and `.output/public` holds every
asset `/login` references — verified on 2026-09-07 by running
`.output/server/index.mjs` from an otherwise empty directory (`/api/healthcheck`
200, `/login` 200 / 136710 bytes, no resolution errors). The workspace
`node_modules` and per-package source copies the previous runner carried were
dead weight.

**Gate.** `bash tooling/gates/p13-images.sh` builds both images, boots each
against this box's local services and asserts the api's `/healthz/ready` = 200
and the dashboard's `/login` server-renders (HTTP 200, `<html`, ≥1000 bytes,
clean container log) — the `.github/smoke/smoke.sh` assertions, because
"the image built" is exactly what main-8e60 passed. It prunes the build cache
between the two builds and again on exit; one from-scratch build leaves ~6GB of
cache on a box with ~15GB free.

Full run, 2026-09-07: **PASSED in 3m16s**, `/login` 152348 bytes, both container
logs clean, 7.8G free after the final prune.

**Sizes and the one known break** (the shipped compose templates' `prisma
migrate deploy` line, pre-existing): `docs/TECH_DEBT.md` → *M13-003 image
sizes*.
