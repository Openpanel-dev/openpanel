# buffers off `sqlstring` — V1 → V2 result-set proof (M12-009)

M12-009 deletes `sqlstring` from every workspace manifest, so the three buffer
files that still imported it had to move onto the `sql` tag first. V1 is the
`sqlstring.escape(...)` text each file built at `30d236fa`; V2 is the tagged
statement in this commit. Both forms were rendered in one Bun process and
executed through the same `@clickhouse/client` (`format: 'JSONCompact'`) — V1
as `query`, V2 as `query` + `query_params`. `meta` and `data` were compared
field for field.

- **Date**: 2026-09-07, run by ralph on this box.
- **Reads**: local prod-copy `openpanel` (319M events), read-only.
- **Mutation**: the `profile-backfill-buffer` lightweight `UPDATE` is a write,
  so it ran against a throwaway `m12009_scratch` database seeded with three
  rows, never against `openpanel` or `openpanel_test`. The database was dropped
  after the run.
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box. Timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`).
- **Verdict**: **4 statements, all IDENTICAL.**

| # | Site | Statement | Rows | old → new |
|---|---|---|---:|---|
| 1 | `group-buffer.ts:84` | `SELECT … FROM groups FINAL WHERE project_id/id` | 1 | 33ms → 8ms |
| 2 | `profile-buffer.ts:222` | batch fetch, `withDateFilter=false` | 2 | 20ms → 20ms |
| 3 | `profile-buffer.ts:222` | batch fetch, `withDateFilter=true` | 0 | 9ms → 8ms |
| 4 | `profile-backfill-buffer.ts:96` | lightweight `UPDATE … CASE session_id` | 3 read back | 7ms → 6ms |

## IN / GLOBAL IN

Every `IN` touched here takes a **literal set** — `(p.id, p.project_id) IN
((…), (…))` and `(project_id, session_id) IN ((…), (…))` — not a subquery. A
literal set is evaluated identically on every shard, so `docs/ENVIRONMENT.md`'s
`IN` vs `GLOBAL IN` trap does not apply and **no `IN` was converted in either
direction**. Binding the tuple members as `{pN:String}` does not change that:
the set is still spelled out in the query text, one placeholder per member.

## Run output

```
==============================================================================
CASE: group-buffer: SELECT ... FROM groups FINAL  [db=openpanel]
--- OLD (clix/sqlstring text) ---
SELECT project_id, id, type, name, properties, created_at
      FROM groups FINAL
      WHERE project_id = 'acade'
        AND id = 'acade'
        AND deleted = 0
--- NEW (sql tag) ---
SELECT project_id, id, type, name, properties, created_at
      FROM groups FINAL
      WHERE project_id = {p1:String}
        AND id = {p2:String}
        AND deleted = 0
--- params ---
{"p1":"acade","p2":"acade"}
old: ok=true rows=1 33ms
new: ok=true rows=1 8ms
RESULT SETS: IDENTICAL
==============================================================================
CASE: profile-buffer: batch fetch (withDateFilter=false)  [db=openpanel]
--- OLD (clix/sqlstring text) ---
SELECT id, project_id, argMax(first_name, p.last_seen_at) AS first_name, argMax(last_name, p.last_seen_at) AS last_name, argMax(email, p.last_seen_at) AS email, argMax(avatar, p.last_seen_at) AS avatar, argMax(properties, p.last_seen_at) AS properties, argMax(is_external, p.last_seen_at) AS is_external, argMax(groups, p.last_seen_at) AS groups, min(created_at) AS created_at, max(p.last_seen_at) AS last_seen_at
            FROM profiles AS p
            WHERE (p.id, p.project_id) IN (('03b7d7d74db08200f7fb3dc912abb51e', '0byte'), ('07deba9fc77b280a8dbc7f823d5c2319', '0byte'))
            
            GROUP BY p.id, p.project_id
--- NEW (sql tag) ---
SELECT id, project_id, argMax(first_name, p.last_seen_at) AS first_name, argMax(last_name, p.last_seen_at) AS last_name, argMax(email, p.last_seen_at) AS email, argMax(avatar, p.last_seen_at) AS avatar, argMax(properties, p.last_seen_at) AS properties, argMax(is_external, p.last_seen_at) AS is_external, argMax(groups, p.last_seen_at) AS groups, min(created_at) AS created_at, max(p.last_seen_at) AS last_seen_at
            FROM profiles AS p
            WHERE (p.id, p.project_id) IN (({p1:String}, {p2:String}), ({p3:String}, {p4:String}))
            
            GROUP BY p.id, p.project_id
--- params ---
{"p1":"03b7d7d74db08200f7fb3dc912abb51e","p2":"0byte","p3":"07deba9fc77b280a8dbc7f823d5c2319","p4":"0byte"}
old: ok=true rows=2 20ms
new: ok=true rows=2 20ms
RESULT SETS: IDENTICAL
==============================================================================
CASE: profile-buffer: batch fetch (withDateFilter=true)  [db=openpanel]
--- OLD (clix/sqlstring text) ---
SELECT id, project_id, argMax(first_name, p.last_seen_at) AS first_name, argMax(last_name, p.last_seen_at) AS last_name, argMax(email, p.last_seen_at) AS email, argMax(avatar, p.last_seen_at) AS avatar, argMax(properties, p.last_seen_at) AS properties, argMax(is_external, p.last_seen_at) AS is_external, argMax(groups, p.last_seen_at) AS groups, min(created_at) AS created_at, max(p.last_seen_at) AS last_seen_at
            FROM profiles AS p
            WHERE (p.id, p.project_id) IN (('03b7d7d74db08200f7fb3dc912abb51e', '0byte'), ('07deba9fc77b280a8dbc7f823d5c2319', '0byte'))
            AND p.last_seen_at > now() - INTERVAL 2 DAY
            GROUP BY p.id, p.project_id
--- NEW (sql tag) ---
SELECT id, project_id, argMax(first_name, p.last_seen_at) AS first_name, argMax(last_name, p.last_seen_at) AS last_name, argMax(email, p.last_seen_at) AS email, argMax(avatar, p.last_seen_at) AS avatar, argMax(properties, p.last_seen_at) AS properties, argMax(is_external, p.last_seen_at) AS is_external, argMax(groups, p.last_seen_at) AS groups, min(created_at) AS created_at, max(p.last_seen_at) AS last_seen_at
            FROM profiles AS p
            WHERE (p.id, p.project_id) IN (({p1:String}, {p2:String}), ({p3:String}, {p4:String}))
            AND p.last_seen_at > now() - INTERVAL 2 DAY
            GROUP BY p.id, p.project_id
--- params ---
{"p1":"03b7d7d74db08200f7fb3dc912abb51e","p2":"0byte","p3":"07deba9fc77b280a8dbc7f823d5c2319","p4":"0byte"}
old: ok=true rows=0 9ms
new: ok=true rows=0 8ms
RESULT SETS: IDENTICAL
```

The `profile-backfill-buffer` case, run against `m12009_scratch`:

```
==============================================================================
CASE: profile-backfill-buffer: lightweight UPDATE ... CASE session_id  [db=m12009_scratch]
--- OLD ---
UPDATE events_replicated
        SET profile_id = CASE session_id
          WHEN 's1' THEN 'prof-1'
WHEN 's2' THEN 'prof-2'
        END
        WHERE (project_id, session_id) IN (('p1', 's1'),('p1', 's2'))
          AND created_at > now() - INTERVAL 6 HOURS
--- NEW ---
UPDATE events_replicated
        SET profile_id = CASE session_id
          WHEN {p1:String} THEN {p2:String}
WHEN {p3:String} THEN {p4:String}
        END
        WHERE (project_id, session_id) IN (({p5:String}, {p6:String}), ({p7:String}, {p8:String}))
          AND created_at > now() - INTERVAL 6 HOURS
--- params ---
{"p1":"s1","p2":"prof-1","p3":"s2","p4":"prof-2","p5":"p1","p6":"s1","p7":"p1","p8":"s2"}
old: ok=true 7ms
new: ok=true 6ms
old rows after: {"meta":[{"name":"project_id","type":"String"},{"name":"session_id","type":"String"},{"name":"profile_id","type":"String"}],"data":[["p1","s1","prof-1"],["p1","s2","prof-2"],["p2","s3","keep"]]}
new rows after: {"meta":[{"name":"project_id","type":"String"},{"name":"session_id","type":"String"},{"name":"profile_id","type":"String"}],"data":[["p1","s1","prof-1"],["p1","s2","prof-2"],["p2","s3","keep"]]}
RESULT SETS: IDENTICAL
```

`m12009_scratch.events_replicated` needed `enable_block_number_column = 1` for
`allow_experimental_lightweight_update` to apply — a property of the throwaway
fixture table, not of the statement; both forms failed identically before it was
set and both succeeded identically after.

## Whitespace-only differences, stated

`profile-backfill-buffer.ts`'s tuple list joins on `', '` where V1 joined on
`','`, and `profile-buffer.ts`'s aggregate column list is now a
`sql.join([...], ', ')` of one fragment per column instead of a
`String[].join(', ')`. Both render the same tokens; the run above is over the
rendered text, so the comparison covers it.
