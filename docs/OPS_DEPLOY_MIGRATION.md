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
