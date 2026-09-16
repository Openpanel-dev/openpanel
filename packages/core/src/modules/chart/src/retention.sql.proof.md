# retention.sql.ts — V1 -> V2 result-set proof (M7-004)

Every builder in `retention.sql.ts` was executed twice against the same data — once as V1 (the `git HEAD` `packages/db/src/services/retention.service.ts`, `c4760ac2`, captured by wrapping its `chQuery`) and once as V2 (the fragment returned by the core builder, bound through `query_params`) — through one `@clickhouse/client` with `format: 'JSON'` and the same client settings. The two responses were compared on `data` (every row, every column, as JSON) and `meta` (column names and types).

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel` (319,499,000 events, static). Projects: `verdict`, `secure-privacy`, `dream-mate`.
- **Machine**: single-node ClickHouse on a 4-vCPU box — timings are directional only; production is 2 shards x 2 replicas (`docs/ENVIRONMENT.md`). None of these statements contains an `IN (subquery)`: the cohort matrix is a five-CTE self-join, unchanged from V1, so no `IN` / `GLOBAL IN` decision is made or unmade here.
- **Whitespace**: V2 joins the base WHERE conditions and the interval columns with the `sql` tag's closed separator set (`' AND '`, `', '`) instead of V1's newline-indented ones. Text-only; every result set below is byte-identical.
- **Contract test**: `packages/db/src/services/retention.service.test.ts` (11 cases, seeded fixtures on `openpanel_test`) is unchanged and runs against this code through the V1 shim.

- **Verdict**: 14 cases, 0 not identical.

### retentionSeriesQuery — verdict

**IDENTICAL** — rows V1/V2 = 9/9; rows_read V1/V2 = 88473638/88473638; wall V1/V2 = 3103 ms / 3053 ms.

```sql
-- V1
WITH weekly_active AS ( SELECT profile_id, toStartOfWeek(created_at) AS week FROM events WHERE project_id = 'verdict' AND profile_id != device_id GROUP BY profile_id, week ) SELECT cur.week AS date, countDistinct(cur.profile_id) AS active_users, countDistinct(nxt.profile_id) AS retained_users, (100 * (countDistinct(nxt.profile_id) / CAST(countDistinct(cur.profile_id), 'Float64'))) AS retention FROM weekly_active AS cur LEFT JOIN weekly_active AS nxt ON cur.profile_id = nxt.profile_id AND nxt.week = cur.week + toIntervalWeek(1) GROUP BY date ORDER BY date ASC -- Unmatched LEFT JOIN rows must be NULL (not the empty-string default), -- otherwise countDistinct(nxt.profile_id) counts '' as a retained user. SETTINGS join_use_nulls = 1
-- V2
WITH weekly_active AS ( SELECT profile_id, toStartOfWeek(created_at) AS week FROM events WHERE project_id = {p1:String} AND profile_id != device_id GROUP BY profile_id, week ) SELECT cur.week AS date, countDistinct(cur.profile_id) AS active_users, countDistinct(nxt.profile_id) AS retained_users, (100 * (countDistinct(nxt.profile_id) / CAST(countDistinct(cur.profile_id), 'Float64'))) AS retention FROM weekly_active AS cur LEFT JOIN weekly_active AS nxt ON cur.profile_id = nxt.profile_id AND nxt.week = cur.week + toIntervalWeek(1) GROUP BY date ORDER BY date ASC -- Unmatched LEFT JOIN rows must be NULL (not the empty-string default), -- otherwise countDistinct(nxt.profile_id) counts '' as a retained user. SETTINGS join_use_nulls = 1
-- V2 params: {"p1":"verdict"}
```

### retentionSeriesQuery — secure-privacy

**IDENTICAL** — rows V1/V2 = 9/9; rows_read V1/V2 = 1130322/1130322; wall V1/V2 = 85 ms / 102 ms.

```sql
-- V1
WITH weekly_active AS ( SELECT profile_id, toStartOfWeek(created_at) AS week FROM events WHERE project_id = 'secure-privacy' AND profile_id != device_id GROUP BY profile_id, week ) SELECT cur.week AS date, countDistinct(cur.profile_id) AS active_users, countDistinct(nxt.profile_id) AS retained_users, (100 * (countDistinct(nxt.profile_id) / CAST(countDistinct(cur.profile_id), 'Float64'))) AS retention FROM weekly_active AS cur LEFT JOIN weekly_active AS nxt ON cur.profile_id = nxt.profile_id AND nxt.week = cur.week + toIntervalWeek(1) GROUP BY date ORDER BY date ASC -- Unmatched LEFT JOIN rows must be NULL (not the empty-string default), -- otherwise countDistinct(nxt.profile_id) counts '' as a retained user. SETTINGS join_use_nulls = 1
-- V2
WITH weekly_active AS ( SELECT profile_id, toStartOfWeek(created_at) AS week FROM events WHERE project_id = {p1:String} AND profile_id != device_id GROUP BY profile_id, week ) SELECT cur.week AS date, countDistinct(cur.profile_id) AS active_users, countDistinct(nxt.profile_id) AS retained_users, (100 * (countDistinct(nxt.profile_id) / CAST(countDistinct(cur.profile_id), 'Float64'))) AS retention FROM weekly_active AS cur LEFT JOIN weekly_active AS nxt ON cur.profile_id = nxt.profile_id AND nxt.week = cur.week + toIntervalWeek(1) GROUP BY date ORDER BY date ASC -- Unmatched LEFT JOIN rows must be NULL (not the empty-string default), -- otherwise countDistinct(nxt.profile_id) counts '' as a retained user. SETTINGS join_use_nulls = 1
-- V2 params: {"p1":"secure-privacy"}
```

### rollingActiveUsersQuery — verdict, 7d

**IDENTICAL** — rows V1/V2 = 62/62; rows_read V1/V2 = 73247/73247; wall V1/V2 = 355 ms / 358 ms.

```sql
-- V1
SELECT date, uniqMerge(profile_id) AS users FROM ( SELECT date + n AS date, profile_id, project_id FROM ( SELECT * FROM dau_mv WHERE project_id = 'verdict' ) ARRAY JOIN range(7) AS n ) WHERE project_id = 'verdict' GROUP BY date
-- V2
SELECT date, uniqMerge(profile_id) AS users FROM ( SELECT date + n AS date, profile_id, project_id FROM ( SELECT * FROM dau_mv WHERE project_id = {p1:String} ) ARRAY JOIN range({p2:UInt64}) AS n ) WHERE project_id = {p3:String} GROUP BY date
-- V2 params: {"p1":"verdict","p2":7,"p3":"verdict"}
```

### rollingActiveUsersQuery — secure-privacy, 30d

**IDENTICAL** — rows V1/V2 = 85/85; rows_read V1/V2 = 73247/73247; wall V1/V2 = 312 ms / 313 ms.

```sql
-- V1
SELECT date, uniqMerge(profile_id) AS users FROM ( SELECT date + n AS date, profile_id, project_id FROM ( SELECT * FROM dau_mv WHERE project_id = 'secure-privacy' ) ARRAY JOIN range(30) AS n ) WHERE project_id = 'secure-privacy' GROUP BY date
-- V2
SELECT date, uniqMerge(profile_id) AS users FROM ( SELECT date + n AS date, profile_id, project_id FROM ( SELECT * FROM dau_mv WHERE project_id = {p1:String} ) ARRAY JOIN range({p2:UInt64}) AS n ) WHERE project_id = {p3:String} GROUP BY date
-- V2 params: {"p1":"secure-privacy","p2":30,"p3":"secure-privacy"}
```

### rollingActiveUsersQuery — dream-mate, 1d

**IDENTICAL** — rows V1/V2 = 56/56; rows_read V1/V2 = 73247/73247; wall V1/V2 = 250 ms / 252 ms.

```sql
-- V1
SELECT date, uniqMerge(profile_id) AS users FROM ( SELECT date + n AS date, profile_id, project_id FROM ( SELECT * FROM dau_mv WHERE project_id = 'dream-mate' ) ARRAY JOIN range(1) AS n ) WHERE project_id = 'dream-mate' GROUP BY date
-- V2
SELECT date, uniqMerge(profile_id) AS users FROM ( SELECT date + n AS date, profile_id, project_id FROM ( SELECT * FROM dau_mv WHERE project_id = {p1:String} ) ARRAY JOIN range({p2:UInt64}) AS n ) WHERE project_id = {p3:String} GROUP BY date
-- V2 params: {"p1":"dream-mate","p2":1,"p3":"dream-mate"}
```

### retentionLastSeenSeriesQuery — verdict

**IDENTICAL** — rows V1/V2 = 56/56; rows_read V1/V2 = 44236819/44236819; wall V1/V2 = 1276 ms / 1274 ms.

```sql
-- V1
WITH last_active AS ( SELECT max(created_at) AS last_active, profile_id FROM events WHERE (project_id = 'verdict') AND (device_id != profile_id) GROUP BY profile_id ) SELECT dateDiff('day', last_active, today()) AS days, countDistinct(profile_id) AS users FROM last_active GROUP BY days ORDER BY days ASC
-- V2
WITH last_active AS ( SELECT max(created_at) AS last_active, profile_id FROM events WHERE (project_id = {p1:String}) AND (device_id != profile_id) GROUP BY profile_id ) SELECT dateDiff('day', last_active, today()) AS days, countDistinct(profile_id) AS users FROM last_active GROUP BY days ORDER BY days ASC
-- V2 params: {"p1":"verdict"}
```

### retentionLastSeenSeriesQuery — secure-privacy

**IDENTICAL** — rows V1/V2 = 56/56; rows_read V1/V2 = 565161/565161; wall V1/V2 = 46 ms / 54 ms.

```sql
-- V1
WITH last_active AS ( SELECT max(created_at) AS last_active, profile_id FROM events WHERE (project_id = 'secure-privacy') AND (device_id != profile_id) GROUP BY profile_id ) SELECT dateDiff('day', last_active, today()) AS days, countDistinct(profile_id) AS users FROM last_active GROUP BY days ORDER BY days ASC
-- V2
WITH last_active AS ( SELECT max(created_at) AS last_active, profile_id FROM events WHERE (project_id = {p1:String}) AND (device_id != profile_id) GROUP BY profile_id ) SELECT dateDiff('day', last_active, today()) AS days, countDistinct(profile_id) AS users FROM last_active GROUP BY days ORDER BY days ASC
-- V2 params: {"p1":"secure-privacy"}
```

### retentionCohortQuery — any event, week, on_or_after (getRetentionCohortCore shape)

**IDENTICAL** — rows V1/V2 = 9/9; rows_read V1/V2 = 8945664/8945664; wall V1/V2 = 369 ms / 374 ms.

```sql
-- V1
WITH cohort_users AS ( SELECT profile_id AS userID, toStartOfWeek(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = 'verdict' AND created_at >= toDateTime('2026-06-14 00:00:00') AND created_at <= toDateTime('2026-09-06 00:00:00') GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = 'verdict' AND created_at >= toDateTime('2026-06-14 00:00:00') AND created_at <= toDateTime('2026-09-06 00:00:00') + INTERVAL 12 WEEK ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff('WEEK', f.cohort_interval, toStartOfWeek(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff('WEEK', f.cohort_interval, toStartOfWeek(l.event_date)) <= 12 ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= 0) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= 1) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= 2) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= 3) AS interval_3_users, groupUniqArrayIf(profile_id, x_after_cohort >= 4) AS interval_4_users, groupUniqArrayIf(profile_id, x_after_cohort >= 5) AS interval_5_users, groupUniqArrayIf(profile_id, x_after_cohort >= 6) AS interval_6_users, groupUniqArrayIf(profile_id, x_after_cohort >= 7) AS interval_7_users, groupUniqArrayIf(profile_id, x_after_cohort >= 8) AS interval_8_users, groupUniqArrayIf(profile_id, x_after_cohort >= 9) AS interval_9_users, groupUniqArrayIf(profile_id, x_after_cohort >= 10) AS interval_10_users, groupUniqArrayIf(profile_id, x_after_cohort >= 11) AS interval_11_users, groupUniqArrayIf(profile_id, x_after_cohort >= 12) AS interval_12_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count, length(interval_4_users) AS interval_4_user_count, length(interval_5_users) AS interval_5_user_count, length(interval_6_users) AS interval_6_user_count, length(interval_7_users) AS interval_7_user_count, length(interval_8_users) AS interval_8_user_count, length(interval_9_users) AS interval_9_user_count, length(interval_10_users) AS interval_10_user_count, length(interval_11_users) AS interval_11_user_count, length(interval_12_users) AS interval_12_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2
WITH cohort_users AS ( SELECT profile_id AS userID, toStartOfWeek(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at <= toDateTime({p3:String}) GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) + INTERVAL {p7:UInt64} WEEK ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff({p8:String}, f.cohort_interval, toStartOfWeek(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff({p9:String}, f.cohort_interval, toStartOfWeek(l.event_date)) <= {p10:UInt64} ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= {p11:UInt64}) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p12:UInt64}) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p13:UInt64}) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p14:UInt64}) AS interval_3_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p15:UInt64}) AS interval_4_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p16:UInt64}) AS interval_5_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p17:UInt64}) AS interval_6_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p18:UInt64}) AS interval_7_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p19:UInt64}) AS interval_8_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p20:UInt64}) AS interval_9_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p21:UInt64}) AS interval_10_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p22:UInt64}) AS interval_11_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p23:UInt64}) AS interval_12_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count, length(interval_4_users) AS interval_4_user_count, length(interval_5_users) AS interval_5_user_count, length(interval_6_users) AS interval_6_user_count, length(interval_7_users) AS interval_7_user_count, length(interval_8_users) AS interval_8_user_count, length(interval_9_users) AS interval_9_user_count, length(interval_10_users) AS interval_10_user_count, length(interval_11_users) AS interval_11_user_count, length(interval_12_users) AS interval_12_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2 params: {"p1":"verdict","p2":"2026-06-14 00:00:00","p3":"2026-09-06 00:00:00","p4":"verdict","p5":"2026-06-14 00:00:00","p6":"2026-09-06 00:00:00","p7":12,"p8":"WEEK","p9":"WEEK","p10":12,"p11":0,"p12":1,"p13":2,"p14":3,"p15":4,"p16":5,"p17":6,"p18":7,"p19":8,"p20":9,"p21":10,"p22":11,"p23":12}
```

### retentionCohortQuery — named first+second event, day, on

**IDENTICAL** — rows V1/V2 = 7/7; rows_read V1/V2 = 163840/163840; wall V1/V2 = 42 ms / 38 ms.

```sql
-- V1
WITH cohort_users AS ( SELECT profile_id AS userID, toDate(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = 'verdict' AND name = 'session_start' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = 'verdict' AND name = 'view_page' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') + INTERVAL 6 DAY ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff('DAY', f.cohort_interval, toDate(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff('DAY', f.cohort_interval, toDate(l.event_date)) <= 6 ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort = 0) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort = 1) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort = 2) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort = 3) AS interval_3_users, groupUniqArrayIf(profile_id, x_after_cohort = 4) AS interval_4_users, groupUniqArrayIf(profile_id, x_after_cohort = 5) AS interval_5_users, groupUniqArrayIf(profile_id, x_after_cohort = 6) AS interval_6_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count, length(interval_4_users) AS interval_4_user_count, length(interval_5_users) AS interval_5_user_count, length(interval_6_users) AS interval_6_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2
WITH cohort_users AS ( SELECT profile_id AS userID, toDate(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = {p1:String} AND name = {p2:String} AND created_at >= toDateTime({p3:String}) AND created_at <= toDateTime({p4:String}) GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = {p5:String} AND name = {p6:String} AND created_at >= toDateTime({p7:String}) AND created_at <= toDateTime({p8:String}) + INTERVAL {p9:UInt64} DAY ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff({p10:String}, f.cohort_interval, toDate(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff({p11:String}, f.cohort_interval, toDate(l.event_date)) <= {p12:UInt64} ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort = {p13:UInt64}) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort = {p14:UInt64}) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort = {p15:UInt64}) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort = {p16:UInt64}) AS interval_3_users, groupUniqArrayIf(profile_id, x_after_cohort = {p17:UInt64}) AS interval_4_users, groupUniqArrayIf(profile_id, x_after_cohort = {p18:UInt64}) AS interval_5_users, groupUniqArrayIf(profile_id, x_after_cohort = {p19:UInt64}) AS interval_6_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count, length(interval_4_users) AS interval_4_user_count, length(interval_5_users) AS interval_5_user_count, length(interval_6_users) AS interval_6_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2 params: {"p1":"verdict","p2":"session_start","p3":"2026-07-06 00:00:00","p4":"2026-07-12 23:59:59","p5":"verdict","p6":"view_page","p7":"2026-07-06 00:00:00","p8":"2026-07-12 23:59:59","p9":6,"p10":"DAY","p11":"DAY","p12":6,"p13":0,"p14":1,"p15":2,"p16":3,"p17":4,"p18":5,"p19":6}
```

### retentionCohortQuery — multi first event (IN), week, on_or_after

**IDENTICAL** — rows V1/V2 = 3/3; rows_read V1/V2 = 65536/65536; wall V1/V2 = 25 ms / 29 ms.

```sql
-- V1
WITH cohort_users AS ( SELECT profile_id AS userID, toStartOfWeek(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = 'secure-privacy' AND name IN ('session_start', 'screen_view') AND created_at >= toDateTime('2026-06-01 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = 'secure-privacy' AND name IN ('screen_view', 'session_end') AND created_at >= toDateTime('2026-06-01 00:00:00') AND created_at <= toDateTime('2026-07-12 23:59:59') + INTERVAL 5 WEEK ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff('WEEK', f.cohort_interval, toStartOfWeek(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff('WEEK', f.cohort_interval, toStartOfWeek(l.event_date)) <= 5 ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= 0) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= 1) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= 2) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= 3) AS interval_3_users, groupUniqArrayIf(profile_id, x_after_cohort >= 4) AS interval_4_users, groupUniqArrayIf(profile_id, x_after_cohort >= 5) AS interval_5_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count, length(interval_4_users) AS interval_4_user_count, length(interval_5_users) AS interval_5_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2
WITH cohort_users AS ( SELECT profile_id AS userID, toStartOfWeek(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = {p1:String} AND name IN {p2:Array(String)} AND created_at >= toDateTime({p3:String}) AND created_at <= toDateTime({p4:String}) GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = {p5:String} AND name IN {p6:Array(String)} AND created_at >= toDateTime({p7:String}) AND created_at <= toDateTime({p8:String}) + INTERVAL {p9:UInt64} WEEK ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff({p10:String}, f.cohort_interval, toStartOfWeek(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff({p11:String}, f.cohort_interval, toStartOfWeek(l.event_date)) <= {p12:UInt64} ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= {p13:UInt64}) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p14:UInt64}) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p15:UInt64}) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p16:UInt64}) AS interval_3_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p17:UInt64}) AS interval_4_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p18:UInt64}) AS interval_5_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count, length(interval_4_users) AS interval_4_user_count, length(interval_5_users) AS interval_5_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2 params: {"p1":"secure-privacy","p2":["session_start","screen_view"],"p3":"2026-06-01 00:00:00","p4":"2026-07-12 23:59:59","p5":"secure-privacy","p6":["screen_view","session_end"],"p7":"2026-06-01 00:00:00","p8":"2026-07-12 23:59:59","p9":5,"p10":"WEEK","p11":"WEEK","p12":5,"p13":0,"p14":1,"p15":2,"p16":3,"p17":4,"p18":5}
```

### retentionCohortQuery — month interval, any event

**IDENTICAL** — rows V1/V2 = 1/1; rows_read V1/V2 = 114688/114688; wall V1/V2 = 23 ms / 24 ms.

```sql
-- V1
WITH cohort_users AS ( SELECT profile_id AS userID, toStartOfMonth(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-04-01 00:00:00') AND created_at <= toDateTime('2026-07-01 00:00:00') GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-04-01 00:00:00') AND created_at <= toDateTime('2026-07-01 00:00:00') + INTERVAL 3 MONTH ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff('MONTH', f.cohort_interval, toStartOfMonth(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff('MONTH', f.cohort_interval, toStartOfMonth(l.event_date)) <= 3 ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= 0) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= 1) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= 2) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= 3) AS interval_3_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2
WITH cohort_users AS ( SELECT profile_id AS userID, toStartOfMonth(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at <= toDateTime({p3:String}) GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) + INTERVAL {p7:UInt64} MONTH ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff({p8:String}, f.cohort_interval, toStartOfMonth(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff({p9:String}, f.cohort_interval, toStartOfMonth(l.event_date)) <= {p10:UInt64} ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= {p11:UInt64}) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p12:UInt64}) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p13:UInt64}) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p14:UInt64}) AS interval_3_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2 params: {"p1":"secure-privacy","p2":"2026-04-01 00:00:00","p3":"2026-07-01 00:00:00","p4":"secure-privacy","p5":"2026-04-01 00:00:00","p6":"2026-07-01 00:00:00","p7":3,"p8":"MONTH","p9":"MONTH","p10":3,"p11":0,"p12":1,"p13":2,"p14":3}
```

### retentionCohortQuery — property filter -> raw events fallback

**IDENTICAL** — rows V1/V2 = 4/4; rows_read V1/V2 = 196602/196602; wall V1/V2 = 50 ms / 57 ms.

```sql
-- V1
WITH cohort_users AS ( SELECT profile_id AS userID, toDate(min(created_at)) AS cohort_interval FROM events WHERE project_id = 'secure-privacy' AND profile_id != device_id AND country = 'US' AND name = 'screen_view' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-09 23:59:59') GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM events WHERE project_id = 'secure-privacy' AND profile_id != device_id AND country = 'US' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-09 23:59:59') + INTERVAL 3 DAY ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff('DAY', f.cohort_interval, toDate(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff('DAY', f.cohort_interval, toDate(l.event_date)) <= 3 ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= 0) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= 1) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= 2) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= 3) AS interval_3_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2
WITH cohort_users AS ( SELECT profile_id AS userID, toDate(min(created_at)) AS cohort_interval FROM events WHERE project_id = {p1:String} AND profile_id != device_id AND country = 'US' AND name = {p2:String} AND created_at >= toDateTime({p3:String}) AND created_at <= toDateTime({p4:String}) GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM events WHERE project_id = {p5:String} AND profile_id != device_id AND country = 'US' AND created_at >= toDateTime({p6:String}) AND created_at <= toDateTime({p7:String}) + INTERVAL {p8:UInt64} DAY ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff({p9:String}, f.cohort_interval, toDate(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff({p10:String}, f.cohort_interval, toDate(l.event_date)) <= {p11:UInt64} ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= {p12:UInt64}) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p13:UInt64}) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p14:UInt64}) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p15:UInt64}) AS interval_3_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2 params: {"p1":"secure-privacy","p2":"screen_view","p3":"2026-07-06 00:00:00","p4":"2026-07-09 23:59:59","p5":"secure-privacy","p6":"2026-07-06 00:00:00","p7":"2026-07-09 23:59:59","p8":3,"p9":"DAY","p10":"DAY","p11":3,"p12":0,"p13":1,"p14":2,"p15":3}
```

### retentionCohortQuery — hour interval (toDate/DAY mapping), any event

**IDENTICAL** — rows V1/V2 = 3/3; rows_read V1/V2 = 3579904/3579904; wall V1/V2 = 90 ms / 95 ms.

```sql
-- V1
WITH cohort_users AS ( SELECT profile_id AS userID, toDate(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = 'dream-mate' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 00:00:00') GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = 'dream-mate' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-08 00:00:00') + INTERVAL 2 DAY ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff('DAY', f.cohort_interval, toDate(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff('DAY', f.cohort_interval, toDate(l.event_date)) <= 2 ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= 0) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= 1) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= 2) AS interval_2_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2
WITH cohort_users AS ( SELECT profile_id AS userID, toDate(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at <= toDateTime({p3:String}) GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) + INTERVAL {p7:UInt64} DAY ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff({p8:String}, f.cohort_interval, toDate(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff({p9:String}, f.cohort_interval, toDate(l.event_date)) <= {p10:UInt64} ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= {p11:UInt64}) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p12:UInt64}) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p13:UInt64}) AS interval_2_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2 params: {"p1":"dream-mate","p2":"2026-07-06 00:00:00","p3":"2026-07-08 00:00:00","p4":"dream-mate","p5":"2026-07-06 00:00:00","p6":"2026-07-08 00:00:00","p7":2,"p8":"DAY","p9":"DAY","p10":2,"p11":0,"p12":1,"p13":2}
```

### retentionCohortQuery — ISO dates with T separator

**IDENTICAL** — rows V1/V2 = 4/4; rows_read V1/V2 = 1474560/1474560; wall V1/V2 = 55 ms / 59 ms.

```sql
-- V1
WITH cohort_users AS ( SELECT profile_id AS userID, toDate(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = 'verdict' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-09 23:59:59') GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = 'verdict' AND created_at >= toDateTime('2026-07-06 00:00:00') AND created_at <= toDateTime('2026-07-09 23:59:59') + INTERVAL 3 DAY ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff('DAY', f.cohort_interval, toDate(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff('DAY', f.cohort_interval, toDate(l.event_date)) <= 3 ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= 0) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= 1) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= 2) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= 3) AS interval_3_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2
WITH cohort_users AS ( SELECT profile_id AS userID, toDate(min(created_at)) AS cohort_interval FROM cohort_events_mv WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at <= toDateTime({p3:String}) GROUP BY profile_id ), last_event AS ( SELECT profile_id, toDate(created_at) AS event_date FROM cohort_events_mv WHERE project_id = {p4:String} AND created_at >= toDateTime({p5:String}) AND created_at <= toDateTime({p6:String}) + INTERVAL {p7:UInt64} DAY ), retention_matrix AS ( SELECT f.cohort_interval, l.profile_id, dateDiff({p8:String}, f.cohort_interval, toDate(l.event_date)) AS x_after_cohort FROM cohort_users AS f INNER JOIN last_event AS l ON f.userID = l.profile_id WHERE l.event_date >= f.cohort_interval AND dateDiff({p9:String}, f.cohort_interval, toDate(l.event_date)) <= {p10:UInt64} ), interval_users AS ( SELECT cohort_interval, groupUniqArrayIf(profile_id, x_after_cohort >= {p11:UInt64}) AS interval_0_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p12:UInt64}) AS interval_1_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p13:UInt64}) AS interval_2_users, groupUniqArrayIf(profile_id, x_after_cohort >= {p14:UInt64}) AS interval_3_users FROM retention_matrix GROUP BY cohort_interval ), cohort_sizes AS ( SELECT cohort_interval, COUNT(DISTINCT userID) AS total_first_event_count FROM cohort_users GROUP BY cohort_interval ) SELECT interval_users.cohort_interval AS cohort_interval, cs.total_first_event_count AS total_first_event_count, length(interval_0_users) AS interval_0_user_count, length(interval_1_users) AS interval_1_user_count, length(interval_2_users) AS interval_2_user_count, length(interval_3_users) AS interval_3_user_count FROM interval_users LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval ORDER BY cohort_interval ASC
-- V2 params: {"p1":"verdict","p2":"2026-07-06 00:00:00","p3":"2026-07-09 23:59:59","p4":"verdict","p5":"2026-07-06 00:00:00","p6":"2026-07-09 23:59:59","p7":3,"p8":"DAY","p9":"DAY","p10":3,"p11":0,"p12":1,"p13":2,"p14":3}
```

## M34-002 — the REST retention series bounded to a window (Group C fix 8, remainder)

- **Date**: 2026-09-16, 09:20–09:30 UTC. **Data**: local prod-copy `openpanel`, read-only
  (`readonly=2`; `events` read 321,191,857 before the run). `use_query_condition_cache=0`,
  `max_memory_usage` 12 GiB. **Both statements were rendered by the builders themselves.** "Before" is
  `retention.sql.ts` at `26a56aa0`, copied next to this file for the run and deleted afterwards.
  "After" is this change. Parameters were bound through `param_pN=`. Timings are the median of 3
  `FORMAT Null` runs, taken from `X-ClickHouse-Summary`. Each builder's three runs were back to back,
  not interleaved. The result hash is the sha256 of one extra `FORMAT JSONEachRow` run. Only counts,
  timings and hashes were kept; no row left the box.
- **Windows**: `1d` = 2026-08-25, `7d` = 2026-08-19 -> 08-25, `30d` = 2026-07-27 -> 08-25
  (`23:59:59`-closed; the copy's last event is 2026-08-25 08:49). `default3m` is what a caller
  naming no window got on the run day: `2026-06-16 00:00:00` -> `2026-09-17 00:00:00`.

Both `weekly_active` (series) and `last_active` (engagement) read every identified event the project
ever had. They now also carry `AND created_at BETWEEN toDateTime({pN:String}) AND
toDateTime({pM:String})`, the same spelling as `pages.sql.ts` and `profile/src/sql.ts`.
`/insights/:projectId/retention` and `/engagement` now accept `range` / `startDate` / `endDate`,
resolved by `resolveInsightsDateRange` like the sibling routes, with
`RETENTION_SERIES_DEFAULT_RANGE = '3m'` when `range` is omitted. That default lives **on the
routes only**. A service caller that passes no `startDate`/`endDate` still gets the all-time
statement, token-for-token and parameter-for-parameter the one at `26a56aa0` (checked by rendering
both builders). Only whitespace differs, because the bound fragment renders empty.

**The approved change:**
- series: a week before the window disappears, and a week the window cuts in half counts only its
  in-window users.
- engagement: a profile whose last event is before the window is no longer counted. With `3m` it
  stays wider than the 60-day `churned_60_plus` bucket, so that bucket still gets users.
- **Not changed:** the MCP tools `get_weekly_retention_series` (`mcp/.../active-users.ts`) and
  `get_user_last_seen_distribution` (`mcp/.../engagement.ts`). They call the service with only
  `projectId`, so they keep reading all time. Their contracts depend on that: up to
  `MAX_WEEKLY_POINTS = 260` weeks, and a `churned_60_plus_days` bucket that must count profiles gone
  for longer than any default window. Bounding them is a decision for the `mcp` module. It is out of
  this task's scope and is handed forward.

> **Correction (attempt 2).** The first attempt put the `3m` fallback in the shared service
> functions. That silently capped both MCP tools to ~13 weeks and dropped long-churned profiles from
> the engagement distribution. Review rejected it. The fallback now lives only in
> `export.routes.ts`, and `retention.service.test.ts` keeps the no-window call asserting the full
> all-time series and all seven fixture profiles.

### Result sets and cost — before (all-time) vs after

`R` = result rows. Hash = the first 12 hex digits of the JSON result's sha256.

| project | statement | before (all-time) | after 1d | after 7d | after 30d | after `default3m` |
|---|---|---|---|---|---|---|
| `verdict` | series | 3,004 ms / 88.33 M rows / 63 MiB / R 9 / `700f4be4a890` | 36 ms / 0.60 M | 385 ms / 8.69 M | 1,648 ms / 44.59 M | 3,123 ms / 88.33 M / R 9 / **`700f4be4a890`** |
| `verdict` | lastSeen | 1,238 ms / 44.16 M / R 56 / `6476bf15f406` | 21 ms / 0.30 M | 142 ms / 4.35 M | 673 ms / 22.30 M | 1,288 ms / 44.16 M / R 56 / **`6476bf15f406`** |
| `bayse` | series | 2,423 ms / 76.49 M / R 9 / `8fdc236bf7e1` | 32 ms / 0.65 M | 334 ms / 9.30 M | 1,216 ms / 33.36 M | 2,601 ms / 76.49 M / **`8fdc236bf7e1`** |
| `bayse` | lastSeen | 1,039 ms / 38.25 M / R 56 / `0b08b3135340` | 16 ms / 0.33 M | 146 ms / 4.65 M | 522 ms / 16.68 M | 1,123 ms / 38.25 M / **`0b08b3135340`** |
| `earlysalary-production` | series | 2,159 ms / 53.58 M / 271 MiB / R 9 / `ac3fdda7c4c3` | 48 ms / 0.84 M | 285 ms / 5.96 M | 1,330 ms / 30.10 M | 2,293 ms / 53.58 M / **`ac3fdda7c4c3`** |
| `earlysalary-production` | lastSeen | 964 ms / 26.79 M / R 56 / `f9ac35c14bc3` | 24 ms / 0.42 M | 153 ms / 2.98 M | 586 ms / 15.05 M | 1,041 ms / 26.79 M / **`f9ac35c14bc3`** |
| `website-8103` | series | 131 ms / 46.25 M / R 0 | 24 ms / 0.53 M | 40 ms / 3.81 M | 185 ms / 24.24 M | 332 ms / 46.25 M / R 0 |
| `website-8103` | lastSeen | 63 ms / 23.13 M / R 0 | 11 ms / 0.26 M | 20 ms / 1.91 M | 90 ms / 12.12 M | 163 ms / 23.13 M / R 0 |
| `chatpaper` | series | 1,160 ms / 39.59 M / R 0 | 34 ms / 0.64 M | 163 ms / 4.64 M | 894 ms / 26.46 M | 1,288 ms / 39.59 M / R 0 |
| `chatpaper` | lastSeen | 583 ms / 19.80 M / R 0 | 15 ms / 0.32 M | 83 ms / 2.32 M | 447 ms / 13.23 M | 640 ms / 19.80 M / R 0 |
| `secure-privacy` | series | 75 ms / 1.11 M / R 9 / `87ee95b1e36e` | 30 ms / 0.36 M | 23 ms / 0.36 M | 50 ms / 0.97 M | 81 ms / 1.11 M / **`87ee95b1e36e`** |
| `secure-privacy` | lastSeen | 37 ms / 0.56 M / R 56 / `cddc379beaa3` | 9 ms / 0.18 M | 11 ms / 0.18 M | 27 ms / 0.48 M | 38 ms / 0.56 M / **`cddc379beaa3`** |

(`website-8103` and `chatpaper` have no identified profiles (`profile_id != device_id`), so both
statements return 0 rows either way.) The series reads each project's events **twice**, because
ClickHouse runs the `weekly_active` CTE once per reference. The self-join needs it on both sides.

**What this shows.**
- **`default3m` is byte-identical to the old all-time statement on all six projects.** On the run
  day, every identified event in the copy (earliest 2026-07-01) is inside the default window, so the
  answer is the same and so is the work (same `read_rows`; timings are within run-to-run noise).
- **Short windows are what gets cheaper:** 1d is 30–80x cheaper, and 7d is 7–8x cheaper.
- **This copy hides the real cost, and it cuts both ways, as with `page_titles`.** The copy holds
  only ~8 weeks of data, so "all-time" here is small. In production, the old statement read the
  tenant's **whole lifetime** on every call. There, a `3m` default is a strict improvement for any
  tenant older than three months. The cost that is genuinely new is for **explicit windows longer
  than the tenant's lifetime**, and there is none: a window can never read more rows than all-time
  did. Unlike `page_titles`, this fix cannot make any statement more expensive than before. The one
  thing it adds is on the REST routes: a Postgres lookup of the project timezone, the same one the
  sibling `/insights` routes already do.

### Golden coverage — predicted: zero changes today, with a known date when that stops

The cases are `insights-retention-weekly` (`verdict`), `insights-retention-weekly-secure` and
`insights-engagement` (`verdict`). All three call the REST routes with **no query**, so they get
`default3m`. The
table above shows the identical result for both projects on the run day. The `insights-engagement`
normaliser works on dates and on summary sums, which are unchanged because the row set is unchanged.

**These cases stop being time-independent.** `insights-retention-weekly*` is marked
`deterministic`. That was true when the statement read all time. With a `3m` default, the window
start is `now - 3 months`. It passes the two projects' first identified event (2026-07-01, in UTC)
on **2026-10-02** (UTC; an organisation timezone other than UTC moves this by hours). From then on, the first week row (`2026-06-28`) shrinks and the cases differ
for a reason that has nothing to do with code. To stay reproducible, a re-capture would have to pin
`startDate`/`endDate`. That is M34-003's call; this task may not touch `verification/`.
