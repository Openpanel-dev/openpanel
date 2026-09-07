# cohort.service.ts — V1 → V2 result-set proof (M12-004)

`packages/core/src/modules/cohort/cohort.service.ts` at commit
**54c4fe7af3c57af90b25733a5b8419ab8fde81bb** (this task's parent) held 46
`sqlstring.escape()` sites across every cohort statement. M12-004 moves all of
them onto the ADR-013 `sql` tag. The pre-change file was copied verbatim out of
git (`git show HEAD:… > __v1_m12004.service.ts`, placed inside the module so its
relative imports resolve, deleted after this proof) and **both sides were
imported into one Bun process and called** — no V1 text was retyped. Statements
that are not returned by a builder (the `cohort_members` reads, the two
`DELETE`s) were captured off a fake `deps.ch` that records
`{query, query_params, clickhouse_settings}`, from V1 and V2 identically.
Both sides then went through **one `@clickhouse/client` 1.18.5**, `format:
'JSON'`, same database, same settings; V1 as `query`, V2 as `query` +
`query_params`. `data` and `meta` were compared for every case. Cases whose V1
text has no total `ORDER BY` were compared **as sets** (marked below); the one
case where that is still not enough — a bare `LIMIT` — is treated separately in
§C22 with a V1-vs-V1 control.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, **319,850,695 events**, 18,630,719
  profiles. Project **`secure-privacy`** (118,502 profile rows, 30 distinct
  event names, `event_date` range 2026-07-01 … 2026-08-25) is the fixture for
  groups A, B and C.
  **`cohort_members` and `cohort_metadata` are both EMPTY in the prod copy
  (`SELECT count()` = 0 / 0).** Postgres holds exactly one `cohort` row —
  `cccccccc-0000-4000-8000-000000000001` ("Auth contract cohort", project
  `authc-project-a1`), an auth-contract harness fixture whose `definition` is
  `{}` and whose `profileCount` is 0. It has no members in ClickHouse and no
  definition to compute, so it is nameable but not usable. Group D
  therefore executes the seven `cohort_members` statements against the prod copy
  for statement equivalence at 0 rows, and group **E repeats all seven on the
  isolated `openpanel_test` database** seeded with cohorts `m12004-a`,
  `m12004-b` and `m12004-keep` under project `m12004-proof` (7 member rows, 3
  metadata rows, 120 events) so every one of them has a **non-zero** row count.
  The same split, for the same reason, is the `chart.sql.proof.md` precedent.
  The `openpanel_test` fixtures were deleted again after the run.
- **Machine**: single-node ClickHouse **26.1.3.52** on a **4-vCPU** box —
  timings are directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). Four statements contain `IN (subquery)` against the
  Distributed `cohort_members` (`listCohortMemberProfiles`,
  `getCohortMemberEvents`, `getCohortEventsPerDay`, `getCohortMemberRoutes`).
  **No `IN` was rewritten to `GLOBAL IN` or the reverse** — see §Distribution.
- **Verdict**: **65 cases, all IDENTICAL** — 58 on the prod copy and 7 on
  `openpanel_test`, plus the executed `DELETE` pair in §D8/D9. **64 are
  IDENTICAL row-for-row (or as sets, where marked). The 65th, C22, is a V1
  defect reproduced identically**: `buildPropertyBasedCohortQuery` emits
  `LIMIT n` with no `ORDER BY`, so V1 disagrees with *itself* across
  consecutive runs of the same text (control in §C22). It is IDENTICAL on row
  count, `meta`, and set-membership in the unrestricted result, and the bare
  `LIMIT`'s row identity is recorded as not-a-contract rather than sorted away.
  Three deliberate behaviour changes are recorded in §Behaviour changes — none
  of them is a difference in any executed result set.

## A — `buildEventCriteriaQuery`: every event-criteria branch

The two summary MVs, the three timeframe shapes, the three frequency operators and all six event-property operator branches (`is` / `isNot` single and multi, `contains`, `doesNotContain`, the `default` fall-through) plus the no-property path. `buildTimeConstraint`'s column is now a parameter rather than a `.replace('created_at','event_date')` over finished text; A1–A3 are the proof that the substituted column is byte-identical.

### A1 no filters, relative timeframe

**statement** — IDENTICAL; rows V1/V2 = 892/892; rows_read V1/V2 = 73728/73728; wall V1/V2 = 30 ms / 14 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY)
-- V2
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY)
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365}
```

### A2 no filters, absolute BETWEEN

**statement** — IDENTICAL; rows V1/V2 = 892/892; rows_read V1/V2 = 73728/65536; wall V1/V2 = 13 ms / 8 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date BETWEEN toDate('2026-07-01') AND toDate('2026-08-31')
-- V2
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date BETWEEN toDate({p3:String}) AND toDate({p4:String})
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": "2026-07-01", "p4": "2026-08-31"}
```

### A3 no filters, absolute open-ended

**statement** — IDENTICAL; rows V1/V2 = 892/892; rows_read V1/V2 = 73728/65536; wall V1/V2 = 9 ms / 11 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate('2026-07-01')
-- V2
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate({p3:String})
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": "2026-07-01"}
```

### A4 frequency gte

**statement** — IDENTICAL; rows V1/V2 = 403/403; rows_read V1/V2 = 73728/73728; wall V1/V2 = 13 ms / 11 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'screen_view' AND event_date >= toDate(now() - INTERVAL 365 DAY) GROUP BY profile_id HAVING countMerge(event_count) >= 3
-- V2
SELECT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) GROUP BY profile_id HAVING countMerge(event_count) >= {p4:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "screen_view", "p3": 365, "p4": 3}
```

### A5 frequency eq

**statement** — IDENTICAL; rows V1/V2 = 47/47; rows_read V1/V2 = 73728/73728; wall V1/V2 = 10 ms / 10 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'screen_view' AND event_date >= toDate(now() - INTERVAL 365 DAY) GROUP BY profile_id HAVING countMerge(event_count) = 1
-- V2
SELECT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) GROUP BY profile_id HAVING countMerge(event_count) = {p4:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "screen_view", "p3": 365, "p4": 1}
```

### A6 frequency lte

**statement** — IDENTICAL; rows V1/V2 = 71/71; rows_read V1/V2 = 73728/73728; wall V1/V2 = 9 ms / 11 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'screen_view' AND event_date >= toDate(now() - INTERVAL 365 DAY) GROUP BY profile_id HAVING countMerge(event_count) <= 2
-- V2
SELECT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) GROUP BY profile_id HAVING countMerge(event_count) <= {p4:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "screen_view", "p3": 365, "p4": 2}
```

### A7 property is (single value)

**statement** — IDENTICAL; rows V1/V2 = 810/810; rows_read V1/V2 = 155648/155648; wall V1/V2 = 31 ms / 15 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value = 'Web Small'))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value = {p5:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": "Web Small"}
```

### A8 property is (multi value)

**statement** — IDENTICAL; rows V1/V2 = 810/810; rows_read V1/V2 = 155648/155648; wall V1/V2 = 16 ms / 16 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value IN ('Web Small', 'Web Medium')))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value IN {p5:Array(String)}))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": ["Web Small", "Web Medium"]}
```

### A9 property isNot (single value)

**statement** — IDENTICAL; rows V1/V2 = 82/82; rows_read V1/V2 = 155648/155648; wall V1/V2 = 18 ms / 15 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value != 'Web Small'))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value != {p5:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": "Web Small"}
```

### A10 property isNot (multi value)

**statement** — IDENTICAL; rows V1/V2 = 82/82; rows_read V1/V2 = 155648/155648; wall V1/V2 = 16 ms / 16 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value NOT IN ('Web Small', 'Web Medium')))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value NOT IN {p5:Array(String)}))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": ["Web Small", "Web Medium"]}
```

### A11 property contains

**statement** — IDENTICAL; rows V1/V2 = 808/808; rows_read V1/V2 = 155648/155648; wall V1/V2 = 17 ms / 17 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'signUpSource' AND (property_value LIKE '%Google%' OR property_value LIKE '%o\'brien-%_%')))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND (property_value LIKE {p5:String} OR property_value LIKE {p6:String})))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "signUpSource", "p5": "%Google%", "p6": "%o'brien-%_%"}
```

### A12 property doesNotContain

**statement** — IDENTICAL; rows V1/V2 = 46/46; rows_read V1/V2 = 155648/155648; wall V1/V2 = 13 ms / 14 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'signUpSource' AND (property_value NOT LIKE '%Google%')))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND (property_value NOT LIKE {p5:String})))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "signUpSource", "p5": "%Google%"}
```

### A13 property default operator (startsWith falls through to IN)

**statement** — IDENTICAL; rows V1/V2 = 810/810; rows_read V1/V2 = 155648/155648; wall V1/V2 = 16 ms / 15 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value IN ('Web Small')))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value IN {p5:Array(String)}))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": ["Web Small"]}
```

### A14 two property filters OR-ed

**statement** — IDENTICAL; rows V1/V2 = 810/810; rows_read V1/V2 = 155648/155648; wall V1/V2 = 16 ms / 18 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value = 'Web Small') OR (property_key = 'signUpSource' AND property_value = 'Google Tag'))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value = {p5:String}) OR (property_key = {p6:String} AND property_value = {p7:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": "Web Small", "p6": "signUpSource", "p7": "Google Tag"}
```

### A15 property filter + frequency

**statement** — IDENTICAL; rows V1/V2 = 810/810; rows_read V1/V2 = 155648/155648; wall V1/V2 = 21 ms / 19 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value = 'Web Small')) GROUP BY profile_id HAVING countMerge(event_count) >= 1
-- V2
SELECT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value = {p5:String})) GROUP BY profile_id HAVING countMerge(event_count) >= {p6:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": "Web Small", "p6": 1}
```

### A16 property is with an empty value list (V1 IN ())

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 5 ms / 5 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

0 rows on both sides is the point: V1's literal `IN ()` and V2's `IN {p:Array(String)}` with `[]` both match nothing. Recipe idiom 10.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value IN ()))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value IN {p5:Array(String)}))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": []}
```

### A17 quote in the comparand

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 155648/155648; wall V1/V2 = 9 ms / 11 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

0 rows on both sides — no `signed_up` event carries `Web 'Small'`. The case exists for the escaping half: V1 emits `'Web \'Small\''`, V2 never puts the value in the text. Positive-row coverage for a quote is C20.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value = 'Web \'Small\''))
-- V2
SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value = {p5:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "productName", "p5": "Web 'Small'"}
```

### A18 profile.properties filter is NOT an event-property filter

**statement** — IDENTICAL; rows V1/V2 = 892/892; rows_read V1/V2 = 73728/73728; wall V1/V2 = 8 ms / 9 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY)
-- V2
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY)
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365}
```

## B — combining criteria: `INTERSECT` / `UNION DISTINCT`, and the count wrapper

`sql.join`'s separator set is closed and holds neither keyword, so the criteria fold left — the same associativity `queries.join(' INTERSECT ')` produced. Captured off the real `computeEventBasedCohort` / `countEventBasedCohort`, not rebuilt.

### B1 computeEventBasedCohort — INTERSECT (operator: and)

**statement** — IDENTICAL; rows V1/V2 = 214/214; rows_read V1/V2 = 147456/147456; wall V1/V2 = 12 ms / 12 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) INTERSECT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'user_logged_in' AND event_date >= toDate(now() - INTERVAL 365 DAY)
-- V2
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) INTERSECT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p4:String} AND name = {p5:String} AND event_date >= toDate(now() - INTERVAL {p6:UInt64} DAY)
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "secure-privacy", "p5": "user_logged_in", "p6": 365}
```

### B2 computeEventBasedCohort — UNION DISTINCT (operator: or)

**statement** — IDENTICAL; rows V1/V2 = 989/989; rows_read V1/V2 = 147456/147456; wall V1/V2 = 12 ms / 12 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) UNION DISTINCT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'user_logged_in' AND event_date >= toDate(now() - INTERVAL 365 DAY)
-- V2
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) UNION DISTINCT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p4:String} AND name = {p5:String} AND event_date >= toDate(now() - INTERVAL {p6:UInt64} DAY)
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "secure-privacy", "p5": "user_logged_in", "p6": 365}
```

### B3 computeEventBasedCohort — UNION DISTINCT with LIMIT

**statement** — IDENTICAL; rows V1/V2 = 989/989; rows_read V1/V2 = 147456/147456; wall V1/V2 = 11 ms / 12 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) UNION DISTINCT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'user_logged_in' AND event_date >= toDate(now() - INTERVAL 365 DAY) LIMIT 500
-- V2
SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) UNION DISTINCT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p4:String} AND name = {p5:String} AND event_date >= toDate(now() - INTERVAL {p6:UInt64} DAY) LIMIT {p7:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "secure-privacy", "p5": "user_logged_in", "p6": 365, "p7": 500}
```

### B4 countEventBasedCohort — INTERSECT

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 147456/147456; wall V1/V2 = 11 ms / 12 ms.

```sql
-- V1
SELECT count() as count FROM ( SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) INTERSECT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'user_logged_in' AND event_date >= toDate(now() - INTERVAL 365 DAY) )
-- V2
SELECT count() as count FROM ( SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) INTERSECT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p4:String} AND name = {p5:String} AND event_date >= toDate(now() - INTERVAL {p6:UInt64} DAY) )
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "secure-privacy", "p5": "user_logged_in", "p6": 365}
```

### B5 countEventBasedCohort — UNION DISTINCT

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 147456/147456; wall V1/V2 = 11 ms / 11 ms.

```sql
-- V1
SELECT count() as count FROM ( SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) UNION DISTINCT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'user_logged_in' AND event_date >= toDate(now() - INTERVAL 365 DAY) )
-- V2
SELECT count() as count FROM ( SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) UNION DISTINCT SELECT DISTINCT profile_id FROM event_profile_summary_mv WHERE project_id = {p4:String} AND name = {p5:String} AND event_date >= toDate(now() - INTERVAL {p6:UInt64} DAY) )
-- V2 params: {"p1": "secure-privacy", "p2": "signed_up", "p3": 365, "p4": "secure-privacy", "p5": "user_logged_in", "p6": 365}
```

## C — `buildPropertyBasedCohortQuery`: every profile-filter kind

All thirteen operators `getProfileFiltersWhereClause` distinguishes, on both column shapes (a `properties[...]` Map lookup and a plain column), `AND` and `OR`, the shared `argMax` row key including its dedup, the `WHERE 1=0` guard, the limit, and the two count/compute wrappers.

### C1 is (single value), map column

**statement** — IDENTICAL; rows V1/V2 = 1579/1579; rows_read V1/V2 = 212832/212832; wall V1/V2 = 98 ms / 93 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) = 'SE')
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) = {p4:String})
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "SE"}
```

### C2 is (multi value), map column

**statement** — IDENTICAL; rows V1/V2 = 1661/1661; rows_read V1/V2 = 212832/212832; wall V1/V2 = 88 ms / 89 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) IN ('SE', 'NO'))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) IN {p4:Array(String)})
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": ["SE", "NO"]}
```

### C3 isNot (single value)

**statement** — IDENTICAL; rows V1/V2 = 116923/116923; rows_read V1/V2 = 212832/212832; wall V1/V2 = 126 ms / 127 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) != 'SE')
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) != {p4:String})
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "SE"}
```

### C4 isNot (multi value)

**statement** — IDENTICAL; rows V1/V2 = 116841/116841; rows_read V1/V2 = 212832/212832; wall V1/V2 = 120 ms / 138 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) NOT IN ('SE', 'NO'))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) NOT IN {p4:Array(String)})
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": ["SE", "NO"]}
```

### C5 contains

**statement** — IDENTICAL; rows V1/V2 = 107590/107590; rows_read V1/V2 = 212832/212832; wall V1/V2 = 128 ms / 120 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.properties['browser'], tuple(last_seen_at, cityHash64(profiles.properties['browser']))) LIKE '%Chrome%'))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) LIKE {p4:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "browser", "p3": "browser", "p4": "%Chrome%"}
```

### C6 doesNotContain

**statement** — IDENTICAL; rows V1/V2 = 10912/10912; rows_read V1/V2 = 212832/212832; wall V1/V2 = 98 ms / 87 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.properties['browser'], tuple(last_seen_at, cityHash64(profiles.properties['browser']))) NOT LIKE '%Chrome%'))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) NOT LIKE {p4:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "browser", "p3": "browser", "p4": "%Chrome%"}
```

### C7 startsWith

**statement** — IDENTICAL; rows V1/V2 = 103568/103568; rows_read V1/V2 = 212832/212832; wall V1/V2 = 113 ms / 122 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.properties['browser'], tuple(last_seen_at, cityHash64(profiles.properties['browser']))) LIKE 'Chr%'))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) LIKE {p4:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "browser", "p3": "browser", "p4": "Chr%"}
```

### C8 endsWith

**statement** — IDENTICAL; rows V1/V2 = 13252/13252; rows_read V1/V2 = 212832/212832; wall V1/V2 = 89 ms / 92 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.properties['os'], tuple(last_seen_at, cityHash64(profiles.properties['os']))) LIKE '%OS'))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) LIKE {p4:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "os", "p3": "os", "p4": "%OS"}
```

### C9 isNull

**statement** — IDENTICAL; rows V1/V2 = 117249/117249; rows_read V1/V2 = 212832/212832; wall V1/V2 = 96 ms / 89 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) IS NULL OR argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) = ''))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) IS NULL OR argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) = ''))
-- V2 params: {"p1": "secure-privacy"}
```

### C10 isNotNull

**statement** — IDENTICAL; rows V1/V2 = 1253/1253; rows_read V1/V2 = 212832/212832; wall V1/V2 = 79 ms / 57 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) IS NOT NULL AND argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) != ''))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) IS NOT NULL AND argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) != ''))
-- V2 params: {"p1": "secure-privacy"}
```

### C11 gt (numeric cast)

**statement** — IDENTICAL; rows V1/V2 = 2528/2528; rows_read V1/V2 = 212832/212832; wall V1/V2 = 86 ms / 93 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties['latitude'], tuple(last_seen_at, cityHash64(profiles.properties['latitude'])))) > 55)
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}])))) > {p4:Float64})
-- V2 params: {"p1": "secure-privacy", "p2": "latitude", "p3": "latitude", "p4": 55}
```

### C12 lt (numeric cast)

**statement** — IDENTICAL; rows V1/V2 = 115973/115973; rows_read V1/V2 = 212832/212832; wall V1/V2 = 125 ms / 122 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties['latitude'], tuple(last_seen_at, cityHash64(profiles.properties['latitude'])))) < 55)
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}])))) < {p4:Float64})
-- V2 params: {"p1": "secure-privacy", "p2": "latitude", "p3": "latitude", "p4": 55}
```

### C13 gte (numeric cast)

**statement** — IDENTICAL; rows V1/V2 = 2528/2528; rows_read V1/V2 = 212832/212832; wall V1/V2 = 96 ms / 93 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties['latitude'], tuple(last_seen_at, cityHash64(profiles.properties['latitude'])))) >= 55)
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}])))) >= {p4:Float64})
-- V2 params: {"p1": "secure-privacy", "p2": "latitude", "p3": "latitude", "p4": 55}
```

### C14 lte (numeric cast, negative comparand)

**statement** — IDENTICAL; rows V1/V2 = 72747/72747; rows_read V1/V2 = 212832/212832; wall V1/V2 = 110 ms / 132 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties['longitude'], tuple(last_seen_at, cityHash64(profiles.properties['longitude'])))) <= -1.5)
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}])))) <= {p4:Float64})
-- V2 params: {"p1": "secure-privacy", "p2": "longitude", "p3": "longitude", "p4": -1.5}
```

### C15 gt with a non-numeric comparand (V1 emitted a bare NaN)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 212832/212832; wall V1/V2 = 75 ms / 68 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

`Number('abc')` is `NaN`. V1 spliced the bare token `NaN` (a legal ClickHouse Float64 literal); V2 binds `{p4:Float64}`, which the driver puts on the wire as `nan`. Both compare false for every row — 0 rows on both sides, and `> NaN` is false by IEEE rules, not by an error.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties['latitude'], tuple(last_seen_at, cityHash64(profiles.properties['latitude'])))) > NaN)
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (toFloat64OrNull(argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}])))) > {p4:Float64})
-- V2 params: {"p1": "secure-privacy", "p2": "latitude", "p3": "latitude", "p4": null}
```

### C16 plain column (profile.email) via sql.id

**statement** — IDENTICAL; rows V1/V2 = 1253/1253; rows_read V1/V2 = 212832/212832; wall V1/V2 = 54 ms / 55 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) LIKE '%@%'))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.email))) LIKE {p2:String}))
-- V2 params: {"p1": "secure-privacy", "p2": "%@%"}
```

### C17 AND of a map column and a plain column

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 212832/212832; wall V1/V2 = 84 ms / 86 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country'], profiles.email))) = 'SE' AND (argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties['country'], profiles.email))) IS NOT NULL AND argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties['country'], profiles.email))) != ''))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}], profiles.email))) = {p4:String} AND (argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties[{p5:String}], profiles.email))) IS NOT NULL AND argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties[{p6:String}], profiles.email))) != ''))
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "SE", "p5": "country", "p6": "country"}
```

### C18 OR of two columns

**statement** — IDENTICAL; rows V1/V2 = 1661/1661; rows_read V1/V2 = 212832/212832; wall V1/V2 = 80 ms / 82 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) = 'SE' OR argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) = 'NO')
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) = {p4:String} OR argMax(profiles.properties[{p5:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p6:String}]))) = {p7:String})
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "SE", "p5": "country", "p6": "country", "p7": "NO"}
```

### C19 quote in a user-controlled property key

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 212832/212832; wall V1/V2 = 63 ms / 64 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

0 rows on both sides — no profile has a property literally named `coun'try`. The case exists for the key-escaping half: V1 emits `profiles.properties['coun\'try']`, V2 emits `profiles.properties[{p2:String}]` with the raw key bound. C20 carries the positive-row quote coverage (1 row, `O'Fallon`).

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['coun\'try'], tuple(last_seen_at, cityHash64(profiles.properties['coun\'try']))) = 'SE')
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) = {p4:String})
-- V2 params: {"p1": "secure-privacy", "p2": "coun'try", "p3": "coun'try", "p4": "SE"}
```

### C20 quote in the comparand

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 212832/212832; wall V1/V2 = 65 ms / 64 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['city'], tuple(last_seen_at, cityHash64(profiles.properties['city']))) = 'O\'Fallon')
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) = {p4:String})
-- V2 params: {"p1": "secure-privacy", "p2": "city", "p3": "city", "p4": "O'Fallon"}
```

### C21 every filter dropped as empty (WHERE 1=0)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 4 ms / 3 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

0 rows on both sides by construction — `WHERE 1=0` is the guard that keeps an all-empty filter set from becoming "match everything". Recipe trap 6.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE 1=0
-- V2
SELECT id as profile_id FROM profiles WHERE 1=0
```

### C22 limit applied

**statement** — DIFFERENT data; rows V1/V2 = 25/25; rows_read V1/V2 = 212832/212832; wall V1/V2 = 50 ms / 74 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

**Not comparable row-for-row, and not because of the conversion** — `LIMIT` with no `ORDER BY`. See §C22 below for the V1-vs-V1 control and what this case *is* held to (row count, `meta`, subset of the unrestricted result, and the rendered `LIMIT {p5:UInt64}` / `p5 = 25`).

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) = 'SE') LIMIT 25
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) = {p4:String}) LIMIT {p5:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "SE", "p5": 25}
```

### C23 duplicate column deduped in the shared row key

**statement** — IDENTICAL; rows V1/V2 = 1661/1661; rows_read V1/V2 = 212832/212832; wall V1/V2 = 108 ms / 86 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) = 'SE' OR argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) = 'NO')
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) = {p4:String} OR argMax(profiles.properties[{p5:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p6:String}]))) = {p7:String})
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "SE", "p5": "country", "p6": "country", "p7": "NO"}
```

### C24 countPropertyBasedCohort wrapper (SELECT count() FROM (...))

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 212832/212832; wall V1/V2 = 61 ms / 65 ms.

```sql
-- V1
SELECT count() as count FROM ( SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) = 'SE') )
-- V2
SELECT count() as count FROM ( SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) = {p4:String}) )
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "SE"}
```

### C25 computePropertyBasedCohort (limit + PROFILE_COHORT_QUERY_SETTINGS)

**statement** — IDENTICAL; rows V1/V2 = 100/100; rows_read V1/V2 = 212832/212832; wall V1/V2 = 52 ms / 72 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country']))) = 'SE') LIMIT 100
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) = {p4:String}) LIMIT {p5:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "SE", "p5": 100}
```

### C26 isNull on a MAP column (columnAccess rendered twice)

**statement** — IDENTICAL; rows V1/V2 = 98300/98300; rows_read V1/V2 = 212832/212832; wall V1/V2 = 158 ms / 145 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

The column fragment is interpolated **twice** in one statement (`IS NULL OR … = ''`) and each copy carries the shared row key, so the one map key `model` renders as **four** placeholders `p2`–`p5`, each bound to `model`. Fragments are name-free until `toStatement()` assigns from a single counter, so repeated rendering multiplies placeholders rather than colliding them (ADR-013 R2) — and the result set is identical to V1's four inline copies of `'model'`.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.properties['model'], tuple(last_seen_at, cityHash64(profiles.properties['model']))) IS NULL OR argMax(profiles.properties['model'], tuple(last_seen_at, cityHash64(profiles.properties['model']))) = ''))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) IS NULL OR argMax(profiles.properties[{p4:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p5:String}]))) = ''))
-- V2 params: {"p1": "secure-privacy", "p2": "model", "p3": "model", "p4": "model", "p5": "model"}
```

### C27 isNotNull on a MAP column (columnAccess rendered twice)

**statement** — IDENTICAL; rows V1/V2 = 20202/20202; rows_read V1/V2 = 212832/212832; wall V1/V2 = 109 ms / 88 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING ((argMax(profiles.properties['model'], tuple(last_seen_at, cityHash64(profiles.properties['model']))) IS NOT NULL AND argMax(profiles.properties['model'], tuple(last_seen_at, cityHash64(profiles.properties['model']))) != ''))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING ((argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}]))) IS NOT NULL AND argMax(profiles.properties[{p4:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p5:String}]))) != ''))
-- V2 params: {"p1": "secure-privacy", "p2": "model", "p3": "model", "p4": "model", "p5": "model"}
```

### C28 three filters sharing one argMax row key

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 212832/212832; wall V1/V2 = 110 ms / 108 ms.

Compared as a **set** — V1 has no total `ORDER BY` on this statement, so row order is arbitrary.

One `latestPerProfileKey` fragment shared by four `argMax` calls (`isNotNull` uses two), itself carrying two map-key params: **13** placeholders rendered from four distinct fragments, every one bound to the right value, and the shared key text byte-identical at all four sites — which is the invariant `buildProfileCohortHavingClause`'s comment exists to protect.

```sql
-- V1
SELECT id as profile_id FROM profiles WHERE project_id = 'secure-privacy' GROUP BY id HAVING (argMax(profiles.properties['country'], tuple(last_seen_at, cityHash64(profiles.properties['country'], profiles.properties['browser'], profiles.email))) = 'SE' AND (argMax(profiles.properties['browser'], tuple(last_seen_at, cityHash64(profiles.properties['country'], profiles.properties['browser'], profiles.email))) LIKE '%Chrome%') AND (argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties['country'], profiles.properties['browser'], profiles.email))) IS NOT NULL AND argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties['country'], profiles.properties['browser'], profiles.email))) != ''))
-- V2
SELECT id as profile_id FROM profiles WHERE project_id = {p1:String} GROUP BY id HAVING (argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}], profiles.properties[{p4:String}], profiles.email))) = {p5:String} AND (argMax(profiles.properties[{p6:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p7:String}], profiles.properties[{p8:String}], profiles.email))) LIKE {p9:String}) AND (argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties[{p10:String}], profiles.properties[{p11:String}], profiles.email))) IS NOT NULL AND argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties[{p12:String}], profiles.properties[{p13:String}], profiles.email))) != ''))
-- V2 params: {"p1": "secure-privacy", "p2": "country", "p3": "country", "p4": "browser", "p5": "SE", "p6": "browser", "p7": "country", "p8": "browser", "p9": "%Chrome%", "p10": "country", "p11": "browser", "p12": "country", "p13": "browser"}
```
## D — the `cohort_members` statements, on the prod copy

`cohort_members` and `cohort_metadata` are **empty** in the prod copy, so these seven prove statement equivalence at 0 rows. Group E re-runs all seven with rows.

### D1 getCohortMembers (no limit/offset)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 19 ms / 3 ms.

0 rows: `cohort_members` is EMPTY in the prod copy. Positive-row coverage is E1.

```sql
-- V1
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = 'secure-privacy' AND cohort_id = 'm12004-proof-cohort' ORDER BY matched_at DESC
-- V2
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = {p1:String} AND cohort_id = {p2:String} ORDER BY matched_at DESC
-- V2 params: {"p1": "secure-privacy", "p2": "m12004-proof-cohort"}
```

### D2 getCohortMembers (limit + offset)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 3 ms / 3 ms.

0 rows, empty table. See E2.

```sql
-- V1
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = 'secure-privacy' AND cohort_id = 'm12004-proof-cohort' ORDER BY matched_at DESC LIMIT 5 OFFSET 2
-- V2
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = {p1:String} AND cohort_id = {p2:String} ORDER BY matched_at DESC LIMIT {p3:UInt64} OFFSET {p4:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "m12004-proof-cohort", "p3": 5, "p4": 2}
```

### D3 getCohortCount (stale cache → ClickHouse)

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 5 ms / 4 ms.

```sql
-- V1
SELECT count() as count FROM cohort_members FINAL WHERE project_id = 'secure-privacy' AND cohort_id = 'm12004-proof-cohort'
-- V2
SELECT count() as count FROM cohort_members FINAL WHERE project_id = {p1:String} AND cohort_id = {p2:String}
-- V2 params: {"p1": "secure-privacy", "p2": "m12004-proof-cohort"}
```

### D4 getCohortMemberEvents

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 16 ms / 12 ms.

0 rows, empty `cohort_members`. See E4.

```sql
-- V1
SELECT name, count() AS count FROM events WHERE project_id = 'secure-privacy' AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'm12004-proof-cohort' AND project_id = 'secure-privacy' ) AND name NOT IN ('screen_view', 'session_start', 'session_end') GROUP BY name ORDER BY count DESC LIMIT 10
-- V2
SELECT name, count() AS count FROM events WHERE project_id = {p1:String} AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p2:String} AND project_id = {p3:String} ) AND name NOT IN ('screen_view', 'session_start', 'session_end') GROUP BY name ORDER BY count DESC LIMIT {p4:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "m12004-proof-cohort", "p3": "secure-privacy", "p4": 10}
```

### D5 getCohortEventsPerDay

**statement** — IDENTICAL; rows V1/V2 = 31/31; rows_read V1/V2 = 0/0; wall V1/V2 = 9 ms / 11 ms.

```sql
-- V1
SELECT toDate(created_at) AS date, count() AS count FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDate(now() - INTERVAL 30 DAY) AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'm12004-proof-cohort' AND project_id = 'secure-privacy' ) GROUP BY date ORDER BY date ASC WITH FILL FROM toDate(now() - INTERVAL 30 DAY) TO toDate(now() + INTERVAL 1 DAY) STEP INTERVAL 1 DAY
-- V2
SELECT toDate(created_at) AS date, count() AS count FROM events WHERE project_id = {p1:String} AND created_at >= toDate(now() - INTERVAL {p2:UInt64} DAY) AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p3:String} AND project_id = {p4:String} ) GROUP BY date ORDER BY date ASC WITH FILL FROM toDate(now() - INTERVAL {p5:UInt64} DAY) TO toDate(now() + INTERVAL 1 DAY) STEP INTERVAL 1 DAY
-- V2 params: {"p1": "secure-privacy", "p2": 30, "p3": "m12004-proof-cohort", "p4": "secure-privacy", "p5": 30}
```

### D6 getCohortMemberRoutes

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 14 ms / 9 ms.

0 rows, empty `cohort_members`. See E6.

```sql
-- V1
SELECT path, count() AS count FROM events WHERE project_id = 'secure-privacy' AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'm12004-proof-cohort' AND project_id = 'secure-privacy' ) AND name = 'screen_view' AND path != '' GROUP BY path ORDER BY count DESC LIMIT 10
-- V2
SELECT path, count() AS count FROM events WHERE project_id = {p1:String} AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p2:String} AND project_id = {p3:String} ) AND name = 'screen_view' AND path != '' GROUP BY path ORDER BY count DESC LIMIT {p4:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "m12004-proof-cohort", "p3": "secure-privacy", "p4": 10}
```

### D7 getProfilesInCohort (limit 100000)

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 0/0; wall V1/V2 = 4 ms / 6 ms.

0 rows, empty `cohort_members`. See E7.

```sql
-- V1
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = 'secure-privacy' AND cohort_id = 'm12004-proof-cohort' ORDER BY matched_at DESC LIMIT 100000
-- V2
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = {p1:String} AND cohort_id = {p2:String} ORDER BY matched_at DESC LIMIT {p3:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "m12004-proof-cohort", "p3": 100000}
```

## E — the same `cohort_members` statements on seeded `openpanel_test`

Isolated test database, project `m12004-proof`: cohorts `m12004-a` (3 members), `m12004-b` (3 members, byte-identical fixture for the DELETE comparison) and `m12004-keep` (1 member, must survive), 3 `cohort_metadata` rows and 120 events across 4 profiles. Every case here has a non-zero row count. Fixtures deleted after the run.

### E1 getCohortMembers (no limit/offset)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 7/7; wall V1/V2 = 17 ms / 6 ms.

```sql
-- V1
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = 'm12004-proof' AND cohort_id = 'm12004-a' ORDER BY matched_at DESC
-- V2
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = {p1:String} AND cohort_id = {p2:String} ORDER BY matched_at DESC
-- V2 params: {"p1": "m12004-proof", "p2": "m12004-a"}
```

### E2 getCohortMembers (limit 2, offset 1)

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 7/7; wall V1/V2 = 6 ms / 5 ms.

```sql
-- V1
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = 'm12004-proof' AND cohort_id = 'm12004-a' ORDER BY matched_at DESC LIMIT 2 OFFSET 1
-- V2
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = {p1:String} AND cohort_id = {p2:String} ORDER BY matched_at DESC LIMIT {p3:UInt64} OFFSET {p4:UInt64}
-- V2 params: {"p1": "m12004-proof", "p2": "m12004-a", "p3": 2, "p4": 1}
```

### E3 getCohortCount

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 7/7; wall V1/V2 = 5 ms / 6 ms.

```sql
-- V1
SELECT count() as count FROM cohort_members FINAL WHERE project_id = 'm12004-proof' AND cohort_id = 'm12004-a'
-- V2
SELECT count() as count FROM cohort_members FINAL WHERE project_id = {p1:String} AND cohort_id = {p2:String}
-- V2 params: {"p1": "m12004-proof", "p2": "m12004-a"}
```

### E4 getCohortMemberEvents

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 127/127; wall V1/V2 = 9 ms / 8 ms.

```sql
-- V1
SELECT name, count() AS count FROM events WHERE project_id = 'm12004-proof' AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'm12004-a' AND project_id = 'm12004-proof' ) AND name NOT IN ('screen_view', 'session_start', 'session_end') GROUP BY name ORDER BY count DESC LIMIT 10
-- V2
SELECT name, count() AS count FROM events WHERE project_id = {p1:String} AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p2:String} AND project_id = {p3:String} ) AND name NOT IN ('screen_view', 'session_start', 'session_end') GROUP BY name ORDER BY count DESC LIMIT {p4:UInt64}
-- V2 params: {"p1": "m12004-proof", "p2": "m12004-a", "p3": "m12004-proof", "p4": 10}
```

### E5 getCohortEventsPerDay

**statement** — IDENTICAL; rows V1/V2 = 31/31; rows_read V1/V2 = 127/127; wall V1/V2 = 12 ms / 8 ms.

```sql
-- V1
SELECT toDate(created_at) AS date, count() AS count FROM events WHERE project_id = 'm12004-proof' AND created_at >= toDate(now() - INTERVAL 30 DAY) AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'm12004-a' AND project_id = 'm12004-proof' ) GROUP BY date ORDER BY date ASC WITH FILL FROM toDate(now() - INTERVAL 30 DAY) TO toDate(now() + INTERVAL 1 DAY) STEP INTERVAL 1 DAY
-- V2
SELECT toDate(created_at) AS date, count() AS count FROM events WHERE project_id = {p1:String} AND created_at >= toDate(now() - INTERVAL {p2:UInt64} DAY) AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p3:String} AND project_id = {p4:String} ) GROUP BY date ORDER BY date ASC WITH FILL FROM toDate(now() - INTERVAL {p5:UInt64} DAY) TO toDate(now() + INTERVAL 1 DAY) STEP INTERVAL 1 DAY
-- V2 params: {"p1": "m12004-proof", "p2": 30, "p3": "m12004-a", "p4": "m12004-proof", "p5": 30}
```

### E6 getCohortMemberRoutes

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 127/127; wall V1/V2 = 8 ms / 8 ms.

```sql
-- V1
SELECT path, count() AS count FROM events WHERE project_id = 'm12004-proof' AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = 'm12004-a' AND project_id = 'm12004-proof' ) AND name = 'screen_view' AND path != '' GROUP BY path ORDER BY count DESC LIMIT 10
-- V2
SELECT path, count() AS count FROM events WHERE project_id = {p1:String} AND profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p2:String} AND project_id = {p3:String} ) AND name = 'screen_view' AND path != '' GROUP BY path ORDER BY count DESC LIMIT {p4:UInt64}
-- V2 params: {"p1": "m12004-proof", "p2": "m12004-a", "p3": "m12004-proof", "p4": 10}
```

### E7 getProfilesInCohort (limit 100000)

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 7/7; wall V1/V2 = 5 ms / 5 ms.

```sql
-- V1
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = 'm12004-proof' AND cohort_id = 'm12004-a' ORDER BY matched_at DESC LIMIT 100000
-- V2
SELECT profile_id, count() OVER() as total FROM cohort_members FINAL WHERE project_id = {p1:String} AND cohort_id = {p2:String} ORDER BY matched_at DESC LIMIT {p3:UInt64}
-- V2 params: {"p1": "m12004-proof", "p2": "m12004-a", "p3": 100000}
```

## The `_all_cohorts` material

The `_all_cohorts` CTE that chart's cohort breakdowns `INNER JOIN` against is
built by `chart/src/chart.sql.ts` (`allCohortsCte`, `chart.sql.ts:224-229`), and
that file has been on the `sql` tag since M7 — it is not this module's SQL and
is untouched here:

```sql
SELECT profile_id, cohort_id FROM cohort_members FINAL WHERE project_id = {pN:String}
```

What *this* module owns is the **material it reads**: every row in
`cohort_members` is written by `storeCohortMembership` (a `ch.insert`, no SQL
text, unchanged) and removed by the two `DELETE`s, and the membership itself is
decided by the `computeCohort` statements in groups A–C. All of those are
converted and proved above; §D8/D9 executes the two deletes and shows a
non-targeted cohort surviving. `cohortMembershipCte` and `allCohortsLabelExpr`
in `chart.sql.ts` read the same `cohort_members` columns
(`project_id, cohort_id, profile_id`) this module writes, and neither column
list nor `FINAL` placement moved on either side — the goldens' cohort-breakdown
cases are the end-to-end check, and they are 137/137 with zero diffs.

## C22 — `LIMIT` with no `ORDER BY`: V1 disagrees with itself

`buildPropertyBasedCohortQuery(projectId, definition, limit)` emits
`LIMIT n` with no `ORDER BY`, so *which* n rows come back is not a contract.
Comparing the two sides row-for-row therefore fails against V1 as readily as
against V2. Measured 2026-09-07, the same V1 text run three times in a row:

```
V1-vs-V1, 3 runs of the SAME text, distinct result sets: 3   (first control)
V1-vs-V1, 3 runs of the SAME text, distinct result sets: 2   (second control)
```

What the conversion can be held to, and was:

```
limited rows V1/V2:            25 / 25
meta identical:                true
V1 limited rows ⊆ full set:    true
V2 limited rows ⊆ full set:    true
unrestricted rows V1/V2:       1579 / 1579   (result sets identical — case C1)
rows_read V1/V2:               212832 / 212832 ; wall 80 ms / 79 ms
```

The `LIMIT` clause itself is proved by C25 — `computePropertyBasedCohort` with
`limit: 100` — which came back IDENTICAL row-for-row on this run, and by the
rendered `LIMIT {p5:UInt64}` + `p5 = 25` above. The row *identity* under a bare
`LIMIT` is recorded here as not-a-contract rather than sorted away.

## Distribution — `IN` / `GLOBAL IN` unchanged

The module contains **no `GLOBAL`** before or after:

```
$ grep -rn "GLOBAL" /tmp/m12004/v1-cohort.service.ts packages/core/src/modules/cohort/
(none on either side)
```

The four `IN (subquery)` sites — all against the Distributed `cohort_members` —
are at the same four statements on both sides and were not touched:

```
$ grep -n "IN ($" <V1>                 $ grep -n "IN ($" <V2>
845:      AND id IN (                   908:      AND id IN (
883:      AND profile_id IN (           949:      AND profile_id IN (
911:      AND profile_id IN (           979:      AND profile_id IN (
939:      AND profile_id IN (          1008:      AND profile_id IN (
```

(The first is `listCohortMemberProfiles`, already converted at M12-003 and
untouched here.) The whole-file `IN (` count drops 11 → 10 because
**value-list** `IN ('a', 'b')` becomes `IN {p:Array(String)}` — a binding
change, not a distribution one; both forms are single-node-local and
shard-irrelevant. Three of the four subquery sites gained a one-line comment
saying the plain `IN` is V1's and is kept as written.

Whether any of those four *should* be `GLOBAL IN` is the pre-existing question
`retention.sql.ts:14` and `sankey.sql.ts:14-16` also record and do not answer.

## `{cluster}` is a macro, not a placeholder

`updateCohortMembership` and `deleteCohortMembership` target
`getReplicatedTableName(t)`, which under `CLICKHOUSE_CLUSTER` renders
`<t>_replicated ON CLUSTER '{cluster}'` — not an identifier, so it cannot go
through `sql.id` whole. V2 rebuilds the same text from a validated identifier
plus literal template text (`replicatedTarget`, asserted byte-equal to
`getReplicatedTableName` in `src/cohort-sql.test.ts`). Rendered side by side
with `CLICKHOUSE_CLUSTER`/`SELF_HOSTED` unset (i.e. clustered):

```sql
-- V1
DELETE FROM cohort_members_replicated ON CLUSTER '{cluster}' WHERE cohort_id = 'c1' AND project_id = 'p1'
DELETE FROM cohort_metadata_replicated ON CLUSTER '{cluster}' WHERE cohort_id = 'c1' AND project_id = 'p1'
-- V2
DELETE FROM cohort_members_replicated ON CLUSTER '{cluster}' WHERE cohort_id = {p1:String} AND project_id = {p2:String}
DELETE FROM cohort_metadata_replicated ON CLUSTER '{cluster}' WHERE cohort_id = {p1:String} AND project_id = {p2:String}
-- V2 params: {"p1": "c1", "p2": "p1"}
```

That form cannot be *executed* on a single node (this box has the `cluster`
macro but no such cluster), so the interaction that matters — does adding
`query_params` to a statement break the `{cluster}` macro? — was measured
directly instead:

```bash
$ curl -s -G 'http://127.0.0.1:8123/?database=openpanel&default_format=JSONCompact' \
    --data-urlencode 'param_p1=abc' \
    --data-urlencode "query=SELECT {p1:String} AS bound, '{cluster}' AS macro_left_alone"
[["abc","{cluster}"]]

$ curl -s -X POST 'http://127.0.0.1:8123/?database=openpanel_test&param_p1=nope' \
    --data-binary "DELETE FROM cohort_members ON CLUSTER '{cluster}' WHERE cohort_id = {p1:String}"
Code: 701. DB::Exception: Requested cluster 'openpanel_cluster' not found. (CLUSTER_DOESNT_EXIST)
```

Parameter substitution ignores `{cluster}` (no `:Type` suffix), and the second
call got all the way past parsing and substitution to the cluster lookup with
both a macro and a bound param in one statement. The non-clustered rendering
(`SELF_HOSTED=true`) is what §D8/D9 and §E executed.

## D8 / D9 — the two DELETE paths, executed

Executed on `openpanel_test`: V1 deleted cohort `m12004-a`, V2 deleted the
byte-identical fixture `m12004-b`, and `m12004-keep` had to survive both.

| | a_members | b_members | keep_members | a_metadata | b_metadata |
|---|---|---|---|---|---|
| before | 3 | 3 | 1 | 1 | 1 |
| after (V1 on a, V2 on b) | **0** | **0** | **1** | **0** | **0** |

Rendered (`SELF_HOSTED=true`, i.e. non-clustered):

```sql
-- D8 updateCohortMembership, clickhouse_settings {"lightweight_deletes_sync":"1"} on both sides
-- V1
DELETE FROM cohort_members WHERE cohort_id = 'm12004-a' AND project_id = 'm12004-proof'
-- V2
DELETE FROM cohort_members WHERE cohort_id = {p1:String} AND project_id = {p2:String}
-- V2 params: {"p1": "m12004-a", "p2": "m12004-proof"}

-- D9 deleteCohortMembership, clickhouse_settings {"lightweight_deletes_sync":"0"} on both sides
-- V1
DELETE FROM cohort_members  WHERE cohort_id = 'x' AND project_id = 'y'
DELETE FROM cohort_metadata WHERE cohort_id = 'x' AND project_id = 'y'
-- V2
DELETE FROM cohort_members  WHERE cohort_id = {p1:String} AND project_id = {p2:String}
DELETE FROM cohort_metadata WHERE cohort_id = {p1:String} AND project_id = {p2:String}
-- V2 params: {"p1": "x", "p2": "y"}
```

`storeCohortMembership` is untouched: it was already `ch.insert({table, values,
format: 'JSONEachRow'})` with no SQL text, and the capture confirms both sides
issue the same inserts (`cohort_metadata` × 1 with an empty member list,
`cohort_members` + `cohort_metadata` when there are members).

## Numeric bindings — which ClickHouse type, and why

There is no "the number type" (recipe, *Numbers*). Every numeric this module
binds, with the value's provenance:

| site | V1 emitted | V2 binds | why |
|---|---|---|---|
| `INTERVAL n DAY` (relative timeframe) | `INTERVAL 365 DAY` | `sql.uint64` | `n` comes from `/^(\d+)d$/` on a `z.enum(['7d','30d','90d','180d','365d'])` — never negative. Cases A1, D5/E5 |
| `HAVING countMerge(event_count) >= n` | `>= 3` | `sql.uint64` | `zFrequency.count` is `z.number().int().min(1)`. Cases A4–A6, A15 |
| `LIMIT` / `OFFSET` | `LIMIT 25` | `sql.uint64` | `COHORT_MATERIALIZE_LIMIT` is a validated positive int; the rpc's `limit`/`offset` are `z.number().int().min(0)`. Cases C22, C25, B3, E2, E4, E6 |
| `toFloat64OrNull(col) > n` | `> 55`, `> -1.5`, `> NaN` | `sql.float64` | the comparand is `Number(value[0])` — fractional, signed and `NaN` all reachable. Cases C11–C15 |

`sql.float64` is the correct type and not a cast-deleting shortcut: V1 wrote a
**bare** `${Number(v)}` here — not a quoted comparand fed to `toFloat64`, which
is the shape `chart/src/filter-where.ts` has and which is why *that* file binds
`String`. There is no cast to preserve, so `Float64` is the value's own type.
C15 pins the `NaN` end of it: the driver puts `NaN` on the wire as the literal
`nan`, ClickHouse parses it as a Float64 NaN, and every comparison is false —
the same 0 rows V1's bare `NaN` token returned.

The `UInt64` choices carry one real difference, recorded in §Behaviour changes
item 3.

## Behaviour changes

Three, all deliberate, none visible in any executed result set above.

### 1. A non-identifier profile column is now rejected, not inlined (ADR-013 R3)

V1's `profileColumnAccess` returned `profiles.<name>` **verbatim** for anything
that was not a `properties.` lookup — the site ADR-013 names as having "no guard
today". V2 routes it through `sql.id`, which throws. Measured 2026-09-07, both
sides called with the same filter name:

| filter `name` | V1 emitted / executed | V2 |
|---|---|---|
| `profile.email` | `argMax(profiles.email, …)` → **0 rows, no error** | identical text, `{p2:String}` comparand |
| `profile.foo.bar` | `argMax(profiles.foo.bar, …)` → **`UNKNOWN_IDENTIFIER` (47)** | `SqlIdentifierError: Refusing to inline identifier "profiles.foo.bar": more than 2 dot-separated parts` |
| `profile.email); DROP` | `HAVING (argMax(profiles.email); DROP, tuple(…` → **`SYNTAX_ERROR` (62)** | `SqlIdentifierError: … "email); DROP" is not a bare identifier` |

Every input V1 could actually *serve* is served identically; the inputs whose
behaviour changes are exactly the ones V1 turned into a ClickHouse error, and
V2 rejects them before the round trip. No `allowed` whitelist is passed, because
V1 had no closed column set here and adding one would drop filters V1 accepted.

### 2. `escapeDate` has no successor — and never applied here

Trap 1 of the recipe. This module never used clix, so no expression relied on
`escapeDate`'s implicit re-quoting; the two date-shaped values it handles
(`timeframe.start` / `timeframe.end`) were already inside explicit
`toDate('…')` calls in V1 and are inside `toDate({pN:String})` in V2 — cases A2
and A3, both IDENTICAL. `session_timezone` (trap 3) likewise does not arise:
no cohort statement went through clix, so none of them ever sent one, and none
sends one now. The only per-query settings in the module are
`PROFILE_COHORT_QUERY_SETTINGS` (unchanged, passed through — case C25) and the
two `lightweight_deletes_sync` values (unchanged — §D8/D9).

### 3. A negative `LIMIT` / `OFFSET` / frequency count now fails instead of returning a row

Measured 2026-09-07:

```
SELECT number FROM numbers(10) LIMIT -1          ->  rows 1, [[9]]      (V1's shape)
SELECT 1 LIMIT {p1:UInt64}  with param_p1=-1     ->  Code: 457. Value -1 cannot be
                                                     parsed as UInt64 … (BAD_QUERY_PARAMETER)
```

So ClickHouse **accepts** a negative literal `LIMIT` (it does not error, it
returns one row), while a negative `{p:UInt64}` is rejected at the server. This
is the recipe's stated intent — "a limit that went negative is a bug, not a
row" — and it is the only place a bound type is stricter than V1's literal.

Nothing in the module can reach it today: `COHORT_MATERIALIZE_LIMIT` is
`parsePositiveInt`-guarded, `getCohortMembers`' `limit`/`offset` are
`z.number().int().min(0)` on the rpc, and `zFrequency.count` is
`z.number().int().min(1)`. The one unvalidated path is
`updateCohortMembership`, which reads `cohort.definition` back out of Prisma's
JSON column and casts it without re-running zod — a `frequency.count` persisted
before that schema tightened would now fail loudly rather than quietly. No such
row exists here: the prod copy's only Postgres `cohort` row
(`cccccccc-0000-4000-8000-000000000001`) has `definition = {}`. Recorded rather
than guessed at.

## Tests that used to compare SQL text

`packages/core/src/modules/cohort/src/cohort-sql.test.ts` is the only
text-comparing test over this module. Every assertion in it now runs against
`toStatement()` — the rendered `query` plus `query_params` — and none changed
what it claims:

| test | before | after |
|---|---|---|
| `resolves the newest row per profile without FINAL` | `argMax(profiles.properties['experiment'], tuple(last_seen_at, cityHash64(profiles.properties['experiment'])))` | `argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}])))` |
| `orders every aggregate by ONE shared row key` | same key text twice | same key text twice, with placeholders |
| `filters aggregates in HAVING, not WHERE` | unchanged (index comparison on the rendered query) | unchanged |
| `wraps plain columns too…` | unchanged | unchanged |
| `wraps numeric comparisons inside the cast` | `toFloat64OrNull(argMax(profiles.properties['age'], tuple(last_seen_at,` | `toFloat64OrNull(argMax(profiles.properties[{p2:String}], tuple(last_seen_at,` |
| `applies the limit` | `toContain('LIMIT 10')` | `toContain('LIMIT {p5:UInt64}')` **and** `query_params.p5 === 10` |
| `matches nothing when every filter was dropped as empty` | unchanged | unchanged |
| **`escapes quotes in user-controlled property keys`** → **`binds user-controlled property keys instead of escaping them`** | asserted the escaped literal `profiles.properties['pl\'an']` was present | asserts the key is **absent** from the SQL text, that the text reads `profiles.properties[{p2:String}]`, and that `pl'an` is among the bound params |

The last row is the one whose *assertion* had to change rather than merely
re-render: V1's claim ("the quote is escaped inside the literal") describes a
literal that no longer exists. The property it was protecting — a quote in a
user-controlled key cannot terminate a string — is now stronger and is what the
new assertion states. One test was **added**: `replicatedTarget renders exactly
what getReplicatedTableName produces`, which is what keeps the `ON CLUSTER`
rebuild from drifting from `shared/ch-tables.ts`.

`cohort.service.test.ts`, `cohort.rpc.test.ts` and `cohort.jobs.test.ts` assert
on behaviour, not text, and are unmodified.

## Reproducing a case with curl

Every V2 statement above is runnable as written; bind each `pN` as `param_pN`.
Array params go on the wire in ClickHouse's literal form
(`param_p1=['a','b']`), which is what `@clickhouse/client` sends. Case A7:

```bash
curl -s 'http://127.0.0.1:8123/?database=openpanel&default_format=JSONCompact' \
  --data-binary "SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = 'secure-privacy' AND name = 'signed_up' AND event_date >= toDate(now() - INTERVAL 365 DAY) AND ((property_key = 'productName' AND property_value = 'Web Small'))" | tail -5

curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode 'param_p1=secure-privacy' --data-urlencode 'param_p2=signed_up' \
  --data-urlencode 'param_p3=365' --data-urlencode 'param_p4=productName' \
  --data-urlencode 'param_p5=Web Small' \
  --data-urlencode "query=SELECT DISTINCT profile_id FROM event_property_profile_summary_mv WHERE project_id = {p1:String} AND name = {p2:String} AND event_date >= toDate(now() - INTERVAL {p3:UInt64} DAY) AND ((property_key = {p4:String} AND property_value = {p5:String}))" | tail -5
```

Both return 810 rows.

## P12 grep gate

```
$ bash tooling/gates/p12-grep-gates.sh --report | grep cohort
(no line — packages/core/src/modules/cohort/** scores 0 in every column)

before (54c4fe7a):  46 sqlstring, 0 clix, 0 sql-builder   cohort.service.ts
after:              (absent from the report)
TOTAL   sqlstring 82 → 36    clix 73 → 73    sql-builder 6 → 6
```

Nothing else moved. The one surviving `sqlstring` token in the module is the
word inside this file's and the service's header comments, which the gate does
not count.
