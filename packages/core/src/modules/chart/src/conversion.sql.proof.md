# conversion.sql.ts — V1 -> V2 result-set proof (M7-004)

The conversion statement was executed twice against the same data — once as V1 (the `git HEAD` `packages/db/src/services/conversion.service.ts`, `c4760ac2`, captured by wrapping the shared ClickHouse client) and once as V2 (the fragment the core service sends) — through one `@clickhouse/client` with `format: 'JSON'` and the same `session_timezone`. The two responses were compared on `data` (every row, every column, as JSON) and `meta` (column names and types). Both sides were driven by their own service, so the inputs, the breakdown resolution and the cohort lookups are the real ones.

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel` (319,499,000 events, static). Projects: `secure-privacy`, `verdict`, `bayse` (America/New_York).
- **Machine**: single-node ClickHouse on a 4-vCPU box — timings are directional only; production is 2 shards x 2 replicas (`docs/ENVIRONMENT.md`). The statement contains no `IN (subquery)`; the profile, group and cohort joins keep V1's exact `LEFT ANY JOIN` / `ARRAY JOIN` shape, so no `IN` / `GLOBAL IN` decision is made or unmade here.

- **Verdict**: 12 cases, 0 not identical.

### conversionQuery — no breakdown, day (secure-privacy)

**IDENTICAL** — rows V1/V2 = 7/7; rows_read V1/V2 = 106489/106489; wall V1/V2 = 38 ms / 42 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, windowFunnel(86400)( toDateTime(created_at), events.name = 'session_start', events.name = 'session_end' ) as steps FROM events WHERE project_id = 'secure-privacy' AND events.name IN ('session_start', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-12 23:59:59') GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"session_start","p6":"session_end","p7":"secure-privacy","p8":["session_start","session_end"],"p9":"2026-07-06 00:00:00","p10":"2026-07-12 23:59:59"}
```

### conversionQuery — breakdown country, day

**IDENTICAL** — rows V1/V2 = 463/463; rows_read V1/V2 = 106489/106489; wall V1/V2 = 55 ms / 38 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, country as b_0, windowFunnel(86400)( toDateTime(created_at), events.name = 'session_start', events.name = 'session_end' ) as steps FROM events WHERE project_id = 'secure-privacy' AND events.name IN ('session_start', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-12 23:59:59') GROUP BY session_id, country) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, country as b_0, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY session_id, country) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"session_start","p6":"session_end","p7":"secure-privacy","p8":["session_start","session_end"],"p9":"2026-07-06 00:00:00","p10":"2026-07-12 23:59:59"}
```

### conversionQuery — profile_id group, week interval, limit 3

**IDENTICAL** — rows V1/V2 = 19/19; rows_read V1/V2 = 155590/155590; wall V1/V2 = 50 ms / 65 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, b_0, uniqExact(profile_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(profile_id), 2) AS conversion_rate_percentage FROM ( (SELECT profile_id, any(toStartOfWeek(toDateTime(created_at))) as event_day, os as b_0, windowFunnel(259200)( toDateTime(created_at), events.name = 'session_start', events.name = 'screen_view' ) as steps FROM events WHERE project_id = 'secure-privacy' AND events.name IN ('session_start', 'screen_view') AND created_at BETWEEN toDateTime('2026-06-01 00:00:00') AND toDateTime('2026-07-12 23:59:59') GROUP BY profile_id, os) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2
SELECT event_day, b_0, uniqExact(profile_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(profile_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT profile_id, any(toStartOfWeek(toDateTime(created_at))) as event_day, os as b_0, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY profile_id, os) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":259200,"p5":"session_start","p6":"screen_view","p7":"secure-privacy","p8":["session_start","screen_view"],"p9":"2026-06-01 00:00:00","p10":"2026-07-12 23:59:59"}
```

### conversionQuery — step filters (country is US) + breakdown, hour

**IDENTICAL** — rows V1/V2 = 49/49; rows_read V1/V2 = 24572/24572; wall V1/V2 = 16 ms / 17 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfHour(created_at)) as event_day, device as b_0, windowFunnel(86400)( toDateTime(created_at), (events.name = 'screen_view' AND country = 'US'), events.name = 'session_end' ) as steps FROM events WHERE project_id = 'secure-privacy' AND events.name IN ('screen_view', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-07 00:00:00') GROUP BY session_id, device) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfHour(created_at)) as event_day, device as b_0, windowFunnel({p4:UInt64})( toDateTime(created_at), (events.name = {p5:String} AND country = 'US'), events.name = {p6:String} ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY session_id, device) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"screen_view","p6":"session_end","p7":"secure-privacy","p8":["screen_view","session_end"],"p9":"2026-07-06 00:00:00","p10":"2026-07-07 00:00:00"}
```

### conversionQuery — property breakdown + properties filter, day

**IDENTICAL** — rows V1/V2 = 4/4; rows_read V1/V2 = 65534/65534; wall V1/V2 = 29 ms / 48 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, properties['__path'] as b_0, windowFunnel(86400)( toDateTime(created_at), (events.name = 'screen_view' AND events.properties['__query.utm_source'] != ''), events.name = 'session_end' ) as steps FROM events WHERE project_id = 'secure-privacy' AND events.name IN ('screen_view', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') GROUP BY session_id, properties['__path']) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, properties['__path'] as b_0, windowFunnel({p4:UInt64})( toDateTime(created_at), (events.name = {p5:String} AND events.properties['__query.utm_source'] != ''), events.name = {p6:String} ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY session_id, properties['__path']) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"screen_view","p6":"session_end","p7":"secure-privacy","p8":["screen_view","session_end"],"p9":"2026-07-06 00:00:00","p10":"2026-07-09 23:59:59"}
```

### conversionQuery — profile breakdown -> profiles LEFT ANY JOIN, day

**IDENTICAL** — rows V1/V2 = 15/15; rows_read V1/V2 = 376510/376510; wall V1/V2 = 72 ms / 66 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, profile.email as b_0, windowFunnel(86400)( toDateTime(created_at), events.name = 'session_start', events.name = 'session_end' ) as steps FROM events LEFT ANY JOIN ( SELECT id, email FROM profiles FINAL WHERE project_id = 'secure-privacy' ) as profile ON profile.id = profile_id WHERE project_id = 'secure-privacy' AND events.name IN ('session_start', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') GROUP BY session_id, profile.email) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, profile.email as b_0, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events LEFT ANY JOIN ( SELECT id, email FROM profiles FINAL WHERE project_id = {p7:String} ) as profile ON profile.id = profile_id WHERE project_id = {p8:String} AND events.name IN {p9:Array(String)} AND created_at BETWEEN toDateTime({p10:String}) AND toDateTime({p11:String}) GROUP BY session_id, profile.email) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"session_start","p6":"session_end","p7":"secure-privacy","p8":"secure-privacy","p9":["session_start","session_end"],"p10":"2026-07-06 00:00:00","p11":"2026-07-09 23:59:59"}
```

### conversionQuery — profile.properties breakdown -> properties Map join, day

**IDENTICAL** — rows V1/V2 = 4/4; rows_read V1/V2 = 376510/376510; wall V1/V2 = 96 ms / 101 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, profile.properties['plan'] as b_0, windowFunnel(86400)( toDateTime(created_at), events.name = 'session_start', events.name = 'session_end' ) as steps FROM events LEFT ANY JOIN ( SELECT id, properties FROM profiles FINAL WHERE project_id = 'secure-privacy' ) as profile ON profile.id = profile_id WHERE project_id = 'secure-privacy' AND events.name IN ('session_start', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') GROUP BY session_id, profile.properties['plan']) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, profile.properties['plan'] as b_0, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events LEFT ANY JOIN ( SELECT id, properties FROM profiles FINAL WHERE project_id = {p7:String} ) as profile ON profile.id = profile_id WHERE project_id = {p8:String} AND events.name IN {p9:Array(String)} AND created_at BETWEEN toDateTime({p10:String}) AND toDateTime({p11:String}) GROUP BY session_id, profile.properties['plan']) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"session_start","p6":"session_end","p7":"secure-privacy","p8":"secure-privacy","p9":["session_start","session_end"],"p10":"2026-07-06 00:00:00","p11":"2026-07-09 23:59:59"}
```

### conversionQuery — group breakdown -> ARRAY JOIN groups, day

**IDENTICAL** — rows V1/V2 = 14/14; rows_read V1/V2 = 68893/68893; wall V1/V2 = 35 ms / 43 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, _group_id as b_0, windowFunnel(86400)( toDateTime(created_at), events.name = 'session_start', events.name = 'session_end' ) as steps FROM events ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') AS _g ON _g.id = _group_id WHERE project_id = 'secure-privacy' AND events.name IN ('session_start', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') GROUP BY session_id, _group_id) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2
SELECT event_day, b_0, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, _group_id as b_0, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p7:String}) AS _g ON _g.id = _group_id WHERE project_id = {p8:String} AND events.name IN {p9:Array(String)} AND created_at BETWEEN toDateTime({p10:String}) AND toDateTime({p11:String}) GROUP BY session_id, _group_id) ) WHERE steps > 0 GROUP BY event_day, b_0 ORDER BY event_day ASC, b_0 ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"session_start","p6":"session_end","p7":"secure-privacy","p8":"secure-privacy","p9":["session_start","session_end"],"p10":"2026-07-06 00:00:00","p11":"2026-07-09 23:59:59"}
```

### conversionQuery — unknown breakdown dropped, minute interval

**IDENTICAL** — rows V1/V2 = 116/116; rows_read V1/V2 = 16381/16381; wall V1/V2 = 15 ms / 15 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfMinute(created_at)) as event_day, windowFunnel(86400)( toDateTime(created_at), events.name = 'session_start', events.name = 'session_end' ) as steps FROM events WHERE project_id = 'secure-privacy' AND events.name IN ('session_start', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-06 02:00:00') GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfMinute(created_at)) as event_day, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"session_start","p6":"session_end","p7":"secure-privacy","p8":["session_start","session_end"],"p9":"2026-07-06 00:00:00","p10":"2026-07-06 02:00:00"}
```

### conversionQuery — month interval, verdict

**IDENTICAL** — rows V1/V2 = 1/1; rows_read V1/V2 = 24600197/24600197; wall V1/V2 = 626 ms / 576 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfMonth(toDateTime(created_at))) as event_day, windowFunnel(86400)( toDateTime(created_at), events.name = 'view_lobby_item', events.name = 'view_picks' ) as steps FROM events WHERE project_id = 'verdict' AND events.name IN ('view_lobby_item', 'view_picks') AND created_at BETWEEN toDateTime('2026-05-01 00:00:00') AND toDateTime('2026-07-31 23:59:59') GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfMonth(toDateTime(created_at))) as event_day, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"view_lobby_item","p6":"view_picks","p7":"verdict","p8":["view_lobby_item","view_picks"],"p9":"2026-05-01 00:00:00","p10":"2026-07-31 23:59:59"}
```

### conversionQuery — non-UTC session timezone (America/New_York), day

**IDENTICAL** — rows V1/V2 = 7/7; rows_read V1/V2 = 7945887/7945887; wall V1/V2 = 145 ms / 143 ms; clickhouse_settings: {"session_timezone":"America/New_York"} (both).

```sql
-- V1
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, windowFunnel(86400)( toDateTime(created_at), events.name = 'session_start', events.name = 'session_end' ) as steps FROM events WHERE project_id = 'bayse' AND events.name IN ('session_start', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-12 23:59:59') GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, windowFunnel({p4:UInt64})( toDateTime(created_at), events.name = {p5:String}, events.name = {p6:String} ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"session_start","p6":"session_end","p7":"bayse","p8":["session_start","session_end"],"p9":"2026-07-06 00:00:00","p10":"2026-07-12 23:59:59"}
```

### conversionQuery — globalFilters merged into both steps, day

**IDENTICAL** — rows V1/V2 = 4/4; rows_read V1/V2 = 65534/65534; wall V1/V2 = 25 ms / 35 ms; clickhouse_settings: {"session_timezone":"UTC"} (both).

```sql
-- V1
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= 2) AS conversions, round(100.0 * countIf(steps >= 2) / uniqExact(session_id), 2) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, windowFunnel(86400)( toDateTime(created_at), (events.name = 'session_start' AND os = 'iOS'), (events.name = 'session_end' AND os = 'iOS') ) as steps FROM events WHERE project_id = 'secure-privacy' AND events.name IN ('session_start', 'session_end') AND created_at BETWEEN toDateTime('2026-07-06 00:00:00') AND toDateTime('2026-07-09 23:59:59') GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2
SELECT event_day, uniqExact(session_id) AS total_first, countIf(steps >= {p1:UInt64}) AS conversions, round(100.0 * countIf(steps >= {p2:UInt64}) / uniqExact(session_id), {p3:UInt64}) AS conversion_rate_percentage FROM ( (SELECT session_id, any(toStartOfDay(created_at)) as event_day, windowFunnel({p4:UInt64})( toDateTime(created_at), (events.name = {p5:String} AND os = 'iOS'), (events.name = {p6:String} AND os = 'iOS') ) as steps FROM events WHERE project_id = {p7:String} AND events.name IN {p8:Array(String)} AND created_at BETWEEN toDateTime({p9:String}) AND toDateTime({p10:String}) GROUP BY session_id) ) WHERE steps > 0 GROUP BY event_day ORDER BY event_day ASC
-- V2 params: {"p1":2,"p2":2,"p3":2,"p4":86400,"p5":"session_start","p6":"session_end","p7":"secure-privacy","p8":["session_start","session_end"],"p9":"2026-07-06 00:00:00","p10":"2026-07-09 23:59:59"}
```
