# A fresh install's migrations, measured

**Task M16-004. All numbers below come from runs executed on this box on
2026-09-12 between 19:50 and 20:00 UTC**, against the local Postgres (5432) and
ClickHouse (8123), on scratch databases that were dropped afterwards.

Carl's scope (2026-09-12): *"Only thing I want here is our existing migrations
will work in a similar fashion"*, narrowed to *"I don't feel worried about 2.
Just try number 1 on new databases is good enough here."* So this is
**fresh databases only** — upgrade-in-place is deliberately not exercised.

## Verdict, first

| Question | Answer |
|---|---|
| Does a brand-new install migrate cleanly, end to end? | **Yes.** Every Prisma migration and every code-migration applied, first try, no errors. |
| Is the sequence idempotent on a second boot? | **Yes** — and also when the ledger is empty but the tables already exist (extra test below). |
| Is the `3-init-ch` failure report real? | **The failure is real and reproduces byte for byte — but it is an artifact of the harness M15-203 used, not of a fresh install.** Neither the original explanation nor the operator's hypothesis is the cause. See [`3-init-ch`](#deliverable-2--the-3-init-ch-verdict). |
| Anything genuinely broken found? | One real hazard, **not** on the first boot: if the *first* boot is interrupted part-way through `3-init-ch`, the *next* boot takes the self-hosting upgrade path on what is really a fresh install. Reported, not fixed — see [Why nothing was fixed](#why-nothing-was-fixed). |

## The shipped command, verified not assumed

`self-hosting/docker-compose.template.yml:152`, `self-hosting/coolify.yml:132`
and `.github/smoke/docker-compose.yml:85` all run the same two lines in the api
container's start command, before `bun run start`:

```sh
cd /app/packages/db && bunx prisma@6.14.0 migrate deploy
cd /app/packages/core && bun scripts/migrate-code.ts
```

`packages/core/scripts/migrate-code.ts` is a one-line forwarder to
`@openpanel/db/scripts/migrate-code`, which reads the environment and calls
`runCodeMigrations` (`packages/db/src/code-migrations/migrate.ts`). Both were
run exactly as written.

## The surface is 153 + 24, not 154 + 27

The task text says 154 Prisma migrations and 27 code-migrations. Measured:

```console
$ find packages/db/prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l
153
$ ls packages/db/src/code-migrations/*.ts | grep -E "/[0-9]+-" | wc -l
24
```

`ls packages/db/prisma/migrations | wc -l` returns 154 because it counts
`migration_lock.toml`, which is not a migration. Prisma agrees: *"153 migrations
found in prisma/migrations"*. The 24 code-migrations are files `1`…`22` with two
`20-` and two `21-` files. The runner's own plan box lists exactly those 24.

## Reproducing it safely

**The local ClickHouse holds the prod-copy dataset every golden test replays
against. Read this section before running anything.**

Pointing `CLICKHOUSE_URL` at a scratch database is **not** isolation, for two
reasons that are easy to miss:

1. `getExistingTables()` (`packages/db/src/clickhouse/migration.ts:174-187`)
   asks `SELECT name FROM system.tables WHERE database = 'openpanel'` — the
   database name is a **literal**, not the one in `CLICKHOUSE_URL`. A run
   pointed at a scratch database still reads the real `openpanel`.
2. `4-add-sessions.ts:111-114` writes `INSERT INTO openpanel.sessions ... FROM
   openpanel.events` — fully qualified. A run pointed at a scratch database
   would still **write** to the real `openpanel`.

So the drill puts a proxy between the migrations and ClickHouse
(`docs/migrations-fresh-install/ch-scratch-proxy.ts`) which rewrites every
`openpanel` token — in the URL and in the SQL — to the scratch database name,
and refuses outright any request that still names `openpanel` or
`openpanel_test`. That is also what makes the run *faithful*: the migration's
own hardcoded database name resolves to the empty scratch database, which is
what it would find on a real fresh install.

```bash
# run 1 + run 2, on scratch databases, with the proxy
bash docs/migrations-fresh-install/fresh-install-drill.sh rewrite

# M15-203's setup: only CLICKHOUSE_URL points at a scratch database
bash docs/migrations-fresh-install/fresh-install-drill.sh guard

# drops ONLY the scratch databases (refuses openpanel / openpanel_test / postgres)
bash docs/migrations-fresh-install/fresh-install-teardown.sh
```

The drill creates `openpanel_m16_004` in both Postgres and ClickHouse
(`SCRATCH_DB` overrides the name), prints the protected databases' table counts
before and after, and dies if something is already listening on the proxy port —
a stale proxy would silently serve the run against the wrong database.

The migrations write a `<migration>.sql` dump next to each migration file
(`writeSqlDump`, `helpers.ts:79-92`). Those files are **untracked and not
gitignored**, so `fresh-install-teardown.sh` removes them
(`rm -f packages/db/src/code-migrations/*.sql`) along with the databases. They are also how M15-203's report came to cite a `3-init-ch.sql` that
does not exist in the repo: it is generated by the failing run itself.

## Deliverable 1 — what actually happened

`bash docs/migrations-fresh-install/fresh-install-drill.sh rewrite`, 2026-09-12
19:54:44 UTC, whole drill **7.8 s wall clock** (`time`):

| Step | Result | Time |
|---|---|---|
| RUN 1 `bunx prisma@6.14.0 migrate deploy` | `153 migrations found` → **"All migrations have been successfully applied."** | 3 s |
| RUN 1 `bun scripts/migrate-code.ts` | all **24** ran, **"Migrations finished"**, exit 0 | 2 s |
| RUN 2 `bunx prisma@6.14.0 migrate deploy` | **"No pending migrations to apply."** | 2 s |
| RUN 2 `bun scripts/migrate-code.ts` | 24 × **"✅ Already Migrated ✅"**, **"Migrations finished"** | 0 s |

**There was no first failure. All 177 applied cleanly** (153 Prisma + 24
code-migrations).

State after each run, read from the scratch databases themselves:

```
_prisma_migrations finished: 153
__code_migrations rows:       24
clickhouse tables:            33   (25 tables/MVs + 8 .inner_id MV storage tables)
```

identical after run 2.

The config the run reported: `isClustered: false`, `isSelfHosting: true`
(`SELF_HOSTED=true`, which is what `self-hosting/.env.template:2`,
`self-hosting/coolify.yml` and `.github/smoke/docker-compose.yml` all set — so
it is the path every self-hoster takes).

### The fresh schema against the live one

```console
$ diff <live openpanel tables> <fresh scratch tables>
17a18,19
> profile_event_property_summary_mv
> profile_event_summary_mv
```

A fresh install produces **exactly the live prod-copy table set plus two MVs**.
That is expected, not drift: migration 20's header says the pre-20 summary MVs
"are left in place and keep receiving inserts. Once the new ones are verified,
dropping them is a one-line follow-up migration" — so a fresh install carries
both generations, and the prod copy simply does not have the older pair.

The dated tables (`events_20251123`, `sessions_20251123`, `profiles_20260504`)
are created by a *fresh* run too — they are the rename-swap halves of
`8-order-keys` and `16-restructure-profiles`, not leftovers.

## Deliverable 2 — the `3-init-ch` verdict

**The failure reproduces exactly, and it is a property of the harness, not of a
fresh install.**

Reproduced with `fresh-install-drill.sh guard` (2026-09-12 19:51 UTC), which is
M15-203's setup — `CLICKHOUSE_URL` pointed at a scratch database and nothing
else:

```
Failed on query RENAME TABLE cohort_events_mv TO cohort_events_mv_tmp
error: Table `openpanel_m16_004`.`cohort_events_mv` doesn't exist.
 type: "UNKNOWN_TABLE",
 code: "60"
```

Character for character M15-203's error, with only the scratch database's name
different (theirs said `openpanel_m15_203`). The proxy log shows why, in one
pair of lines — the request is routed at the scratch database while the SQL asks
about `openpanel`:

```
[POST] /?query_id=...&database=openpanel_m16_004
SELECT name FROM system.tables WHERE database = 'openpanel'
FORMAT JSONEachRow
[POST] /?query_id=...&database=openpanel_m16_004
RENAME TABLE cohort_events_mv TO cohort_events_mv_tmp
```

`getExistingTables()` answered with the **prod copy's 23 tables** (the local
`openpanel`, alphabetically first `cohort_events_mv`), so
`isSelfHostingOld = existingTables.length !== 0 && isSelfHosting` was true, and
the rename block emitted a rename for every one of them — against a database
where none of them exist.

Three explanations, judged against that evidence:

1. **M15-203's stated mechanism — "the migration opens with `RENAME TABLE
   cohort_events_mv TO cohort_events_mv_tmp`, so it cannot run against an empty
   ClickHouse": WRONG.** In the fresh run the same migration's first statement
   is `CREATE DATABASE IF NOT EXISTS openpanel` and it emits **zero** renames
   (`grep -c RENAME` over the run's ClickHouse traffic: the only 6 renames in
   the whole 24-migration sequence are the deliberate table swaps in
   `8-order-keys` and `16-restructure-profiles`). The generated
   `3-init-ch.sql`'s first line after a fresh run is `CREATE DATABASE IF NOT
   EXISTS openpanel;`.
2. **The operator's hypothesis — "migrations 1 and 2 run first and CREATE
   tables, so by migration 3 `existingTables.length !== 0` is true": WRONG, and
   disprovable by reading the two files.** `1-settings.ts` is three lines and a
   no-op (`// Deprecate migration`); `2-accounts.ts` only touches Postgres, and
   on a fresh install it returns immediately (`No users found, skipping
   migration`). Neither creates a ClickHouse table. In the fresh run, migration
   3 saw an empty `existingTables` and took no rename path.
3. **What actually happened: the hardcoded database name in
   `getExistingTables()`.** On a real fresh install the target database *is*
   `openpanel`, so the literal matches and the answer is empty. On a box where
   `openpanel` already holds data and the run is aimed elsewhere — which is
   exactly how you would try to test a fresh install without endangering the
   prod copy — the answer comes from the wrong database, and the upgrade path
   fires. The report was an artifact of the only safe-looking way to run the
   test.

**So: the `3-init-ch` box is not a fresh-install bug, and M15-203's conclusion
("a fresh self-host install is left partially migrated") does not follow from
it.** A fresh install with `SELF_HOSTED=true` completes all 24 migrations.

### But there is a real hazard next door: the retry

`3-init-ch` is not safely retryable on a self-hosted install. The ledger row in
`__code_migrations` is written **after** the migration finishes
(`migrate.ts:96-108`), so if the first boot dies part-way through it — disk
full, ClickHouse restart, container killed — the tables it already created stay
and the ledger row does not. On the next boot `existingTables.length !== 0` is
true, `isSelfHosting` is true, and the upgrade path runs on what is really a
fresh install. The shipped start command makes this easy to reach: it is one
`sh -c` without `set -e`, so a failed migration still lets `bun run start`
execute, and the operator sees a booting api.

Demonstrated directly (2026-09-12 19:57 UTC), on fresh scratch databases:

```console
# boot 1, interrupted: migration 3 runs, its ledger row is never written
$ bun scripts/migrate-code.ts 3-init-ch.ts --no-record
Migrations finished                       # 13 ClickHouse tables created, 0 ledger rows

# boot 2: the retry
$ bun scripts/migrate-code.ts
Migrations finished                       # exit 0 — and:
9 _tmp tables now exist   (every table migration 3 created, renamed aside)
0 INSERT statements ran   (migration 3's two data-move branches need a V1
                           marker table; the renamed tables were empty anyway)
```

and the operator is told to delete them:

```
│  ⚠️ Please run the following command to clean up unused tables:
│  docker compose exec -it op-ch clickhouse-client --query "DROP TABLE IF EXISTS openpanel.cohort_events_mv_tmp"
│  ...
```

On a fresh install those tables are empty, so nothing is lost — the cost is 9
orphaned tables and a frightening message. The same path on a populated
database is what makes it worth recording: with the ledger cleared and the
scratch database fully migrated, a re-run renamed **all 25** tables aside,
created 25 empty ones, moved nothing out of them (migration 3's two
data-move branches need `events_replicated` or `events_v2`, and neither exists
on a V2 install), and still exited 0.

## Deliverable 3 — idempotency

The second run of the whole sequence changed nothing and errored nowhere:

```
========== RUN 2 (idempotency) — prisma migrate deploy ==========
153 migrations found in prisma/migrations
No pending migrations to apply.
========== RUN 2 (idempotency) — code migrations ==========
│  ✅  Already Migrated  ✅      (× 24)
Migrations finished
========== state after run 2 (ok) ==========
[{"applied":153}] [{"code_migrations":24}] 33 clickhouse tables
```

Counts identical to run 1; 0 s of ClickHouse work.

Note **why** it is idempotent: the code-migration half is skipped wholesale by
the `__code_migrations` ledger, so the second boot executes no ClickHouse SQL at
all. That is a property of the ledger, not of the SQL. The stronger property was
tested separately — ledger deleted, all 24 replayed against the already-migrated
scratch database — and **all 24 succeeded** (exit 0, "Migrations finished"), at
the cost of the rename shuffle described above. Both properties hold; only the
first one is what a normal second boot exercises.

## Why nothing was fixed

The fresh-install path works, so there is nothing to fix there. The retry hazard
is real, but the obvious fix is not safe, and the task's own constraint is that
a fix which breaks upgrades is worse than the bug:

- The narrow fix would be to fire the rename only when a **V1 marker** table
  exists — `events_v2`, `events_replicated` or one of the `*_distributed` names
  the migration already probes — rather than on any table at all. That works for
  a non-clustered install.
- It does **not** work clustered. With `isClustered`, `createTable` creates
  `events_replicated` *itself* (`migration.ts:103-115`), so a fresh clustered
  install that retries would match the marker anyway — and would additionally
  match `isSelfHostingPostCluster`, which tries to move data out of
  `events_replicated_tmp`.
- A very old self-host with plain `events` (no `_v2`, no `_replicated`) matches
  no marker, so the marker fix would silently change its behaviour from
  "rename aside, create new" to "keep the old table, schema and all".
- Making the retry safe properly needs a persistent "V2 init already started
  here" marker, which is a new mechanism and a new place to put it — a decision,
  not a patch.

`getExistingTables()` lives in `packages/db/src/clickhouse/migration.ts`, which
is outside this task's scope (`packages/db/src/code-migrations/**`, `docs/**`)
in any case.

## Still unknown

- **Non-default ClickHouse database names are not supported and nothing says
  so.** `getExistingTables()` and `4-add-sessions.ts` hardcode `openpanel`, and
  `3-init-ch.ts` hardcodes `CREATE DATABASE IF NOT EXISTS openpanel`. A
  self-hoster who points `CLICKHOUSE_URL` at a differently-named database gets a
  half-populated `openpanel` alongside it. Pre-existing V1 behaviour; not
  measured beyond noticing it.
- **Clustered fresh install.** Everything here ran `isClustered: false`. The
  clustered path creates different tables and has the sharper version of the
  retry hazard; it needs a real cluster to test.
- **This was not run inside the api image.** The commands are the shipped ones
  and were run from the same repo layout the image ships, but `bunx
  prisma@6.14.0` fetching the CLI at container start (and the registry reach
  that needs) is covered by `.github/smoke`, not by this drill.
- **The `.sql` dumps are untracked and not gitignored.** Adding
  `packages/db/src/code-migrations/.gitignore` would stop a future run dirtying
  the tree and stop the next reader citing a generated file as source, as
  M15-203 did. Not done here: it is not this task's change to make.
