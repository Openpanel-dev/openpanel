# profile.sql.ts (now src/sql.ts) — V1 → V2 result-set proof (M7-002)

Every query builder in `src/sql.ts` (`profile.sql.ts` at proof time; renamed under R1, M15-121) was executed twice against the same data — once as V1 (the `git HEAD` service/router code, `3300f2a0`) and once as V2 (core's service, which renders the builder) — through one patched ClickHouse client that captured each statement, its `query_params`, `clickhouse_settings`, wall time and the raw JSON response. The two responses were compared on `data` (every row, every column, as JSON) and `meta` (column names and types). Statements without an `ORDER BY` were compared as row sets, because ClickHouse's parallel aggregation returns them in a different order run to run — V1 against itself too.

- **Amended by M27-002 (2026-09-15): `profileRecentEventsQuery`'s ORDER BY is no longer V1's text.**
  Same re-spelling as `event/src/sql.proof.md` records for `eventListQuery`, for the same reason: the
  `events` sort key is `(project_id, toDate(created_at), created_at, name)` and `ORDER BY created_at DESC`
  alone cannot use it (`docs/ANALYTICS_PERFORMANCE.md` §6.4). It now reads
  `ORDER BY toDate(created_at) DESC, created_at DESC`; `toDate` is monotonic in `created_at`, so the order
  is unchanged. Only the `-- V2` render of `profileRecentEventsQuery` (case
  `profileRowQuery + profileRecentEventsQuery`, statement 2) carries it; the `-- V1` line is left as V1
  wrote it. Re-proved against the local prod copy on **2026-09-15**, `use_query_condition_cache=0`,
  numbers off `X-ClickHouse-Summary`, on each project's busiest identified profile of 2026-08:
  - **Result sets:** both spellings as `FORMAT TSVRaw` compared by `sha256sum` (bytes and row order) on
    `verdict`, `bayse`, `earlysalary-production`, `chatpaper`: **identical, 4/4**.
  - **Cost, `LIMIT 20`, `read_rows` / warm `elapsed_ns`:** `verdict` 17,280,491 rows / 295 ms ->
    **139,246 rows / 21 ms** · `bayse` 10,195,851 / 183 ms -> 204,800 / 24 ms ·
    `earlysalary-production` 245,751 / 26-43 ms -> 180,217 / 31-47 ms · `chatpaper` 663,537 / 33-44 ms ->
    245,762 / 26-34 ms. On the two projects where `idx_profile_id` already pruned the read the two
    spellings are within run-to-run noise over 5 warm iterations each; the win is on the two where it
    did not.
  - The per-statement `rows_read V1/V2` and `wall V1/V2` figures below are from the 2026-09-04 run and
    therefore describe the pre-amendment V2 text.

- **Amended by M31-003 (2026-09-16): `profileListQuery`, `profileListCountQuery` and `powerUsersQuery`
  are bounded to an explicit window.** M25 Group C fix 8, approved by Carl on 2026-09-15: all three
  had no date filter at all, so their cost grew with the tenant's lifetime rather than with anything
  the caller chose (`docs/ANALYTICS_PERFORMANCE.md` §6.8). Each now carries
  `created_at BETWEEN toDateTime({pN:String}) AND toDateTime({pN:String})`, spelled as
  `overview/src/pages.sql.ts` spells it. **This is the approved semantic change** — "power users of
  all time" is now "power users of the range" — so these three cases are no longer V1-identical by
  construction, and the V1 lines below stand as the record of what they used to be. `created_at` is
  the column both tables can prune on (`profiles` is `PARTITION BY toYYYYMM(created_at)`; `events`
  has it in the sort key) and the column the list already orders by; `profiles.last_seen_at` is in
  neither and would prune nothing. See the M31-003 section at the end for the measurements.

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel` (319,499,000 events, static), project `redcollege` unless noted; cases needing rows the prod-copy lacks (`cohort_members`, `events_bots` are empty there) also ran on the isolated `openpanel_test` database with 3,380 events copied from `redcollege` under project `m7-002-proof`, plus seeded cohort/bot rows (deleted afterwards).
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are directional only; production is 2 shards × 2 replicas (`docs/ENVIRONMENT.md`). `rows_read` differences on JOIN statements are ClickHouse's per-run accounting of the right-hand side, not a plan difference: the SQL text is identical up to `{pN:Type}` binding.
- **Verdict**: 20 cases / 23 statements, all IDENTICAL. No conversion changed a result set.

The harness was a throwaway script (it needed verbatim copies of the V1 sources next to V2); each statement below is complete and reproducible with `curl http://127.0.0.1:8123/?database=openpanel`, binding the V2 params as `param_pN=`.

### profileMetricsQuery

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 335310/335310; wall V1/V2 = 52.5 ms / 49.1 ms; clickhouse_settings same.

```sql
-- V1
WITH profileSeen AS ( SELECT created_at as firstSeen, last_seen_at as lastSeen FROM profiles FINAL WHERE id = '107145' AND project_id = 'redcollege' LIMIT 1 ), eventStats AS ( SELECT countIf(name = 'screen_view') as screenViews, countIf(name = 'session_start') as sessions, round(avgIf(duration, name = 'session_end' AND duration != 0) / 1000 / 60, 2) as durationAvg, round(quantilesExactInclusiveIf(0.9)(duration, name = 'session_end' AND duration != 0)[1] / 1000 / 60, 2) as durationP90, count(*) as totalEvents, count(DISTINCT toDate(created_at)) as uniqueDaysActive, round(avgIf(properties['__bounce'] = '1', name = 'session_end') * 100, 4) as bounceRate, countIf(name NOT IN ('screen_view', 'session_start', 'session_end')) as conversionEvents, sumIf(revenue, name = 'revenue') as revenue FROM events WHERE profile_id = '107145' AND project_id = 'redcollege' ) SELECT (SELECT lastSeen FROM profileSeen) as lastSeen, (SELECT firstSeen FROM profileSeen) as firstSeen, screenViews, sessions, durationAvg, durationP90, totalEvents, uniqueDaysActive, bounceRate, round(totalEvents / nullIf(sessions, 0), 2) as avgEventsPerSession, conversionEvents, CASE WHEN sessions <= 1 THEN 0 ELSE round(dateDiff('second', (SELECT firstSeen FROM profileSeen), (SELECT lastSeen FROM profileSeen)) / nullIf(sessions - 1, 0), 1) END as avgTimeBetweenSessions, revenue FROM eventStats
-- V2
WITH profileSeen AS ( SELECT created_at as firstSeen, last_seen_at as lastSeen FROM profiles FINAL WHERE id = {p1:String} AND project_id = {p2:String} LIMIT 1 ), eventStats AS ( SELECT countIf(name = 'screen_view') as screenViews, countIf(name = 'session_start') as sessions, round(avgIf(duration, name = 'session_end' AND duration != 0) / 1000 / 60, 2) as durationAvg, round(quantilesExactInclusiveIf(0.9)(duration, name = 'session_end' AND duration != 0)[1] / 1000 / 60, 2) as durationP90, count(*) as totalEvents, count(DISTINCT toDate(created_at)) as uniqueDaysActive, round(avgIf(properties['__bounce'] = '1', name = 'session_end') * 100, 4) as bounceRate, countIf(name NOT IN ('screen_view', 'session_start', 'session_end')) as conversionEvents, sumIf(revenue, name = 'revenue') as revenue FROM events WHERE profile_id = {p3:String} AND project_id = {p4:String} ) SELECT (SELECT lastSeen FROM profileSeen) as lastSeen, (SELECT firstSeen FROM profileSeen) as firstSeen, screenViews, sessions, durationAvg, durationP90, totalEvents, uniqueDaysActive, bounceRate, round(totalEvents / nullIf(sessions, 0), 2) as avgEventsPerSession, conversionEvents, CASE WHEN sessions <= 1 THEN 0 ELSE round(dateDiff('second', (SELECT firstSeen FROM profileSeen), (SELECT lastSeen FROM profileSeen)) / nullIf(sessions - 1, 0), 1) END as avgTimeBetweenSessions, revenue FROM eventStats
-- V2 params: {"p1":"107145","p2":"redcollege","p3":"107145","p4":"redcollege"}
```

Result (first rows, identical on both sides): `[{"lastSeen":"2026-08-28 19:45:27.000","firstSeen":"2026-08-10 20:01:50.000","screenViews":1447,"sessions":2,"durationAvg":5.48,"durationP90":9.65,"totalEvents":1482,"uniqueDaysActive":11,"bounceRate"`

### profileByIdQuery

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 106218/106218; wall V1/V2 = 29.0 ms / 29.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE id = '107145' AND project_id = 'redcollege' LIMIT 1
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE id = {p1:String} AND project_id = {p2:String} LIMIT 1
-- V2 params: {"p1":"107145","p2":"redcollege"}
```

### profilesByIdsQuery

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 122602/122602; wall V1/V2 = 38.2 ms / 38.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = 'redcollege' AND id IN ('107145','107075','107098','missing')
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = {p1:String} AND id IN {p2:Array(String)}
-- V2 params: {"p1":"redcollege","p2":["107145","107075","107098","missing"]}
```

### profileListQuery — page 1, no search

**statement** — IDENTICAL; rows V1/V2 = 25/25; rows_read V1/V2 = 122602/122602; wall V1/V2 = 36.8 ms / 36.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM profiles FINAL WHERE project_id = 'redcollege' ORDER BY created_at DESC LIMIT 25
-- V2
SELECT * FROM profiles FINAL WHERE project_id = {p1:String} ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"redcollege","p2":25}
```

### profileListQuery — page 3, multi-token search, isExternal, filters

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 122602/122602; wall V1/V2 = 37.9 ms / 40.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM profiles FINAL WHERE project_id = 'redcollege' AND ((id ILIKE '%maria%' OR email ILIKE '%maria%' OR first_name ILIKE '%maria%' OR last_name ILIKE '%maria%' OR concat(first_name, ' ', last_name) ILIKE '%maria%') AND (id ILIKE '%colegio%' OR email ILIKE '%colegio%' OR first_name ILIKE '%colegio%' OR last_name ILIKE '%colegio%' OR concat(first_name, ' ', last_name) ILIKE '%colegio%')) AND is_external = true ORDER BY created_at DESC LIMIT 2 OFFSET 2
-- V2
SELECT * FROM profiles FINAL WHERE project_id = {p1:String} AND ((id ILIKE {p2:String} OR email ILIKE {p3:String} OR first_name ILIKE {p4:String} OR last_name ILIKE {p5:String} OR concat(first_name, ' ', last_name) ILIKE {p6:String}) AND (id ILIKE {p7:String} OR email ILIKE {p8:String} OR first_name ILIKE {p9:String} OR last_name ILIKE {p10:String} OR concat(first_name, ' ', last_name) ILIKE {p11:String})) AND is_external = {p12:Bool} ORDER BY created_at DESC LIMIT {p13:UInt64} OFFSET {p14:UInt64}
-- V2 params: {"p1":"redcollege","p2":"%maria%","p3":"%maria%","p4":"%maria%","p5":"%maria%","p6":"%maria%","p7":"%colegio%","p8":"%colegio%","p9":"%colegio%","p10":"%colegio%","p11":"%colegio%","p12":true,"p13":2,"p14":2}
```

### profileListCountQuery — no search

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 57344/57344; wall V1/V2 = 6.9 ms / 7.3 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(id) as count FROM profiles WHERE project_id = 'redcollege' GROUP BY project_id
-- V2
SELECT count(id) as count FROM profiles WHERE project_id = {p1:String} GROUP BY project_id
-- V2 params: {"p1":"redcollege"}
```

Result (first rows, identical on both sides): `[{"count":5604}]`

### profileListCountQuery — search, isExternal=false, filters

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 24576/24576; wall V1/V2 = 11.9 ms / 10.2 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(id) as count FROM profiles WHERE project_id = 'redcollege' AND ((id ILIKE '%maria%' OR email ILIKE '%maria%' OR first_name ILIKE '%maria%' OR last_name ILIKE '%maria%' OR concat(first_name, ' ', last_name) ILIKE '%maria%')) AND is_external = true GROUP BY project_id
-- V2
SELECT count(id) as count FROM profiles WHERE project_id = {p1:String} AND ((id ILIKE {p2:String} OR email ILIKE {p3:String} OR first_name ILIKE {p4:String} OR last_name ILIKE {p5:String} OR concat(first_name, ' ', last_name) ILIKE {p6:String})) AND is_external = {p7:Bool} GROUP BY project_id
-- V2 params: {"p1":"redcollege","p2":"%maria%","p3":"%maria%","p4":"%maria%","p5":"%maria%","p6":"%maria%","p7":true}
```

Result (first rows, identical on both sides): `[{"count":23}]`

### findProfilesQuery — every condition, asc, capped limit

**statement** — IDENTICAL; rows V1/V2 = 4/4; rows_read V1/V2 = 351028/351028; wall V1/V2 = 70.5 ms / 61.5 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = 'redcollege' AND email ILIKE '%colegio%' AND ((id ILIKE '%maria%' OR email ILIKE '%maria%' OR first_name ILIKE '%maria%' OR last_name ILIKE '%maria%' OR concat(first_name, ' ', last_name) ILIKE '%maria%')) AND properties['country'] = 'CL' AND properties['city'] = 'Santiago' AND properties['device'] = 'desktop' AND properties['browser'] = 'Chrome' AND id NOT IN ( SELECT DISTINCT profile_id FROM events WHERE project_id = 'redcollege' AND profile_id != '' AND created_at >= now() - INTERVAL 3 DAY ) AND id IN ( SELECT profile_id FROM sessions WHERE project_id = 'redcollege' AND sign = 1 AND profile_id != '' GROUP BY profile_id HAVING count() >= 1 ) AND id IN ( SELECT DISTINCT profile_id FROM events WHERE project_id = 'redcollege' AND name = 'screen_view' ) ORDER BY created_at ASC LIMIT 100
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = {p1:String} AND email ILIKE {p2:String} AND ((id ILIKE {p3:String} OR email ILIKE {p4:String} OR first_name ILIKE {p5:String} OR last_name ILIKE {p6:String} OR concat(first_name, ' ', last_name) ILIKE {p7:String})) AND properties[{p8:String}] = {p9:String} AND properties[{p10:String}] = {p11:String} AND properties[{p12:String}] = {p13:String} AND properties[{p14:String}] = {p15:String} AND id NOT IN ( SELECT DISTINCT profile_id FROM events WHERE project_id = {p16:String} AND profile_id != '' AND created_at >= now() - INTERVAL {p17:UInt64} DAY ) AND id IN ( SELECT profile_id FROM sessions WHERE project_id = {p18:String} AND sign = 1 AND profile_id != '' GROUP BY profile_id HAVING count() >= {p19:UInt64} ) AND id IN ( SELECT DISTINCT profile_id FROM events WHERE project_id = {p20:String} AND name = {p21:String} ) ORDER BY created_at ASC LIMIT {p22:UInt64}
-- V2 params: {"p1":"redcollege","p2":"%colegio%","p3":"%maria%","p4":"%maria%","p5":"%maria%","p6":"%maria%","p7":"%maria%","p8":"country","p9":"CL","p10":"city","p11":"Santiago","p12":"device","p13":"desktop","p14":"browser","p15":"Chrome","p16":"redcollege","p17":3,"p18":"redcollege","p19":1,"p20":"redcollege","p21":"screen_view","p22":100}
```

### findProfilesQuery — defaults (project only)

**statement** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 122602/122602; wall V1/V2 = 41.2 ms / 36.3 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = 'redcollege' ORDER BY created_at DESC LIMIT 20
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = {p1:String} ORDER BY created_at DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"redcollege","p2":20}
```

### profileRowQuery + profileRecentEventsQuery (getProfileWithEvents)

**statement 1** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 106218/106218; wall V1/V2 = 35.7 ms / 35.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = 'redcollege' AND id = '107145' LIMIT 1
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = {p1:String} AND id = {p2:String} LIMIT 1
-- V2 params: {"p1":"redcollege","p2":"107145"}
```

**statement 2** — IDENTICAL; rows V1/V2 = 7/7; rows_read V1/V2 = 131065/131065; wall V1/V2 = 26.5 ms / 34.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM events WHERE project_id = 'redcollege' AND profile_id = '107145' ORDER BY created_at DESC LIMIT 7
-- V2
SELECT * FROM events WHERE project_id = {p1:String} AND profile_id = {p2:String} ORDER BY toDate(created_at) DESC, created_at DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":"107145","p3":7}
```

### profileSessionsQuery

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 16378/16378; wall V1/V2 = 15.4 ms / 14.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM sessions WHERE project_id = 'redcollege' AND profile_id = '107145' AND sign = 1 ORDER BY created_at DESC LIMIT 5
-- V2
SELECT * FROM sessions WHERE project_id = {p1:String} AND profile_id = {p2:String} AND sign = 1 ORDER BY created_at DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":"107145","p3":5}
```

### profilePropertyKeysQuery

**statement** — IDENTICAL (as row sets; no ORDER BY); rows V1/V2 = 23/23; rows_read V1/V2 = 49152/49152; wall V1/V2 = 8.4 ms / 11.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT DISTINCT arrayJoin(mapKeys(properties)) as key FROM profiles WHERE project_id = 'redcollege' AND is_external = true
-- V2
SELECT DISTINCT arrayJoin(mapKeys(properties)) as key FROM profiles WHERE project_id = {p1:String} AND is_external = {p2:Bool}
-- V2 params: {"p1":"redcollege","p2":true}
```

Result (first rows, identical on both sides): `[{"key":"__referrer"},{"key":"roles"},{"key":"cargo"},{"key":"establecimientoId"},{"key":"establecimientoNombre"},{"key":"country"},{"key":"city"},{"key":"region"},{"key":"longitude"},{"key":"latitude`

### profileActivityQuery (profile.activity)

**statement** — IDENTICAL; rows V1/V2 = 11/11; rows_read V1/V2 = 122874/122874; wall V1/V2 = 12.2 ms / 10.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count, toStartOfDay(created_at) as date FROM events WHERE project_id = 'redcollege' and profile_id = '107145' GROUP BY date ORDER BY date DESC
-- V2
SELECT count(*) as count, toStartOfDay(created_at) as date FROM events WHERE project_id = {p1:String} and profile_id = {p2:String} GROUP BY date ORDER BY date DESC
-- V2 params: {"p1":"redcollege","p2":"107145"}
```

Result (first rows, identical on both sides): `[{"count":195,"date":"2026-08-24 00:00:00"},{"count":90,"date":"2026-08-21 00:00:00"},{"count":193,"date":"2026-08-20 00:00:00"},{"count":175,"date":"2026-08-19 00:00:00"},{"count":132,"date":"2026-08`

### profileMostEventsQuery (profile.mostEvents)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 114683/114683; wall V1/V2 = 11.7 ms / 12.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count, name FROM events WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND project_id = 'redcollege' and profile_id = '107145' GROUP BY name ORDER BY count DESC
-- V2
SELECT count(*) as count, name FROM events WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND project_id = {p1:String} and profile_id = {p2:String} GROUP BY name ORDER BY count DESC
-- V2 params: {"p1":"redcollege","p2":"107145"}
```

Result (first rows, identical on both sides): `[{"count":31,"name":"link_out"}]`

### profilePopularRoutesQuery (profile.popularRoutes)

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 122874/122874; wall V1/V2 = 15.4 ms / 17.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count, path FROM events WHERE name = 'screen_view' AND project_id = 'redcollege' and profile_id = '107145' GROUP BY path ORDER BY count DESC LIMIT 10
-- V2
SELECT count(*) as count, path FROM events WHERE name = 'screen_view' AND project_id = {p1:String} and profile_id = {p2:String} GROUP BY path ORDER BY count DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":"107145","p3":10}
```

Result (first rows, identical on both sides): `[{"count":485,"path":"/271/2026/libros"},{"count":231,"path":"/271/2026/asistencia-consolidada"},{"count":33,"path":"/271/2026/inicio"},{"count":28,"path":"/271/2026/libros/12533/asistencia"},{"count"`

### profilePropertyNamesQuery (profile.properties)

**statement** — IDENTICAL (as row sets; no ORDER BY); rows V1/V2 = 281/281; rows_read V1/V2 = 57344/57344; wall V1/V2 = 9.4 ms / 9.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT distinct mapKeys(properties) as keys from profiles where project_id = 'redcollege';
-- V2
SELECT distinct mapKeys(properties) as keys from profiles where project_id = {p1:String};
-- V2 params: {"p1":"redcollege"}
```

Result (first rows, identical on both sides): `[{"keys":["path","country","city","region","longitude","latitude","os","os_version","browser","browser_version","device","referrer","referrer_name"]},{"keys":["path","country","city","region","longitu`

### powerUsersQuery — page 2 (profile.powerUsers)

**statement 1** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 106218/106218; wall V1/V2 = 34.7 ms / 34.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = 'redcollege' AND id IN ('102208','91117','36357','183365','19316','133571','157236','161982','133563','107114')
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = {p1:String} AND id IN {p2:Array(String)}
-- V2 params: {"p1":"redcollege","p2":["102208","91117","36357","183365","19316","133571","157236","161982","133563","107114"]}
```

**statement 2** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 155641/155641; wall V1/V2 = 10.6 ms / 13.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT profile_id, count(*) as count FROM events WHERE profile_id != '' AND project_id = 'redcollege' GROUP BY profile_id ORDER BY count() DESC LIMIT 10 OFFSET 10
-- V2
SELECT profile_id, count(*) as count FROM events WHERE profile_id != '' AND project_id = {p1:String} GROUP BY profile_id ORDER BY count() DESC LIMIT {p2:UInt64} OFFSET {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":10,"p3":10}
```

Result (first rows, identical on both sides): `[{"profile_id":"102208","count":776},{"profile_id":"91117","count":728},{"profile_id":"36357","count":722},{"profile_id":"183365","count":721},{"profile_id":"19316","count":687},{"profile_id":"133571"`

### powerUsersQuery — first page (no OFFSET)

**statement 1** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 106218/106218; wall V1/V2 = 34.9 ms / 33.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = 'redcollege' AND id IN ('179221','107145','132720','107075','107139','107098','112629','133575','107144','167538')
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = {p1:String} AND id IN {p2:Array(String)}
-- V2 params: {"p1":"redcollege","p2":["179221","107145","132720","107075","107139","107098","112629","133575","107144","167538"]}
```

**statement 2** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 155641/155641; wall V1/V2 = 10.0 ms / 10.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT profile_id, count(*) as count FROM events WHERE profile_id != '' AND project_id = 'redcollege' GROUP BY profile_id ORDER BY count() DESC LIMIT 10
-- V2
SELECT profile_id, count(*) as count FROM events WHERE profile_id != '' AND project_id = {p1:String} GROUP BY profile_id ORDER BY count() DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"redcollege","p2":10}
```

Result (first rows, identical on both sides): `[{"profile_id":"179221","count":2377},{"profile_id":"107145","count":1482},{"profile_id":"132720","count":1387},{"profile_id":"107075","count":1361},{"profile_id":"107139","count":1182},{"profile_id":`

### profileValuesQuery — properties.* path with array wildcard

**statement** — IDENTICAL; rows V1/V2 = 14/14; rows_read V1/V2 = 57344/57344; wall V1/V2 = 11.4 ms / 10.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, 'roles'))) as values FROM profiles WHERE project_id = 'redcollege'
-- V2
SELECT distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, {p1:String}))) as values FROM profiles WHERE project_id = {p2:String}
-- V2 params: {"p1":"roles","p2":"redcollege"}
```

Result (first rows, identical on both sides): `[{"values":[]},{"values":["[\"Profesor\"]"]},{"values":["[\"Admin\"]"]},{"values":["[\"Admin\",\"Profesor\"]"]},{"values":["[\"Admin\",\"Apoderado\"]"]},{"values":["[\"Profesor\",\"Apoderado\"]"]},{"v`

### profileValuesQuery — bare column

**statement** — IDENTICAL; rows V1/V2 = 5604/5604; rows_read V1/V2 = 57344/57344; wall V1/V2 = 6.6 ms / 6.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT first_name as values FROM profiles WHERE project_id = 'redcollege'
-- V2
SELECT first_name as values FROM profiles WHERE project_id = {p1:String}
-- V2 params: {"p1":"redcollege"}
```

## profileMetricsQuery — EXPLAIN

`profile-metrics-sql.test.ts` drops V1's `itCH('parses and resolves against ClickHouse')` case (see its header for why core's suite cannot host a reachability check). The same check was run by hand on the rendered V2 statement with its bound params (`profile-1` / `test-sql-validation`, the test's own fixtures) against the prod-copy:

```
EXPLAIN <profileMetricsQuery(...).toStatement().query>   -- params {"p1":"profile-1","p2":"test-sql-validation","p3":"profile-1","p4":"test-sql-validation"}
Expression ((Project names + (Projection + (Change column names to column identifiers + (Project names + Projection)))))
  Aggregating
    Expression (Before GROUP BY)
      Expression ((WHERE + Change column names to column identifiers))
        ReadFromMergeTree (openpanel.events)
```

Parsed and resolved (73.6 ms). The plan shows one `ReadFromMergeTree` on `events` — the property the string tests guard; the `profiles` CTE is consumed through scalar subqueries, which ClickHouse evaluates ahead of the plan it prints. The result-set diff for the same builder on a real profile is the `profileMetricsQuery` case above.

## M31-003 — the explicit window (2026-09-16)

Run against the local prod-copy `openpanel` on **2026-09-16**, `use_query_condition_cache=0`,
`session_timezone=UTC`, numbers off `X-ClickHouse-Summary`, every statement rendered by the builder
itself (not retyped) and bound through `param_pN=`. Old and new were **interleaved** within each
5-iteration loop so neither owns the warm cache; the ms column is the median of 5, the rows/bytes
columns are invariant across iterations. `LIMIT 50`, which is `DEFAULT_LIST_TAKE`.

**A caveat this copy forces, stated first.** The copy's whole history fits inside three months —
`events` end 2026-08-25 and `profiles.created_at` spans 2026-07-01 -> 2026-08-30 — so at the default
`3m` range the window covers **all** the data and cannot prune anything. The `3m` column below is
therefore the *floor* case (what the change costs when it buys nothing), and the `7d` column is what
it buys as soon as the window is narrower than the tenant's history. On a tenant older than the
window the `3m` column moves toward the `7d` one; nothing on this box can show that, because no
project here is older than the window.

### `powerUsersQuery` (`events`)

| project | unbounded (V1) | default `3m` | `7d` (2026-08-18 -> 08-25) |
|---|---|---|---|
| `verdict` | 657 ms / 44,164,383 rows / 1017 MiB | 834 ms / 44,164,383 / 1354 MiB | **105 ms / 4,821,286 / 154 MiB** |
| `earlysalary-production` | 621 ms / 26,787,424 / 1624 MiB | 725 ms / 26,787,424 / 1828 MiB | **100 ms / 3,465,150 / 228 MiB** |
| `chatpaper` | 666 ms / 19,797,378 / 888 MiB | 777 ms / 19,797,378 / 1039 MiB | **101 ms / 2,662,273 / 134 MiB** |

At a window narrower than the data this is **6.3x fewer rows and ~6x faster**. At the default on this
copy it is **15-27 % slower**, and that is not noise: the `BETWEEN` adds `created_at` to the columns
read (+337 / +204 / +151 MiB) while pruning nothing, because everything is inside the window. That is
the unavoidable floor price of any date filter on this table, and it is bounded — after the change
the endpoint can never read more than three months, where before it read the tenant's whole life.

### `profileListQuery` / `profileListCountQuery` (`profiles`)

| statement | project | unbounded (V1) | default `3m` | `7d` |
|---|---|---|---|---|
| list | `chatpaper` | 309 ms / 1,858,944 / 707 MiB | 292 ms / 1,858,944 / 707 MiB | **125 ms / 794,624 / 301 MiB** |
| list | `earlysalary-production` | 278 ms / 1,827,940 / 861 MiB | 279 ms / 1,827,940 / 861 MiB | **128 ms / 851,968 / 406 MiB** |
| list | `verdict` | 156 ms / 916,864 / 380 MiB | 155 ms / 916,864 / 380 MiB | **71 ms / 434,176 / 178 MiB** |
| count | `chatpaper` | 65 ms / 1,662,816 / 74 MiB | 78 ms / 1,662,816 / 87 MiB | **40 ms / 745,472 / 39 MiB** |
| count | `earlysalary-production` | 49 ms / 1,624,345 / 95 MiB | 54 ms / 1,624,345 / 107 MiB | **24 ms / 802,816 / 33 MiB** |
| count | `verdict` | 30 ms / 745,312 / 32 MiB | 37 ms / 745,312 / 37 MiB | **31 ms / 385,024 / 19 MiB** |

The list pays **nothing** at the default — `SELECT *` already read `created_at` — and halves at a
narrower window. Only the count pays the extra column (+5 to +13 ms), for the same reason
`powerUsers` does.

### Result sets: what changed, and what did not

The window is a pure restriction, so where it covers all the data the answer must be unchanged. It
is, on every anchor — compared as result **sets** (`sorted(rows)`, sha256), `LIMIT 50`:

| query | `verdict` | `chatpaper` | `earlysalary-production` | `bayse` | `website-8103` |
|---|---|---|---|---|---|
| `powerUsersQuery` unbounded vs default `3m` | IDENTICAL | IDENTICAL | IDENTICAL | IDENTICAL | IDENTICAL |
| `profileListQuery` unbounded vs default `3m` | IDENTICAL | IDENTICAL | — | — | — |
| `profileListCountQuery` unbounded vs default `3m` | 696,160 = 696,160 | 1,609,483 = 1,609,483 | — | — | — |

At `7d` they differ, which is the approved change: `verdict`'s top-50 power users keep **23 of 50**
ids, `bayse` **39 of 50**; the profile count falls 1,609,483 -> 208,529 on `chatpaper` and
696,160 -> 92,275 on `verdict`.

**One thing to know before comparing `powerUsersQuery` by ordered rows: it was already
nondeterministic, and still is.** `ORDER BY count() DESC` has no tiebreak, so equal-count rows come
back in whatever order the parallel aggregation produced. Five runs of the **unbounded** statement,
unchanged, on 2026-09-16: `chatpaper` returned **4 distinct** ordered-row hashes, `earlysalary-production`
**5 distinct**. The top-50 *set* was stable across all of them. This is pre-existing (M31-003 changed
no `ORDER BY`), and it is why the table above compares sets — an ordered-row diff of this builder
reports a difference that is not a change.
