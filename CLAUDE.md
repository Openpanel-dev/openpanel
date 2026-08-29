# OpenPanel V2 — autonomous rewrite

This repository is being rewritten by an autonomous loop. Read this before doing
anything.

## Safety

Never access, read, or modify:

```
/data/apps/openpanel        <- PRODUCTION OpenPanel
/data/apps/lb
/data/apps/docker-proxy
/data/apps/sales
/data/apps/mock
```

Never use production credentials. Local Postgres / ClickHouse / Redis only.

## Environment

- **No docker.** `pnpm dock:up` will fail. Postgres (5432), Redis (6379) and
  ClickHouse (8123) are already running on localhost, started by another user.
  Do not try to start, stop or install them.
- **No sudo.** Anything needing root is a human task. Say so; do not attempt it.
- Writes are confined to this repo and `/data/apps/rewrite-openpanel`. Every
  other path on the box is read-only to you.

## Commands

```bash
pnpm install
pnpm codegen        # prisma client; needs .env
pnpm run typecheck
pnpm run lint
pnpm test
```

`typecheck` and `test` fail until `.env` exists and `pnpm codegen` has run. If a
task depends on them and they are not ready, report `BLOCKED` rather than
inventing a workaround.

## Architecture

Architecture decisions live in `/data/apps/rewrite-openpanel/decisions`.
**Accepted ADRs are binding.** If you need a decision no accepted ADR covers,
stop and say `BLOCKED: needs ADR — <question>`. Do not decide it yourself.

The target architecture is `/data/apps/rewrite-openpanel/docs/TARGET_ARCHITECTURE.md`.
The documented behaviour of the system you are replacing is in
`/data/apps/rewrite-openpanel/docs/current/`. Read the relevant document before
changing that area — it exists so you do not have to rediscover it.

## Ralph

Do not modify:

```
/data/apps/rewrite-openpanel/plan/tasks.json
/data/apps/rewrite-openpanel/state
/data/apps/rewrite-openpanel/verification
```

The orchestrator owns task state and owns the definition of "passing".

## Git

Do not commit. The orchestrator manages commits and the `rewrite/v2` branch.
There are no push credentials on this machine, by design - all commits are local
and a human pushes them later. Never try to add a remote or authenticate to one.

## Scope

Do exactly the assigned task. Do not opportunistically refactor, upgrade
dependencies, or fix unrelated things you notice along the way.
