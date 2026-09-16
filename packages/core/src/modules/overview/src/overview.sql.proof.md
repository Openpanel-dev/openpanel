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

- **Amended by M27-001 (2026-09-15): the user-journey dedup expression is no longer V1's.** V1's
  `arrayFilter((x, i) -> i = 1 OR x != paths_raw[i - 1], groupArray(path) as paths_raw, arrayEnumerate(paths_raw))`
  is Theta(n^2) in the longest single session's pageview count, so `overview.userJourney` — which the
  dashboard calls on every load — could not answer at all for a tenant with one very long session
  (`docs/ANALYTICS_PERFORMANCE.md` section 6.1). It now reads `arrayCompact(groupArray(path))`, which is the
  ClickHouse built-in for the same operation and is linear. The render below is the amended text.
  Re-proved against the local prod copy on **2026-09-15**, `use_query_condition_cache=0`,
  `max_memory_usage=6 GiB`, `memory_usage` and `elapsed_ns` read off `X-ClickHouse-Summary`:
  - **Result sets:** `cityHash64(arraySort(groupArray(tuple(*))))` old vs new on every (project, window)
    pair where the old spelling survives — `verdict`/`bayse`/`earlysalary-production`/`chatpaper` at 30 d
    and `bayse` at 7 d, both statements: **identical, 10/10**.
  - **Cost, both statements, 5 steps, 30-day window:** `verdict` 100 ms -> 71 ms · `bayse` 1,583 ms ->
    980 ms / 182 MiB · `earlysalary-production` 1,341 ms -> 1,283 ms · `website-8103` FAIL
    (`would use 917.36 TiB`) -> 2,304 ms / 909 MiB · `chatpaper` 7,125 ms -> 6,434 ms / 1,392 MiB.
    `website-8103` at 1 day: FAIL (`852.36 GiB`) -> 119 ms / 27 MiB.
  - **Row order is not part of the contract for `transitionsQuery`**, exactly as `sankey.sql.proof.md`
    already records: it ends `ORDER BY step ASC, value DESC` and most rows share a `(step, value)` pair,
    so ClickHouse returns them in whatever order the parallel merge produced. Measured 2026-09-15 on
    `bayse` 30 d: 5,192 of 5,301 result rows sit in a tied group, and **the unchanged shipped statement,
    run 10 times, returned 10 different row orders and 1 identical row set**. Set-level hashes are the
    comparison above for that reason.

- **Amended by M28-001 (2026-09-15): `metricsWithPageFilterQuery` reads each source table once.**
  The shipped shape referenced `overall_unique_visitors` twice and `session_agg` twice, and
  **a ClickHouse CTE is re-executed once per reference** — so the statement performed **four
  `events` scans and two `sessions FINAL` scans**, not the three `docs/ANALYTICS_PERFORMANCE.md`
  section 6.10 counted. Measured on the local prod copy, `chatpaper` 30 d filtered on its busiest
  path: the whole statement read **60,569,110 rows = 4 x 13,393,722 + 2 x 3,497,111**, and removing
  each scalar reference in turn dropped exactly one scan's worth (47,175,388 -> 33,781,666 ->
  30,284,555). Section 6.10's *"ClickHouse may already share those scans"* is therefore **measured
  false**, and its 1,453 ms / 30,350,044-row baseline is the cost of the statement with those two
  extra references removed, i.e. roughly half the real one.
  The query now reads `events` once into `filtered_screen_views`, aggregates it once with
  `GROUP BY date WITH ROLLUP`, and broadcasts the window-wide totals off that rollup row with
  `max(if(date = <rollup>, x, NULL)) OVER ()` instead of re-scanning. Same for `sessions`. Both
  aggregates keep their rollup row through the `LEFT JOIN` so the two totals rows pair up — that is
  what carries `overall_bounce_rate` onto days the sessions aggregate has no row for — and the
  rollup row is dropped afterwards. `src/metrics-page-filter.test.ts` pins both that case and the
  NULL-when-nothing-matches nullability the old scalar subqueries had.
  Re-proved against the local prod copy on **2026-09-15**, `use_query_condition_cache=0`,
  `max_memory_usage=6 GiB`, `elapsed_ns`/`read_rows`/`memory_usage` read off `X-ClickHouse-Summary`:
  - **Result sets: `FORMAT JSONCompact` `meta` + `data`, compared byte-for-byte, old vs new —
    identical on 38 of 38 cases.** All five anchors; windows 1 d / 7 d / 30 d / 56 d; intervals
    minute / hour / day / week / month; and the edge cases that decide the rewrite: a page filter
    matching nothing (all five projects), `verdict` — which has no `screen_view` events at all — a
    path that is never any session's `entry_path`, and a `bayse` path whose event days and session
    days **do not overlap at all**, which is the case the naive fold gets wrong.
  - **Cost, 30-day window, busiest path, median of 3:**

| project | old ms | old rows_read | new ms | new rows_read |
|---|---:|---:|---:|---:|
| `bayse` | 1,554 | 68,873,974 | **495** | **17,496,956** |
| `earlysalary-production` | 1,863 | 62,275,058 | **706** | **15,875,922** |
| `website-8103` | 1,551 | 49,471,404 | **520** | **12,384,061** |
| `chatpaper` | 2,901 | 60,569,110 | **1,118** | **16,890,833** |
| `verdict` (no `screen_view` at all) | 182 | 1,673,650 | **66** | **828,633** |

  Peak memory is slightly higher (`chatpaper` 98 MiB -> 186 MiB), because one pass now holds the
  per-row `lead()` window and the daily aggregate together instead of building them in separate
  scans. At 56 days on `bayse` the statement goes 3,317 ms / 154,168,912 rows -> 1,031 ms /
  38,968,107 rows.
  - **The M7-005 render case below** (`skills-directory`, `2026-08-01`..`2026-08-08`, no filter)
    re-run on 2026-09-15: same 7 rows, byte-identical, **65 ms / 475,054 rows -> 30 ms /
    131,039 rows**. Its row in the per-query table further down is M7-005's original measurement
    and is left as the historical record.

- **Amended by M39-002 (2026-09-16): `FINAL` dropped from the sign-weighted `sessions` aggregates**
  `topEntryExitQuery`, `topGenericQuery` and `topGenericSeriesTimeSeriesQuery` (plus the three
  `insight/src/referrer-spikes.ts` statements). Every output column is a grouping key or a sum that is
  linear in `sign`. A collapsible pair is `(+1, V)` and `(-1, V)` with identical columns
  (`session-buffer.ts` builds the `-1` as `{ ...existing, sign: -1 }`), so it sums to 0 in the same
  group, under the same filter, and `HAVING sum(sign) > 0` sees the same sums. **`bounceRate`
  (`countIf(sign = 1)`) and `pages.sql.ts` are not linear and keep `FINAL`.**
  Proof, run 2026-09-16 21:48–21:52 UTC on the local prod copy, read-only, `wait_end_of_query=1`,
  `use_query_cache=0`, `use_query_condition_cache=0`. Statements were rendered by the real builders
  (the referrer-spike ones were captured from `getReferrerSpikes` through a recording `deps.ch`), and
  the old form is the same text with ` FINAL` put back. Result-set hash `count(), sum(sipHash64(formatRow('TSV', *)))`:
  **312 of 312 statements identical.** The anchors were `chatpaper`, `verdict`, `bayse`,
  `earlysalary-production` and `website-8103` over 2026-08-01..08-30, plus `e2e-sessions` over
  2026-09-01..09-15, which holds the box's 21 unmerged `-1` rows. The cases covered entry/exit,
  six `topGeneric` columns (with and without a prefix), four series intervals, no filter, a
  `country` filter and a page filter (the `distinct_sessions` CTE), and spikes at
  hour/day/week, UTC and `Europe/Stockholm`. The spike cases include a forced step 1, because every
  `e2e-sessions` referrer is `''`. A non-linear control (`count()` without `FINAL`) **did** differ on
  `e2e-sessions`, which shows the probe can detect the unmerged rows. Row *order* differs only
  within ties: the sort-key column sequence (`sessions` / `date` / `total`) was identical in every
  ordered case.
  Cost, warm, 3 runs, shipped → no `FINAL`: `chatpaper` `topGenericQuery` 169–182 → 53–57 ms,
  `topEntryExitQuery` 610–635 → 376–381 ms, series (day) 191–195 → 76–80 ms, spikes steps 1/2/3
  139–141 / 139–140 / 128–136 → 41–43 / 43–45 / 41–43 ms (3,571,254 → 3,448,379 rows read);
  `verdict` `topGenericQuery` 47–51 → 18 ms, `topEntryExitQuery` 61–86 → 26–30 ms, series
  52–56 → 24 ms.

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
-- topEntriesQuery (user-journey step 1) — same array-function shape sankey.sql.ts established (M7-004),
-- with M27-001's arrayCompact amendment (see the note above the render)
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
      arraySlice(arrayCompact(groupArray(path)), 1, {p4:UInt64}) as paths_deduped
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
