# project.service.ts — V1 → V2 result-set proof (M12-006)

Both ClickHouse statements `packages/core/src/modules/project/project.service.ts`
runs, executed V1 against V2 on the local prod-copy `openpanel`. V1 is the file
at commit `78098bdc`
(`git show HEAD:packages/core/src/modules/project/project.service.ts`), which
builds `getProjectEventsCount` as a `sqlstring.escape`d template string and
`getLastEventPerProject` with `clix`; V2 is the converted file, every value
bound as a `{pN:Type}` param. **Both files were imported into one Bun process
and called with the same inputs** — the SQL below was produced by calling the
real exported functions with a `deps.ch.query` stub that captures
`{query, query_params, clickhouse_settings}`, never by retyping V1 by hand. Each
captured statement was then executed through the local HTTP interface at
`format: 'JSON'` with the settings its own side asked for; V1 went as `query`,
V2 as `query` + `param_pN`. `data` was compared row-for-row and `meta`
column-for-column.

**One case was compared as a set**: `getLastEventPerProject` is
`GROUP BY project_id` with **no `ORDER BY` at all**, so ClickHouse is free to
emit the 1,864 groups in any order and V1-vs-V2 row order carries no meaning.
Its 1,864 rows are identical as a set (`{project_id, last_event_at}` pairs
sorted and compared) and the two sides did in fact come back in different orders
— V1's 3rd/4th rows are `paper`/`2334`, V2's are `2334`/`paper`, same pairs — so
the set comparison is load-bearing here rather than a formality. Nothing was
sorted away that is not explained here.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,850,903 events;
  `distinct_event_names_mv` holds 1,864 projects. Fixtures: `verdict`
  (41,921,451 non-session events) for the positive-row case, and
  `o'brien-prod` — **which does not exist** — for the quote-in-the-value
  escaping case. That second case returns one row whose `count` is 0; its
  positive-row twin is the `verdict` run immediately above it, and it is listed
  because a value carrying a `'` is the whole point of the escaping half of this
  conversion.
- **Machine**: single-node ClickHouse 26.1.3.52 on this box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). **No `IN` / `GLOBAL IN` was changed in either
  direction.** `grep -c GLOBAL` is `0` on the V1 file and `0` on the V2 file;
  both sides emit exactly one `NOT IN` per statement and its operand is a
  literal value list (V1 an inline tuple, V2 an `Array(String)` param) — there
  is no `IN (subquery)` in this module, so the distributed-`IN` trap does not
  arise.
- **Verdict**: **3 statement pairs, all IDENTICAL.**

## `session_timezone`

`clix(client)` with no timezone argument defaults to `'UTC'`
(`query-builder.ts:696-697`) and sends it as
`clickhouse_settings.session_timezone` on every `execute()` (`:562`).
`getProjectEventsCount` was already a raw `chQuery(deps, text)` call and sent
none. V2 preserves both halves via `CLIX_SESSION_TIMEZONE`, and the capture
confirms it per statement:

| statement | built by (V1) | V1 sent | V2 sends |
|---|---|---|---|
| `getProjectEventsCount` | raw `chQuery` | *(none)* | *(none)* |
| `getLastEventPerProject` | `clix` | `UTC` | `UTC` |

## `getProjectEventsCount` — `verdict`

**statement** — IDENTICAL; rows V1/V2 = 1/1; `count` V1/V2 =
**41921451/41921451**; `meta` V1/V2 = `[{"name":"count","type":"UInt64"}]`;
rows_read V1/V2 = 221184/221184; wall V1/V2 = 10 ms / 9 ms;
clickhouse_settings: *(none)* on both.

```sql
-- V1
SELECT sum(event_count) as count FROM distinct_event_names_mv
WHERE project_id = 'verdict' AND name NOT IN ('session_start', 'session_end')
-- V2
SELECT sum(event_count) as count FROM distinct_event_names_mv
WHERE project_id = {p1:String} AND name NOT IN {p2:Array(String)}
-- V2 params: {"p1":"verdict","p2":["session_start","session_end"]}
```

## `getProjectEventsCount` — `o'brien-prod` (quote in the value)

**statement** — IDENTICAL; rows V1/V2 = 1/1; `count` V1/V2 = **0/0**; `meta`
V1/V2 = `[{"name":"count","type":"UInt64"}]`; rows_read V1/V2 = 8192/8192; wall
V1/V2 = 4 ms / 4 ms; clickhouse_settings: *(none)* on both.

The single quote is handled on both sides — V1 by `sqlstring`'s backslash escape
(`'o\'brien-prod'`), V2 by never putting the value in the text at all. No such
project exists in the prod copy, so the count is 0 on both sides; the row-bearing
coverage for this statement is the `verdict` case above.

```sql
-- V1
SELECT sum(event_count) as count FROM distinct_event_names_mv
WHERE project_id = 'o\'brien-prod' AND name NOT IN ('session_start', 'session_end')
-- V2
SELECT sum(event_count) as count FROM distinct_event_names_mv
WHERE project_id = {p1:String} AND name NOT IN {p2:Array(String)}
-- V2 params: {"p1":"o'brien-prod","p2":["session_start","session_end"]}
```

## `getLastEventPerProject`

**statement** — IDENTICAL (**compared as a set**, see the header); rows V1/V2 =
**1864/1864**; `meta` V1/V2 =
`[{"name":"project_id","type":"String"},{"name":"last_event_at","type":"DateTime64(3)"}]`;
rows_read V1/V2 = 10992588/11000780; wall V1/V2 = 125 ms / 134 ms;
clickhouse_settings: `session_timezone=UTC` (both).

`rows_read` differs by 8,192 (one granule) between the two sides. That is index
analysis treating a bound `{p1:Array(String)}` differently from an inline tuple
for the `NOT IN` on a `LowCardinality(String)` column — a perf note, not a
semantic one: the 1,864 returned groups and their `max(created_at)` values are
identical.

```sql
-- V1
SELECT project_id, max(created_at) AS last_event_at FROM distinct_event_names_mv
WHERE name NOT IN ('session_start', 'session_end')
GROUP BY project_id
-- V2
SELECT project_id, max(created_at) AS last_event_at FROM distinct_event_names_mv
WHERE name NOT IN {p1:Array(String)}
GROUP BY project_id
-- V2 params: {"p1":["session_start","session_end"]}
```

## Tests

No test in this module compares generated SQL text, so none had to be retargeted
to compare statement + params. `project.service.test.ts` exercises the Postgres
half of the service through a fake `deps.db`; its assertions are unchanged and
the file is untouched by this task.

## Reproduce

```bash
# getLastEventPerProject, V1
curl -s 'http://127.0.0.1:8123/?database=openpanel&session_timezone=UTC&default_format=JSONCompact' \
  --data-binary "SELECT project_id, max(created_at) AS last_event_at FROM distinct_event_names_mv WHERE name NOT IN ('session_start', 'session_end') GROUP BY project_id"

# getLastEventPerProject, V2
curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=UTC' \
  --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode "param_p1=['session_start','session_end']" \
  --data-urlencode 'query=SELECT project_id, max(created_at) AS last_event_at FROM distinct_event_names_mv WHERE name NOT IN {p1:Array(String)} GROUP BY project_id'
```

Both return 1,864 rows.
