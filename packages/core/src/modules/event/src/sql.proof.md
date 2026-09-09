# sql.ts (formerly event.sql.ts) — V1 → V2 result-set proof (M7-002)

Every query builder in `sql.ts` was executed twice against the same data — once as V1 (the `git HEAD` service/router code, `3300f2a0`) and once as V2 (core's service, which renders the builder) — through one patched ClickHouse client that captured each statement, its `query_params`, `clickhouse_settings`, wall time and the raw JSON response. The two responses were compared on `data` (every row, every column, as JSON) and `meta` (column names and types). Statements without an `ORDER BY` were compared as row sets, because ClickHouse's parallel aggregation returns them in a different order run to run — V1 against itself too.

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel` (319,499,000 events, static), project `redcollege` unless noted; cases needing rows the prod-copy lacks (`cohort_members`, `events_bots` are empty there) also ran on the isolated `openpanel_test` database with 3,380 events copied from `redcollege` under project `m7-002-proof`, plus seeded cohort/bot rows (deleted afterwards).
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are directional only; production is 2 shards × 2 replicas (`docs/ENVIRONMENT.md`). `rows_read` differences on JOIN statements are ClickHouse's per-run accounting of the right-hand side, not a plan difference: the SQL text is identical up to `{pN:Type}` binding.
- **Verdict**: 26 cases / 51 statements, all IDENTICAL. No conversion changed a result set.

The harness was a throwaway script (it needed verbatim copies of the V1 sources next to V2); each statement below is complete and reproducible with `curl http://127.0.0.1:8123/?database=openpanel`, binding the V2 params as `param_pN=`.

### eventListQuery — date cursor, default columns, no lookups

**statement 1** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 42.7 ms / 10.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 0.5 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} ORDER BY created_at DESC, id ASC LIMIT {p5:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":0.5,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":50}
```

**statement 2** — IDENTICAL; rows V1/V2 = 50/50; rows_read V1/V2 = 24575/24575; wall V1/V2 = 27.3 ms / 18.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 1 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} ORDER BY created_at DESC, id ASC LIMIT {p5:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":1,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":50}
```

### eventListQuery — numeric cursor page 2, every column, date range

**statement** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 73721/73721; wall V1/V2 = 23.2 ms / 21.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, properties, country, city, region, longitude, latitude, os, os_version, browser, browser_version, device, brand, model, path, origin, referrer, referrer_name, referrer_type, imported_at, sdk_name, sdk_version, revenue, groups FROM events e WHERE project_id = 'redcollege' AND toDate(created_at) BETWEEN toDate('2026-08-15 00:00:00') AND toDate('2026-08-20 23:59:59') ORDER BY created_at DESC, id ASC LIMIT 20 OFFSET 40
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, properties, country, city, region, longitude, latitude, os, os_version, browser, browser_version, device, brand, model, path, origin, referrer, referrer_name, referrer_type, imported_at, sdk_name, sdk_version, revenue, groups FROM events e WHERE project_id = {p1:String} AND toDate(created_at) BETWEEN toDate({p2:String}) AND toDate({p3:String}) ORDER BY created_at DESC, id ASC LIMIT {p4:UInt64} OFFSET {p5:UInt64}
-- V2 params: {"p1":"redcollege","p2":"2026-08-15 00:00:00","p3":"2026-08-20 23:59:59","p4":20,"p5":40}
```

### eventListQuery — profile (identity stitching) + events + sessionId

**statement 1** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 122874/122874; wall V1/V2 = 31.2 ms / 20.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-26 00:00:00', 3) - INTERVAL 0.5 DAY AND created_at < '2026-08-26 00:00:00' AND project_id = 'redcollege' AND ((device_id IN (SELECT device_id as did FROM events WHERE project_id = 'redcollege' AND device_id != '' AND profile_id = '107145' group by did) AND profile_id = device_id) OR profile_id = '107145') AND session_id = '0kiE1SjOk6U6_WDCbuyLeQ' AND name IN ('screen_view','link_out') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND ((device_id IN (SELECT device_id as did FROM events WHERE project_id = {p5:String} AND device_id != '' AND profile_id = {p6:String} group by did) AND profile_id = device_id) OR profile_id = {p7:String}) AND session_id = {p8:String} AND name IN {p9:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p10:UInt64}
-- V2 params: {"p1":"2026-08-26 00:00:00","p2":0.5,"p3":"2026-08-26 00:00:00","p4":"redcollege","p5":"redcollege","p6":"107145","p7":"107145","p8":"0kiE1SjOk6U6_WDCbuyLeQ","p9":["screen_view","link_out"],"p10":50}
```

**statement 2** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 163832/163832; wall V1/V2 = 22.5 ms / 27.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-26 00:00:00', 3) - INTERVAL 1 DAY AND created_at < '2026-08-26 00:00:00' AND project_id = 'redcollege' AND ((device_id IN (SELECT device_id as did FROM events WHERE project_id = 'redcollege' AND device_id != '' AND profile_id = '107145' group by did) AND profile_id = device_id) OR profile_id = '107145') AND session_id = '0kiE1SjOk6U6_WDCbuyLeQ' AND name IN ('screen_view','link_out') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND ((device_id IN (SELECT device_id as did FROM events WHERE project_id = {p5:String} AND device_id != '' AND profile_id = {p6:String} group by did) AND profile_id = device_id) OR profile_id = {p7:String}) AND session_id = {p8:String} AND name IN {p9:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p10:UInt64}
-- V2 params: {"p1":"2026-08-26 00:00:00","p2":1,"p3":"2026-08-26 00:00:00","p4":"redcollege","p5":"redcollege","p6":"107145","p7":"107145","p8":"0kiE1SjOk6U6_WDCbuyLeQ","p9":["screen_view","link_out"],"p10":50}
```

**statement 3** — IDENTICAL; rows V1/V2 = 50/50; rows_read V1/V2 = 180215/180215; wall V1/V2 = 32.7 ms / 32.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-26 00:00:00', 3) - INTERVAL 2 DAY AND created_at < '2026-08-26 00:00:00' AND project_id = 'redcollege' AND ((device_id IN (SELECT device_id as did FROM events WHERE project_id = 'redcollege' AND device_id != '' AND profile_id = '107145' group by did) AND profile_id = device_id) OR profile_id = '107145') AND session_id = '0kiE1SjOk6U6_WDCbuyLeQ' AND name IN ('screen_view','link_out') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND ((device_id IN (SELECT device_id as did FROM events WHERE project_id = {p5:String} AND device_id != '' AND profile_id = {p6:String} group by did) AND profile_id = device_id) OR profile_id = {p7:String}) AND session_id = {p8:String} AND name IN {p9:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p10:UInt64}
-- V2 params: {"p1":"2026-08-26 00:00:00","p2":2,"p3":"2026-08-26 00:00:00","p4":"redcollege","p5":"redcollege","p6":"107145","p7":"107145","p8":"0kiE1SjOk6U6_WDCbuyLeQ","p9":["screen_view","link_out"],"p10":50}
```

### eventListQuery — groupId + profile.* filter (profile join)

**statement 1** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 16.6 ms / 10.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = 'redcollege') as profile on profile.id = profile_id WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 0.5 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND has(groups, '395') AND profile.properties['cargo'] = 'Profesora' ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = {p1:String}) as profile on profile.id = profile_id WHERE created_at >= toDateTime64({p2:String}, 3) - INTERVAL {p3:Float64} DAY AND created_at < {p4:String} AND project_id = {p5:String} AND has(groups, {p6:String}) AND profile.properties['cargo'] = 'Profesora' ORDER BY created_at DESC, id ASC LIMIT {p7:UInt64}
-- V2 params: {"p1":"redcollege","p2":"2026-08-24 00:00:00","p3":0.5,"p4":"2026-08-24 00:00:00","p5":"redcollege","p6":"395","p7":50}
```

**statement 2** — IDENTICAL; rows V1/V2 = 50/50; rows_read V1/V2 = 130794/130794; wall V1/V2 = 71.3 ms / 52.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = 'redcollege') as profile on profile.id = profile_id WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 1 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND has(groups, '395') AND profile.properties['cargo'] = 'Profesora' ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = {p1:String}) as profile on profile.id = profile_id WHERE created_at >= toDateTime64({p2:String}, 3) - INTERVAL {p3:Float64} DAY AND created_at < {p4:String} AND project_id = {p5:String} AND has(groups, {p6:String}) AND profile.properties['cargo'] = 'Profesora' ORDER BY created_at DESC, id ASC LIMIT {p7:UInt64}
-- V2 params: {"p1":"redcollege","p2":"2026-08-24 00:00:00","p3":1,"p4":"2026-08-24 00:00:00","p5":"redcollege","p6":"395","p7":50}
```

### eventListQuery — groupId + group.* filter (group array join)

**statement 1** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 3359/3359; wall V1/V2 = 10.3 ms / 12.2 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'redcollege') AS _g ON _g.id = _group_id WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 0.5 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND has(groups, '271') AND _g.type = 'establecimiento' ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) AS _g ON _g.id = _group_id WHERE created_at >= toDateTime64({p2:String}, 3) - INTERVAL {p3:Float64} DAY AND created_at < {p4:String} AND project_id = {p5:String} AND has(groups, {p6:String}) AND _g.type = 'establecimiento' ORDER BY created_at DESC, id ASC LIMIT {p7:UInt64}
-- V2 params: {"p1":"redcollege","p2":"2026-08-24 00:00:00","p3":0.5,"p4":"2026-08-24 00:00:00","p5":"redcollege","p6":"271","p7":50}
```

**statement 2** — IDENTICAL; rows V1/V2 = 50/50; rows_read V1/V2 = 11551/11551; wall V1/V2 = 14.5 ms / 12.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'redcollege') AS _g ON _g.id = _group_id WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 1 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND has(groups, '271') AND _g.type = 'establecimiento' ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) AS _g ON _g.id = _group_id WHERE created_at >= toDateTime64({p2:String}, 3) - INTERVAL {p3:Float64} DAY AND created_at < {p4:String} AND project_id = {p5:String} AND has(groups, {p6:String}) AND _g.type = 'establecimiento' ORDER BY created_at DESC, id ASC LIMIT {p7:UInt64}
-- V2 params: {"p1":"redcollege","p2":"2026-08-24 00:00:00","p3":1,"p4":"2026-08-24 00:00:00","p5":"redcollege","p6":"271","p7":50}
```

### eventListQuery — profile.* AND group.* filters together (V1 error parity)

Both sides raise the same ClickHouse error (V1 has always failed this input; V2 must fail identically, not "fix" it):

- **v1**: `JOIN ANY LEFT JOIN ... ON profile.id = profile_id ambiguous identifier 'id'. In scope SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events AS e ANY LEFT JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = 'redcollege'`
- **v2**: `JOIN ANY LEFT JOIN ... ON profile.id = profile_id ambiguous identifier 'id'. In scope SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events AS e ANY LEFT JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = 'redcollege'`

### eventListQuery — cohortId + conversions name list (event.conversions)

**statement 1** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 15.6 ms / 10.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 0.5 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":0.5,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 2** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 16.1 ms / 9.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 1 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":1,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 3** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 14.6 ms / 10.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 2 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":2,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 4** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 15.3 ms / 11.5 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 4 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":4,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 5** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 16.7 ms / 14.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 8 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":8,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 6** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 15.6 ms / 13.2 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 16 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":16,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 7** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 14.0 ms / 15.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 32 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":32,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 8** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 15.1 ms / 14.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 64 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":64,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 9** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 18.3 ms / 14.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 128 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":128,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 10** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 12.3 ms / 14.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 256 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":256,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 11** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 13.0 ms / 14.2 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 512 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":512,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 12** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 14.6 ms / 14.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 1024 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":1024,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

**statement 13** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 13.3 ms / 14.3 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 1825 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":1825,"p3":"2026-08-24 00:00:00","p4":"redcollege","p5":"cohort-1","p6":"redcollege","p7":["link_out","banner_click"],"p8":50}
```

The prod-copy has no rows for this case (empty `cohort_members` / `events_bots`), so the same case also ran on the seeded `openpanel_test` copy:

### eventListQuery — cohortId + conversions name list (event.conversions)

_Database: `openpanel_test`._

**statement 1** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 3383/3383; wall V1/V2 = 50.5 ms / 8.3 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 0.5 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'm7-002-proof' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'm7-002-proof') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":0.5,"p3":"2026-08-24 00:00:00","p4":"m7-002-proof","p5":"cohort-1","p6":"m7-002-proof","p7":["link_out","banner_click"],"p8":50}
```

**statement 2** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 6763/6763; wall V1/V2 = 9.9 ms / 8.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-08-24 00:00:00', 3) - INTERVAL 1 DAY AND created_at < '2026-08-24 00:00:00' AND project_id = 'm7-002-proof' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'm7-002-proof') AND name IN ('link_out','banner_click') ORDER BY created_at DESC, id ASC LIMIT 50
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p5:String} AND project_id = {p6:String}) AND name IN {p7:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p8:UInt64}
-- V2 params: {"p1":"2026-08-24 00:00:00","p2":1,"p3":"2026-08-24 00:00:00","p4":"m7-002-proof","p5":"cohort-1","p6":"m7-002-proof","p7":["link_out","banner_click"],"p8":50}
```

### eventListQuery — no cursor, no range (lookback doubling until rows)

**statement 1** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 6.5 ms / 6.9 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-09-04 06:37:07', 3) - INTERVAL 0.5 DAY AND project_id = 'redcollege' ORDER BY created_at DESC, id ASC LIMIT 10
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND project_id = {p3:String} ORDER BY created_at DESC, id ASC LIMIT {p4:UInt64}
-- V2 params: {"p1":"2026-09-04 06:37:07","p2":0.5,"p3":"redcollege","p4":10}
```

**statement 2** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 1878/0; wall V1/V2 = 6.8 ms / 6.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-09-04 06:37:07', 3) - INTERVAL 1 DAY AND project_id = 'redcollege' ORDER BY created_at DESC, id ASC LIMIT 10
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND project_id = {p3:String} ORDER BY created_at DESC, id ASC LIMIT {p4:UInt64}
-- V2 params: {"p1":"2026-09-04 06:37:07","p2":1,"p3":"redcollege","p4":10}
```

**statement 3** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 7284/0; wall V1/V2 = 9.6 ms / 10.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-09-04 06:37:07', 3) - INTERVAL 2 DAY AND project_id = 'redcollege' ORDER BY created_at DESC, id ASC LIMIT 10
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND project_id = {p3:String} ORDER BY created_at DESC, id ASC LIMIT {p4:UInt64}
-- V2 params: {"p1":"2026-09-04 06:37:07","p2":2,"p3":"redcollege","p4":10}
```

**statement 4** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 7284/0; wall V1/V2 = 8.8 ms / 15.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-09-04 06:37:07', 3) - INTERVAL 4 DAY AND project_id = 'redcollege' ORDER BY created_at DESC, id ASC LIMIT 10
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND project_id = {p3:String} ORDER BY created_at DESC, id ASC LIMIT {p4:UInt64}
-- V2 params: {"p1":"2026-09-04 06:37:07","p2":4,"p3":"redcollege","p4":10}
```

**statement 5** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 7284/0; wall V1/V2 = 10.0 ms / 9.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-09-04 06:37:07', 3) - INTERVAL 8 DAY AND project_id = 'redcollege' ORDER BY created_at DESC, id ASC LIMIT 10
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND project_id = {p3:String} ORDER BY created_at DESC, id ASC LIMIT {p4:UInt64}
-- V2 params: {"p1":"2026-09-04 06:37:07","p2":8,"p3":"redcollege","p4":10}
```

**statement 6** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 113773/81914; wall V1/V2 = 17.3 ms / 18.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64('2026-09-04 06:37:07', 3) - INTERVAL 16 DAY AND project_id = 'redcollege' ORDER BY created_at DESC, id ASC LIMIT 10
-- V2
SELECT created_at, project_id, id, name, device_id, profile_id, session_id, country, city, os, browser, path FROM events e WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND project_id = {p3:String} ORDER BY created_at DESC, id ASC LIMIT {p4:UInt64}
-- V2 params: {"p1":"2026-09-04 06:37:07","p2":16,"p3":"redcollege","p4":10}
```

### eventsCountQuery — plain project

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 65533/65533; wall V1/V2 = 10.8 ms / 9.5 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count FROM events e WHERE project_id = 'redcollege'
-- V2
SELECT count(*) as count FROM events e WHERE project_id = {p1:String}
-- V2 params: {"p1":"redcollege"}
```

Result (first rows, identical on both sides): `[{"count":126190}]`

### eventsCountQuery — profileId + groupId + range + events + profile.* filter

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 155365/155365; wall V1/V2 = 61.1 ms / 40.5 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = 'redcollege') as profile on profile.id = profile_id WHERE project_id = 'redcollege' AND profile_id = '107145' AND has(groups, '271') AND toDate(created_at) BETWEEN toDate('2026-08-15 00:00:00') AND toDate('2026-08-20 23:59:59') AND name IN ('screen_view') AND profile.properties['cargo'] = 'Profesora'
-- V2
SELECT count(*) as count FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = {p1:String}) as profile on profile.id = profile_id WHERE project_id = {p2:String} AND profile_id = {p3:String} AND has(groups, {p4:String}) AND toDate(created_at) BETWEEN toDate({p5:String}) AND toDate({p6:String}) AND name IN {p7:Array(String)} AND profile.properties['cargo'] = 'Profesora'
-- V2 params: {"p1":"redcollege","p2":"redcollege","p3":"107145","p4":"271","p5":"2026-08-15 00:00:00","p6":"2026-08-20 23:59:59","p7":["screen_view"]}
```

Result (first rows, identical on both sides): `[{"count":0}]`

### eventsCountQuery — group.* filter (group array join)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 159000/159000; wall V1/V2 = 11.6 ms / 12.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'redcollege') AS _g ON _g.id = _group_id WHERE project_id = 'redcollege' AND _g.type = 'establecimiento'
-- V2
SELECT count(*) as count FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) AS _g ON _g.id = _group_id WHERE project_id = {p2:String} AND _g.type = 'establecimiento'
-- V2 params: {"p1":"redcollege","p2":"redcollege"}
```

Result (first rows, identical on both sides): `[{"count":100146}]`

### eventsCountQuery — profile.* AND group.* filters together (V1 error parity)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 281602/281602; wall V1/V2 = 67.1 ms / 56.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = 'redcollege') as profile on profile.id = profile_id ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'redcollege') AS _g ON _g.id = _group_id WHERE project_id = 'redcollege' AND profile.properties['cargo'] = 'Profesora' AND _g.type = 'establecimiento'
-- V2
SELECT count(*) as count FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = {p1:String}) as profile on profile.id = profile_id ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p2:String}) AS _g ON _g.id = _group_id WHERE project_id = {p3:String} AND profile.properties['cargo'] = 'Profesora' AND _g.type = 'establecimiento'
-- V2 params: {"p1":"redcollege","p2":"redcollege","p3":"redcollege"}
```

Result (first rows, identical on both sides): `[{"count":6066}]`

### eventsCountQuery — cohortId

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 9.6 ms / 9.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count FROM events e WHERE project_id = 'redcollege' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'redcollege')
-- V2
SELECT count(*) as count FROM events e WHERE project_id = {p1:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p2:String} AND project_id = {p3:String})
-- V2 params: {"p1":"redcollege","p2":"cohort-1","p3":"redcollege"}
```

Result (first rows, identical on both sides): `[{"count":0}]`

The prod-copy has no rows for this case (empty `cohort_members` / `events_bots`), so the same case also ran on the seeded `openpanel_test` copy:

### eventsCountQuery — cohortId

_Database: `openpanel_test`._

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 3383/3383; wall V1/V2 = 6.4 ms / 7.2 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count FROM events e WHERE project_id = 'm7-002-proof' AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'cohort-1' AND project_id = 'm7-002-proof')
-- V2
SELECT count(*) as count FROM events e WHERE project_id = {p1:String} AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p2:String} AND project_id = {p3:String})
-- V2 params: {"p1":"m7-002-proof","p2":"cohort-1","p3":"m7-002-proof"}
```

Result (first rows, identical on both sides): `[{"count":2019}]`

### topPagesQuery — page 2 with search

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 179309/179309; wall V1/V2 = 33.4 ms / 36.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT path, count(*) as count, project_id, first_value(created_at) as first_seen, last_value(properties['__title']) as title, origin FROM events WHERE name = 'screen_view' AND project_id = 'redcollege' AND created_at > now() - INTERVAL 30 DAY AND path ILIKE '%libro%' GROUP BY path, project_id, origin ORDER BY count desc LIMIT 10 OFFSET 10
-- V2
SELECT path, count(*) as count, project_id, first_value(created_at) as first_seen, last_value(properties['__title']) as title, origin FROM events WHERE name = 'screen_view' AND project_id = {p1:String} AND created_at > now() - INTERVAL {p2:UInt64} DAY AND path ILIKE {p3:String} GROUP BY path, project_id, origin ORDER BY count desc LIMIT {p4:UInt64} OFFSET {p5:UInt64}
-- V2 params: {"p1":"redcollege","p2":30,"p3":"%libro%","p4":10,"p5":10}
```

Result (first rows, identical on both sides): `[{"path":"/83/2026/libros","count":522,"project_id":"redcollege","first_seen":"2026-08-11 13:33:59.234","title":"RedCollege | Libro de Clases","origin":"https://libro.redcollege.net"},{"path":"/63/202`

### topPagesQuery — first page, no search

**statement** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 179309/179309; wall V1/V2 = 30.6 ms / 32.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT path, count(*) as count, project_id, first_value(created_at) as first_seen, last_value(properties['__title']) as title, origin FROM events WHERE name = 'screen_view' AND project_id = 'redcollege' AND created_at > now() - INTERVAL 30 DAY GROUP BY path, project_id, origin ORDER BY count desc LIMIT 20 OFFSET 0
-- V2
SELECT path, count(*) as count, project_id, first_value(created_at) as first_seen, last_value(properties['__title']) as title, origin FROM events WHERE name = 'screen_view' AND project_id = {p1:String} AND created_at > now() - INTERVAL {p2:UInt64} DAY GROUP BY path, project_id, origin ORDER BY count desc LIMIT {p3:UInt64} OFFSET {p4:UInt64}
-- V2 params: {"p1":"redcollege","p2":30,"p3":20,"p4":0}
```

Result (first rows, identical on both sides): `[{"path":"/","count":5026,"project_id":"redcollege","first_seen":"2026-08-11 11:35:22.248","title":"RedCollege | Dashboard","origin":"https://inicio.redcollege.net"},{"path":"/login","count":4461,"pro`

### eventByIdQuery — with createdAt window

**statement 1** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 106218/106218; wall V1/V2 = 36.4 ms / 32.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE id = {p1:String} AND project_id = {p2:String} LIMIT 1
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE id = {p1:String} AND project_id = {p2:String} LIMIT 1
-- V2 params: {"p1":"107145","p2":"redcollege"}
```

**statement 2** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 24574/24574; wall V1/V2 = 25.2 ms / 14.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM events WHERE project_id = 'redcollege' AND created_at BETWEEN '2026-08-24 20:58:43' AND '2026-08-24 20:58:45' AND id = 'db54e0ad-b152-4d6f-9e5d-2aab3e23f9ef' LIMIT 1
-- V2
SELECT * FROM events WHERE project_id = {p1:String} AND created_at BETWEEN {p2:String} AND {p3:String} AND id = {p4:String} LIMIT 1
-- V2 params: {"p1":"redcollege","p2":"2026-08-24 20:58:43","p3":"2026-08-24 20:58:45","p4":"db54e0ad-b152-4d6f-9e5d-2aab3e23f9ef"}
```

### eventByIdQuery — without createdAt

**statement 1** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 106218/106218; wall V1/V2 = 33.0 ms / 29.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE id = {p1:String} AND project_id = {p2:String} LIMIT 1
-- V2
SELECT id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups FROM profiles FINAL WHERE id = {p1:String} AND project_id = {p2:String} LIMIT 1
-- V2 params: {"p1":"107145","p2":"redcollege"}
```

**statement 2** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32766/32766; wall V1/V2 = 14.0 ms / 13.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM events WHERE project_id = 'redcollege' AND id = 'db54e0ad-b152-4d6f-9e5d-2aab3e23f9ef' LIMIT 1
-- V2
SELECT * FROM events WHERE project_id = {p1:String} AND id = {p2:String} LIMIT 1
-- V2 params: {"p1":"redcollege","p2":"db54e0ad-b152-4d6f-9e5d-2aab3e23f9ef"}
```

### topEventNamesQuery

**statement** — IDENTICAL; rows V1/V2 = 7/7; rows_read V1/V2 = 40960/40960; wall V1/V2 = 5.9 ms / 6.1 ms; clickhouse_settings same.

```sql
-- V1
SELECT name, count() as count FROM distinct_event_names_mv WHERE project_id = 'redcollege' GROUP BY name ORDER BY count DESC LIMIT 50
-- V2
SELECT name, count() as count FROM distinct_event_names_mv WHERE project_id = {p1:String} GROUP BY name ORDER BY count DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"redcollege","p2":50}
```

Result (first rows, identical on both sides): `[{"name":"screen_view","count":1235},{"name":"session_start","count":1125},{"name":"session_end","count":1117},{"name":"link_out","count":955},{"name":"tema_cambiado","count":41},{"name":"apariencia_c`

### eventPropertiesQuery — all events

**statement** — IDENTICAL; rows V1/V2 = 144/144; rows_read V1/V2 = 131437/131437; wall V1/V2 = 9.7 ms / 9.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT property_key, name as event_name FROM event_property_values_mv WHERE project_id = 'redcollege' GROUP BY property_key, name ORDER BY property_key ASC, name ASC LIMIT 500
-- V2
SELECT property_key, name as event_name FROM event_property_values_mv WHERE project_id = {p1:String} GROUP BY property_key, name ORDER BY property_key ASC, name ASC LIMIT {p2:UInt64}
-- V2 params: {"p1":"redcollege","p2":500}
```

Result (first rows, identical on both sides): `[{"property_key":"__bot","event_name":"screen_view"},{"property_key":"__bot","event_name":"session_start"},{"property_key":"__bot_reasons","event_name":"apariencia_cambiada"},{"property_key":"__bot_re`

### eventPropertiesQuery — one event

**statement** — IDENTICAL; rows V1/V2 = 64/64; rows_read V1/V2 = 73728/73728; wall V1/V2 = 8.4 ms / 8.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT property_key, name as event_name FROM event_property_values_mv WHERE project_id = 'redcollege' AND name = 'screen_view' GROUP BY property_key, name ORDER BY property_key ASC, name ASC LIMIT 500
-- V2
SELECT property_key, name as event_name FROM event_property_values_mv WHERE project_id = {p1:String} AND name = {p2:String} GROUP BY property_key, name ORDER BY property_key ASC, name ASC LIMIT {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":"screen_view","p3":500}
```

Result (first rows, identical on both sides): `[{"property_key":"__bot","event_name":"screen_view"},{"property_key":"__bot_reasons","event_name":"screen_view"},{"property_key":"__query.anexos","event_name":"screen_view"},{"property_key":"__query.a`

### eventPropertyValuesQuery

**statement** — IDENTICAL; rows V1/V2 = 200/200; rows_read V1/V2 = 81920/81920; wall V1/V2 = 8.4 ms / 8.6 ms; clickhouse_settings same.

```sql
-- V1
SELECT property_value as value FROM event_property_values_mv WHERE project_id = 'redcollege' AND name = 'screen_view' AND property_key = '__query.curso' ORDER BY created_at DESC LIMIT 200
-- V2
SELECT property_value as value FROM event_property_values_mv WHERE project_id = {p1:String} AND name = {p2:String} AND property_key = {p3:String} ORDER BY created_at DESC LIMIT {p4:UInt64}
-- V2 params: {"p1":"redcollege","p2":"screen_view","p3":"__query.curso","p4":200}
```

Result (first rows, identical on both sides): `[{"value":"12735"},{"value":"12734"},{"value":"12736"},{"value":"13028"},{"value":"12681"},{"value":"12770"},{"value":"12775"},{"value":"12382"},{"value":"12731"},{"value":"12810"},{"value":"12806"},{`

### queryEventsQuery — default 30-day range, every equality column, properties, filters

**statement** — IDENTICAL (as row sets; no ORDER BY); rows V1/V2 = 42/42; rows_read V1/V2 = 270051/270051; wall V1/V2 = 70.4 ms / 73.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM events WHERE project_id = 'redcollege' AND profile_id IN ('19318', '19315') AND name IN ('screen_view', 'link_out') AND path = '/63/2026/libros' AND referrer = 'https://inicio.redcollege.net' AND referrer_name = 'https://inicio.redcollege.net' AND device = 'desktop' AND country = 'CL' AND city = 'Santiago' AND os = 'Windows' AND browser = 'Chrome' AND properties['__title'] = 'RedCollege | Libro de Clases' AND created_at BETWEEN '2026-08-05 00:00:00' AND '2026-09-04 00:00:00' AND (profile_id IN (SELECT id FROM profiles FINAL WHERE project_id = 'redcollege' AND properties['cargo'] = 'Profesora')) LIMIT 100
-- V2
SELECT * FROM events WHERE project_id = {p1:String} AND profile_id IN {p2:Array(String)} AND name IN {p3:Array(String)} AND path = {p4:String} AND referrer = {p5:String} AND referrer_name = {p6:String} AND device = {p7:String} AND country = {p8:String} AND city = {p9:String} AND os = {p10:String} AND browser = {p11:String} AND properties[{p12:String}] = {p13:String} AND created_at BETWEEN {p14:String} AND {p15:String} AND (profile_id IN (SELECT id FROM profiles FINAL WHERE project_id = 'redcollege' AND properties['cargo'] = 'Profesora')) LIMIT {p16:UInt64}
-- V2 params: {"p1":"redcollege","p2":["19318","19315"],"p3":["screen_view","link_out"],"p4":"/63/2026/libros","p5":"https://inicio.redcollege.net","p6":"https://inicio.redcollege.net","p7":"desktop","p8":"CL","p9":"Santiago","p10":"Windows","p11":"Chrome","p12":"__title","p13":"RedCollege | Libro de Clases","p14":"2026-08-05 00:00:00","p15":"2026-09-04 00:00:00","p16":100}
```

### queryEventsQuery — sessionId (no date clause), profileId, explicit dates

**statement** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 24575/24575; wall V1/V2 = 22.2 ms / 15.0 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM events WHERE project_id = 'redcollege' AND session_id = '0kiE1SjOk6U6_WDCbuyLeQ' AND profile_id = '107145' LIMIT 20
-- V2
SELECT * FROM events WHERE project_id = {p1:String} AND session_id = {p2:String} AND profile_id = {p3:String} LIMIT {p4:UInt64}
-- V2 params: {"p1":"redcollege","p2":"0kiE1SjOk6U6_WDCbuyLeQ","p3":"107145","p4":20}
```

### queryEventsQuery — sessionId + explicit startDate/endDate

**statement** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 24575/24575; wall V1/V2 = 14.6 ms / 32.5 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM events WHERE project_id = 'redcollege' AND session_id = '0kiE1SjOk6U6_WDCbuyLeQ' AND created_at BETWEEN '2026-08-01 00:00:00' AND '2026-08-31 00:00:00' LIMIT 20
-- V2
SELECT * FROM events WHERE project_id = {p1:String} AND session_id = {p2:String} AND created_at BETWEEN {p3:String} AND {p4:String} LIMIT {p5:UInt64}
-- V2 params: {"p1":"redcollege","p2":"0kiE1SjOk6U6_WDCbuyLeQ","p3":"2026-08-01 00:00:00","p4":"2026-08-31 00:00:00","p5":20}
```

### botEventsQuery + botEventsCountQuery (event.bots)

**statement 1** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 9.0 ms / 6.5 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count FROM events_bots WHERE project_id = 'redcollege'
-- V2
SELECT count(*) as count FROM events_bots WHERE project_id = {p1:String}
-- V2 params: {"p1":"redcollege"}
```

Result (first rows, identical on both sides): `[{"count":0}]`

**statement 2** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 5.9 ms / 6.4 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM events_bots WHERE project_id = 'redcollege' ORDER BY created_at DESC LIMIT 8 OFFSET 8
-- V2
SELECT * FROM events_bots WHERE project_id = {p1:String} ORDER BY created_at DESC LIMIT {p2:UInt64} OFFSET {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":8,"p3":8}
```

The prod-copy has no rows for this case (empty `cohort_members` / `events_bots`), so the same case also ran on the seeded `openpanel_test` copy:

### botEventsQuery + botEventsCountQuery (event.bots)

_Database: `openpanel_test`._

**statement 1** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 1/1; wall V1/V2 = 50.2 ms / 7.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT count(*) as count FROM events_bots WHERE project_id = 'm7-002-proof'
-- V2
SELECT count(*) as count FROM events_bots WHERE project_id = {p1:String}
-- V2 params: {"p1":"m7-002-proof"}
```

Result (first rows, identical on both sides): `[{"count":23}]`

**statement 2** — IDENTICAL; rows V1/V2 = 8/8; rows_read V1/V2 = 46/46; wall V1/V2 = 51.9 ms / 6.7 ms; clickhouse_settings same.

```sql
-- V1
SELECT * FROM events_bots WHERE project_id = 'm7-002-proof' ORDER BY created_at DESC LIMIT 8 OFFSET 8
-- V2
SELECT * FROM events_bots WHERE project_id = {p1:String} ORDER BY created_at DESC LIMIT {p2:UInt64} OFFSET {p3:UInt64}
-- V2 params: {"p1":"m7-002-proof","p2":8,"p3":8}
```

### topOriginsQuery (event.origins)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 179309/179309; wall V1/V2 = 19.0 ms / 14.8 ms; clickhouse_settings same.

```sql
-- V1
SELECT DISTINCT origin, count(id) as count FROM events WHERE project_id = 'redcollege' AND origin IS NOT NULL AND origin != '' AND toDate(created_at) > now() - INTERVAL 30 DAY GROUP BY origin ORDER BY count DESC LIMIT 3
-- V2
SELECT DISTINCT origin, count(id) as count FROM events WHERE project_id = {p1:String} AND origin IS NOT NULL AND origin != '' AND toDate(created_at) > now() - INTERVAL {p2:UInt64} DAY GROUP BY origin ORDER BY count DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"redcollege","p2":30,"p3":3}
```

Result (first rows, identical on both sides): `[{"origin":"https://libro.redcollege.net","count":85533},{"origin":"https://inicio.redcollege.net","count":27307},{"origin":"https://evalua.redcollege.net","count":4725}]`

