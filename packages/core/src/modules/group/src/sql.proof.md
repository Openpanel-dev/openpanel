# sql.ts (formerly group.sql.ts) — V1 → V2 result-set proof (M7-002)

Every query builder in `sql.ts` was executed twice against the same data — once as V1 (the `git HEAD` service/router code, `3300f2a0`) and once as V2 (core's service, which renders the builder) — through one patched ClickHouse client that captured each statement, its `query_params`, `clickhouse_settings`, wall time and the raw JSON response. The two responses were compared on `data` (every row, every column, as JSON) and `meta` (column names and types). Statements without an `ORDER BY` were compared as row sets, because ClickHouse's parallel aggregation returns them in a different order run to run — V1 against itself too.

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel` (319,499,000 events, static), project `redcollege` unless noted; cases needing rows the prod-copy lacks (`cohort_members`, `events_bots` are empty there) also ran on the isolated `openpanel_test` database with 3,380 events copied from `redcollege` under project `m7-002-proof`, plus seeded cohort/bot rows (deleted afterwards).
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are directional only; production is 2 shards × 2 replicas (`docs/ENVIRONMENT.md`). `rows_read` differences on JOIN statements are ClickHouse's per-run accounting of the right-hand side, not a plan difference: the SQL text is identical up to `{pN:Type}` binding.
- **Verdict**: 16 cases / 18 statements, all IDENTICAL. No conversion changed a result set.

The harness was a throwaway script (it needed verbatim copies of the V1 sources next to V2); each statement below is complete and reproducible with `curl http://127.0.0.1:8123/?database=openpanel`, binding the V2 params as `param_pN=`.

### groupByIdQuery

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 3359/3359; wall V1/V2 = 5.3 ms / 5.5 ms; clickhouse_settings same.

```sql
-- V1
SELECT project_id, id, type, name, properties, created_at, version FROM groups FINAL WHERE project_id = 'redcollege' AND id = '271' AND deleted = 0
-- V2
SELECT project_id, id, type, name, properties, created_at, version FROM groups FINAL WHERE project_id = {p1:String} AND id = {p2:String} AND deleted = 0
-- V2 params: {"p1":"redcollege","p2":"271"}
```

### groupListQuery — page 2, type + search

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 3359/3359; wall V1/V2 = 5.5 ms / 5.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT project_id, id, type, name, properties, created_at, version FROM groups FINAL WHERE project_id = 'redcollege' AND deleted = 0 AND type = 'establecimiento' AND (name ILIKE '%colegio%' OR id ILIKE '%colegio%') ORDER BY created_at DESC LIMIT 10 OFFSET 10
-- V2
SELECT project_id, id, type, name, properties, created_at, version FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0 AND type = {p2:String} AND (name ILIKE {p3:String} OR id ILIKE {p4:String}) ORDER BY created_at DESC LIMIT {p5:UInt64} OFFSET {p6:UInt64}
-- V2 params: {"p1":"redcollege","p2":"establecimiento","p3":"%colegio%","p4":"%colegio%","p5":10,"p6":10}
```

### groupListQuery — first page, no filters

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 3359/3359; wall V1/V2 = 9.8 ms / 6.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT project_id, id, type, name, properties, created_at, version FROM groups FINAL WHERE project_id = 'redcollege' AND deleted = 0 ORDER BY created_at DESC LIMIT 10 OFFSET 0
-- V2
SELECT project_id, id, type, name, properties, created_at, version FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0 ORDER BY created_at DESC LIMIT {p2:UInt64} OFFSET {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":10,"p3":0}
```

### groupListCountQuery — type + search

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 3359/3359; wall V1/V2 = 5.3 ms / 5.3 ms; clickhouse_settings same.

```sql
-- V1
SELECT count() as count FROM groups FINAL WHERE project_id = 'redcollege' AND deleted = 0 AND type = 'establecimiento' AND (name ILIKE '%colegio%' OR id ILIKE '%colegio%')
-- V2
SELECT count() as count FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0 AND type = {p2:String} AND (name ILIKE {p3:String} OR id ILIKE {p4:String})
-- V2 params: {"p1":"redcollege","p2":"establecimiento","p3":"%colegio%","p4":"%colegio%"}
```

Result (first rows, identical on both sides): `[{"count":42}]`

### groupListCountQuery — plain

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 3359/3359; wall V1/V2 = 5.7 ms / 4.3 ms; clickhouse_settings same.

```sql
-- V1
SELECT count() as count FROM groups FINAL WHERE project_id = 'redcollege' AND deleted = 0
-- V2
SELECT count() as count FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0
-- V2 params: {"p1":"redcollege"}
```

Result (first rows, identical on both sides): `[{"count":124}]`

### groupTypesQuery

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 3359/3359; wall V1/V2 = 4.1 ms / 4.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT DISTINCT type FROM groups FINAL WHERE project_id = 'redcollege' AND deleted = 0
-- V2
SELECT DISTINCT type FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0
-- V2 params: {"p1":"redcollege"}
```

Result (first rows, identical on both sides): `[{"type":"establecimiento"}]`

### groupPropertyKeysQuery

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 3359/3359; wall V1/V2 = 6.2 ms / 6.2 ms; clickhouse_settings same.

```sql
-- V1
SELECT DISTINCT arrayJoin(mapKeys(properties)) as key FROM groups FINAL WHERE project_id = 'redcollege' AND deleted = 0
-- V2
SELECT DISTINCT arrayJoin(mapKeys(properties)) as key FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0
-- V2 params: {"p1":"redcollege"}
```

Result (first rows, identical on both sides): `[{"key":"rbd"}]`

### groupStatsQuery

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 147449/147449; wall V1/V2 = 23.6 ms / 17.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT g AS group_id, uniqExact(profile_id) AS member_count, max(created_at) AS last_active_at FROM events ARRAY JOIN groups AS g WHERE project_id = 'redcollege' AND g IN ('271','454','521') AND profile_id != device_id GROUP BY g
-- V2
SELECT g AS group_id, uniqExact(profile_id) AS member_count, max(created_at) AS last_active_at FROM events ARRAY JOIN groups AS g WHERE project_id = {p1:String} AND g IN {p2:Array(String)} AND profile_id != device_id GROUP BY g
-- V2 params: {"p1":"redcollege","p2":["271","454","521"]}
```

Result (first rows, identical on both sides): `[{"group_id":"271","member_count":76,"last_active_at":"2026-08-25 02:16:23.865"}]`

### groupsByIdsQuery

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 3359/3359; wall V1/V2 = 5.2 ms / 4.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT project_id, id, type, name, properties, created_at, version FROM groups FINAL WHERE project_id = 'redcollege' AND id IN ('271','454','missing') AND deleted = 0
-- V2
SELECT project_id, id, type, name, properties, created_at, version FROM groups FINAL WHERE project_id = {p1:String} AND id IN {p2:Array(String)} AND deleted = 0
-- V2 params: {"p1":"redcollege","p2":["271","454","missing"]}
```

### groupMemberProfilesQuery — search (trimmed), page 2

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 122602/122602; wall V1/V2 = 23.1 ms / 22.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, count() OVER () AS total_count FROM profiles FINAL WHERE project_id = 'redcollege' AND has(groups, '271') AND (email ILIKE '%maria%' OR first_name ILIKE '%maria%' OR last_name ILIKE '%maria%') ORDER BY created_at DESC LIMIT 5 OFFSET 5
-- V2
SELECT id, count() OVER () AS total_count FROM profiles FINAL WHERE project_id = {p1:String} AND has(groups, {p2:String}) AND (email ILIKE {p3:String} OR first_name ILIKE {p4:String} OR last_name ILIKE {p5:String}) ORDER BY created_at DESC LIMIT {p6:UInt64} OFFSET {p7:UInt64}
-- V2 params: {"p1":"redcollege","p2":"271","p3":"%maria%","p4":"%maria%","p5":"%maria%","p6":5,"p7":5}
```

### groupMemberProfilesQuery — blank search, first page

**statement 1** — IDENTICAL; rows V1/V2 = 5/5; rows_read V1/V2 = 106218/106218; wall V1/V2 = 35.9 ms / 34.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = {p1:String} AND id IN {p2:Array(String)}
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE project_id = {p1:String} AND id IN {p2:Array(String)}
-- V2 params: {"p1":"redcollege","p2":["107142","186276","107079","107111","107918"]}
```

**statement 2** — IDENTICAL; rows V1/V2 = 5/5; rows_read V1/V2 = 122602/122602; wall V1/V2 = 22.9 ms / 19.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, count() OVER () AS total_count FROM profiles FINAL WHERE project_id = 'redcollege' AND has(groups, '271') ORDER BY created_at DESC LIMIT 5 OFFSET 0
-- V2
SELECT id, count() OVER () AS total_count FROM profiles FINAL WHERE project_id = {p1:String} AND has(groups, {p2:String}) ORDER BY created_at DESC LIMIT {p3:UInt64} OFFSET {p4:UInt64}
-- V2 params: {"p1":"redcollege","p2":"271","p3":5,"p4":0}
```

### groupEventMetricsQuery + groupUniqueProfilesQuery (group.metrics)

**statement 1** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 147449/147449; wall V1/V2 = 13.0 ms / 14.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT count() AS totalEvents, min(created_at) AS firstSeen, max(created_at) AS lastSeen FROM events WHERE project_id = 'redcollege' AND has(groups, '271')
-- V2
SELECT count() AS totalEvents, min(created_at) AS firstSeen, max(created_at) AS lastSeen FROM events WHERE project_id = {p1:String} AND has(groups, {p2:String})
-- V2 params: {"p1":"redcollege","p2":"271"}
```

Result (first rows, identical on both sides): `[{"totalEvents":20492,"firstSeen":"2026-08-10 20:02:03.875","lastSeen":"2026-08-25 02:16:23.865"}]`

**statement 2** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 122602/122602; wall V1/V2 = 21.8 ms / 21.3 ms; clickhouse_settings same.

```sql
-- V1
SELECT count() AS uniqueProfiles FROM profiles FINAL WHERE project_id = 'redcollege' AND has(groups, '271')
-- V2
SELECT count() AS uniqueProfiles FROM profiles FINAL WHERE project_id = {p1:String} AND has(groups, {p2:String})
-- V2 params: {"p1":"redcollege","p2":"271"}
```

Result (first rows, identical on both sides): `[{"uniqueProfiles":75}]`

### groupActivityQuery (group.activity)

**statement** — IDENTICAL; rows V1/V2 = 16/16; rows_read V1/V2 = 147449/147449; wall V1/V2 = 11.5 ms / 11.2 ms; clickhouse_settings same.

```sql
-- V1
SELECT count() AS count, toStartOfDay(created_at) AS date FROM events WHERE project_id = 'redcollege' AND has(groups, '271') GROUP BY date ORDER BY date DESC
-- V2
SELECT count() AS count, toStartOfDay(created_at) AS date FROM events WHERE project_id = {p1:String} AND has(groups, {p2:String}) GROUP BY date ORDER BY date DESC
-- V2 params: {"p1":"redcollege","p2":"271"}
```

Result (first rows, identical on both sides): `[{"count":2,"date":"2026-08-25 00:00:00"},{"count":1985,"date":"2026-08-24 00:00:00"},{"count":72,"date":"2026-08-23 00:00:00"},{"count":41,"date":"2026-08-22 00:00:00"},{"count":1178,"date":"2026-08-`

### groupMemberGrowthQuery (group.memberGrowth)

**statement** — IDENTICAL; rows V1/V2 = 30/30; rows_read V1/V2 = 73450/73450; wall V1/V2 = 12.8 ms / 13.5 ms; clickhouse_settings same.

```sql
-- V1
SELECT toDate(toStartOfDay(created_at)) AS date, count() AS count FROM profiles FINAL WHERE project_id = 'redcollege' AND has(groups, '271') AND created_at >= now() - INTERVAL 30 DAY GROUP BY date ORDER BY date ASC WITH FILL FROM toDate(now() - INTERVAL 29 DAY) TO toDate(now() + INTERVAL 1 DAY) STEP 1
-- V2
SELECT toDate(toStartOfDay(created_at)) AS date, count() AS count FROM profiles FINAL WHERE project_id = {p1:String} AND has(groups, {p2:String}) AND created_at >= now() - INTERVAL {p3:UInt64} DAY GROUP BY date ORDER BY date ASC WITH FILL FROM toDate(now() - INTERVAL {p4:UInt64} DAY) TO toDate(now() + INTERVAL 1 DAY) STEP 1
-- V2 params: {"p1":"redcollege","p2":"271","p3":30,"p4":29}
```

Result (first rows, identical on both sides): `[{"date":"2026-08-06","count":0},{"date":"2026-08-07","count":0},{"date":"2026-08-08","count":0},{"date":"2026-08-09","count":0},{"date":"2026-08-10","count":22},{"date":"2026-08-11","count":36},{"dat`

### groupMostEventsQuery (group.mostEvents)

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 147449/147449; wall V1/V2 = 11.6 ms / 16.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT count() as count, name FROM events WHERE project_id = 'redcollege' AND has(groups, '271') AND name NOT IN ('screen_view', 'session_start', 'session_end') GROUP BY name ORDER BY count DESC LIMIT 10
-- V2
SELECT count() as count, name FROM events WHERE project_id = {p1:String} AND has(groups, {p2:String}) AND name NOT IN ('screen_view', 'session_start', 'session_end') GROUP BY name ORDER BY count DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":"271","p3":10}
```

Result (first rows, identical on both sides): `[{"count":854,"name":"link_out"},{"count":1,"name":"banner_click"}]`

### groupPopularRoutesQuery (group.popularRoutes)

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 147449/147449; wall V1/V2 = 21.0 ms / 15.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT count() as count, path FROM events WHERE project_id = 'redcollege' AND has(groups, '271') AND name = 'screen_view' GROUP BY path ORDER BY count DESC LIMIT 10
-- V2
SELECT count() as count, path FROM events WHERE project_id = {p1:String} AND has(groups, {p2:String}) AND name = 'screen_view' GROUP BY path ORDER BY count DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":"271","p3":10}
```

Result (first rows, identical on both sides): `[{"count":3460,"path":"/271/2026/libros"},{"count":1648,"path":"/271/2026/inicio"},{"count":903,"path":"/271/2026/asistencia-consolidada"},{"count":181,"path":"/271/2026/libros/12530/asistencia"},{"co`

