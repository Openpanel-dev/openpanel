# sql.ts — V1 → V2 result-set proof (M7-003)

Every query builder in `sql.ts` was executed twice against the same data — once as V1 (the `git HEAD` `packages/db/src/services/chart.service.ts` `getChartSql` / `getAggregateChartSql`, and the `packages/trpc/src/routers/chart.ts` clix / `createSqlBuilder` texts, `f1573b1a`) and once as V2 (the fragment returned by the core builder, bound through `query_params`) — through one `@clickhouse/client` with `format: 'JSON'` and the same `session_timezone`. The two responses were compared on `data` (every row, every column, as JSON) and `meta` (column names and types). Chart statements were compared as row **sets**: V1's `ORDER BY date ASC WITH FILL` leaves rows sharing a `date` in arbitrary order, and three V1-vs-V1 runs of the 191-row wildcard-breakdown case produced three different orders; the engine groups rows by label, so order is not part of the contract. Statements without an `ORDER BY` (values lists, getProfiles) were compared as sets for the same reason.

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel` (319,499,000 events, static). Projects: `verdict` / `secure-privacy` (UTC), `bayse` (America/New_York), `website-8103` (Asia/Kolkata), `dream-mate` (Australia/Sydney), `authc-project-a1` (the only project with a Postgres cohort; `cohort_members` is empty in the prod-copy, so cohort cases prove statement equivalence on 0 rows — positive-row coverage is `sql.test.ts` on `openpanel_test`).
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are directional only; production is 2 shards × 2 replicas (`docs/ENVIRONMENT.md`). The chart statements contain no `IN (subquery)`; cohort membership is a CTE joined on `profile_id`, unchanged from V1. `rows_read` is often lower for V2 (e.g. 245717 → 98299 on the multi-series case): ClickHouse's index analysis treats a bound `{p:String}` differently from an inline literal for the `created_at` range, with identical result sets — a perf note, not a semantic change.
- **Verdict**: 73 cases (28 `chartSeriesQuery`, 15 `aggregateChartQuery`, 30 router queries), all IDENTICAL. 5 of the 73 are **IDENTICAL ERROR**: V1 defects reproduced byte-for-byte on both sides, listed below, not fixed here (out of scope — the task is byte-equivalence, and each is recorded as debt in the task report).

Pre-existing V1 defects reproduced identically (both sides fail with the same ClickHouse error):

1. `chartSeriesQuery` — a `profile.properties.*` / `properties.__query.*` trailing-`.*` wildcard filter: `getSelectPropertyKey` produces `arrayMap(...)` while `getEventFiltersWhereClause` treats it as a scalar (no `%` → `isWildcard` false) → `Illegal type Array(String) of argument of function like` / `Array does not start with '['`. The `[*]` form works and is proven below.
2. `chartSeriesQuery` — all-cohorts (`cohort:*`) breakdown on the series shape: the `INNER JOIN _all_cohorts` makes the unqualified `uniqState(profile_id)` ambiguous; with `one_event_per_user` it is `Unknown expression _all_cohorts.cohort_id`. The aggregate shape works and is proven below.
3. `aggregateChartQuery` — `one_event_per_user` with a named event re-emits `WHERE e.name = …` outside the subquery → `Unknown expression or function identifier e.name`. Wildcard event works and is proven below.

The harness was a throwaway script (it imported V1 and V2 side by side); each statement below is complete and reproducible with `curl http://127.0.0.1:8123/?database=openpanel`, binding the V2 params as `param_pN=`. The projectCard chart statement differs in one deliberate way: V1 appended `SETTINGS session_timezone = '<tz>'` to the text, V2 passes the same value as `clickhouse_settings.session_timezone` — the proof runs both with that setting, and the row sets (92 daily buckets in `America/New_York`) are identical.

## chartSeriesQuery

### chartSeriesQuery — golden export-charts-basic (verdict, view_page, day)

**statement** — IDENTICAL; rows V1/V2 = 7/7; rows_read V1/V2 = 7649340/7470531; wall V1/V2 = 181 ms / 162 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'view_page' as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"view_page","p2":"verdict","p3":"view_page","p4":"2026-07-06 00:00:00","p5":"2026-07-12 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```
### chartSeriesQuery — golden export-charts-breakdown-country (secure-privacy, breakdown country)

**statement** — IDENTICAL; rows V1/V2 = 6/6; rows_read V1/V2 = 0/0; wall V1/V2 = 29 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1) as total_count FROM (SELECT 'view_page' as label_0, count(*) as count, toStartOfDay(created_at) as date, country as label_1, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'secure-privacy' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY date, label_1) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1) as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, country as label_1, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date, label_1) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"view_page","p2":"secure-privacy","p3":"view_page","p4":"2026-07-06 00:00:00","p5":"2026-07-12 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — golden export-charts-multi-series-filters (secure-privacy, screen_view, country is US)

**statement** — IDENTICAL; rows V1/V2 = 7/7; rows_read V1/V2 = 245717/98299; wall V1/V2 = 36 ms / 27 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'screen_view' as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE country = 'US' AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE country = 'US' AND project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"screen_view","p2":"secure-privacy","p3":"screen_view","p4":"2026-07-06 00:00:00","p5":"2026-07-12 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — golden export-charts-month-week-interval (verdict, week)

**statement** — IDENTICAL; rows V1/V2 = 5/5; rows_read V1/V2 = 24600197/24600197; wall V1/V2 = 460 ms / 442 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'view_page' as label_0, count(*) as count, toStartOfWeek(created_at, 1, 'UTC') as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at <= toDateTime('2026-07-31 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfWeek(toDateTime('2026-07-01 00:00:00'), 1, 'UTC') TO toStartOfWeek(toDateTime('2026-07-31 23:59:59'), 1, 'UTC') STEP toIntervalWeek(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfWeek(created_at, 1, {p2:String}) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfWeek(toDateTime({p7:String}), 1, {p8:String}) TO toStartOfWeek(toDateTime({p9:String}), 1, {p10:String}) STEP toIntervalWeek(1)
-- V2 params: {"p1":"view_page","p2":"UTC","p3":"verdict","p4":"view_page","p5":"2026-07-01 00:00:00","p6":"2026-07-31 23:59:59","p7":"2026-07-01 00:00:00","p8":"UTC","p9":"2026-07-31 23:59:59","p10":"UTC"}
```

### chartSeriesQuery — golden export-charts-nyc-dst-spring (bayse, week, America/New_York)

**statement** — IDENTICAL; rows V1/V2 = 21/21; rows_read V1/V2 = 17710659/17595974; wall V1/V2 = 341 ms / 340 ms; clickhouse_settings: session_timezone=America/New_York (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'pm_order_open' as label_0, count(*) as count, toStartOfWeek(created_at, 1, 'America/New_York') as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'bayse' AND e.name = 'pm_order_open' AND created_at >= toDateTime('2026-03-01 00:00:00') AND created_at <= toDateTime('2026-07-15 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfWeek(toDateTime('2026-03-01 00:00:00'), 1, 'America/New_York') TO toStartOfWeek(toDateTime('2026-07-15 23:59:59'), 1, 'America/New_York') STEP toIntervalWeek(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfWeek(created_at, 1, {p2:String}) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfWeek(toDateTime({p7:String}), 1, {p8:String}) TO toStartOfWeek(toDateTime({p9:String}), 1, {p10:String}) STEP toIntervalWeek(1)
-- V2 params: {"p1":"pm_order_open","p2":"America/New_York","p3":"bayse","p4":"pm_order_open","p5":"2026-03-01 00:00:00","p6":"2026-07-15 23:59:59","p7":"2026-03-01 00:00:00","p8":"America/New_York","p9":"2026-07-15 23:59:59","p10":"America/New_York"}
```

### chartSeriesQuery — golden export-charts-nyc-dst-fall (bayse, day, America/New_York)

**statement** — IDENTICAL; rows V1/V2 = 99/99; rows_read V1/V2 = 12131671/12107095; wall V1/V2 = 216 ms / 209 ms; clickhouse_settings: session_timezone=America/New_York (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'pm_order_open' as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'bayse' AND e.name = 'pm_order_open' AND created_at >= toDateTime('2026-08-01 00:00:00') AND created_at <= toDateTime('2026-11-08 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-08-01 00:00:00')) TO toStartOfDay(toDateTime('2026-11-08 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"pm_order_open","p2":"bayse","p3":"pm_order_open","p4":"2026-08-01 00:00:00","p5":"2026-11-08 23:59:59","p6":"2026-08-01 00:00:00","p7":"2026-11-08 23:59:59"}
```

### chartSeriesQuery — golden export-charts-ist-hour (website-8103, hour, Asia/Kolkata)

**statement** — IDENTICAL; rows V1/V2 = 48/48; rows_read V1/V2 = 913793/890640; wall V1/V2 = 30 ms / 26 ms; clickhouse_settings: session_timezone=Asia/Kolkata (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'screen_view' as label_0, count(*) as count, toStartOfHour(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'website-8103' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-08-01 00:00:00') AND created_at <= toDateTime('2026-08-02 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfHour(toDateTime('2026-08-01 00:00:00')) TO toStartOfHour(toDateTime('2026-08-02 23:59:59')) STEP toIntervalHour(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfHour(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfHour(toDateTime({p6:String})) TO toStartOfHour(toDateTime({p7:String})) STEP toIntervalHour(1)
-- V2 params: {"p1":"screen_view","p2":"website-8103","p3":"screen_view","p4":"2026-08-01 00:00:00","p5":"2026-08-02 23:59:59","p6":"2026-08-01 00:00:00","p7":"2026-08-02 23:59:59"}
```

### chartSeriesQuery — golden export-charts-syd-dst (dream-mate, day, Australia/Sydney)

**statement** — IDENTICAL; rows V1/V2 = 91/91; rows_read V1/V2 = 7972226/7953964; wall V1/V2 = 171 ms / 171 ms; clickhouse_settings: session_timezone=Australia/Sydney (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'screen_view' as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'dream-mate' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-08-01 00:00:00') AND created_at <= toDateTime('2026-10-31 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-08-01 00:00:00')) TO toStartOfDay(toDateTime('2026-10-31 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"screen_view","p2":"dream-mate","p3":"screen_view","p4":"2026-08-01 00:00:00","p5":"2026-10-31 23:59:59","p6":"2026-08-01 00:00:00","p7":"2026-10-31 23:59:59"}
```

### chartSeriesQuery — minute interval (verdict, 1 hour)

**statement** — IDENTICAL; rows V1/V2 = 60/60; rows_read V1/V2 = 260132/24575; wall V1/V2 = 18 ms / 14 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'view_page' as label_0, count(*) as count, toStartOfMinute(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-06 01:00:00') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfMinute(toDateTime('2026-07-06 00:00:00')) TO toStartOfMinute(toDateTime('2026-07-06 01:00:00')) STEP toIntervalMinute(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfMinute(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfMinute(toDateTime({p6:String})) TO toStartOfMinute(toDateTime({p7:String})) STEP toIntervalMinute(1)
-- V2 params: {"p1":"view_page","p2":"verdict","p3":"view_page","p4":"2026-07-06 00:00:00","p5":"2026-07-06 01:00:00","p6":"2026-07-06 00:00:00","p7":"2026-07-06 01:00:00"}
```

### chartSeriesQuery — month interval with timezone (bayse, America/New_York)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 25083459/25034307; wall V1/V2 = 485 ms / 468 ms; clickhouse_settings: session_timezone=America/New_York (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'pm_order_open' as label_0, count(*) as count, toStartOfMonth(created_at, 'America/New_York') as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'bayse' AND e.name = 'pm_order_open' AND created_at >= toDateTime('2026-05-01 00:00:00') AND created_at <= toDateTime('2026-07-31 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfMonth(toDateTime('2026-05-01 00:00:00'), 'America/New_York') TO toStartOfMonth(toDateTime('2026-07-31 23:59:59'), 'America/New_York') STEP toIntervalMonth(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfMonth(created_at, {p2:String}) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfMonth(toDateTime({p7:String}), {p8:String}) TO toStartOfMonth(toDateTime({p9:String}), {p10:String}) STEP toIntervalMonth(1)
-- V2 params: {"p1":"pm_order_open","p2":"America/New_York","p3":"bayse","p4":"pm_order_open","p5":"2026-05-01 00:00:00","p6":"2026-07-31 23:59:59","p7":"2026-05-01 00:00:00","p8":"America/New_York","p9":"2026-07-31 23:59:59","p10":"America/New_York"}
```

### chartSeriesQuery — wildcard event '*' + segment user (verdict)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 1185604/990411; wall V1/V2 = 48 ms / 45 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT '*' as label_0, countDistinct(profile_id) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'verdict' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT '*' as label_0, countDistinct(profile_id) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at <= toDateTime({p3:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p4:String})) TO toStartOfDay(toDateTime({p5:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"verdict","p2":"2026-07-06 00:00:00","p3":"2026-07-08 23:59:59","p4":"2026-07-06 00:00:00","p5":"2026-07-08 23:59:59"}
```

### chartSeriesQuery — segment session (verdict)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 1185604/982645; wall V1/V2 = 45 ms / 37 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'view_page' as label_0, countDistinct(session_id) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, countDistinct(session_id) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"view_page","p2":"verdict","p3":"view_page","p4":"2026-07-06 00:00:00","p5":"2026-07-08 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-08 23:59:59"}
```

### chartSeriesQuery — segment user_average (verdict)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 982645/982645; wall V1/V2 = 33 ms / 33 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'view_page' as label_0, COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"view_page","p2":"verdict","p3":"view_page","p4":"2026-07-06 00:00:00","p5":"2026-07-08 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-08 23:59:59"}
```

### chartSeriesQuery — segment one_event_per_user + breakdown path (verdict)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 982645/982645; wall V1/V2 = 49 ms / 52 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT 'view_page' as label_0, count(*) as count, toStartOfDay(created_at) as date, path as label_1 FROM ( SELECT DISTINCT ON (profile_id) * from events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') ORDER BY profile_id, created_at DESC ) as subQuery GROUP BY date, label_1 ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, path as label_1 FROM ( SELECT DISTINCT ON (profile_id) * from events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) ORDER BY profile_id, created_at DESC ) as subQuery GROUP BY date, label_1 ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"view_page","p2":"verdict","p3":"view_page","p4":"2026-07-06 00:00:00","p5":"2026-07-08 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-08 23:59:59"}
```

### chartSeriesQuery — segment group + breakdown group.name + filter group.type (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 44/44; rows_read V1/V2 = 249076/101658; wall V1/V2 = 26 ms / 23 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2) as total_count FROM (SELECT 'screen_view' as label_0, countDistinct(_group_id) as count, toStartOfDay(created_at) as date, _g.name as label_1, _g.properties['employees'] as label_2, uniqState(profile_id) as _uc_state FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE _g.type = 'company' AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY date, label_1, label_2) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2) as total_count FROM (SELECT {p2:String} as label_0, countDistinct(_group_id) as count, toStartOfDay(created_at) as date, _g.name as label_1, _g.properties['employees'] as label_2, uniqState(profile_id) as _uc_state FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE _g.type = 'company' AND project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY date, label_1, label_2) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p7:String})) TO toStartOfDay(toDateTime({p8:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"secure-privacy","p4":"screen_view","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":"2026-07-06 00:00:00","p8":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — profile breakdown + profile.properties filter + narrowed CTE (secure-privacy)

**statement** — IDENTICAL (row order differs — see note); rows V1/V2 = 86/86; rows_read V1/V2 = 556693/433840; wall V1/V2 = 108 ms / 97 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", properties['country'] as `profile.properties.country`, properties['device'] as `profile.properties.device`, email as "profile.email", first_name as "profile.first_name" FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2) as total_count FROM (SELECT 'screen_view' as label_0, count(*) as count, toStartOfDay(created_at) as date, `profile.properties.device` as label_1, profile.first_name as label_2, uniqState(profile_id) as _uc_state FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE (`profile.properties.country` != '' AND `profile.properties.country` IS NOT NULL) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY date, label_1, label_2) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
WITH profile AS (SELECT id as "profile.id", properties['country'] as `profile.properties.country`, properties['device'] as `profile.properties.device`, email as "profile.email", first_name as "profile.first_name" FROM profiles FINAL WHERE project_id = {p1:String}) SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2) as total_count FROM (SELECT {p2:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, `profile.properties.device` as label_1, profile.first_name as label_2, uniqState(profile_id) as _uc_state FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE (`profile.properties.country` != '' AND `profile.properties.country` IS NOT NULL) AND project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY date, label_1, label_2) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p7:String})) TO toStartOfDay(toDateTime({p8:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"secure-privacy","p4":"screen_view","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":"2026-07-06 00:00:00","p8":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — profile wildcard filter (full map) + math property_max on profile.properties.longitude (secure-privacy)

**statement** — IDENTICAL ERROR (pre-existing V1 defect, both sides fail with the same ClickHouse error).

```
V1 ERROR: Illegal type Array(String) of argument of function like: In scope SELECT 'screen_view' AS label_0, max(toFloat64OrNull(`profile.properties.longitude`)) AS count, toStartOfDay(created_at) AS date, uniqState(profile_id) AS _uc_state FROM events AS e ANY LEFT JOIN profile ON profile.id = profile_id WHERE (arrayMap(x -> trimBoth(x), mapValues(mapExtractKeyLike(profile.properties, 'profile.properties.*'))) LIKE '%Chrome%') AND (project_id = 'secure-privacy') AND (e.name = 'screen_view') AND (created_at >= toDateTime('2026-07-06 00:00:00')) AND (created_at <= toDateTime('2026-07-12 23:59:59')) AND (`profile.properties.longitude` IS NOT NULL) AND notEmpty(`profile.properties.longitude`) GROUP BY date. 
V2 ERROR: Illegal type Array(String) of argument of function like: In scope SELECT 'screen_view' AS label_0, max(toFloat64OrNull(`profile.properties.longitude`)) AS count, toStartOfDay(created_at) AS date, uniqState(profile_id) AS _uc_state FROM events AS e ANY LEFT JOIN profile ON profile.id = profile_id WHERE (arrayMap(x -> trimBoth(x), mapValues(mapExtractKeyLike(profile.properties, 'profile.properties.*'))) LIKE '%Chrome%') AND (project_id = 'secure-privacy') AND (e.name = 'screen_view') AND (created_at >= toDateTime('2026-07-06 00:00:00')) AND (created_at <= toDateTime('2026-07-12 23:59:59')) AND (`profile.properties.longitude` IS NOT NULL) AND notEmpty(`profile.properties.longitude`) GROUP BY date. 
```

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", properties['longitude'] as `profile.properties.longitude`, properties as "profile.properties" FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'screen_view' as label_0, max(toFloat64OrNull(`profile.properties.longitude`)) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE (arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(profile.properties, 'profile.properties.*'))) LIKE '%Chrome%') AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') AND `profile.properties.longitude` IS NOT NULL AND notEmpty(`profile.properties.longitude`) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
WITH profile AS (SELECT id as "profile.id", properties['longitude'] as `profile.properties.longitude`, properties as "profile.properties" FROM profiles FINAL WHERE project_id = {p1:String}) SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p2:String} as label_0, max(toFloat64OrNull(`profile.properties.longitude`)) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE (arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(profile.properties, 'profile.properties.*'))) LIKE '%Chrome%') AND project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) AND `profile.properties.longitude` IS NOT NULL AND notEmpty(`profile.properties.longitude`) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p7:String})) TO toStartOfDay(toDateTime({p8:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"secure-privacy","p4":"screen_view","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":"2026-07-06 00:00:00","p8":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — properties breakdown __title + filters: properties.__query.gclid isNotNull, value gt, path regex, referrerName alias, utm_source bare (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 6/6; rows_read V1/V2 = 245717/0; wall V1/V2 = 40 ms / 18 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2, label_3) as total_count FROM (SELECT 'screen_view' as label_0, count(*) as count, toStartOfDay(created_at) as date, e.properties['__title'] as label_1, referrer_type as label_2, e.properties['__query.utm_medium'] as label_3, uniqState(profile_id) as _uc_state FROM events e WHERE (e.properties['__query.gclid'] != '' AND e.properties['__query.gclid'] IS NOT NULL) AND (toFloat64OrZero(e.properties['value']) > toFloat64('1')) AND (match(path, '^\\/.*')) AND (referrer_name = '' OR referrer_name IS NULL) AND (e.properties['__query.utm_source'] = '' OR e.properties['__query.utm_source'] IS NULL) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY date, label_1, label_2, label_3) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2, label_3) as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, e.properties['__title'] as label_1, referrer_type as label_2, e.properties['__query.utm_medium'] as label_3, uniqState(profile_id) as _uc_state FROM events e WHERE (e.properties['__query.gclid'] != '' AND e.properties['__query.gclid'] IS NOT NULL) AND (toFloat64OrZero(e.properties['value']) > toFloat64('1')) AND (match(path, '^\\/.*')) AND (referrer_name = '' OR referrer_name IS NULL) AND (e.properties['__query.utm_source'] = '' OR e.properties['__query.utm_source'] IS NULL) AND project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date, label_1, label_2, label_3) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"screen_view","p2":"secure-privacy","p3":"screen_view","p4":"2026-07-06 00:00:00","p5":"2026-07-12 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — math property_sum on numeric column duration + has_profile true + wildcard properties.* is (secure-privacy)

**statement** — IDENTICAL ERROR (pre-existing V1 defect, both sides fail with the same ClickHouse error).

```
V1 ERROR: Array does not start with '[' character: while converting '' to Array(String): while executing function notEquals on arguments arrayMap(x String -> trimBoth(x), mapValues(mapExtractKeyLike(__table2.properties, '__query.*'_String))) Array(String) Array(size = 0, UInt64(size = 0), String(size = 0)), ''_String String Const(size = 0, String(size = 1)). 
V2 ERROR: Array does not start with '[' character: while converting '' to Array(String): while executing function notEquals on arguments arrayMap(x String -> trimBoth(x), mapValues(mapExtractKeyLike(__table2.properties, '__query.*'_String))) Array(String) Array(size = 0, UInt64(size = 0), String(size = 0)), ''_String String Const(size = 0, String(size = 1)). 
```

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'screen_view' as label_0, sum(duration) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE profile_id != device_id AND (arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.*'))) != '' AND arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.*'))) IS NOT NULL) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') AND duration IS NOT NULL GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, sum(duration) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE profile_id != device_id AND (arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.*'))) != '' AND arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.*'))) IS NOT NULL) AND project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) AND duration IS NOT NULL GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"screen_view","p2":"secure-privacy","p3":"screen_view","p4":"2026-07-06 00:00:00","p5":"2026-07-12 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — math property_average on properties.ttfb + typed number filter (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 6/6; rows_read V1/V2 = 245717/0; wall V1/V2 = 35 ms / 10 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'screen_view' as label_0, avg(toFloat64OrNull(e.properties['ttfb'])) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE (toFloat64OrNull(toString(e.properties['renderDelay'])) >= toFloat64OrNull(toString('10'))) AND (toFloat64(duration) < toFloat64('100000')) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') AND e.properties['ttfb'] IS NOT NULL AND notEmpty(e.properties['ttfb']) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, avg(toFloat64OrNull(e.properties['ttfb'])) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE (toFloat64OrNull(toString(e.properties['renderDelay'])) >= toFloat64OrNull(toString('10'))) AND (toFloat64(duration) < toFloat64('100000')) AND project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) AND e.properties['ttfb'] IS NOT NULL AND notEmpty(e.properties['ttfb']) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"screen_view","p2":"secure-privacy","p3":"screen_view","p4":"2026-07-06 00:00:00","p5":"2026-07-12 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — inCohort / notInCohort filters + cohort:<id> breakdown (unknown cohort, empty members) (verdict)

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 0/0; wall V1/V2 = 22 ms / 16 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH `cohort-33333333-3333-4333-8333-333333333333` AS ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = '33333333-3333-4333-8333-333333333333' AND project_id = 'verdict' ) SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1) as total_count FROM (SELECT 'view_page' as label_0, count(*) as count, toStartOfDay(created_at) as date, if(notEmpty(cohort_33333333_3333_4333_8333_333333333333.profile_id), 'In Cohort', 'Not In Cohort') as label_1, uniqState(profile_id) as _uc_state FROM events e LEFT ANY JOIN `cohort-33333333-3333-4333-8333-333333333333` AS cohort_33333333_3333_4333_8333_333333333333 ON cohort_33333333_3333_4333_8333_333333333333.profile_id = e.profile_id WHERE e.profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222') AND project_id = 'verdict') AND e.profile_id NOT IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('33333333-3333-4333-8333-333333333333') AND project_id = 'verdict') AND project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY date, label_1) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1)
-- V2
WITH `cohort-33333333-3333-4333-8333-333333333333` AS ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p1:String} AND project_id = {p2:String} ) SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1) as total_count FROM (SELECT {p3:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, if(notEmpty(cohort_33333333_3333_4333_8333_333333333333.profile_id), {p4:String}, {p5:String}) as label_1, uniqState(profile_id) as _uc_state FROM events e LEFT ANY JOIN `cohort-33333333-3333-4333-8333-333333333333` AS cohort_33333333_3333_4333_8333_333333333333 ON cohort_33333333_3333_4333_8333_333333333333.profile_id = e.profile_id WHERE e.profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222') AND project_id = 'verdict') AND e.profile_id NOT IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('33333333-3333-4333-8333-333333333333') AND project_id = 'verdict') AND project_id = {p6:String} AND e.name = {p7:String} AND created_at >= toDateTime({p8:String}) AND created_at <= toDateTime({p9:String}) GROUP BY date, label_1) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p10:String})) TO toStartOfDay(toDateTime({p11:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"33333333-3333-4333-8333-333333333333","p2":"verdict","p3":"view_page","p4":"In Cohort","p5":"Not In Cohort","p6":"verdict","p7":"view_page","p8":"2026-07-06 00:00:00","p9":"2026-07-08 23:59:59","p10":"2026-07-06 00:00:00","p11":"2026-07-08 23:59:59"}
```

### chartSeriesQuery — notInCohort filter only + cohort:<id> breakdown with named cohort (authc-project-a1)

**statement** — IDENTICAL ERROR (pre-existing V1 defect, both sides fail with the same ClickHouse error).

```
V1 ERROR: JOIN  INNER JOIN ... ON _all_cohorts.profile_id = e.profile_id ambiguous identifier 'profile_id'. In scope SELECT '*' AS label_0, count(*) AS count, toStartOfDay(created_at) AS date, if(notEmpty(cohort_cccccccc_0000_4000_8000_000000000001.profile_id), 'Auth contract cohort', 'Not Auth contract cohort') AS label_1, transform(_all_cohorts.cohort_id, ['cccccccc-0000-4000-8000-000000000001'], ['Auth contract cohort'], 'Unknown') AS label_2, uniqState(profile_id) AS _uc_state FROM events AS e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id ANY LEFT JOIN `cohort-cccccccc-0000-4000-8000-000000000001` AS cohort_cccccccc_0000_4000_8000_000000000001 ON cohort_cccccccc_0000_4000_8000_000000000001.profile_id = e.profile_id WHERE (e.profile_id NOT IN (SELECT profile_id FROM cohort_members FINAL WHERE (cohort_id IN ('cccccccc-0000-4000-8000-000000000001')) AND (project_id = 'authc-project-a1'))) AND (project_id = 'authc-project-a1') AND (created_at >= toDateTime('2026-07-06 00:00:00')) AND (created_at <= toDateTime('2026-07-08 23:59:59')) GROUP BY date, label_1, label_2. 
V2 ERROR: JOIN  INNER JOIN ... ON _all_cohorts.profile_id = e.profile_id ambiguous identifier 'profile_id'. In scope SELECT '*' AS label_0, count(*) AS count, toStartOfDay(created_at) AS date, if(notEmpty(cohort_cccccccc_0000_4000_8000_000000000001.profile_id), 'Auth contract cohort', 'Not Auth contract cohort') AS label_1, transform(_all_cohorts.cohort_id, _CAST(['cccccccc-0000-4000-8000-000000000001'], 'Array(String)'), _CAST(['Auth contract cohort'], 'Array(String)'), 'Unknown') AS label_2, uniqState(profile_id) AS _uc_state FROM events AS e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id ANY LEFT JOIN `cohort-cccccccc-0000-4000-8000-000000000001` AS cohort_cccccccc_0000_4000_8000_000000000001 ON cohort_cccccccc_0000_4000_8000_000000000001.profile_id = e.profile_id WHERE (e.profile_id NOT IN (SELECT profile_id FROM cohort_members FINAL WHERE (cohort_id IN ('cccccccc-0000-4000-8000-000000000001')) AND (project_id = 'authc-project-a1'))) AND (project_id = 'authc-project-a1') AND (created_at >= toDateTime('2026-07-06 00:00:00')) AND (created_at <= toDateTime('2026-07-08 23:59:59')) GROUP BY date, label_1, label_2. 
```

```sql
-- V1
WITH _all_cohorts AS ( SELECT profile_id, cohort_id FROM cohort_members FINAL WHERE project_id = 'authc-project-a1' ), `cohort-cccccccc-0000-4000-8000-000000000001` AS ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cccccccc-0000-4000-8000-000000000001' AND project_id = 'authc-project-a1' ) SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2) as total_count FROM (SELECT '*' as label_0, count(*) as count, toStartOfDay(created_at) as date, if(notEmpty(cohort_cccccccc_0000_4000_8000_000000000001.profile_id), 'Auth contract cohort', 'Not Auth contract cohort') as label_1, transform(_all_cohorts.cohort_id, ['cccccccc-0000-4000-8000-000000000001'], ['Auth contract cohort'], 'Unknown') as label_2, uniqState(profile_id) as _uc_state FROM events e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id LEFT ANY JOIN `cohort-cccccccc-0000-4000-8000-000000000001` AS cohort_cccccccc_0000_4000_8000_000000000001 ON cohort_cccccccc_0000_4000_8000_000000000001.profile_id = e.profile_id WHERE e.profile_id NOT IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('cccccccc-0000-4000-8000-000000000001') AND project_id = 'authc-project-a1') AND project_id = 'authc-project-a1' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY date, label_1, label_2) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1)
-- V2
WITH _all_cohorts AS ( SELECT profile_id, cohort_id FROM cohort_members FINAL WHERE project_id = {p1:String} ), `cohort-cccccccc-0000-4000-8000-000000000001` AS ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p2:String} AND project_id = {p3:String} ) SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1, label_2) as total_count FROM (SELECT '*' as label_0, count(*) as count, toStartOfDay(created_at) as date, if(notEmpty(cohort_cccccccc_0000_4000_8000_000000000001.profile_id), {p4:String}, {p5:String}) as label_1, transform(_all_cohorts.cohort_id, {p6:Array(String)}, {p7:Array(String)}, {p8:String}) as label_2, uniqState(profile_id) as _uc_state FROM events e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id LEFT ANY JOIN `cohort-cccccccc-0000-4000-8000-000000000001` AS cohort_cccccccc_0000_4000_8000_000000000001 ON cohort_cccccccc_0000_4000_8000_000000000001.profile_id = e.profile_id WHERE e.profile_id NOT IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('cccccccc-0000-4000-8000-000000000001') AND project_id = 'authc-project-a1') AND project_id = {p9:String} AND created_at >= toDateTime({p10:String}) AND created_at <= toDateTime({p11:String}) GROUP BY date, label_1, label_2) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p12:String})) TO toStartOfDay(toDateTime({p13:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"authc-project-a1","p2":"cccccccc-0000-4000-8000-000000000001","p3":"authc-project-a1","p4":"Auth contract cohort","p5":"Not Auth contract cohort","p6":["cccccccc-0000-4000-8000-000000000001"],"p7":["Auth contract cohort"],"p8":"Unknown","p9":"authc-project-a1","p10":"2026-07-06 00:00:00","p11":"2026-07-08 23:59:59","p12":"2026-07-06 00:00:00","p13":"2026-07-08 23:59:59"}
```

### chartSeriesQuery — all-cohorts breakdown dropped when project has no cohorts (verdict)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 982645/982645; wall V1/V2 = 49 ms / 33 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'view_page' as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"view_page","p2":"verdict","p3":"view_page","p4":"2026-07-06 00:00:00","p5":"2026-07-08 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-08 23:59:59"}
```

### chartSeriesQuery — endDate before startDate: no WITH FILL (verdict)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 243749/0; wall V1/V2 = 13 ms / 7 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'view_page' as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-08 00:00:00') AND created_at <= toDateTime('2026-07-06 00:00:00') GROUP BY date) ORDER BY date ASC
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date) ORDER BY date ASC
-- V2 params: {"p1":"view_page","p2":"verdict","p3":"view_page","p4":"2026-07-08 00:00:00","p5":"2026-07-06 00:00:00"}
```
### chartSeriesQuery — profile wildcard filter profile.properties.x[*] (full map CTE) + math property_max on profile.properties.longitude (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 6/6; rows_read V1/V2 = 417465/417465; wall V1/V2 = 150 ms / 96 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", properties['longitude'] as `profile.properties.longitude`, properties as "profile.properties" FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'screen_view' as label_0, max(toFloat64OrNull(`profile.properties.longitude`)) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE arrayExists(x -> x LIKE '%Chrome%', arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(profile.properties, 'profile.properties.browser.%')))) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') AND `profile.properties.longitude` IS NOT NULL AND notEmpty(`profile.properties.longitude`) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
WITH profile AS (SELECT id as "profile.id", properties['longitude'] as `profile.properties.longitude`, properties as "profile.properties" FROM profiles FINAL WHERE project_id = {p1:String}) SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p2:String} as label_0, max(toFloat64OrNull(`profile.properties.longitude`)) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE arrayExists(x -> x LIKE '%Chrome%', arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(profile.properties, 'profile.properties.browser.%')))) AND project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) AND `profile.properties.longitude` IS NOT NULL AND notEmpty(`profile.properties.longitude`) GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p7:String})) TO toStartOfDay(toDateTime({p8:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"secure-privacy","p4":"screen_view","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":"2026-07-06 00:00:00","p8":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — math property_sum on numeric column duration + has_profile true + wildcard properties.__query[*] isNotNull (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 7/7; rows_read V1/V2 = 245717/81916; wall V1/V2 = 27 ms / 31 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT 'screen_view' as label_0, sum(duration) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE profile_id != device_id AND arrayExists(x -> x != '' AND x IS NOT NULL, arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.%')))) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') AND duration IS NOT NULL GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER () as total_count FROM (SELECT {p1:String} as label_0, sum(duration) as count, toStartOfDay(created_at) as date, uniqState(profile_id) as _uc_state FROM events e WHERE profile_id != device_id AND arrayExists(x -> x != '' AND x IS NOT NULL, arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.%')))) AND project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) AND duration IS NOT NULL GROUP BY date) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"screen_view","p2":"secure-privacy","p3":"screen_view","p4":"2026-07-06 00:00:00","p5":"2026-07-12 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — wildcard properties.__query[*] breakdown + is filter + has_profile false (secure-privacy)

**statement** — IDENTICAL (row order differs — see note); rows V1/V2 = 191/191; rows_read V1/V2 = 245717/98299; wall V1/V2 = 29 ms / 44 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1) as total_count FROM (SELECT 'screen_view' as label_0, count(*) as count, toStartOfDay(created_at) as date, arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.%'))) as label_1, uniqState(profile_id) as _uc_state FROM events e WHERE profile_id = device_id AND arrayExists(x -> x = '1' OR x = '2', arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.%')))) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY date, label_1) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-12 23:59:59')) STEP toIntervalDay(1)
-- V2
SELECT * EXCEPT (_uc_state), uniqMerge(_uc_state) OVER (PARTITION BY label_1) as total_count FROM (SELECT {p1:String} as label_0, count(*) as count, toStartOfDay(created_at) as date, arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.%'))) as label_1, uniqState(profile_id) as _uc_state FROM events e WHERE profile_id = device_id AND arrayExists(x -> x = '1' OR x = '2', arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(e.properties, '__query.%')))) AND project_id = {p2:String} AND e.name = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at <= toDateTime({p5:String}) GROUP BY date, label_1) ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p6:String})) TO toStartOfDay(toDateTime({p7:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"screen_view","p2":"secure-privacy","p3":"screen_view","p4":"2026-07-06 00:00:00","p5":"2026-07-12 23:59:59","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```

### chartSeriesQuery — all-cohorts breakdown + one_event_per_user (authc-project-a1)

**statement** — IDENTICAL ERROR (pre-existing V1 defect, both sides fail with the same ClickHouse error): `Unknown expression or function identifier `_all_cohorts.cohort_id` in scope WITH _all_cohorts AS (SELECT profile_id, cohort_id FROM cohort_members FINAL WHERE project_id = 'authc-project-a1') SELECT '*' AS label_0, count(*) AS count, toStartOfDay(created_at) AS date, transform(_all_cohorts.cohort_id, ['cccccccc-0000-4000-8000-000000000001'], ['Auth contract cohort'], 'Unknown') AS label_1 FROM (SELECT * FROM events AS e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id WHERE (project_id = 'authc-project-a1') AND (created_at >= toDateTime('2026-07-06 00:00:00')) AND (created_at <= toDateTime('2026-07-08 23:59:59')) ORDER BY profile_id ASC, created_at DESC LIMIT 1 BY profile_id) AS subQuery GROUP BY date, label_1 ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1). Maybe you meant: ['_all_cohorts.profile_id'].`

```sql
-- V1
WITH _all_cohorts AS ( SELECT profile_id, cohort_id FROM cohort_members FINAL WHERE project_id = 'authc-project-a1' ) SELECT '*' as label_0, count(*) as count, toStartOfDay(created_at) as date, transform(_all_cohorts.cohort_id, ['cccccccc-0000-4000-8000-000000000001'], ['Auth contract cohort'], 'Unknown') as label_1 FROM ( SELECT DISTINCT ON (profile_id) * from events e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id WHERE project_id = 'authc-project-a1' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') ORDER BY profile_id, created_at DESC ) as subQuery GROUP BY date, label_1 ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime('2026-07-06 00:00:00')) TO toStartOfDay(toDateTime('2026-07-08 23:59:59')) STEP toIntervalDay(1)
-- V2
WITH _all_cohorts AS ( SELECT profile_id, cohort_id FROM cohort_members FINAL WHERE project_id = {p1:String} ) SELECT '*' as label_0, count(*) as count, toStartOfDay(created_at) as date, transform(_all_cohorts.cohort_id, {p2:Array(String)}, {p3:Array(String)}, {p4:String}) as label_1 FROM ( SELECT DISTINCT ON (profile_id) * from events e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id WHERE project_id = {p5:String} AND created_at >= toDateTime({p6:String}) AND created_at <= toDateTime({p7:String}) ORDER BY profile_id, created_at DESC ) as subQuery GROUP BY date, label_1 ORDER BY date ASC WITH FILL FROM toStartOfDay(toDateTime({p8:String})) TO toStartOfDay(toDateTime({p9:String})) STEP toIntervalDay(1)
-- V2 params: {"p1":"authc-project-a1","p2":["cccccccc-0000-4000-8000-000000000001"],"p3":["Auth contract cohort"],"p4":"Unknown","p5":"authc-project-a1","p6":"2026-07-06 00:00:00","p7":"2026-07-08 23:59:59","p8":"2026-07-06 00:00:00","p9":"2026-07-08 23:59:59"}
```

## aggregateChartQuery

### aggregateChartQuery — basic (verdict, view_page, limit 10)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 7649340/7470531; wall V1/V2 = 101 ms / 69 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT 'view_page' as label_0, '2026-07-06 00:00:00' as date, count(*) as count FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY label_0 ORDER BY count DESC LIMIT 10
-- V2
SELECT {p1:String} as label_0, {p2:String} as date, count(*) as count FROM events e WHERE project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY label_0 ORDER BY count DESC LIMIT {p7:UInt64}
-- V2 params: {"p1":"view_page","p2":"2026-07-06 00:00:00","p3":"verdict","p4":"view_page","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":10}
```

### aggregateChartQuery — breakdown country + path, limit 25 (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 8 ms / 6 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT 'view_page' as label_0, '2026-07-06 00:00:00' as date, country as label_1, path as label_2, count(*) as count FROM events e WHERE project_id = 'secure-privacy' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY label_1, label_2, label_0 ORDER BY count DESC LIMIT 25
-- V2
SELECT {p1:String} as label_0, {p2:String} as date, country as label_1, path as label_2, count(*) as count FROM events e WHERE project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY label_1, label_2, label_0 ORDER BY count DESC LIMIT {p7:UInt64}
-- V2 params: {"p1":"view_page","p2":"2026-07-06 00:00:00","p3":"secure-privacy","p4":"view_page","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":25}
```

### aggregateChartQuery — wildcard event + segment user + breakdown referrerName alias, no limit (verdict)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 1185604/998587; wall V1/V2 = 36 ms / 33 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT '*' as label_0, '2026-07-06 00:00:00' as date, referrer_name as label_1, countDistinct(profile_id) as count FROM events e WHERE project_id = 'verdict' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY label_1, label_0 ORDER BY count DESC
-- V2
SELECT '*' as label_0, {p1:String} as date, referrer_name as label_1, countDistinct(profile_id) as count FROM events e WHERE project_id = {p2:String} AND created_at >= toDateTime({p3:String}) AND created_at <= toDateTime({p4:String}) GROUP BY label_1, label_0 ORDER BY count DESC
-- V2 params: {"p1":"2026-07-06 00:00:00","p2":"verdict","p3":"2026-07-06 00:00:00","p4":"2026-07-08 23:59:59"}
```

### aggregateChartQuery — segment session + filter contains (verdict)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 1185604/0; wall V1/V2 = 21 ms / 7 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT 'view_page' as label_0, '2026-07-06 00:00:00' as date, countDistinct(session_id) as count FROM events e WHERE (path LIKE '%/%') AND project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY label_0 ORDER BY count DESC LIMIT 5
-- V2
SELECT {p1:String} as label_0, {p2:String} as date, countDistinct(session_id) as count FROM events e WHERE (path LIKE '%/%') AND project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY label_0 ORDER BY count DESC LIMIT {p7:UInt64}
-- V2 params: {"p1":"view_page","p2":"2026-07-06 00:00:00","p3":"verdict","p4":"view_page","p5":"2026-07-06 00:00:00","p6":"2026-07-08 23:59:59","p7":5}
```

### aggregateChartQuery — segment user_average + breakdown properties.__title (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 245717/98299; wall V1/V2 = 26 ms / 47 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT 'screen_view' as label_0, '2026-07-06 00:00:00' as date, e.properties['__title'] as label_1, COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count FROM events e WHERE project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY label_1, label_0 ORDER BY count DESC LIMIT 20
-- V2
SELECT {p1:String} as label_0, {p2:String} as date, e.properties['__title'] as label_1, COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count FROM events e WHERE project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY label_1, label_0 ORDER BY count DESC LIMIT {p7:UInt64}
-- V2 params: {"p1":"screen_view","p2":"2026-07-06 00:00:00","p3":"secure-privacy","p4":"screen_view","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":20}
```

### aggregateChartQuery — segment group + breakdown group.name + group.properties.country + filter group.properties.employees gt (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 109848/109848; wall V1/V2 = 29 ms / 36 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT 'screen_view' as label_0, '2026-07-06 00:00:00' as date, _g.name as label_1, _g.properties['country'] as label_2, countDistinct(_group_id) as count FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE (_g.properties['employees'] != '' AND _g.properties['employees'] IS NOT NULL) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY label_1, label_2, label_0 ORDER BY count DESC LIMIT 20
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT {p2:String} as label_0, {p3:String} as date, _g.name as label_1, _g.properties['country'] as label_2, countDistinct(_group_id) as count FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE (_g.properties['employees'] != '' AND _g.properties['employees'] IS NOT NULL) AND project_id = {p4:String} AND e.name = {p5:String} AND created_at >= toDateTime({p6:String}) AND created_at <= toDateTime({p7:String}) GROUP BY label_1, label_2, label_0 ORDER BY count DESC LIMIT {p8:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"2026-07-06 00:00:00","p4":"secure-privacy","p5":"screen_view","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59","p8":20}
```

### aggregateChartQuery — profile breakdown profile.properties.os + profile.last_name + filter profile.email endsWith (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 16/16; rows_read V1/V2 = 409275/409275; wall V1/V2 = 133 ms / 88 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", email as "profile.email", properties['os'] as `profile.properties.os`, last_name as "profile.last_name" FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT 'screen_view' as label_0, '2026-07-06 00:00:00' as date, `profile.properties.os` as label_1, profile.last_name as label_2, count(*) as count FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY label_1, label_2, label_0 ORDER BY count DESC LIMIT 20
-- V2
WITH profile AS (SELECT id as "profile.id", email as "profile.email", properties['os'] as `profile.properties.os`, last_name as "profile.last_name" FROM profiles FINAL WHERE project_id = {p1:String}) SELECT {p2:String} as label_0, {p3:String} as date, `profile.properties.os` as label_1, profile.last_name as label_2, count(*) as count FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE project_id = {p4:String} AND e.name = {p5:String} AND created_at >= toDateTime({p6:String}) AND created_at <= toDateTime({p7:String}) GROUP BY label_1, label_2, label_0 ORDER BY count DESC LIMIT {p8:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"2026-07-06 00:00:00","p4":"secure-privacy","p5":"screen_view","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59","p8":20}
```

### aggregateChartQuery — math property_sum on properties.value (project-resolved) + profile wildcard breakdown (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 556693/0; wall V1/V2 = 84 ms / 11 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", properties as "profile.properties" FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT 'screen_view' as label_0, '2026-07-06 00:00:00' as date, arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(profile.properties, 'profile.properties.browser.%'))) as label_1, sum(toFloat64OrNull(e.properties['value'])) as count FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') AND e.properties['value'] IS NOT NULL AND notEmpty(e.properties['value']) GROUP BY label_1, label_0 ORDER BY count DESC LIMIT 20
-- V2
WITH profile AS (SELECT id as "profile.id", properties as "profile.properties" FROM profiles FINAL WHERE project_id = {p1:String}) SELECT {p2:String} as label_0, {p3:String} as date, arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(profile.properties, 'profile.properties.browser.%'))) as label_1, sum(toFloat64OrNull(e.properties['value'])) as count FROM events e LEFT ANY JOIN profile ON profile.id = profile_id WHERE project_id = {p4:String} AND e.name = {p5:String} AND created_at >= toDateTime({p6:String}) AND created_at <= toDateTime({p7:String}) AND e.properties['value'] IS NOT NULL AND notEmpty(e.properties['value']) GROUP BY label_1, label_0 ORDER BY count DESC LIMIT {p8:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"2026-07-06 00:00:00","p4":"secure-privacy","p5":"screen_view","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59","p8":20}
```

### aggregateChartQuery — math property_average on duration (numeric column) + typed date filter on created_at (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 245717/98291; wall V1/V2 = 20 ms / 17 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT 'screen_view' as label_0, '2026-07-06 00:00:00' as date, avg(duration) as count FROM events e WHERE (toDate(parseDateTimeBestEffortOrNull(toString(created_at))) >= toDate(parseDateTimeBestEffortOrNull(toString('2026-07-08')))) AND project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') AND duration IS NOT NULL GROUP BY label_0 ORDER BY count DESC
-- V2
SELECT {p1:String} as label_0, {p2:String} as date, avg(duration) as count FROM events e WHERE (toDate(parseDateTimeBestEffortOrNull(toString(created_at))) >= toDate(parseDateTimeBestEffortOrNull(toString('2026-07-08')))) AND project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) AND duration IS NOT NULL GROUP BY label_0 ORDER BY count DESC
-- V2 params: {"p1":"screen_view","p2":"2026-07-06 00:00:00","p3":"secure-privacy","p4":"screen_view","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59"}
```

### aggregateChartQuery — math property_max on group.properties.employees (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 109848/109848; wall V1/V2 = 28 ms / 59 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT 'screen_view' as label_0, '2026-07-06 00:00:00' as date, max(toFloat64OrNull(_g.properties['employees'])) as count FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE project_id = 'secure-privacy' AND e.name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') AND _g.properties['employees'] IS NOT NULL AND notEmpty(_g.properties['employees']) GROUP BY label_0 ORDER BY count DESC
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT {p2:String} as label_0, {p3:String} as date, max(toFloat64OrNull(_g.properties['employees'])) as count FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE project_id = {p4:String} AND e.name = {p5:String} AND created_at >= toDateTime({p6:String}) AND created_at <= toDateTime({p7:String}) AND _g.properties['employees'] IS NOT NULL AND notEmpty(_g.properties['employees']) GROUP BY label_0 ORDER BY count DESC
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"2026-07-06 00:00:00","p4":"secure-privacy","p5":"screen_view","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59"}
```

### aggregateChartQuery — one_event_per_user + breakdown path (verdict) — V1 re-emits WHERE

**statement** — IDENTICAL ERROR (pre-existing V1 defect, both sides fail with the same ClickHouse error): `Unknown expression or function identifier `e.name` in scope SELECT 'view_page' AS label_0, '2026-07-06 00:00:00' AS date, path AS label_1, count(*) AS count FROM (SELECT * FROM events AS e WHERE (project_id = 'verdict') AND (e.name = 'view_page') AND (created_at >= toDateTime('2026-07-06 00:00:00')) AND (created_at <= toDateTime('2026-07-08 23:59:59')) ORDER BY profile_id ASC, created_at DESC LIMIT 1 BY profile_id) AS subQuery WHERE (project_id = 'verdict') AND (e.name = 'view_page') AND (created_at >= toDateTime('2026-07-06 00:00:00')) AND (created_at <= toDateTime('2026-07-08 23:59:59')) GROUP BY label_1, label_0.`

```sql
-- V1
SELECT 'view_page' as label_0, '2026-07-06 00:00:00' as date, path as label_1, count(*) as count FROM ( SELECT DISTINCT ON (profile_id) * from events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') ORDER BY profile_id, created_at DESC ) as subQuery WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY label_1, label_0
-- V2
SELECT {p1:String} as label_0, {p2:String} as date, path as label_1, count(*) as count FROM ( SELECT DISTINCT ON (profile_id) * from events e WHERE project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) ORDER BY profile_id, created_at DESC ) as subQuery WHERE project_id = {p7:String} AND e.name = {p8:String} AND created_at >= toDateTime({p9:String}) AND created_at <= toDateTime({p10:String}) GROUP BY label_1, label_0
-- V2 params: {"p1":"view_page","p2":"2026-07-06 00:00:00","p3":"verdict","p4":"view_page","p5":"2026-07-06 00:00:00","p6":"2026-07-08 23:59:59","p7":"verdict","p8":"view_page","p9":"2026-07-06 00:00:00","p10":"2026-07-08 23:59:59"}
```

### aggregateChartQuery — one_event_per_user, wildcard event, no breakdown (verdict)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 841552/622225; wall V1/V2 = 110 ms / 73 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT '*' as label_0, '2026-07-06 00:00:00' as date, count(*) as count FROM ( SELECT DISTINCT ON (profile_id) * from events e WHERE project_id = 'verdict' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-07 23:59:59') ORDER BY profile_id, created_at DESC ) as subQuery WHERE project_id = 'verdict' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-07 23:59:59') GROUP BY label_0
-- V2
SELECT '*' as label_0, {p1:String} as date, count(*) as count FROM ( SELECT DISTINCT ON (profile_id) * from events e WHERE project_id = {p2:String} AND created_at >= toDateTime({p3:String}) AND created_at <= toDateTime({p4:String}) ORDER BY profile_id, created_at DESC ) as subQuery WHERE project_id = {p5:String} AND created_at >= toDateTime({p6:String}) AND created_at <= toDateTime({p7:String}) GROUP BY label_0
-- V2 params: {"p1":"2026-07-06 00:00:00","p2":"verdict","p3":"2026-07-06 00:00:00","p4":"2026-07-07 23:59:59","p5":"verdict","p6":"2026-07-06 00:00:00","p7":"2026-07-07 23:59:59"}
```

### aggregateChartQuery — all-cohorts breakdown with named cohort + cohort:<id> breakdown (authc-project-a1)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 11 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _all_cohorts AS ( SELECT profile_id, cohort_id FROM cohort_members FINAL WHERE project_id = 'authc-project-a1' ), `cohort-cccccccc-0000-4000-8000-000000000001` AS ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cccccccc-0000-4000-8000-000000000001' AND project_id = 'authc-project-a1' ) SELECT '*' as label_0, '2026-07-06 00:00:00' as date, transform(_all_cohorts.cohort_id, ['cccccccc-0000-4000-8000-000000000001'], ['Auth contract cohort'], 'Unknown') as label_1, if(notEmpty(cohort_cccccccc_0000_4000_8000_000000000001.profile_id), 'Auth contract cohort', 'Not Auth contract cohort') as label_2, count(*) as count FROM events e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id LEFT ANY JOIN `cohort-cccccccc-0000-4000-8000-000000000001` AS cohort_cccccccc_0000_4000_8000_000000000001 ON cohort_cccccccc_0000_4000_8000_000000000001.profile_id = e.profile_id WHERE project_id = 'authc-project-a1' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY label_1, label_2, label_0 ORDER BY count DESC LIMIT 10
-- V2
WITH _all_cohorts AS ( SELECT profile_id, cohort_id FROM cohort_members FINAL WHERE project_id = {p1:String} ), `cohort-cccccccc-0000-4000-8000-000000000001` AS ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p2:String} AND project_id = {p3:String} ) SELECT '*' as label_0, {p4:String} as date, transform(_all_cohorts.cohort_id, {p5:Array(String)}, {p6:Array(String)}, {p7:String}) as label_1, if(notEmpty(cohort_cccccccc_0000_4000_8000_000000000001.profile_id), {p8:String}, {p9:String}) as label_2, count(*) as count FROM events e INNER JOIN _all_cohorts ON _all_cohorts.profile_id = e.profile_id LEFT ANY JOIN `cohort-cccccccc-0000-4000-8000-000000000001` AS cohort_cccccccc_0000_4000_8000_000000000001 ON cohort_cccccccc_0000_4000_8000_000000000001.profile_id = e.profile_id WHERE project_id = {p10:String} AND created_at >= toDateTime({p11:String}) AND created_at <= toDateTime({p12:String}) GROUP BY label_1, label_2, label_0 ORDER BY count DESC LIMIT {p13:UInt64}
-- V2 params: {"p1":"authc-project-a1","p2":"cccccccc-0000-4000-8000-000000000001","p3":"authc-project-a1","p4":"2026-07-06 00:00:00","p5":["cccccccc-0000-4000-8000-000000000001"],"p6":["Auth contract cohort"],"p7":"Unknown","p8":"Auth contract cohort","p9":"Not Auth contract cohort","p10":"authc-project-a1","p11":"2026-07-06 00:00:00","p12":"2026-07-08 23:59:59","p13":10}
```

### aggregateChartQuery — cohort:<id> breakdown unknown cohort + inCohort filter (verdict)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 11 ms / 11 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH `cohort-44444444-4444-4444-8444-444444444444` AS ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = '44444444-4444-4444-8444-444444444444' AND project_id = 'verdict' ) SELECT 'view_page' as label_0, '2026-07-06 00:00:00' as date, if(notEmpty(cohort_44444444_4444_4444_8444_444444444444.profile_id), 'In Cohort', 'Not In Cohort') as label_1, count(*) as count FROM events e LEFT ANY JOIN `cohort-44444444-4444-4444-8444-444444444444` AS cohort_44444444_4444_4444_8444_444444444444 ON cohort_44444444_4444_4444_8444_444444444444.profile_id = e.profile_id WHERE e.profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('44444444-4444-4444-8444-444444444444') AND project_id = 'verdict') AND project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY label_1, label_0 ORDER BY count DESC LIMIT 10
-- V2
WITH `cohort-44444444-4444-4444-8444-444444444444` AS ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p1:String} AND project_id = {p2:String} ) SELECT {p3:String} as label_0, {p4:String} as date, if(notEmpty(cohort_44444444_4444_4444_8444_444444444444.profile_id), {p5:String}, {p6:String}) as label_1, count(*) as count FROM events e LEFT ANY JOIN `cohort-44444444-4444-4444-8444-444444444444` AS cohort_44444444_4444_4444_8444_444444444444 ON cohort_44444444_4444_4444_8444_444444444444.profile_id = e.profile_id WHERE e.profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('44444444-4444-4444-8444-444444444444') AND project_id = 'verdict') AND project_id = {p7:String} AND e.name = {p8:String} AND created_at >= toDateTime({p9:String}) AND created_at <= toDateTime({p10:String}) GROUP BY label_1, label_0 ORDER BY count DESC LIMIT {p11:UInt64}
-- V2 params: {"p1":"44444444-4444-4444-8444-444444444444","p2":"verdict","p3":"view_page","p4":"2026-07-06 00:00:00","p5":"In Cohort","p6":"Not In Cohort","p7":"verdict","p8":"view_page","p9":"2026-07-06 00:00:00","p10":"2026-07-08 23:59:59","p11":10}
```

### aggregateChartQuery — all-cohorts breakdown dropped (verdict, no cohorts) + unknown field dropped

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 1185604/982645; wall V1/V2 = 36 ms / 32 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT 'view_page' as label_0, '2026-07-06 00:00:00' as date, if(profile_id != device_id, 'true', 'false') as label_1, count(*) as count FROM events e WHERE project_id = 'verdict' AND e.name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 23:59:59') GROUP BY label_1, label_0 ORDER BY count DESC LIMIT 10
-- V2
SELECT {p1:String} as label_0, {p2:String} as date, if(profile_id != device_id, 'true', 'false') as label_1, count(*) as count FROM events e WHERE project_id = {p3:String} AND e.name = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) GROUP BY label_1, label_0 ORDER BY count DESC LIMIT {p7:UInt64}
-- V2 params: {"p1":"view_page","p2":"2026-07-06 00:00:00","p3":"verdict","p4":"view_page","p5":"2026-07-06 00:00:00","p6":"2026-07-08 23:59:59","p7":10}
```

## Router queries (projectCard, events, properties, values, getProfiles)

### projectCardChartQuery — projectCard chart (verdict, UTC)

**statement** — IDENTICAL; rows V1/V2 = 92/92; rows_read V1/V2 = 1273247/1273247; wall V1/V2 = 99 ms / 62 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT uniqHLL12(profile_id) as value, toStartOfDay(created_at) as date, sum(revenue * sign) as revenue FROM sessions WHERE project_id = 'verdict' AND created_at >= now() - interval '3 month' GROUP BY date ORDER BY date ASC WITH FILL FROM toStartOfDay(now() - interval '3 month') TO toStartOfDay(now()) STEP INTERVAL 1 day SETTINGS session_timezone = 'UTC'
-- V2
SELECT uniqHLL12(profile_id) as value, toStartOfDay(created_at) as date, sum(revenue * sign) as revenue FROM sessions WHERE project_id = {p1:String} AND created_at >= now() - interval '3 month' GROUP BY date ORDER BY date ASC WITH FILL FROM toStartOfDay(now() - interval '3 month') TO toStartOfDay(now()) STEP INTERVAL 1 day
-- V2 params: {"p1":"verdict"}
```

### projectCardMetricsQuery — projectCard metrics (verdict, UTC)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 1273247/1273247; wall V1/V2 = 67 ms / 60 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT uniqHLL12(if(created_at >= (now() - toIntervalMonth(3)), profile_id, null)) AS months_3, uniqHLL12(if(created_at >= (now() - toIntervalMonth(6)) AND created_at < (now() - toIntervalMonth(3)), profile_id, null)) AS months_3_prev, uniqHLL12(if(created_at >= (now() - toIntervalMonth(1)), profile_id, null)) AS month, uniqHLL12(if(created_at >= (now() - toIntervalDay(1)), profile_id, null)) AS day, uniqHLL12(if(created_at >= (now() - toIntervalDay(2)) AND created_at < (now() - toIntervalDay(1)), profile_id, null)) AS day_prev, sum(revenue * sign) as revenue FROM sessions WHERE project_id = 'verdict' AND created_at >= (now() - toIntervalMonth(6))
-- V2
SELECT uniqHLL12(if(created_at >= (now() - toIntervalMonth(3)), profile_id, null)) AS months_3, uniqHLL12(if(created_at >= (now() - toIntervalMonth(6)) AND created_at < (now() - toIntervalMonth(3)), profile_id, null)) AS months_3_prev, uniqHLL12(if(created_at >= (now() - toIntervalMonth(1)), profile_id, null)) AS month, uniqHLL12(if(created_at >= (now() - toIntervalDay(1)), profile_id, null)) AS day, uniqHLL12(if(created_at >= (now() - toIntervalDay(2)) AND created_at < (now() - toIntervalDay(1)), profile_id, null)) AS day_prev, sum(revenue * sign) as revenue FROM sessions WHERE project_id = {p1:String} AND created_at >= (now() - toIntervalMonth(6))
-- V2 params: {"p1":"verdict"}
```

### projectCardChartQuery — projectCard chart (bayse, America/New_York)

**statement** — IDENTICAL; rows V1/V2 = 92/92; rows_read V1/V2 = 835382/835382; wall V1/V2 = 46 ms / 65 ms; clickhouse_settings: session_timezone=America/New_York (both).

```sql
-- V1
SELECT uniqHLL12(profile_id) as value, toStartOfDay(created_at) as date, sum(revenue * sign) as revenue FROM sessions WHERE project_id = 'bayse' AND created_at >= now() - interval '3 month' GROUP BY date ORDER BY date ASC WITH FILL FROM toStartOfDay(now() - interval '3 month') TO toStartOfDay(now()) STEP INTERVAL 1 day SETTINGS session_timezone = 'America/New_York'
-- V2
SELECT uniqHLL12(profile_id) as value, toStartOfDay(created_at) as date, sum(revenue * sign) as revenue FROM sessions WHERE project_id = {p1:String} AND created_at >= now() - interval '3 month' GROUP BY date ORDER BY date ASC WITH FILL FROM toStartOfDay(now() - interval '3 month') TO toStartOfDay(now()) STEP INTERVAL 1 day
-- V2 params: {"p1":"bayse"}
```

### projectCardMetricsQuery — projectCard metrics (bayse, America/New_York)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 835382/835382; wall V1/V2 = 43 ms / 68 ms; clickhouse_settings: session_timezone=America/New_York (both).

```sql
-- V1
SELECT uniqHLL12(if(created_at >= (now() - toIntervalMonth(3)), profile_id, null)) AS months_3, uniqHLL12(if(created_at >= (now() - toIntervalMonth(6)) AND created_at < (now() - toIntervalMonth(3)), profile_id, null)) AS months_3_prev, uniqHLL12(if(created_at >= (now() - toIntervalMonth(1)), profile_id, null)) AS month, uniqHLL12(if(created_at >= (now() - toIntervalDay(1)), profile_id, null)) AS day, uniqHLL12(if(created_at >= (now() - toIntervalDay(2)) AND created_at < (now() - toIntervalDay(1)), profile_id, null)) AS day_prev, sum(revenue * sign) as revenue FROM sessions WHERE project_id = 'bayse' AND created_at >= (now() - toIntervalMonth(6))
-- V2
SELECT uniqHLL12(if(created_at >= (now() - toIntervalMonth(3)), profile_id, null)) AS months_3, uniqHLL12(if(created_at >= (now() - toIntervalMonth(6)) AND created_at < (now() - toIntervalMonth(3)), profile_id, null)) AS months_3_prev, uniqHLL12(if(created_at >= (now() - toIntervalMonth(1)), profile_id, null)) AS month, uniqHLL12(if(created_at >= (now() - toIntervalDay(1)), profile_id, null)) AS day, uniqHLL12(if(created_at >= (now() - toIntervalDay(2)) AND created_at < (now() - toIntervalDay(1)), profile_id, null)) AS day_prev, sum(revenue * sign) as revenue FROM sessions WHERE project_id = {p1:String} AND created_at >= (now() - toIntervalMonth(6))
-- V2 params: {"p1":"bayse"}
```

### eventNamesWithCountQuery — events (verdict)

**statement** — IDENTICAL; rows V1/V2 = 85/85; rows_read V1/V2 = 221184/221184; wall V1/V2 = 11 ms / 11 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT name, count(name) as count FROM distinct_event_names_mv WHERE project_id = 'verdict' GROUP BY name ORDER BY count DESC, name ASC
-- V2
SELECT name, count(name) as count FROM distinct_event_names_mv WHERE project_id = {p1:String} GROUP BY name ORDER BY count DESC, name ASC
-- V2 params: {"p1":"verdict"}
```

### eventPropertyKeysQuery — properties (secure-privacy, event=undefined)

**statement** — IDENTICAL; rows V1/V2 = 174/174; rows_read V1/V2 = 128264/128264; wall V1/V2 = 18 ms / 11 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct property_key, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = 'secure-privacy' GROUP BY property_key ORDER BY created_at DESC, property_key ASC LIMIT 50000
-- V2
SELECT distinct property_key, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = {p1:String} GROUP BY property_key ORDER BY created_at DESC, property_key ASC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":50000}
```

### eventPropertyKeysQuery — properties (secure-privacy, event=*)

**statement** — IDENTICAL; rows V1/V2 = 174/174; rows_read V1/V2 = 128264/128264; wall V1/V2 = 11 ms / 10 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct property_key, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = 'secure-privacy' GROUP BY property_key ORDER BY created_at DESC, property_key ASC LIMIT 50000
-- V2
SELECT distinct property_key, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = {p1:String} GROUP BY property_key ORDER BY created_at DESC, property_key ASC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":50000}
```

### eventPropertyKeysQuery — properties (secure-privacy, event=screen_view)

**statement** — IDENTICAL; rows V1/V2 = 156/156; rows_read V1/V2 = 128264/128264; wall V1/V2 = 13 ms / 11 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct property_key, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = 'secure-privacy' AND name = 'screen_view' GROUP BY property_key ORDER BY created_at DESC, property_key ASC LIMIT 50000
-- V2
SELECT distinct property_key, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = {p1:String} AND name = {p2:String} GROUP BY property_key ORDER BY created_at DESC, property_key ASC LIMIT {p3:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":50000}
```

### eventPropertyValuesQuery — values properties.__title (secure-privacy, event='*')

**statement** — IDENTICAL; rows V1/V2 = 500/500; rows_read V1/V2 = 270336/172032; wall V1/V2 = 30 ms / 14 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct property_value, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = 'secure-privacy' AND property_key = '__title' GROUP BY property_value ORDER BY created_at DESC, property_value ASC LIMIT 500
-- V2
SELECT distinct property_value, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = {p1:String} AND property_key = {p2:String} GROUP BY property_value ORDER BY created_at DESC, property_value ASC LIMIT {p3:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"__title","p3":500}
```

### eventPropertyValuesQuery — values properties.__query.gclid (secure-privacy, event='screen_view')

**statement** — IDENTICAL; rows V1/V2 = 500/500; rows_read V1/V2 = 131072/114688; wall V1/V2 = 16 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct property_value, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = 'secure-privacy' AND property_key = '__query.gclid' AND name = 'screen_view' GROUP BY property_value ORDER BY created_at DESC, property_value ASC LIMIT 500
-- V2
SELECT distinct property_value, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = {p1:String} AND property_key = {p2:String} AND name = {p3:String} GROUP BY property_value ORDER BY created_at DESC, property_value ASC LIMIT {p4:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"__query.gclid","p3":"screen_view","p4":500}
```

### eventPropertyValuesQuery — values properties.value (secure-privacy, event='')

**statement** — IDENTICAL; rows V1/V2 = 500/500; rows_read V1/V2 = 270336/221184; wall V1/V2 = 14 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct property_value, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = 'secure-privacy' AND property_key = 'value' GROUP BY property_value ORDER BY created_at DESC, property_value ASC LIMIT 500
-- V2
SELECT distinct property_value, max(created_at) as created_at FROM event_property_values_mv WHERE project_id = {p1:String} AND property_key = {p2:String} GROUP BY property_value ORDER BY created_at DESC, property_value ASC LIMIT {p3:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"value","p3":500}
```

### profilePropertyValuesQuery — values profile.email (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 1251/1251; rows_read V1/V2 = 310976/310976; wall V1/V2 = 32 ms / 33 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct email as values FROM profiles FINAL WHERE project_id = 'secure-privacy' AND email != '' AND email IS NOT NULL ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct email as values FROM profiles FINAL WHERE project_id = {p1:String} AND email != '' AND email IS NOT NULL ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### profilePropertyValuesQuery — values profile.properties.os (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 12/12; rows_read V1/V2 = 310976/310976; wall V1/V2 = 82 ms / 71 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct properties['os'] as values FROM profiles FINAL WHERE project_id = 'secure-privacy' AND properties['os'] != '' AND properties['os'] IS NOT NULL ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct properties['os'] as values FROM profiles FINAL WHERE project_id = {p1:String} AND properties['os'] != '' AND properties['os'] IS NOT NULL ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### profilePropertyValuesQuery — values profile.properties.it's"odd (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 310976/310976; wall V1/V2 = 65 ms / 67 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct properties['it\'s\"odd'] as values FROM profiles FINAL WHERE project_id = 'secure-privacy' AND properties['it\'s\"odd'] != '' AND properties['it\'s\"odd'] IS NOT NULL ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct properties['it\'s\"odd'] as values FROM profiles FINAL WHERE project_id = {p1:String} AND properties['it\'s\"odd'] != '' AND properties['it\'s\"odd'] IS NOT NULL ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### profilePropertyValuesQuery — values profile.unknown (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 100000/100000; rows_read V1/V2 = 310976/310976; wall V1/V2 = 96 ms / 116 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct id as values FROM profiles FINAL WHERE project_id = 'secure-privacy' AND id != '' AND id IS NOT NULL ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct id as values FROM profiles FINAL WHERE project_id = {p1:String} AND id != '' AND id IS NOT NULL ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### groupPropertyValuesQuery — values group.name (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 345/345; rows_read V1/V2 = 3359/3359; wall V1/V2 = 8 ms / 8 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct name as values FROM groups FINAL WHERE project_id = 'secure-privacy' AND deleted = 0 AND name != '' AND name IS NOT NULL ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct name as values FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0 AND name != '' AND name IS NOT NULL ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### groupPropertyValuesQuery — values group.type (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 3359/3359; wall V1/V2 = 6 ms / 10 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct type as values FROM groups FINAL WHERE project_id = 'secure-privacy' AND deleted = 0 AND type != '' AND type IS NOT NULL ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct type as values FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0 AND type != '' AND type IS NOT NULL ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### groupPropertyValuesQuery — values group.properties.employees (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 3359/3359; wall V1/V2 = 9 ms / 9 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct properties['employees'] as values FROM groups FINAL WHERE project_id = 'secure-privacy' AND deleted = 0 AND properties['employees'] != '' AND properties['employees'] IS NOT NULL ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct properties['employees'] as values FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0 AND properties['employees'] != '' AND properties['employees'] IS NOT NULL ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### groupPropertyValuesQuery — values group.id (secure-privacy)

**statement** — IDENTICAL; rows V1/V2 = 347/347; rows_read V1/V2 = 3359/3359; wall V1/V2 = 7 ms / 7 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct id as values FROM groups FINAL WHERE project_id = 'secure-privacy' AND deleted = 0 AND id != '' AND id IS NOT NULL ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct id as values FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0 AND id != '' AND id IS NOT NULL ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### eventFieldValuesQuery — values country (secure-privacy, event='*')

**statement** — IDENTICAL; rows V1/V2 = 185/185; rows_read V1/V2 = 606120/606120; wall V1/V2 = 29 ms / 20 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct country as values FROM events WHERE project_id = 'secure-privacy' AND created_at > (now() - INTERVAL 6 MONTH) ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct country as values FROM events WHERE project_id = {p1:String} AND created_at > (now() - INTERVAL 6 MONTH) ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### eventFieldValuesQuery — values referrerName (secure-privacy, event='screen_view')

**statement** — IDENTICAL; rows V1/V2 = 826/826; rows_read V1/V2 = 606120/606120; wall V1/V2 = 29 ms / 25 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct referrer_name as values FROM events WHERE project_id = 'secure-privacy' AND created_at > (now() - INTERVAL 6 MONTH) AND name = 'screen_view' ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct referrer_name as values FROM events WHERE project_id = {p1:String} AND created_at > (now() - INTERVAL 6 MONTH) AND name = {p2:String} ORDER BY created_at DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":100000}
```

### eventFieldValuesQuery — values utm_source (secure-privacy, event='screen_view')

**statement** — IDENTICAL; rows V1/V2 = 89/89; rows_read V1/V2 = 606120/606120; wall V1/V2 = 59 ms / 53 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct properties['__query.utm_source'] as values FROM events WHERE project_id = 'secure-privacy' AND created_at > (now() - INTERVAL 6 MONTH) AND name = 'screen_view' ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct properties['__query.utm_source'] as values FROM events WHERE project_id = {p1:String} AND created_at > (now() - INTERVAL 6 MONTH) AND name = {p2:String} ORDER BY created_at DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":100000}
```

### eventFieldValuesQuery — values properties.__query[*] (secure-privacy, event='*')

**statement** — IDENTICAL; rows V1/V2 = 6532/6532; rows_read V1/V2 = 606120/606120; wall V1/V2 = 79 ms / 86 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.%'))) as values FROM events WHERE project_id = 'secure-privacy' AND created_at > (now() - INTERVAL 6 MONTH) ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.%'))) as values FROM events WHERE project_id = {p1:String} AND created_at > (now() - INTERVAL 6 MONTH) ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":100000}
```

### eventFieldValuesQuery — values path (secure-privacy, event='screen_view')

**statement** — IDENTICAL; rows V1/V2 = 6454/6454; rows_read V1/V2 = 606120/606120; wall V1/V2 = 49 ms / 41 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT distinct path as values FROM events WHERE project_id = 'secure-privacy' AND created_at > (now() - INTERVAL 6 MONTH) AND name = 'screen_view' ORDER BY created_at DESC LIMIT 100000
-- V2
SELECT distinct path as values FROM events WHERE project_id = {p1:String} AND created_at > (now() - INTERVAL 6 MONTH) AND name = {p2:String} ORDER BY created_at DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":100000}
```

### chartBucketProfilesQuery — getProfiles day bucket, screen_view, no breakdowns

**statement** — IDENTICAL; rows V1/V2 = 4092/4092; rows_read V1/V2 = 212951/49148; wall V1/V2 = 18 ms / 17 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT DISTINCT profile_id FROM events e WHERE project_id = 'secure-privacy' AND toStartOfDay(created_at) = toDate('2026-07-07 00:00:00') AND name = 'screen_view'
-- V2
SELECT DISTINCT profile_id FROM events e WHERE project_id = {p1:String} AND toStartOfDay(created_at) = toDate({p2:String}) AND name = {p3:String}
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-07 00:00:00","p3":"screen_view"}
```

### chartBucketProfilesQuery — getProfiles hour bucket, wildcard event, country filter

**statement** — IDENTICAL; rows V1/V2 = 181/181; rows_read V1/V2 = 212951/8192; wall V1/V2 = 17 ms / 6 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT DISTINCT profile_id FROM events e WHERE country = 'US' AND project_id = 'secure-privacy' AND toStartOfHour(created_at) = toDateTime('2026-07-07 10:00:00')
-- V2
SELECT DISTINCT profile_id FROM events e WHERE country = 'US' AND project_id = {p1:String} AND toStartOfHour(created_at) = toDateTime({p2:String})
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-07 10:00:00"}
```

### chartBucketProfilesQuery — getProfiles minute bucket

**statement** — IDENTICAL; rows V1/V2 = 8/8; rows_read V1/V2 = 212951/8192; wall V1/V2 = 11 ms / 10 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT DISTINCT profile_id FROM events e WHERE project_id = 'secure-privacy' AND toStartOfMinute(created_at) = toDateTime('2026-07-07 10:15:00') AND name = 'screen_view'
-- V2
SELECT DISTINCT profile_id FROM events e WHERE project_id = {p1:String} AND toStartOfMinute(created_at) = toDateTime({p2:String}) AND name = {p3:String}
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-07 10:15:00","p3":"screen_view"}
```

### chartBucketProfilesQuery — getProfiles week bucket + breakdowns country/path

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 204759/0; wall V1/V2 = 16 ms / 6 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT DISTINCT profile_id FROM events e WHERE project_id = 'secure-privacy' AND toStartOfWeek(toDateTime(created_at)) = toDate('2026-07-06 00:00:00') AND name = 'screen_view' AND country = 'US' AND path = '/'
-- V2
SELECT DISTINCT profile_id FROM events e WHERE project_id = {p1:String} AND toStartOfWeek(toDateTime(created_at)) = toDate({p2:String}) AND name = {p3:String} AND country = {p4:String} AND path = {p5:String}
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-06 00:00:00","p3":"screen_view","p4":"US","p5":"/"}
```

### chartBucketProfilesQuery — getProfiles month bucket + profile filter/breakdown join

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 671345/671345; wall V1/V2 = 118 ms / 107 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT DISTINCT profile_id FROM events e LEFT ANY JOIN (SELECT id, email, properties, first_name FROM profiles FINAL WHERE project_id = 'secure-privacy') as profile on profile.id = profile_id WHERE project_id = 'secure-privacy' AND toStartOfMonth(toDateTime(created_at)) = toDate('2026-07-01 00:00:00') AND name = 'screen_view' AND profile.properties['os'] = 'Mac OS' AND profile.first_name = 'x'
-- V2
SELECT DISTINCT profile_id FROM events e LEFT ANY JOIN (SELECT id, email, properties, first_name FROM profiles FINAL WHERE project_id = {p1:String}) as profile on profile.id = profile_id WHERE project_id = {p2:String} AND toStartOfMonth(toDateTime(created_at)) = toDate({p3:String}) AND name = {p4:String} AND profile.properties['os'] = {p5:String} AND profile.first_name = {p6:String}
-- V2 params: {"p1":"secure-privacy","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"screen_view","p5":"Mac OS","p6":"x"}
```

### chartBucketProfilesQuery — getProfiles day bucket + group filter/breakdown join

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 216310/3359; wall V1/V2 = 16 ms / 9 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT DISTINCT profile_id FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') AS _g ON _g.id = _group_id WHERE _g.type = 'company' AND project_id = 'secure-privacy' AND toStartOfDay(created_at) = toDate('2026-07-07 00:00:00') AND name = 'screen_view' AND _g.name = 'Secureprivacy' AND properties['__title'] = 'Secure Privacy'
-- V2
SELECT DISTINCT profile_id FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) AS _g ON _g.id = _group_id WHERE _g.type = 'company' AND project_id = {p2:String} AND toStartOfDay(created_at) = toDate({p3:String}) AND name = {p4:String} AND _g.name = {p5:String} AND properties['__title'] = {p6:String}
-- V2 params: {"p1":"secure-privacy","p2":"secure-privacy","p3":"2026-07-07 00:00:00","p4":"screen_view","p5":"Secureprivacy","p6":"Secure Privacy"}
```
