# Ops deploy migration — one image, ROLE-driven

> SPEC FOR A HUMAN. Nothing in this file touches live infra. It describes the
> change an operator must make to the cloud stack definition at cutover; no
> agent has applied it. Source facts are `docs/ANSWERS.md §1.1` and `§1.3`
> (Carl-authored, authoritative).

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
