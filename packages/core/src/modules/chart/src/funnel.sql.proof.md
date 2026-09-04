# funnel.sql.ts — V1 -> V2 result-set proof (M7-004)

Both funnel statements were executed twice against the same data — once as V1 (the `git HEAD` `packages/db/src/services/funnel.service.ts` plus the `getFunnelProfiles` composition from `chart.service.ts`, `c4760ac2`, captured by wrapping the shared ClickHouse client) and once as V2 (the fragment the core builders return) — through one `@clickhouse/client` with `format: 'JSON'` and the same `session_timezone`. The two responses were compared on `data` (every row, every column, as JSON) and `meta` (column names and types).

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel` (319,499,000 events, static). Projects: `secure-privacy`, `verdict`, `bayse` (America/New_York), `dream-mate` (Australia/Sydney).
- **Machine**: single-node ClickHouse on a 4-vCPU box — timings are directional only; production is 2 shards x 2 replicas (`docs/ENVIRONMENT.md`). The statements contain no `IN (subquery)`; the profiles `LEFT JOIN`, the groups `ARRAY JOIN` and the cohort joins keep V1's exact shape, so no `IN` / `GLOBAL IN` decision is made or unmade here.
- **Note on `LIMIT 1000`**: the profile-list cases that return 1000 rows are capped by the statement's own `LIMIT` (V1's `FUNNEL_PROFILES_LIMIT`), and `SELECT DISTINCT ... LIMIT` carries no `ORDER BY` on either side; those cases came back with identical row *sequences* anyway, which is why they read IDENTICAL rather than IDENTICAL AS SET.

- **Verdict**: 21 cases, 0 not identical.

### funnelChartQuery — two steps, no breakdown (golden insights-funnel-two-steps shape)

**IDENTICAL** — rows V1/V2 = 2/2; rows_read V1/V2 = 7470531/7470531; wall V1/V2 = 198 ms / 199 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'view_lobby_item', events.name = 'view_picks') AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = 'verdict' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-12 23:59:59') AND events.name IN ('view_lobby_item', 'view_picks') AND ((events.name = 'view_lobby_item') OR (events.name = 'view_picks')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = {p4:String} AND created_at BETWEEN toDateTime({p5:String}) AND toDateTime({p6:String}) AND events.name IN {p7:Array(String)} AND ((events.name = {p8:String}) OR (events.name = {p9:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"view_lobby_item","p3":"view_picks","p4":"verdict","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":["view_lobby_item","view_picks"],"p8":"view_lobby_item","p9":"view_picks"}
```

### funnelChartQuery — three steps, profile_id group, 72h window (golden shape)

**IDENTICAL** — rows V1/V2 = 2/2; rows_read V1/V2 = 106489/106489; wall V1/V2 = 34 ms / 36 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT profile_id, windowFunnel(259200000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'screen_view', events.name = 'session_end') AS level FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-12 23:59:59') AND events.name IN ('session_start', 'screen_view', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'screen_view') OR (events.name = 'session_end')) GROUP BY profile_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT profile_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}, events.name = {p4:String}) AS level FROM events WHERE project_id = {p5:String} AND created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String}) AND events.name IN {p8:Array(String)} AND ((events.name = {p9:String}) OR (events.name = {p10:String}) OR (events.name = {p11:String})) GROUP BY profile_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":259200000,"p2":"session_start","p3":"screen_view","p4":"session_end","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59","p8":["session_start","screen_view","session_end"],"p9":"session_start","p10":"screen_view","p11":"session_end"}
```

### funnelChartQuery — breakdown country (argMinIf attribution)

**IDENTICAL** — rows V1/V2 = 118/118; rows_read V1/V2 = 106489/106489; wall V1/V2 = 43 ms / 28 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'screen_view') AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(country, created_at, events.name = 'session_start') as b_0 FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-12 23:59:59') AND events.name IN ('session_start', 'screen_view') AND ((events.name = 'session_start') OR (events.name = 'screen_view')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(country, created_at, events.name = {p4:String}) as b_0 FROM events WHERE project_id = {p5:String} AND created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String}) AND events.name IN {p8:Array(String)} AND ((events.name = {p9:String}) OR (events.name = {p10:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"screen_view","p4":"session_start","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-12 23:59:59","p8":["session_start","screen_view"],"p9":"session_start","p10":"screen_view"}
```

### funnelChartQuery — two breakdowns (country + os)

**IDENTICAL** — rows V1/V2 = 284/284; rows_read V1/V2 = 65534/65534; wall V1/V2 = 24 ms / 24 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(country, created_at, events.name = 'session_start') as b_0, argMinIf(os, created_at, events.name = 'session_start') as b_1 FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, b_1, count() as count FROM funnel GROUP BY level, b_0, b_1 ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(country, created_at, events.name = {p4:String}) as b_0, argMinIf(os, created_at, events.name = {p5:String}) as b_1 FROM events WHERE project_id = {p6:String} AND created_at BETWEEN toDateTime({p7:String}) AND toDateTime({p8:String}) AND events.name IN {p9:Array(String)} AND ((events.name = {p10:String}) OR (events.name = {p11:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, b_1, count() as count FROM funnel GROUP BY level, b_0, b_1 ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"session_start","p5":"session_start","p6":"secure-privacy","p7":"2026-07-06 00:00:00","p8":"2026-07-09 23:59:59","p9":["session_start","session_end"],"p10":"session_start","p11":"session_end"}
```

### funnelChartQuery — step filters + step pre-filter

**IDENTICAL** — rows V1/V2 = 2/2; rows_read V1/V2 = 73724/73724; wall V1/V2 = 21 ms / 42 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), country = 'US' AND events.name = 'screen_view', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('screen_view', 'session_end') AND ((country = 'US' AND events.name = 'screen_view') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), country = 'US' AND events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = {p4:String} AND created_at BETWEEN toDateTime({p5:String}) AND toDateTime({p6:String}) AND events.name IN {p7:Array(String)} AND ((country = 'US' AND events.name = {p8:String}) OR (events.name = {p9:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"screen_view","p3":"session_end","p4":"secure-privacy","p5":"2026-07-06 00:00:00","p6":"2026-07-09 23:59:59","p7":["screen_view","session_end"],"p8":"screen_view","p9":"session_end"}
```

### funnelChartQuery — profile.* filter -> profiles LEFT JOIN

**IDENTICAL** — rows V1/V2 = 1/1; rows_read V1/V2 = 376510/376510; wall V1/V2 = 76 ms / 68 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id FROM events LEFT JOIN (SELECT id, email FROM profiles FINAL WHERE project_id = 'secure-privacy') as profile ON profile.id = events.profile_id WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events LEFT JOIN (SELECT id, email FROM profiles FINAL WHERE project_id = {p4:String}) as profile ON profile.id = events.profile_id WHERE project_id = {p5:String} AND created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String}) AND events.name IN {p8:Array(String)} AND ((events.name = {p9:String}) OR (events.name = {p10:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"secure-privacy","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-09 23:59:59","p8":["session_start","session_end"],"p9":"session_start","p10":"session_end"}
```

### funnelChartQuery — profile.properties breakdown -> narrowed properties CTE

**IDENTICAL** — rows V1/V2 = 1/1; rows_read V1/V2 = 376510/376510; wall V1/V2 = 103 ms / 102 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(`profile.properties.plan`, created_at, events.name = 'session_start') as b_0 FROM events LEFT JOIN (SELECT id, properties['plan'] as `profile.properties.plan` FROM profiles FINAL WHERE project_id = 'secure-privacy') as profile ON profile.id = events.profile_id WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(`profile.properties.plan`, created_at, events.name = {p4:String}) as b_0 FROM events LEFT JOIN (SELECT id, properties['plan'] as `profile.properties.plan` FROM profiles FINAL WHERE project_id = {p5:String}) as profile ON profile.id = events.profile_id WHERE project_id = {p6:String} AND created_at BETWEEN toDateTime({p7:String}) AND toDateTime({p8:String}) AND events.name IN {p9:Array(String)} AND ((events.name = {p10:String}) OR (events.name = {p11:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"session_start","p5":"secure-privacy","p6":"secure-privacy","p7":"2026-07-06 00:00:00","p8":"2026-07-09 23:59:59","p9":["session_start","session_end"],"p10":"session_start","p11":"session_end"}
```

### funnelChartQuery — group.* breakdown -> ARRAY JOIN + per-row GROUP BY

**IDENTICAL** — rows V1/V2 = 8/8; rows_read V1/V2 = 68893/68893; wall V1/V2 = 33 ms / 36 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy'), session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id, _group_id as b_0 FROM events ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id, b_0), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}), session_funnel AS (SELECT session_id, windowFunnel({p2:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p3:String}, events.name = {p4:String}) AS level, argMax(profile_id, created_at) AS profile_id, _group_id as b_0 FROM events ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE project_id = {p5:String} AND created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String}) AND events.name IN {p8:Array(String)} AND ((events.name = {p9:String}) OR (events.name = {p10:String})) GROUP BY session_id, b_0), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2 params: {"p1":"secure-privacy","p2":86400000,"p3":"session_start","p4":"session_end","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-09 23:59:59","p8":["session_start","session_end"],"p9":"session_start","p10":"session_end"}
```

### funnelChartQuery — funnelGroup "group" forces the groups ARRAY JOIN

**IDENTICAL** — rows V1/V2 = 1/1; rows_read V1/V2 = 68893/68893; wall V1/V2 = 27 ms / 38 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy'), session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id FROM events ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}), session_funnel AS (SELECT session_id, windowFunnel({p2:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p3:String}, events.name = {p4:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE project_id = {p5:String} AND created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String}) AND events.name IN {p8:Array(String)} AND ((events.name = {p9:String}) OR (events.name = {p10:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":"secure-privacy","p2":86400000,"p3":"session_start","p4":"session_end","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-09 23:59:59","p8":["session_start","session_end"],"p9":"session_start","p10":"session_end"}
```

### funnelChartQuery — properties.* filter + properties.* breakdown

**IDENTICAL** — rows V1/V2 = 2/2; rows_read V1/V2 = 65534/65534; wall V1/V2 = 29 ms / 29 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.properties['__query.utm_source'] != '' AND events.name = 'screen_view', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(properties['__path'], created_at, events.properties['__query.utm_source'] != '' AND events.name = 'screen_view') as b_0 FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('screen_view', 'session_end') AND ((events.properties['__query.utm_source'] != '' AND events.name = 'screen_view') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.properties['__query.utm_source'] != '' AND events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(properties['__path'], created_at, events.properties['__query.utm_source'] != '' AND events.name = {p4:String}) as b_0 FROM events WHERE project_id = {p5:String} AND created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String}) AND events.name IN {p8:Array(String)} AND ((events.properties['__query.utm_source'] != '' AND events.name = {p9:String}) OR (events.name = {p10:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"screen_view","p3":"session_end","p4":"screen_view","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-09 23:59:59","p8":["screen_view","session_end"],"p9":"screen_view","p10":"session_end"}
```

### funnelChartQuery — unknown + all-cohorts breakdowns dropped

**IDENTICAL** — rows V1/V2 = 1/1; rows_read V1/V2 = 65534/65534; wall V1/V2 = 33 ms / 34 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = {p4:String} AND created_at BETWEEN toDateTime({p5:String}) AND toDateTime({p6:String}) AND events.name IN {p7:Array(String)} AND ((events.name = {p8:String}) OR (events.name = {p9:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"secure-privacy","p5":"2026-07-06 00:00:00","p6":"2026-07-09 23:59:59","p7":["session_start","session_end"],"p8":"session_start","p9":"session_end"}
```

### funnelChartQuery — globalFilters merged into every step

**IDENTICAL** — rows V1/V2 = 1/1; rows_read V1/V2 = 81916/81916; wall V1/V2 = 26 ms / 28 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), os = 'iOS' AND events.name = 'session_start', os = 'iOS' AND events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((os = 'iOS' AND events.name = 'session_start') OR (os = 'iOS' AND events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), os = 'iOS' AND events.name = {p2:String}, os = 'iOS' AND events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = {p4:String} AND created_at BETWEEN toDateTime({p5:String}) AND toDateTime({p6:String}) AND events.name IN {p7:Array(String)} AND ((os = 'iOS' AND events.name = {p8:String}) OR (os = 'iOS' AND events.name = {p9:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"secure-privacy","p5":"2026-07-06 00:00:00","p6":"2026-07-09 23:59:59","p7":["session_start","session_end"],"p8":"session_start","p9":"session_end"}
```

### funnelChartQuery — non-UTC session timezone (America/New_York)

**IDENTICAL** — rows V1/V2 = 2/2; rows_read V1/V2 = 7945887/7945887; wall V1/V2 = 146 ms / 161 ms; clickhouse_settings: {"session_timezone":"America/New_York"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'screen_view') AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = 'bayse' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-12 23:59:59') AND events.name IN ('session_start', 'screen_view') AND ((events.name = 'session_start') OR (events.name = 'screen_view')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = {p4:String} AND created_at BETWEEN toDateTime({p5:String}) AND toDateTime({p6:String}) AND events.name IN {p7:Array(String)} AND ((events.name = {p8:String}) OR (events.name = {p9:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"screen_view","p4":"bayse","p5":"2026-07-06 00:00:00","p6":"2026-07-12 23:59:59","p7":["session_start","screen_view"],"p8":"session_start","p9":"screen_view"}
```

### funnelChartQuery — Sydney DST window, 168h (golden insights-funnel-syd-dst shape)

**IDENTICAL** — rows V1/V2 = 2/2; rows_read V1/V2 = 7962156/7962156; wall V1/V2 = 217 ms / 229 ms; clickhouse_settings: {"session_timezone":"Australia/Sydney"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(604800000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'screen_view', events.name = 'send_message') AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = 'dream-mate' AND created_at BETWEEN toDateTime('2026-08-01 00:00:00') AND toDateTime('2026-10-31 23:59:59') AND events.name IN ('screen_view', 'send_message') AND ((events.name = 'screen_view') OR (events.name = 'send_message')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = {p4:String} AND created_at BETWEEN toDateTime({p5:String}) AND toDateTime({p6:String}) AND events.name IN {p7:Array(String)} AND ((events.name = {p8:String}) OR (events.name = {p9:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, count() as count FROM funnel GROUP BY level ORDER BY level DESC
-- V2 params: {"p1":604800000,"p2":"screen_view","p3":"send_message","p4":"dream-mate","p5":"2026-08-01 00:00:00","p6":"2026-10-31 23:59:59","p7":["screen_view","send_message"],"p8":"screen_view","p9":"send_message"}
```

### funnelChartQuery — four steps, limit 3, breakdown device

**IDENTICAL** — rows V1/V2 = 3/3; rows_read V1/V2 = 73724/73724; wall V1/V2 = 31 ms / 27 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'screen_view', events.name = 'screen_view', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(device, created_at, events.name = 'session_start') as b_0 FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'screen_view', 'screen_view', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'screen_view') OR (events.name = 'screen_view') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}, events.name = {p4:String}, events.name = {p5:String}) AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(device, created_at, events.name = {p6:String}) as b_0 FROM events WHERE project_id = {p7:String} AND created_at BETWEEN toDateTime({p8:String}) AND toDateTime({p9:String}) AND events.name IN {p10:Array(String)} AND ((events.name = {p11:String}) OR (events.name = {p12:String}) OR (events.name = {p13:String}) OR (events.name = {p14:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT level, b_0, count() as count FROM funnel GROUP BY level, b_0 ORDER BY level DESC
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"screen_view","p4":"screen_view","p5":"session_end","p6":"session_start","p7":"secure-privacy","p8":"2026-07-06 00:00:00","p9":"2026-07-09 23:59:59","p10":["session_start","screen_view","screen_view","session_end"],"p11":"session_start","p12":"screen_view","p13":"screen_view","p14":"session_end"}
```

### funnelProfilesQuery — level >= 2, no breakdown

**IDENTICAL** — rows V1/V2 = 1000/1000; rows_read V1/V2 = 65534/65534; wall V1/V2 = 49 ms / 32 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level >= 2 LIMIT 1000
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = {p4:String} AND created_at BETWEEN toDateTime({p5:String}) AND toDateTime({p6:String}) AND events.name IN {p7:Array(String)} AND ((events.name = {p8:String}) OR (events.name = {p9:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level >= {p10:UInt64} LIMIT {p11:UInt64}
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"secure-privacy","p5":"2026-07-06 00:00:00","p6":"2026-07-09 23:59:59","p7":["session_start","session_end"],"p8":"session_start","p9":"session_end","p10":2,"p11":1000}
```

### funnelProfilesQuery — level = 1 dropoffs (rare second step), no breakdown

**IDENTICAL** — rows V1/V2 = 1000/1000; rows_read V1/V2 = 65534/65534; wall V1/V2 = 29 ms / 43 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'link_out') AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'link_out') AND ((events.name = 'session_start') OR (events.name = 'link_out')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level = 1 LIMIT 1000
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id FROM events WHERE project_id = {p4:String} AND created_at BETWEEN toDateTime({p5:String}) AND toDateTime({p6:String}) AND events.name IN {p7:Array(String)} AND ((events.name = {p8:String}) OR (events.name = {p9:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level = {p10:UInt64} LIMIT {p11:UInt64}
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"link_out","p4":"secure-privacy","p5":"2026-07-06 00:00:00","p6":"2026-07-09 23:59:59","p7":["session_start","link_out"],"p8":"session_start","p9":"link_out","p10":1,"p11":1000}
```

### funnelProfilesQuery — level >= 2, breakdown value "US"

**IDENTICAL** — rows V1/V2 = 1000/1000; rows_read V1/V2 = 65534/65534; wall V1/V2 = 45 ms / 31 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(country, created_at, events.name = 'session_start') as b_0 FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level >= 2 AND trim(ifNull(toString(b_0), '')) = 'US' LIMIT 1000
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(country, created_at, events.name = {p4:String}) as b_0 FROM events WHERE project_id = {p5:String} AND created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String}) AND events.name IN {p8:Array(String)} AND ((events.name = {p9:String}) OR (events.name = {p10:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level >= {p11:UInt64} AND trim(ifNull(toString(b_0), '')) = {p12:String} LIMIT {p13:UInt64}
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"session_start","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-09 23:59:59","p8":["session_start","session_end"],"p9":"session_start","p10":"session_end","p11":2,"p12":"US","p13":1000}
```

### funnelProfilesQuery — level >= 2, breakdown value "Not set" (empty-bucket match)

**IDENTICAL** — rows V1/V2 = 1000/1000; rows_read V1/V2 = 65534/65534; wall V1/V2 = 51 ms / 56 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT session_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(properties['__query.utm_source'], created_at, events.name = 'session_start') as b_0 FROM events WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level >= 2 AND (trim(ifNull(toString(b_0), '')) = '' OR trim(ifNull(toString(b_0), '')) = 'Not set') LIMIT 1000
-- V2
WITH session_funnel AS (SELECT session_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMax(profile_id, created_at) AS profile_id, argMinIf(properties['__query.utm_source'], created_at, events.name = {p4:String}) as b_0 FROM events WHERE project_id = {p5:String} AND created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String}) AND events.name IN {p8:Array(String)} AND ((events.name = {p9:String}) OR (events.name = {p10:String})) GROUP BY session_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level >= {p11:UInt64} AND (trim(ifNull(toString(b_0), '')) = '' OR trim(ifNull(toString(b_0), '')) = {p12:String}) LIMIT {p13:UInt64}
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"session_start","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-09 23:59:59","p8":["session_start","session_end"],"p9":"session_start","p10":"session_end","p11":2,"p12":"Not set","p13":1000}
```

### funnelProfilesQuery — profile.properties breakdown, profile_id group

**IDENTICAL** — rows V1/V2 = 1000/1000; rows_read V1/V2 = 376510/376510; wall V1/V2 = 87 ms / 67 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
WITH session_funnel AS (SELECT profile_id, windowFunnel(86400000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = 'session_start', events.name = 'session_end') AS level, argMinIf(`profile.properties.plan`, created_at, events.name = 'session_start') as b_0 FROM events LEFT JOIN (SELECT id, properties['plan'] as `profile.properties.plan` FROM profiles FINAL WHERE project_id = 'secure-privacy') as profile ON profile.id = events.profile_id WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') AND events.name IN ('session_start', 'session_end') AND ((events.name = 'session_start') OR (events.name = 'session_end')) GROUP BY profile_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level >= 2 LIMIT 1000
-- V2
WITH session_funnel AS (SELECT profile_id, windowFunnel({p1:UInt64}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), events.name = {p2:String}, events.name = {p3:String}) AS level, argMinIf(`profile.properties.plan`, created_at, events.name = {p4:String}) as b_0 FROM events LEFT JOIN (SELECT id, properties['plan'] as `profile.properties.plan` FROM profiles FINAL WHERE project_id = {p5:String}) as profile ON profile.id = events.profile_id WHERE project_id = {p6:String} AND created_at BETWEEN toDateTime({p7:String}) AND toDateTime({p8:String}) AND events.name IN {p9:Array(String)} AND ((events.name = {p10:String}) OR (events.name = {p11:String})) GROUP BY profile_id), funnel AS (SELECT * FROM session_funnel WHERE level != 0) SELECT DISTINCT profile_id FROM funnel WHERE level >= {p12:UInt64} LIMIT {p13:UInt64}
-- V2 params: {"p1":86400000,"p2":"session_start","p3":"session_end","p4":"session_start","p5":"secure-privacy","p6":"secure-privacy","p7":"2026-07-06 00:00:00","p8":"2026-07-09 23:59:59","p9":["session_start","session_end"],"p10":"session_start","p11":"session_end","p12":2,"p13":1000}
```

### funnelSessionsQuery — buildSessionsCte

**IDENTICAL** — rows V1/V2 = 100/100; rows_read V1/V2 = 24553/24553; wall V1/V2 = 8 ms / 9 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT profile_id as pid, id as sid FROM sessions WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-07 00:00:00') LIMIT 100
-- V2
SELECT profile_id as pid, id as sid FROM sessions WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) LIMIT 100
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-06 00:00:00","p3":"2026-07-07 00:00:00"}
```
