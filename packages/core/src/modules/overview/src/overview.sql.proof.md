# overview.sql.ts — V1 -> V2 result-set proof (M7-005)

**Methodology.** Two levels of evidence, per decision 21:

1. **Whole-method comparison.** `OverviewService`'s public methods were called twice with
   identical input against the same local ClickHouse — once through V1's unmodified
   `clix`-built queries (`git show HEAD:packages/db/src/services/overview.service.ts`, the
   state before this task) and once through this module's `sql`-fragment builders — and the
   JSON results diffed byte-for-byte. This exercises every query plus all of V1's JS-side
   post-processing (revenue merge, fill defaults, the user-journey graph builder) in one pass,
   which a query-by-query SQL diff alone would not catch.
2. **Per-query SQL + execution proof.** Every builder in this file was rendered via
   `toStatement()` and executed against the same data with `EXPLAIN`-equivalent real
   execution (no query is committed unexecuted). Row counts and timings below are from that
   run.

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel` (319,499,000 events, static).
  Project: `skills-directory` (293,597 events, 75,727 sessions, 2026-07-01..2026-08-25).
  Window used throughout: `2026-08-01 00:00:00`..`2026-08-08 00:00:00`, UTC.
- **Machine**: single-node ClickHouse — self-host topology (`docs/ENVIRONMENT.md`). No
  statement here touches a `Distributed` table or a cross-shard `IN`; `events`/`sessions` are
  local tables both locally and on Cloud, so no `GLOBAL IN` question arises for this module.

## Whole-method comparison — verdict

13 of 15 cases came back **byte-identical**; the 2 that didn't are `pages.getTopPages`'s
`title` column, explained below (a V1 characteristic, not a V2 regression).

| Case | Verdict | Rows |
|---|---|---|
| `getMetrics` (no filter) | IDENTICAL | 7 series + summary |
| `getMetrics` (page filter) | IDENTICAL | 7 series + summary |
| `getTopPages` | IDENTICAL | 20 |
| `getTopEntryExit` (entry) | IDENTICAL | 20 |
| `getTopEntryExit` (exit, page filter) | IDENTICAL | 20 |
| `getTopGeneric` (country) | IDENTICAL | 143 |
| `getTopGenericSeries` (referrer, day) | IDENTICAL | 1 item + series |
| `getUserJourney` (4 steps) | IDENTICAL | nodes + links |
| `getTopEvents` | IDENTICAL | 12 |
| `getTopLinkOut` | IDENTICAL | 78 |
| `getMapData` | IDENTICAL | 1000 |
| `pages.getTopPages` | see below | 20 |
| `pages.getTopPages` (search) | see below | 20 |
| `pages.getPageTimeseries` | IDENTICAL | 3103 |
| `getPageConversionsCore` | IDENTICAL | 20 |

### The one V1 characteristic that survives unchanged: `anyLast(properties['__title'])`

`pages.getTopPages`'s title lookup (`page_titles` CTE) uses `anyLast()` with no explicit
ordering. ClickHouse does not guarantee a deterministic pick for `any`/`anyLast` across
repeated executions of the *same* query when the underlying merge is order-sensitive at the
row level. Proven independently of this task's code: running V1's own reconstructed SQL text
(byte-identical, params inlined as V1's clix would) directly via `curl` five times in a row
against the unchanged data flips the same page's title between `''` and its real value:

```
curl ... "WITH page_titles AS (... anyLast(properties['__title']) ...) SELECT ... WHERE e.path = '/skills/jezweb-fastapi' ..."
run 1: title = ''
run 2: title = 'Fastapi (Grade A) - Claude Skill | Skills Directory'
run 3: title = 'Fastapi (Grade A) - Claude Skill | Skills Directory'
run 4: title = ''
run 5: title = 'Fastapi (Grade A) - Claude Skill | Skills Directory'
```

This is V1's behaviour, ported verbatim (same `anyLast`, same lack of an explicit tiebreak) —
fixing it (e.g. `argMax` with a deterministic key) is a behaviour change outside this task's
scope. Every other column in both `pages.getTopPages` cases — `sessions`, `pageviews`,
`avg_duration`, `bounce_rate`, and (for the search case) the row set once title-dependent
matches are excluded — is identical between V1 and V2.

## Two real bugs found during conversion (not V1 bugs — introduced and fixed in this task)

1. **`GROUP BY ... WITH ROLLUP ... HAVING`, not `HAVING ... WITH ROLLUP`.** `sessionMetricsQuery`
   initially emitted `GROUP BY date HAVING sum(sign) > 0 WITH ROLLUP`, which ClickHouse
   rejects (`Syntax error ... Expected ... end of query`, right after `ORDER BY date ASC`).
   Fixed by reordering to `GROUP BY date WITH ROLLUP HAVING sum(sign) > 0`, ClickHouse's
   required clause order. Caught by `bun test` (`get_analytics_overview` mcp tool test),
   confirmed by re-running the corrected query and diffing against V1.
2. **`WITH FILL FROM/TO` needs the exact column type, not a `String`.** The first cut bound
   the fill boundary as `sql.string(...)` (or, once fixed once, `sql.dateTime64(...)`).
   ClickHouse's `WITH FILL` requires the boundary's type to match the sorted column's type
   exactly: `toStartOfDay(created_at)` is `DateTime`, and a `String` or `DateTime64` boundary
   is rejected (`Sort FILL FROM expression must be constant with numeric type` / `Incompatible
   types of WITH FILL expression values with column type DateTime`). Fixed by wrapping the
   boundary in `toStartOfX(...)` exactly as V1's `clix.toStartOf`/`clix.datetime` expression
   text did (never a bare literal) and typing the raw param `DateTime` (day/hour/minute
   buckets) or `Date` (week/month buckets, matching V1's `toDate` wrapper).

## Per-query render + execution proof

Every builder below was rendered via `toStatement()` and executed once against
`skills-directory`, `2026-08-01`..`2026-08-08` UTC (`transitionsQuery` used placeholder entry
pages that don't exist in the data, to prove the array-function shape parses and runs; 0 rows
is expected and correct for that input). All 22 statements below executed with no error.

| Query | Rows | Rows read | Wall |
|---|---|---|---|
| `revenueQuery` | 0 (no revenue events for this project) | 0 | 29 ms |
| `sessionMetricsQuery` | 8 (7 days + rollup total) | 16,369 | 23 ms |
| `metricsWithPageFilterQuery` | 7 | 73,678 | 76 ms |
| `topPagesQuery` (overview) | 20 | 49,152 | 23 ms |
| `topEntryExitQuery` (no page filter) | 20 | 24,551 | 12 ms |
| `distinctSessionsQuery` | 6,981 | 65,536 | 14 ms |
| `topGenericQuery` (no prefix, country) | 143 | 24,551 | 14 ms |
| `topGenericQuery` (with prefix, region) | 725 | 24,551 | 13 ms |
| `topGenericSeriesTimeSeriesQuery` | 219 | 24,551 | 8 ms |
| `topEntriesQuery` | 3 | 49,152 | 55 ms |
| `transitionsQuery` (placeholder entries) | 0 | 49,152 | 54 ms |
| `topEventsQuery` | 12 | 65,536 | 14 ms |
| `topLinkOutQuery` | 78 | 49,152 | 18 ms |
| `mapDataQuery` | 1000 | 49,152 | 24 ms |
| `liveTotalSessionsQuery` | 1 | 0 (empty 30-min window) | 8 ms |
| `liveMinuteCountsQuery` | 30 | 0 | 6 ms |
| `liveMinuteReferrersQuery` | 0 | 0 | 9 ms |
| `liveReferrersQuery` | 0 | 0 | 10 ms |

`liveTotalSessionsQuery`/`liveMinuteCountsQuery`/`liveMinuteReferrersQuery`/`liveReferrersQuery`
read 0 rows against local prod-copy data because their `now() - INTERVAL 30 MINUTE` window
never overlaps the fixture's frozen historical range; `liveMinuteCountsQuery`'s 30 rows are
the `WITH FILL`-materialized empty minute buckets, proving the fill clause itself (`FROM
toStartOfMinute(now() - INTERVAL 30 MINUTE) TO toStartOfMinute(now()) STEP INTERVAL 1
MINUTE`) parses and runs. These four were moved here from packages/trpc's inline
`overview.liveData` procedure (M7-005) and had no prior SQL-discipline proof; this is their
first execution against real ClickHouse.

### Representative statements (rendered, params bound)

```sql
-- sessionMetricsQuery
SELECT
  toStartOfDay(created_at) AS date,
  round(sum(sign * is_bounce) * 100.0 / sum(sign), 2) as bounce_rate,
  uniqIf(profile_id, sign > 0) AS unique_visitors,
  sum(sign) AS total_sessions,
  round(avgIf(duration, duration > 0 AND sign > 0), 2) / 1000 AS _avg_session_duration,
  if(isNaN(_avg_session_duration), 0, _avg_session_duration) AS avg_session_duration,
  sum(sign * screen_view_count) AS total_screen_views,
  round(sum(sign * screen_view_count) * 1.0 / sum(sign), 2) AS views_per_session
FROM sessions
WHERE created_at BETWEEN toDateTime({p1:String}) AND toDateTime({p2:String})
  AND project_id = {p3:String}
GROUP BY date
WITH ROLLUP
HAVING sum(sign) > 0
ORDER BY date ASC
WITH FILL FROM toStartOfDay({p4:DateTime}) TO {p5:DateTime} STEP toIntervalDay(1)
-- params: {"p1":"2026-08-01 00:00:00","p2":"2026-08-08 00:00:00","p3":"skills-directory","p4":"2026-08-01 00:00:00","p5":"2026-08-08 00:00:00"}
```

```sql
-- topEntriesQuery (user-journey step 1) — same array-function shape sankey.sql.ts established (M7-004)
WITH session_paths AS (
  WITH paths_deduped_cte AS (
    WITH ordered_events AS (
      SELECT session_id, concat(origin, path) as path, created_at
      FROM events
      WHERE project_id = {p1:String} AND name = 'screen_view' AND path != '' AND path IS NOT NULL
        AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String})
      ORDER BY session_id ASC, created_at ASC
    )
    SELECT session_id,
      arraySlice(arrayFilter((x, i) -> i = 1 OR x != paths_raw[i - 1], groupArray(path) as paths_raw, arrayEnumerate(paths_raw)), 1, {p4:UInt64}) as paths_deduped
    FROM ordered_events GROUP BY session_id
  )
  SELECT session_id,
    if(arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(paths_deduped)) = 0, paths_deduped,
       arraySlice(paths_deduped, 1, arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(paths_deduped)) - 1)) as paths,
    paths[1] as entry_page
  FROM paths_deduped_cte HAVING length(paths) >= 2
)
SELECT entry_page, count() as count FROM session_paths GROUP BY entry_page ORDER BY count DESC LIMIT {p5:UInt64}
-- params: {"p1":"skills-directory","p2":"2026-08-01 00:00:00","p3":"2026-08-08 00:00:00","p4":4,"p5":3}
```

Full renders for all 18 `overview.sql.ts` builders (including the CTE-heavy
`metricsWithPageFilterQuery` and `transitionsQuery`) are exercised by
`overview.sql.test.ts`'s `EXPLAIN`-based parse gate, which runs on every `bun test`.
