# `packages/db/scripts` off `clix` / `sqlstring` — result-set proof (M12-009)

M12-009 deletes `query-builder.ts`, `sql-builder.ts` and the `sqlstring`
dependency. Two operator scripts in this directory were the last things in
`packages/db` importing either, so they move onto the `sql` tag in the same
commit. (The gate `tooling/gates/p12-grep-gates.sh` does not scan `scripts/`;
these two had to convert anyway because removing `sqlstring` from
`packages/db/package.json` removes the module they imported.)

V1 is each script's text at `30d236fa`; V2 is the tagged statement in this
commit. Both were rendered in one Bun process and executed through the same
`@clickhouse/client` — V1 as `query`, V2 as `query` + `query_params` — and the
result sets (or, for the writes, the table read back afterwards) compared field
for field.

- **Date**: 2026-09-07, run by ralph on this box.
- **Database**: a throwaway `m12009_scratch`, seeded per case and dropped after
  the run. Both scripts are writers (`ALTER TABLE … UPDATE`, `INSERT … SELECT`),
  so neither could be pointed at the prod-copy `openpanel` or at
  `openpanel_test`.
- **Machine**: single-node ClickHouse 26.1.3.52, 4 vCPU. Timings directional
  only; production is 2 shards × 2 replicas (`docs/ENVIRONMENT.md`).
- **Verdict**: **4 statements, all IDENTICAL.**

| # | Script | Statement | Rows | old → new |
|---|---|---|---:|---|
| 1 | `ch-update-sessions-with-revenue.ts:45` | `SELECT id FROM sessions … LIMIT {n}` | 2 | 5ms → 5ms |
| 2 | `ch-update-sessions-with-revenue.ts:79` | `ALTER TABLE … UPDATE revenue = multiIf(…)` | 4 read back | 11ms → 14ms |
| 3 | `ch-copy-from-remote.ts:95` | `SELECT * FROM remote(…)` | 2 | 7ms → 9ms |
| 4 | `ch-copy-from-remote.ts:97` | `INSERT INTO db.table SELECT * FROM remote(…)` | 3 → 5 | 9ms → 9ms |

## What binding buys here, concretely

`remote()` accepts bound parameters in every argument position — `{p:String}`
for the host, user and password, `{p:Identifier}` for the database and table.
That was verified before the conversion was written (case 3 above) and it is
the whole point: `ch-copy-from-remote.ts` **logs the query it is about to run**,
and V1's text carried the remote password in it. It no longer does — the
`--- params ---` line in the run below is the only place the credential
appears, and the script never prints it.

The `INSERT INTO <db>.<table>` target is the one position a `{x:Identifier}`
param is not accepted, so it goes through `sql.id()`, which throws on anything
that is not a bare identifier rather than falling back to interpolation
(ADR-013 R3).

## Type choices

- `revenue` is `Float64` (`system.columns`), so the `multiIf` branches bind as
  `sql.float64` — the type ClickHouse infers for V1's bare integer literal in
  that expression, not a wider guess.
- `LIMIT` takes `sql.uint64`.
- The two date bounds bind as `String`, exactly the form V1 quoted, so
  `date_time_input_format: 'best_effort'` parses them identically.

## IN / GLOBAL IN

`WHERE id IN ('a','b')` became `WHERE id IN {p:Array(String)}`. Both are a
**literal set**, not a subquery, so they evaluate identically on every shard and
`docs/ENVIRONMENT.md`'s `IN` vs `GLOBAL IN` trap does not apply. No `IN` was
converted in either direction. `remote()` is a table function evaluated on the
initiator, unchanged by the rewrite.

## Run output

```
==============================================================================
CASE: ch-update-sessions-with-revenue: SELECT id FROM sessions  [db=m12009_scratch]
--- OLD ---
SELECT id FROM sessions WHERE created_at >= '2025-11-10 00:00:00' AND created_at < '2025-11-10 01:00:00' AND project_id = 'public-web' LIMIT 2
--- NEW ---
SELECT id
      FROM sessions
      WHERE created_at >= {p1:String}
        AND created_at < {p2:String}
        AND project_id = {p3:String}
      LIMIT {p4:UInt64}
--- params ---
{"p1":"2025-11-10 00:00:00","p2":"2025-11-10 01:00:00","p3":"public-web","p4":2}
old: ok=true 5ms 
new: ok=true 5ms 
old: {"meta":[{"name":"id","type":"String"}],"data":[["sess-a"],["sess-b"]]}
new: {"meta":[{"name":"id","type":"String"}],"data":[["sess-a"],["sess-b"]]}
RESULT SETS: IDENTICAL
==============================================================================
CASE: ch-update-sessions-with-revenue: ALTER TABLE ... UPDATE multiIf  [db=m12009_scratch]
--- OLD ---
ALTER TABLE sessions UPDATE revenue = multiIf(id = 'sess-a', 1500, id = 'sess-b', 20000, revenue) WHERE id IN ('sess-a', 'sess-b')
--- NEW ---
ALTER TABLE sessions UPDATE revenue = multiIf(id = {p1:String}, {p2:Float64}, id = {p3:String}, {p4:Float64}, revenue) WHERE id IN {p5:Array(String)}
--- params ---
{"p1":"sess-a","p2":1500,"p3":"sess-b","p4":20000,"p5":["sess-a","sess-b"]}
old: ok=true 11ms 
new: ok=true 14ms 
old rows after: {"meta":[{"name":"id","type":"String"},{"name":"revenue","type":"Float64"}],"data":[["sess-a",1500],["sess-b",20000],["sess-c",0],["sess-d",0]]}
new rows after: {"meta":[{"name":"id","type":"String"},{"name":"revenue","type":"Float64"}],"data":[["sess-a",1500],["sess-b",20000],["sess-c",0],["sess-d",0]]}
RESULT SETS: IDENTICAL
==============================================================================
CASE: ch-copy-from-remote: INSERT INTO <db>.<table> SELECT * FROM remote(...)  [db=m12009_scratch]
--- OLD SELECT ---
SELECT * FROM remote('127.0.0.1:9000', 'm12009_scratch', 'copy_target', 'default', '') WHERE created_at BETWEEN '2025-11-10 00:00:00' AND '2025-11-11 00:00:00' AND project_id IN ('p1', 'p2')
--- NEW SELECT ---
SELECT * FROM remote({p1:String}, {p2:Identifier}, {p3:Identifier}, {p4:String}, {p5:String}) WHERE created_at BETWEEN {p6:String} AND {p7:String} AND project_id IN {p8:Array(String)}
--- params (note: credentials are NOT in the text) ---
{"p1":"127.0.0.1:9000","p2":"m12009_scratch","p3":"copy_target","p4":"default","p5":"","p6":"2025-11-10 00:00:00","p7":"2025-11-11 00:00:00","p8":["p1","p2"]}
old: ok=true 7ms 
new: ok=true 9ms 
old: {"meta":[{"name":"project_id","type":"String"},{"name":"created_at","type":"DateTime64(3)"},{"name":"name","type":"String"}],"data":[["p1","2025-11-10 00:05:00.000","a"],["p2","2025-11-10 00:06:00.000","b"]]}
new: {"meta":[{"name":"project_id","type":"String"},{"name":"created_at","type":"DateTime64(3)"},{"name":"name","type":"String"}],"data":[["p1","2025-11-10 00:05:00.000","a"],["p2","2025-11-10 00:06:00.000","b"]]}
SELECT RESULT SETS: IDENTICAL
--- OLD INSERT ---
INSERT INTO m12009_scratch.copy_target SELECT * FROM remote('127.0.0.1:9000', 'm12009_scratch', 'copy_target', 'default', '') WHERE created_at BETWEEN '2025-11-10 00:00:00' AND '2025-11-11 00:00:00' AND project_id IN ('p1', 'p2')
--- NEW INSERT ---
INSERT INTO m12009_scratch.copy_target SELECT * FROM remote({p1:String}, {p2:Identifier}, {p3:Identifier}, {p4:String}, {p5:String}) WHERE created_at BETWEEN {p6:String} AND {p7:String} AND project_id IN {p8:Array(String)}
old INSERT: ok=true 9ms 
new INSERT: ok=true 9ms 
count before: {"meta":[{"name":"count()","type":"UInt64"}],"data":[[3]]} after old: {"meta":[{"name":"count()","type":"UInt64"}],"data":[[5]]} after new: {"meta":[{"name":"count()","type":"UInt64"}],"data":[[5]]}
INSERT EFFECT: IDENTICAL
```
