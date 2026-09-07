# insight-modules — V1 → V2 result-set proof (M12-007)

The five insight detection modules (`devices`, `geo`, `page-trends`,
`referrers`, `entry-pages`) moved off `createCachedClix` onto the ADR-013 `sql`
tag. V1 is the code at `43dedb75` (this task's parent), extracted with
`git show HEAD:<path>` into `/tmp/m12007/v1src/` with only its relative import
specifiers rewritten to absolute paths — the SQL-producing code is byte-identical
to HEAD. Both sides were driven through the **same** `enumerateDimensions(ctx)`
entry point with the same `projectId`, the same `now` and the same three window
kinds; V1's ClickHouse client and V2's `ctx.runQuery` were each replaced by a
recorder, so the two statement lists come from the real code paths rather than
from retyped SQL. Every V1 statement was then executed as `query`, every V2
statement as `query` + `query_params`, against the same local prod-copy
ClickHouse over one HTTP endpoint with `default_format=JSON` and
`session_timezone=UTC` on both sides (clix's own default — `query-builder.ts:696`
sets `timezone ?? 'UTC'` and `:562` sends it as `session_timezone`; the new
wrapper defaults to `'UTC'` identically). `data` and `meta` were compared in
full. None of these statements has a total `ORDER BY` — every one is a bare
`GROUP BY` or a single-row aggregate — so **all 35 cases were compared as sets**
(rows sorted by their JSON encoding on both sides before comparison); `meta` was
compared in column order.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,850,963 events. Project
  `openalternative`, driven at `now = 2026-08-26T12:00:00.000Z` (its
  `screen_view` events stop on 2026-08-25, and this `now` is what keeps every
  page-trends case non-empty). Project timezone is not read by these modules —
  clix sent `session_timezone: 'UTC'` unconditionally and so does the
  replacement. No fixture is empty here: **every one of the 35 cases returns a
  non-zero row count on both sides**.
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). None of these statements contains `IN`, `GLOBAL IN`,
  `JOIN` or a subquery of any kind: `grep -nE 'GLOBAL |[^A-Za-z_]IN[ (]|JOIN'`
  over the five converted `*.module.ts` files returns nothing, and the same grep
  over their V1 form at `43dedb75` also returns nothing. No `IN`/`GLOBAL IN` was
  introduced, removed or rewritten in either direction.
- **Verdict**: **35 cases, all IDENTICAL.**

## Coverage

Each module issues 5 distinct statements — 3 on the `yesterday` branch, 2 on the
`rolling_*` branch. Both branches were exercised, and the `rolling_*` branch
twice (`rolling_7d` and `rolling_30d`, different dates through the same text),
giving 7 executed cases per module and 35 in total.

## Cache-key derivation, before and after

| | V1 (`cached-clix.ts`, deleted) | V2 (`cached-query.ts`) |
|---|---|---|
| key | `sha256(query.toSQL() + '\|' + timezone)` (lines 32-36) | `sha256(query + '\|' + JSON.stringify(query_params) + '\|' + timezone)` |
| why it worked / must change | clix inlined every value as a literal, so the text alone identified the query | the `sql` tag renders `{p1:Type}, {p2:Type}, …` from a per-render counter, so two statements differing only in their bound values render to the **same text** |
| timezone | `timezone ?? 'UTC'`, folded into the key | unchanged, including the `'UTC'` default |
| `session_timezone` | `clickhouse_settings.session_timezone` on every `execute()` | `clickhouse_settings.session_timezone` on every `chQuery` |
| cache | caller-supplied `Map`, one per module+window, built in `engine.ts` | unchanged — same `Map`, same place, same lifetime |
| miss path | `clix(...).execute()` | `chQuery(deps, statement, settings)` — same retry/round-robin client, now carrying the request's logger (ADR-018) |

`JSON.stringify(query_params)` is stable because `toStatement()` assigns
`p1, p2, …` in render order from one counter; the keys are deliberately **not**
sorted, so two fragments that differ only in param order stay different keys.

`packages/core/src/modules/insight/src/cached-query.test.ts` pins all of it —
in particular `equal text with different params is a different key`, which first
asserts the two statements' rendered text is byte-equal (the collision a
text-only key would produce) and then that both reach ClickHouse.

## Tests

No existing insight test compared generated SQL text: the three test files in
this module (`insight.service.test.ts`, `insight.jobs.test.ts`,
`insight.rpc.test.ts`) assert delegation and payload shapes only, and none of
them is touched by this task. There was therefore no text-comparing test to
retarget onto `statement + params`; the new `cached-query.test.ts` is the only
test added, and it compares statement text **and** params.

## Cases

### devices

**devices — current window, grouped (`yesterday`)** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 16384/16384; wall V1/V2 = 11 ms / 10 ms; `meta` V1/V2 (identical) = `[{"name": "device", "type": "LowCardinality(String)"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT device, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59' GROUP BY device

-- V2
SELECT device, count(*) as cnt
FROM sessions
WHERE project_id = {p1:String}
  AND sign = {p2:Int8}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY device

-- V2 params: {"p1": "openalternative", "p2": 1, "p3": "2026-08-25 00:00:00", "p4": "2026-08-25 23:59:59"}
```

**devices — baseline 28 days, grouped by day (`yesterday`)** — IDENTICAL; rows V1/V2 = 99/99; rows_read V1/V2 = 212928/212928; wall V1/V2 = 23 ms / 18 ms; `meta` V1/V2 (identical) = `[{"name": "date", "type": "Date"}, {"name": "device", "type": "LowCardinality(String)"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT toDate(created_at) as date, device, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-24 23:59:59' GROUP BY date, device

-- V2
SELECT toDate(created_at) as date, device, count(*) as cnt
FROM sessions
WHERE project_id = {p1:String}
  AND sign = {p2:Int8}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY date, device

-- V2 params: {"p1": "openalternative", "p2": 1, "p3": "2026-07-28 00:00:00", "p4": "2026-08-24 23:59:59"}
```

**devices — current-window total (`yesterday`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 270245/270245; wall V1/V2 = 15 ms / 12 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59') as cur_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total
FROM sessions
WHERE project_id = {p3:String}
  AND sign = {p4:Int8}
  AND created_at BETWEEN {p5:DateTime64(3)} AND {p6:DateTime64(3)}

-- V2 params: {"p1": "2026-08-25 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "openalternative", "p4": 1, "p5": "2026-07-28 00:00:00", "p6": "2026-08-25 23:59:59"}
```

**devices — current + baseline countIf, grouped (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 5/5; rows_read V1/V2 = 131025/131025; wall V1/V2 = 11 ms / 10 ms; `meta` V1/V2 (identical) = `[{"name": "device", "type": "LowCardinality(String)"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT device, countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59' GROUP BY device

-- V2
SELECT device, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY device

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**devices — current + baseline totals (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 131025/131025; wall V1/V2 = 9 ms / 7 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**devices — current + baseline countIf, grouped (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 6/6; rows_read V1/V2 = 311191/311191; wall V1/V2 = 16 ms / 14 ms; `meta` V1/V2 (identical) = `[{"name": "device", "type": "LowCardinality(String)"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT device, countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59' GROUP BY device

-- V2
SELECT device, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY device

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**devices — current + baseline totals (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 311191/311191; wall V1/V2 = 10 ms / 9 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

### geo

**geo — current window, grouped (`yesterday`)** — IDENTICAL; rows V1/V2 = 154/154; rows_read V1/V2 = 16384/16384; wall V1/V2 = 5 ms / 4 ms; `meta` V1/V2 (identical) = `[{"name": "country", "type": "LowCardinality(FixedString(2))"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT country, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59' GROUP BY country

-- V2
SELECT country, count(*) as cnt
FROM sessions
WHERE project_id = {p1:String}
  AND sign = {p2:Int8}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY country

-- V2 params: {"p1": "openalternative", "p2": 1, "p3": "2026-08-25 00:00:00", "p4": "2026-08-25 23:59:59"}
```

**geo — baseline 28 days, grouped by day (`yesterday`)** — IDENTICAL; rows V1/V2 = 3876/3876; rows_read V1/V2 = 212928/212928; wall V1/V2 = 14 ms / 13 ms; `meta` V1/V2 (identical) = `[{"name": "date", "type": "Date"}, {"name": "country", "type": "LowCardinality(FixedString(2))"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT toDate(created_at) as date, country, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-24 23:59:59' GROUP BY date, country

-- V2
SELECT toDate(created_at) as date, country, count(*) as cnt
FROM sessions
WHERE project_id = {p1:String}
  AND sign = {p2:Int8}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY date, country

-- V2 params: {"p1": "openalternative", "p2": 1, "p3": "2026-07-28 00:00:00", "p4": "2026-08-24 23:59:59"}
```

**geo — current-window total (`yesterday`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 270245/270245; wall V1/V2 = 9 ms / 8 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59') as cur_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total
FROM sessions
WHERE project_id = {p3:String}
  AND sign = {p4:Int8}
  AND created_at BETWEEN {p5:DateTime64(3)} AND {p6:DateTime64(3)}

-- V2 params: {"p1": "2026-08-25 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "openalternative", "p4": 1, "p5": "2026-07-28 00:00:00", "p6": "2026-08-25 23:59:59"}
```

**geo — current + baseline countIf, grouped (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 202/202; rows_read V1/V2 = 131025/131025; wall V1/V2 = 8 ms / 7 ms; `meta` V1/V2 (identical) = `[{"name": "country", "type": "LowCardinality(FixedString(2))"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT country, countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59' GROUP BY country

-- V2
SELECT country, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY country

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**geo — current + baseline totals (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 131025/131025; wall V1/V2 = 7 ms / 12 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**geo — current + baseline countIf, grouped (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 213/213; rows_read V1/V2 = 311191/311191; wall V1/V2 = 14 ms / 15 ms; `meta` V1/V2 (identical) = `[{"name": "country", "type": "LowCardinality(FixedString(2))"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT country, countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59' GROUP BY country

-- V2
SELECT country, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY country

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**geo — current + baseline totals (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 311191/311191; wall V1/V2 = 11 ms / 10 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

### page-trends

**page-trends — current window, grouped (`yesterday`)** — IDENTICAL; rows V1/V2 = 1057/1057; rows_read V1/V2 = 32755/32755; wall V1/V2 = 8 ms / 8 ms; `meta` V1/V2 (identical) = `[{"name": "origin", "type": "String"}, {"name": "path", "type": "String"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT origin, path, count(*) as cnt FROM events WHERE project_id = 'openalternative' AND name = 'screen_view' AND created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59' GROUP BY origin, path

-- V2
SELECT origin, path, count(*) as cnt
FROM events
WHERE project_id = {p1:String}
  AND name = {p2:String}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY origin, path

-- V2 params: {"p1": "openalternative", "p2": "screen_view", "p3": "2026-08-25 00:00:00", "p4": "2026-08-25 23:59:59"}
```

**page-trends — baseline 28 days, grouped by day (`yesterday`)** — IDENTICAL; rows V1/V2 = 54996/54996; rows_read V1/V2 = 1212377/1212377; wall V1/V2 = 160 ms / 148 ms; `meta` V1/V2 (identical) = `[{"name": "date", "type": "Date"}, {"name": "origin", "type": "String"}, {"name": "path", "type": "String"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT toDate(created_at) as date, origin, path, count(*) as cnt FROM events WHERE project_id = 'openalternative' AND name = 'screen_view' AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-24 23:59:59' GROUP BY date, origin, path

-- V2
SELECT toDate(created_at) as date, origin, path, count(*) as cnt
FROM events
WHERE project_id = {p1:String}
  AND name = {p2:String}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY date, origin, path

-- V2 params: {"p1": "openalternative", "p2": "screen_view", "p3": "2026-07-28 00:00:00", "p4": "2026-08-24 23:59:59"}
```

**page-trends — current-window total (`yesterday`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 1245144/1245144; wall V1/V2 = 40 ms / 28 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59') as cur_total FROM events WHERE project_id = 'openalternative' AND name = 'screen_view' AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total
FROM events
WHERE project_id = {p3:String}
  AND name = {p4:String}
  AND created_at BETWEEN {p5:DateTime64(3)} AND {p6:DateTime64(3)}

-- V2 params: {"p1": "2026-08-25 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "openalternative", "p4": "screen_view", "p5": "2026-07-28 00:00:00", "p6": "2026-08-25 23:59:59"}
```

**page-trends — current + baseline countIf, grouped (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 6608/6608; rows_read V1/V2 = 581593/581593; wall V1/V2 = 42 ms / 50 ms; `meta` V1/V2 (identical) = `[{"name": "origin", "type": "String"}, {"name": "path", "type": "String"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT origin, path, countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base FROM events WHERE project_id = 'openalternative' AND name = 'screen_view' AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59' GROUP BY origin, path

-- V2
SELECT origin, path, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM events
WHERE project_id = {p5:String}
  AND name = {p6:String}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY origin, path

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": "screen_view", "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**page-trends — current + baseline totals (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 581593/581593; wall V1/V2 = 32 ms / 21 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base_total FROM events WHERE project_id = 'openalternative' AND name = 'screen_view' AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM events
WHERE project_id = {p5:String}
  AND name = {p6:String}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": "screen_view", "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**page-trends — current + baseline countIf, grouped (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 13246/13246; rows_read V1/V2 = 1687334/1687334; wall V1/V2 = 99 ms / 112 ms; `meta` V1/V2 (identical) = `[{"name": "origin", "type": "String"}, {"name": "path", "type": "String"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT origin, path, countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base FROM events WHERE project_id = 'openalternative' AND name = 'screen_view' AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59' GROUP BY origin, path

-- V2
SELECT origin, path, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM events
WHERE project_id = {p5:String}
  AND name = {p6:String}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY origin, path

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": "screen_view", "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**page-trends — current + baseline totals (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 1687334/1687334; wall V1/V2 = 42 ms / 31 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base_total FROM events WHERE project_id = 'openalternative' AND name = 'screen_view' AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM events
WHERE project_id = {p5:String}
  AND name = {p6:String}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": "screen_view", "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

### referrers

**referrers — current window, grouped (`yesterday`)** — IDENTICAL; rows V1/V2 = 75/75; rows_read V1/V2 = 16384/16384; wall V1/V2 = 5 ms / 5 ms; `meta` V1/V2 (identical) = `[{"name": "referrer_name", "type": "String"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT referrer_name, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59' GROUP BY referrer_name

-- V2
SELECT referrer_name, count(*) as cnt
FROM sessions
WHERE project_id = {p1:String}
  AND sign = {p2:Int8}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY referrer_name

-- V2 params: {"p1": "openalternative", "p2": 1, "p3": "2026-08-25 00:00:00", "p4": "2026-08-25 23:59:59"}
```

**referrers — baseline 28 days, grouped by day (`yesterday`)** — IDENTICAL; rows V1/V2 = 2112/2112; rows_read V1/V2 = 212928/212928; wall V1/V2 = 15 ms / 15 ms; `meta` V1/V2 (identical) = `[{"name": "date", "type": "Date"}, {"name": "referrer_name", "type": "String"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT toDate(created_at) as date, referrer_name, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-24 23:59:59' GROUP BY date, referrer_name

-- V2
SELECT toDate(created_at) as date, referrer_name, count(*) as cnt
FROM sessions
WHERE project_id = {p1:String}
  AND sign = {p2:Int8}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY date, referrer_name

-- V2 params: {"p1": "openalternative", "p2": 1, "p3": "2026-07-28 00:00:00", "p4": "2026-08-24 23:59:59"}
```

**referrers — current-window total (`yesterday`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 270245/270245; wall V1/V2 = 12 ms / 11 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59') as cur_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total
FROM sessions
WHERE project_id = {p3:String}
  AND sign = {p4:Int8}
  AND created_at BETWEEN {p5:DateTime64(3)} AND {p6:DateTime64(3)}

-- V2 params: {"p1": "2026-08-25 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "openalternative", "p4": 1, "p5": "2026-07-28 00:00:00", "p6": "2026-08-25 23:59:59"}
```

**referrers — current + baseline countIf, grouped (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 331/331; rows_read V1/V2 = 131025/131025; wall V1/V2 = 10 ms / 10 ms; `meta` V1/V2 (identical) = `[{"name": "referrer_name", "type": "String"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT referrer_name, countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59' GROUP BY referrer_name

-- V2
SELECT referrer_name, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY referrer_name

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**referrers — current + baseline totals (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 131025/131025; wall V1/V2 = 8 ms / 8 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**referrers — current + baseline countIf, grouped (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 798/798; rows_read V1/V2 = 311191/311191; wall V1/V2 = 16 ms / 13 ms; `meta` V1/V2 (identical) = `[{"name": "referrer_name", "type": "String"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT referrer_name, countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59' GROUP BY referrer_name

-- V2
SELECT referrer_name, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY referrer_name

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**referrers — current + baseline totals (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 311191/311191; wall V1/V2 = 9 ms / 9 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

### entry-pages

**entry-pages — current window, grouped (`yesterday`)** — IDENTICAL; rows V1/V2 = 1191/1191; rows_read V1/V2 = 16384/16384; wall V1/V2 = 7 ms / 6 ms; `meta` V1/V2 (identical) = `[{"name": "entry_origin", "type": "LowCardinality(String)"}, {"name": "entry_path", "type": "String"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT entry_origin, entry_path, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59' GROUP BY entry_origin, entry_path

-- V2
SELECT entry_origin, entry_path, count(*) as cnt
FROM sessions
WHERE project_id = {p1:String}
  AND sign = {p2:Int8}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY entry_origin, entry_path

-- V2 params: {"p1": "openalternative", "p2": 1, "p3": "2026-08-25 00:00:00", "p4": "2026-08-25 23:59:59"}
```

**entry-pages — baseline 28 days, grouped by day (`yesterday`)** — IDENTICAL; rows V1/V2 = 34473/34473; rows_read V1/V2 = 212928/212928; wall V1/V2 = 94 ms / 93 ms; `meta` V1/V2 (identical) = `[{"name": "date", "type": "Date"}, {"name": "entry_origin", "type": "LowCardinality(String)"}, {"name": "entry_path", "type": "String"}, {"name": "cnt", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT toDate(created_at) as date, entry_origin, entry_path, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-24 23:59:59' GROUP BY date, entry_origin, entry_path

-- V2
SELECT toDate(created_at) as date, entry_origin, entry_path, count(*) as cnt
FROM sessions
WHERE project_id = {p1:String}
  AND sign = {p2:Int8}
  AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}
GROUP BY date, entry_origin, entry_path

-- V2 params: {"p1": "openalternative", "p2": 1, "p3": "2026-07-28 00:00:00", "p4": "2026-08-24 23:59:59"}
```

**entry-pages — current-window total (`yesterday`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 270245/270245; wall V1/V2 = 15 ms / 13 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59') as cur_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-07-28 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total
FROM sessions
WHERE project_id = {p3:String}
  AND sign = {p4:Int8}
  AND created_at BETWEEN {p5:DateTime64(3)} AND {p6:DateTime64(3)}

-- V2 params: {"p1": "2026-08-25 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "openalternative", "p4": 1, "p5": "2026-07-28 00:00:00", "p6": "2026-08-25 23:59:59"}
```

**entry-pages — current + baseline countIf, grouped (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 5724/5724; rows_read V1/V2 = 131025/131025; wall V1/V2 = 38 ms / 28 ms; `meta` V1/V2 (identical) = `[{"name": "entry_origin", "type": "LowCardinality(String)"}, {"name": "entry_path", "type": "String"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT entry_origin, entry_path, countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59' GROUP BY entry_origin, entry_path

-- V2
SELECT entry_origin, entry_path, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY entry_origin, entry_path

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**entry-pages — current + baseline totals (`rolling_7d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 131025/131025; wall V1/V2 = 10 ms / 8 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-08-19 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-18 23:59:59') as base_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-12 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-08-19 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-08-12 00:00:00", "p4": "2026-08-18 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-08-12 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**entry-pages — current + baseline countIf, grouped (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 11423/11423; rows_read V1/V2 = 311191/311191; wall V1/V2 = 41 ms / 46 ms; `meta` V1/V2 (identical) = `[{"name": "entry_origin", "type": "LowCardinality(String)"}, {"name": "entry_path", "type": "String"}, {"name": "cur", "type": "UInt64"}, {"name": "base", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT entry_origin, entry_path, countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59' GROUP BY entry_origin, entry_path

-- V2
SELECT entry_origin, entry_path, countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}
GROUP BY entry_origin, entry_path

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

**entry-pages — current + baseline totals (`rolling_30d`)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 311191/311191; wall V1/V2 = 14 ms / 9 ms; `meta` V1/V2 (identical) = `[{"name": "cur_total", "type": "UInt64"}, {"name": "base_total", "type": "UInt64"}]`; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT countIf(created_at BETWEEN '2026-07-27 00:00:00' AND '2026-08-25 23:59:59') as cur_total, countIf(created_at BETWEEN '2026-06-27 00:00:00' AND '2026-07-26 23:59:59') as base_total FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-06-27 00:00:00' AND '2026-08-25 23:59:59'

-- V2
SELECT countIf(created_at BETWEEN {p1:DateTime64(3)} AND {p2:DateTime64(3)}) as cur_total, countIf(created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)}) as base_total
FROM sessions
WHERE project_id = {p5:String}
  AND sign = {p6:Int8}
  AND created_at BETWEEN {p7:DateTime64(3)} AND {p8:DateTime64(3)}

-- V2 params: {"p1": "2026-07-27 00:00:00", "p2": "2026-08-25 23:59:59", "p3": "2026-06-27 00:00:00", "p4": "2026-07-26 23:59:59", "p5": "openalternative", "p6": 1, "p7": "2026-06-27 00:00:00", "p8": "2026-08-25 23:59:59"}
```

## Reproducing any case

V1 is the literal text above; V2 is the text plus `param_pN=` values:

```bash
# V1 (devices / current window, grouped)
curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=UTC' \
  --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode "query=SELECT device, count(*) as cnt FROM sessions WHERE project_id = 'openalternative' AND sign = 1 AND created_at BETWEEN '2026-08-25 00:00:00' AND '2026-08-25 23:59:59' GROUP BY device"

# V2
curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=UTC' \
  --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode 'param_p1=openalternative' \
  --data-urlencode 'param_p2=1' \
  --data-urlencode 'param_p3=2026-08-25 00:00:00' \
  --data-urlencode 'param_p4=2026-08-25 23:59:59' \
  --data-urlencode 'query=SELECT device, count(*) as cnt FROM sessions WHERE project_id = {p1:String} AND sign = {p2:Int8} AND created_at BETWEEN {p3:DateTime64(3)} AND {p4:DateTime64(3)} GROUP BY device'
```

Both return the same three rows.

## Conversion notes

- **`DateTime64(3)`, not `String`.** `created_at` is `DateTime64(3)` and V1
  compared it against a quoted literal, which ClickHouse converts to that type.
  Measured 2026-09-07 on this box: `{p:DateTime}`, `{p:DateTime64(3)}` and
  `{p:String}` all return the identical count, but only `DateTime64(3)`
  reproduces V1's `rows_read` exactly (163,730 for `{p:String}` vs 212,831 for
  the literal on a probe query), i.e. only it keeps the same index analysis.
- **The date strings are unchanged.** clix's `escapeDate` ran
  `sqlstring.escape(clix.datetime(d))` = `toISOString().slice(0,19)`, and
  `formatClickhouseDate` produces the same string for the same input — including
  the truncation of `getEndOfDay`'s `.999` milliseconds to `23:59:59`. The
  `countIf(...)` expressions already used `formatClickhouseDate` in V1 (they
  went through `clix.exp`, which bypasses `escapeDate`), so both sides of every
  window boundary agree byte-for-byte.
- **`sign = 1` and `name = 'screen_view'` are now bound**, as `{pN:Int8}` and
  `{pN:String}`. Both were *values* handed to `clix.where(...)` in V1, so they
  bind under the mechanical rule; the emitted comparison is unchanged.
- **`escapeDate`'s date-substring rewrite (recipe trap 1) is not reachable
  here.** The only strings V1 escaped were the project id and the window
  boundaries; no `SELECT` expression or column name in these five modules
  contains a date-shaped substring, so nothing relied on the implicit re-quoting
  and no V2 text had to add a quote back. The proof's 35 identical texts are the
  evidence.
- **Bound through the real driver too, not only over HTTP.** The 35 cases above
  were executed over ClickHouse's HTTP interface (`param_pN=`), which is what
  makes them reproducible with `curl`. As a separate check on 2026-09-07,
  `devicesModule.enumerateDimensions` was run once with `ctx.runQuery` wired to a
  real `@clickhouse/client` `query({query, query_params, …})` against local
  prod-copy `openpanel`; it returned
  `["device:mobile", "device:desktop", "device:tablet", "device:smarttv"]`, so
  the `{pN:DateTime64(3)}` / `{pN:Int8}` / `{pN:String}` bindings survive the
  driver's own parameter serialization, not just the query string.
- **`session_timezone` is pinned, not dropped** (recipe trap 3): the new wrapper
  defaults to `'UTC'` and sends it on every statement, exactly as
  `clix(client, undefined)` did.
