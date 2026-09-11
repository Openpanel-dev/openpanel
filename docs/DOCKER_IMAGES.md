# The two shipped images — what they contain, and what they measure

> Task: M15-203. Rewritten from `docs/DOCKER_SLIMMING.md` (M14-203), which is
> the specification. Every cut here was measured there; nothing it did not
> measure was attempted, and its §9 "not worth it" list is treated as binding.

## How to read every number below

Two quantities, never mixed — M14-203's §0 convention, kept verbatim:

| Term | Obtained by | Means |
|---|---|---|
| **compressed** | `docker image inspect --format '{{.Size}}'` | the gzip blob bytes — what a registry stores and a `docker pull` transfers. Under this box's containerd snapshotter this is what `.Size` reports. |
| **uncompressed** | sum of `docker history --no-trunc --format '{{.Size}}'` | the layer tar/diff bytes — what the snapshotter unpacks onto disk |
| **DISK USAGE** | `docker images` | **not used for any claim**. It double-counts: unpacked snapshot **plus** the compressed blobs it was unpacked from. |

## Before / after

Both images were built from scratch on this box on **2026-09-11**.

- **before** = `apps/api/Dockerfile` and `apps/start/Dockerfile` as of
  `de2090d7`, built with the same commands `tooling/gates/p13-images.sh` uses.
- **after** = this task's rewrite, as built by the gate run
  (`bash tooling/gates/p13-images.sh`) that passed.

### api

| | compressed (`image inspect .Size`) | uncompressed (`docker history` sum) | `docker images` DISK USAGE |
|---|---:|---:|---:|
| M13-003 baseline (recorded then) | 412,899,646 B | — | 2.11 GB |
| before, `de2090d7` | 407,700,106 B | 1,669,828,490 B (1,669.8 MB) | 2.08 GB |
| **after** | **341,483,316 B** | **1,472,071,590 B (1,472.1 MB)** | 1.81 GB |
| **change vs before** | **−66,216,790 B (−16.2 %)** | **−197,756,900 B (−11.8 %)** | — |

### dashboard

| | compressed | uncompressed | DISK USAGE |
|---|---:|---:|---:|
| M13-003 baseline (recorded then) | 95,217,524 B | — | 419 MB |
| before, `de2090d7` | 94,745,677 B | 317,767,500 B (317.8 MB) | 413 MB |
| **after** | **94,746,761 B** | **317,767,500 B (317.8 MB)** | 413 MB |
| **change vs before** | **+1,084 B (+0.001 %)** | 0 B | — |

**The dashboard image does not get smaller, and M14-203 said it would not.**
§1.2 measured it as 84.5 % `node:24.19.0-slim` with 9,024,064 B of application
content, and the only two cuts available in this repo are worth 74 B (the
install-stage apt block, which ships nothing) and 47 B (the inert `openssl` /
`libssl3` names in the runner). Per-layer blob measurement of before vs after,
2026-09-11:

| Runner layer | before | after |
|---|---:|---:|
| apt | 5,744,455 B | 5,744,628 B |
| `COPY .output` | 8,536,296 B | 8,537,010 B |

The apt layer moves by 173 B because dropping two names changes which packages
dpkg marks manually-installed, not which packages are installed — `curl` pulls
`libssl3` through `libcurl4` and `ca-certificates` pulls `openssl`. The
`.output` layer moves by 714 B because `COPY --chown=node:node` writes
different uid/gid into the tar headers. Both are below build-to-build noise.
The dashboard changes here are **for clarity and for the non-root user**, not
for size.

## What the api image gave up, and what it did not

Cuts taken — all four from M14-203's "What chore C6 should implement" list,
applied in the `prod-deps` **build** stage so the bytes are never COPYed into
the final image. (Deleting in a final stage adds a whiteout and makes the image
*larger* — §9.3.)

| Cut | Spec | Result |
|---|---|---|
| musl-only store entries, by glob | §8 row 3 / Open questions | 4 entries removed, store 955 → 951 |
| `apps/api/scripts` + `apps/api/e2e` | §6 | 15.7 MB of test fixture out of a production image |
| `*.test.ts` under `packages/` | §6 | 0 remain in the image |
| `packages/sdks` | §5 | nothing in the api's closure imports an SDK |

The musl glob is what §8 row 3 asks for in place of a list of content-hashed
store keys, and it is arch-independent for the reason the name gives: the base
is glibc, so an arm64 build resolves `-linux-arm64` and never `-linuxmusl-*`.
It also catches `@next/swc-linux-x64-musl` (54 MB compressed), which is most of
the saving — that package belongs to the `react-email` → `next` chain §2.2
found has no importer at all, so removing its dead-libc half costs nothing.
**The 144 MB `react-email`/`next` cut itself is NOT taken here**: it is a
`packages/email/package.json` + `bun.lock` change and needs its own task.

Cuts deliberately **not** taken, each because M14-203 says so:

- **The two `GeoLite2-*.mmdb` files stay baked in** (§3.3). They are read on the
  ingest hot path, their absence is silent and permanent, every health probe
  the project ships stays green without them, and no boot-fetch code exists.
- **`netcat-openbsd` stays** (§9.5) — `self-hosting/coolify.yml` waits on
  Postgres and ClickHouse with `nc -z`.
- **The api's `openssl` / `libssl3` apt names stay** (§8 row 4). They buy a
  Debian-Security upgrade of the base's already-installed OpenSSL; dropping
  them is 3,416,908 B and a security decision for Carl, not a size one.
- **`ca-certificates` stays in the dashboard runner** (§8 dashboard row 3) —
  same reason, Carl's call.
- **The base images stay** (§9.1, §9.2). Closed by Carl on 2026-09-08.
- **`COPY /app/packages` stays one line** (§9.4). Splitting it re-introduces the
  silent-drift failure the single COPY exists to prevent.

## Non-root

Both final stages run as uid 1000 — `bun` in the api image, `node` in the
dashboard image, both created by their base images. The api stage also sets
`HOME=/home/bun`, because Docker does not move `HOME` with `USER` and the
shipped start command's `bunx prisma@6.14.0` writes to bun's install cache
under `HOME`. Verified 2026-09-11: `id` inside both running containers reports
uid 1000, the api answers `/healthz/ready` 200, and the dashboard
server-renders `/login`.

## Migrations

Migrations run in the **api container's start command** (Carl, 2026-09-08 —
*"I don't want to move the migration out of it"*). All three shipped compose
files now read:

```sh
cd /app/packages/db && bunx prisma@6.14.0 migrate deploy
cd /app/packages/core && bun scripts/migrate-code.ts
```

- The Prisma CLI is a devDependency, so the image's production-only install
  correctly omits it; `bunx` fetches it at start rather than the image carrying
  the CLI plus `@prisma/engines` (~86 MB) for a once-per-deploy command.
- **The version is pinned.** A bare `bunx prisma` fetches latest, which can
  drift from the generated client and the schema the image ships. The repo is
  on `prisma 6.14.0`.
- `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations` and
  `packages/core/scripts/migrate-code.ts` are asserted at build time by a `RUN
  test` in the runtime stage. The whole command depends on them, and the
  alternative is a self-hoster finding out at container start.
- No new apt packages: the runtime stage is `FROM base`, which already carries
  `ca-certificates`, `openssl` and `libssl3` — what Prisma's engines need.
- Accepted consequence, recorded not re-argued: the api container needs
  npm-registry reach at start and downloads the CLI on a cold start.

Verified 2026-09-11 against a scratch local Postgres, running as uid 1000
inside the built image: `bunx prisma@6.14.0 migrate deploy` → *"All migrations
have been successfully applied."*; re-run → *"No pending migrations to apply."*;
the full three-line start command then reached `/healthz/ready` 200 in 8 s.

`.github/smoke/smoke.sh` gained `assert_migrations_ran`, because `sh -c` does
not stop on a failed line: a broken migration step leaves the api booting and
every probe green, which is exactly how an image whose start command could not
find the Prisma CLI shipped unnoticed.
