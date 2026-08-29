# OpenPanel V2 — autonomous rewrite

This repository is being rewritten by an autonomous loop. Read this before doing
anything.

## Safety

Your world is exactly two directories: this repository and
`/data/apps/rewrite-openpanel` (the controller). Do not read, list, or modify
anything else on this machine.

Never use production credentials — production does not exist on this machine,
and nothing here should reach it. Local Postgres / ClickHouse / Redis only.

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

## ClickHouse

Never commit ClickHouse SQL you have not executed. Run it against the local
server (`http://127.0.0.1:8123`, database `openpanel`) and report timing and row
count. When replacing a query, diff the old and new result sets on the same data.

Local is a single node; production is 2 shards x 2 replicas. Before editing any
query against a `Distributed` table read
`/data/apps/rewrite-openpanel/docs/ENVIRONMENT.md` - a plain `IN (subquery)` on a
distributed table silently returns per-shard results.

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

## Code style

- **Constants over magic numbers** — named, descriptive, at the top of the file
  or in the module's `<name>.constants.ts`.
- **Meaningful names** — reveal purpose; no abbreviations unless universal.
- **Smart comments** — never narrate what code does; comment only the why, and
  keep it very short. APIs, non-obvious side effects and invariants excepted.
- **Single responsibility** — small, focused functions; if it needs a comment
  to explain what it does, split it.
- **DRY** — single sources of truth. But within this rewrite, share only inside
  a module or via `shared/`; do not invent cross-module abstractions to
  deduplicate two call sites.
- **Clean structure & encapsulation** — related code together, implementation
  hidden, nested conditionals extracted into well-named functions.
- **Leave the code you touch cleaner than you found it — inside the task's
  scope only.** Refactoring outside scope is a task of its own; propose it,
  don't do it. Same for technical debt you notice: record it, move on.

## Scope

Do exactly the assigned task. Do not opportunistically refactor, upgrade
dependencies, or fix unrelated things you notice along the way.
