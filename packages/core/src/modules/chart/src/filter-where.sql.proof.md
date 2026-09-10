# filter-where.ts — V1 → V2 result-set proof (M12-002)

V1 is `packages/core/src/modules/chart/src/filter-where.ts` at `be029da1`
(`git show HEAD:packages/core/src/modules/chart/src/filter-where.ts`,
materialised as a sibling module so its relative imports resolve, deleted after
the run). V2 is the converted file in this commit. Both compilers were imported
into ONE Bun process, called with the SAME `IChartEventFilter[]`, `projectId`,
`eventsAlias` and `tableScope`, and each compiled clause was spliced into the
SAME surrounding count query and executed through ONE `@clickhouse/client` with
`format: 'JSON'` and `session_timezone=UTC` on both sides — V1 as `query`, V2 as
`query` + `query_params`. `data` and `meta` were compared field for field. Every
statement here returns a single aggregate row, so no case needed set comparison.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,850,470 events. Project
  `secure-privacy` (347 group rows, 345 distinct names, 31 of those reachable
  from events in the window), window `2026-07-01 00:00:00` … `2026-07-08 00:00:00` (76,885 events, 22,983
  distinct profiles), `session_timezone=UTC`. One case (`wildcard array /
  isNull`) uses project `dd5f6d1c-fff9-43c9-8c89-e40ba06752c8` over the same
  window, because it is the only project in the copy with an empty-valued
  `__query.*` key there — on `secure-privacy` that case returns 0 rows and would
  prove nothing. **`cohort_members` is empty in the prod copy** (`SELECT count()
  FROM cohort_members` = 0), so the two `inCohort` cases are 0-row statement
  equivalences; positive-row cohort coverage lives in `openpanel_test` (same
  precedent as `sql.proof.md`).
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). Two statements contain `IN (subquery)` on a
  `Distributed` table (the two cohort branches); **no `IN` was converted to
  `GLOBAL IN` or back** — see *IN / GLOBAL IN* below.
- **Verdict**: **94 cases, all IDENTICAL** — 91 executed against ClickHouse
  (3 of them IDENTICAL ERROR: V1 defects reproduced byte-for-byte, listed
  below, not fixed here) and 3 compile-time equivalences where both compilers
  emit no clause at all.

## Per-case results

Row counts are `count()` / `uniq(profile_id)` over the window, V1/V2. Three
cases return 0 rows and say why in their row: the two `inCohort` cases
(`cohort_members` is empty here) and `typed cast / number is with a null value`
(a comparison against NULL is never true — the binding itself is proven by the
probe under *The `null` binding*).

| branch | case | verdict | rows V1/V2 | count V1/V2 | uniq V1/V2 | rows_read V1/V2 | wall ms V1/V2 |
|---|---|---|---|---|---|---|---|
| top-level column | is (single value) | IDENTICAL | 1/1 | 3066/3066 | 986/986 | 90057/90057 | 29/21 |
| top-level column | is (multi value -> IN) | IDENTICAL | 1/1 | 3921/3921 | 1090/1090 | 90057/90057 | 21/20 |
| top-level column | isNot (single value) | IDENTICAL | 1/1 | 73819/73819 | 22268/22268 | 90057/90057 | 37/18 |
| top-level column | isNot (multi value -> NOT IN) | IDENTICAL | 1/1 | 72964/72964 | 22179/22179 | 90057/90057 | 24/23 |
| top-level column | contains | IDENTICAL | 1/1 | 60795/60795 | 19723/19723 | 90057/90057 | 20/19 |
| top-level column | doesNotContain | IDENTICAL | 1/1 | 16090/16090 | 3393/3393 | 90057/90057 | 20/23 |
| top-level column | startsWith | IDENTICAL | 1/1 | 60089/60089 | 19504/19504 | 90057/90057 | 17/22 |
| top-level column | endsWith | IDENTICAL | 1/1 | 6333/6333 | 1953/1953 | 90057/90057 | 16/19 |
| top-level column | regex (slashes stripped) | IDENTICAL | 1/1 | 60089/60089 | 19504/19504 | 90057/90057 | 21/21 |
| top-level column | isNull (empty value array) | IDENTICAL | 1/1 | 15591/15591 | 3420/3420 | 90057/90057 | 13/23 |
| top-level column | isNotNull (empty value array) | IDENTICAL | 1/1 | 61294/61294 | 19631/19631 | 90057/90057 | 20/15 |
| top-level column | gt on a numeric column (toFloat64 cast) | IDENTICAL | 1/1 | 868/868 | 702/702 | 90057/90057 | 20/14 |
| top-level column | gte on a numeric column | IDENTICAL | 1/1 | 869/869 | 702/702 | 90057/90057 | 13/13 |
| top-level column | lt on a numeric column | IDENTICAL | 1/1 | 76688/76688 | 22983/22983 | 90057/90057 | 15/15 |
| top-level column | lte on a numeric column | IDENTICAL | 1/1 | 76688/76688 | 22983/22983 | 90057/90057 | 15/20 |
| top-level column | gt on a non-numeric column (raw comparison) | IDENTICAL | 1/1 | 73522/73522 | 22243/22243 | 90057/90057 | 18/17 |
| top-level column | lte on a non-numeric column | IDENTICAL | 1/1 | 7068/7068 | 2091/2091 | 90057/90057 | 22/20 |
| top-level column | camelCase alias (referrerName -> referrer_name) | IDENTICAL | 1/1 | 58439/58439 | 18908/18908 | 90057/90057 | 28/31 |
| top-level column | null in the value array (String(null) -> 'null') | IDENTICAL | 1/1 | 3066/3066 | 986/986 | 90057/90057 | 20/16 |
| top-level column | unknown column is dropped | IDENTICAL (no clause emitted) | – | – | – | – | – |
| top-level column | empty value array with a value operator is dropped | IDENTICAL (no clause emitted) | – | – | – | – | – |
| properties.* | is (single value) | IDENTICAL | 1/1 | 1084/1084 | 360/360 | 81866/81866 | 18/18 |
| properties.* | is (multi value -> IN) | IDENTICAL | 1/1 | 1084/1084 | 360/360 | 81866/81866 | 34/18 |
| properties.* | isNot (single value) | IDENTICAL | 1/1 | 75801/75801 | 22949/22949 | 90057/90057 | 35/23 |
| properties.* | isNot (multi value -> NOT IN) | IDENTICAL | 1/1 | 75801/75801 | 22949/22949 | 90057/90057 | 30/38 |
| properties.* | contains | IDENTICAL | 1/1 | 52792/52792 | 22934/22934 | 90057/90057 | 29/22 |
| properties.* | doesNotContain | IDENTICAL | 1/1 | 24093/24093 | 22891/22891 | 90057/90057 | 20/23 |
| properties.* | startsWith | IDENTICAL | 1/1 | 3948/3948 | 1434/1434 | 90057/90057 | 23/26 |
| properties.* | endsWith | IDENTICAL | 1/1 | 3039/3039 | 1120/1120 | 90057/90057 | 26/20 |
| properties.* | regex (NOT slash-stripped, unlike the column branch) | IDENTICAL | 1/1 | 3948/3948 | 1434/1434 | 90057/90057 | 32/19 |
| properties.* | isNull | IDENTICAL | 1/1 | 23963/23963 | 22890/22890 | 90057/90057 | 22/20 |
| properties.* | isNotNull | IDENTICAL | 1/1 | 52922/52922 | 22973/22973 | 90057/90057 | 28/29 |
| properties.* | gt (toFloat64OrZero) | IDENTICAL | 1/1 | 1157/1157 | 529/529 | 81866/81866 | 17/17 |
| properties.* | gte (toFloat64OrZero) | IDENTICAL | 1/1 | 76885/76885 | 22983/22983 | 90057/90057 | 35/19 |
| properties.* | lt (toFloat64OrZero) | IDENTICAL | 1/1 | 75728/75728 | 22983/22983 | 90057/90057 | 29/23 |
| properties.* | lte (toFloat64OrZero) | IDENTICAL | 1/1 | 75728/75728 | 22983/22983 | 90057/90057 | 22/21 |
| properties.* | eventsAlias qualifies the map (e.properties[...]) | IDENTICAL | 1/1 | 1084/1084 | 360/360 | 81866/81866 | 18/20 |
| properties.__query.* | bare utm_source routed into the __query map | IDENTICAL | 1/1 | 41/41 | 20/20 | 49113/49113 | 12/18 |
| properties.__query.* | explicit properties.__query.utm_source contains | IDENTICAL | 1/1 | 41/41 | 20/20 | 49113/49113 | 12/12 |
| properties.__query.* | properties.__query.gclid isNotNull | IDENTICAL | 1/1 | 1292/1292 | 547/547 | 81866/81866 | 29/22 |
| profile.properties.* | is (single value) | IDENTICAL | 1/1 | 42927/42927 | 13651/13651 | 401033/401033 | 109/82 |
| profile.properties.* | is + rewriteProfilePropertyRefs narrows the ref | IDENTICAL | 1/1 | 42927/42927 | 13651/13651 | 401033/401033 | 75/76 |
| profile.properties.* | contains + rewriteProfilePropertyRefs (the value keeps its own text) | IDENTICAL | 1/1 | 70431/70431 | 21700/21700 | 401033/401033 | 79/76 |
| profile.properties.* | isNotNull | IDENTICAL | 1/1 | 75053/75053 | 22938/22938 | 401033/401033 | 79/82 |
| profile.properties.* | multi value -> IN | IDENTICAL | 1/1 | 46413/46413 | 14783/14783 | 401033/401033 | 79/83 |
| wildcard array | is | IDENTICAL | 1/1 | 41/41 | 20/20 | 49113/49113 | 13/14 |
| wildcard array | isNot | IDENTICAL | 1/1 | 2035/2035 | 802/802 | 81866/81866 | 21/30 |
| wildcard array | contains | IDENTICAL | 1/1 | 41/41 | 20/20 | 49113/49113 | 14/13 |
| wildcard array | doesNotContain | IDENTICAL | 1/1 | 2035/2035 | 802/802 | 81866/81866 | 16/18 |
| wildcard array | startsWith | IDENTICAL | 1/1 | 41/41 | 20/20 | 49113/49113 | 17/14 |
| wildcard array | endsWith | IDENTICAL | 1/1 | 109/109 | 49/49 | 81866/81866 | 17/18 |
| wildcard array | regex | IDENTICAL | 1/1 | 41/41 | 20/20 | 49113/49113 | 14/13 |
| wildcard array | isNull | IDENTICAL | 1/1 | 5/5 | 3/3 | 81897/16379 | 16/13 |
| wildcard array | isNotNull | IDENTICAL | 1/1 | 2076/2076 | 822/822 | 81866/81866 | 17/19 |
| wildcard array | gt | IDENTICAL | 1/1 | 1290/1290 | 587/587 | 81866/81866 | 23/25 |
| wildcard array | gte | IDENTICAL | 1/1 | 2076/2076 | 822/822 | 81866/81866 | 19/23 |
| wildcard array | lt | IDENTICAL | 1/1 | 2029/2029 | 807/807 | 81866/81866 | 32/25 |
| wildcard array | lte | IDENTICAL | 1/1 | 2043/2043 | 814/814 | 81866/81866 | 36/19 |
| wildcard array | nested .*. pattern (properties.__query.*.type) | IDENTICAL | 1/1 | 62/62 | 26/26 | 73674/73674 | 18/18 |
| trailing .* wildcard | properties.__query.* is (V1 defect: not a wildcard) | **IDENTICAL ERROR** | – | – | – | – | 4/4 |
| trailing .* wildcard | properties.__query.* isNotNull | **IDENTICAL ERROR** | – | – | – | – | 4/3 |
| group.* | group.type is | IDENTICAL | 1/1 | 997/997 | 31/31 | 93416/93416 | 32/34 |
| group.* | group.name contains | IDENTICAL | 1/1 | 733/733 | 24/24 | 93416/93416 | 31/27 |
| group.* | group.name is (multi -> IN) | IDENTICAL | 1/1 | 198/198 | 3/3 | 93416/93416 | 26/28 |
| group.* | group.name isNot (single) | IDENTICAL | 1/1 | 2715/2715 | 89/89 | 93416/93416 | 31/32 |
| group.* | group.name isNot (multi -> NOT IN) | IDENTICAL | 1/1 | 2655/2655 | 88/88 | 93416/93416 | 29/28 |
| group.* | group.properties.employees isNotNull | IDENTICAL | 1/1 | 929/929 | 29/29 | 93416/93416 | 32/33 |
| group.* | group.properties.country isNull | IDENTICAL | 1/1 | 2295/2295 | 77/77 | 93416/93416 | 30/30 |
| group.* | group.name startsWith | IDENTICAL | 1/1 | 138/138 | 2/2 | 93416/93416 | 27/33 |
| group.* | group.name endsWith | IDENTICAL | 1/1 | 357/357 | 13/13 | 93416/93416 | 30/29 |
| group.* | group.name doesNotContain | IDENTICAL | 1/1 | 2120/2120 | 68/68 | 93416/93416 | 32/28 |
| group.* | group.name regex | IDENTICAL | 1/1 | 733/733 | 24/24 | 93416/93416 | 28/27 |
| has_profile | has_profile true | IDENTICAL | 1/1 | 2841/2841 | 91/91 | 81866/81866 | 25/16 |
| has_profile | has_profile false | IDENTICAL | 1/1 | 74044/74044 | 22892/22892 | 90057/90057 | 26/18 |
| cohort | inCohort (cohort_members is empty in the prod copy) | IDENTICAL | 1/1 | 0/0 | 0/0 | 0/0 | 8/8 |
| cohort | notInCohort | IDENTICAL | 1/1 | 76885/76885 | 22983/22983 | 229305/229305 | 15/23 |
| cohort | inCohort with eventsAlias | IDENTICAL | 1/1 | 0/0 | 0/0 | 0/0 | 7/11 |
| cohort | inCohort with no cohort ids is dropped | IDENTICAL (no clause emitted) | – | – | – | – | – |
| typed cast | number is on a property | IDENTICAL | 1/1 | 8/8 | 4/4 | 16381/16381 | 17/15 |
| typed cast | number gt on a property | IDENTICAL | 1/1 | 1157/1157 | 529/529 | 81866/81866 | 22/19 |
| typed cast | number gte on a top-level column | IDENTICAL | 1/1 | 869/869 | 702/702 | 90057/90057 | 27/22 |
| typed cast | number isNot on a property (AND joiner) | IDENTICAL | 1/1 | 1157/1157 | 529/529 | 81866/81866 | 22/23 |
| typed cast | boolean is on a property | IDENTICAL | 1/1 | 54159/54159 | 22983/22983 | 90057/90057 | 29/27 |
| typed cast | date gte on created_at | IDENTICAL | 1/1 | 64656/64656 | 20059/20059 | 73676/73676 | 31/18 |
| typed cast | datetime lt on created_at | IDENTICAL | 1/1 | 12229/12229 | 2946/2946 | 24568/24568 | 10/9 |
| typed cast | number is on a wildcard array | IDENTICAL | 1/1 | 62/62 | 26/26 | 73674/73674 | 22/19 |
| typed cast | number is with a numeric (not string) value | IDENTICAL | 1/1 | 8/8 | 4/4 | 16381/16381 | 13/10 |
| typed cast | boolean is with a real boolean value | IDENTICAL | 1/1 | 54159/54159 | 22983/22983 | 90057/90057 | 26/33 |
| typed cast | number is with a null value (NULL keyword) | IDENTICAL | 1/1 | 0/0 | 0/0 | 0/0 | 7/5 |
| typed cast | number gte on a group property | IDENTICAL | 1/1 | 929/929 | 29/29 | 93416/93416 | 29/35 |
| sessions scope | bare entry_path is (no top-level allowlist) | **IDENTICAL ERROR** | – | – | – | – | 6/5 |
| sessions scope | utm_source stays a top-level column | IDENTICAL | 1/1 | 19/19 | 19/19 | 65436/65436 | 24/18 |
| sessions scope | camelCase alias on sessions | IDENTICAL | 1/1 | 19107/19107 | 18877/18877 | 65436/65436 | 16/13 |
| multiple filters | three filters joined with AND | IDENTICAL | 1/1 | 24996/24996 | 12289/12289 | 90057/90057 | 23/24 |
`rows_read` and wall time differ run to run and between an inline literal and
a bound param — recorded, not chased (recipe, *Proof-file template*).

## Rendered statements, one per branch

Every compiled clause below was produced by CALLING the two compilers, not
retyped. Each pair is reproducible with `curl` (see *Reproducing a case*).

### top-level column

**top-level column — is (single value)** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **3066/3066**; uniq V1/V2 = **986/986**; rows_read V1/V2 = 90057/90057; wall V1/V2 = 29 ms / 21 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "path", "operator": "is", "value": ["/"]}]
-- V1 clause
path = '/'
-- V2 clause
path = {p1:String}
-- V2 clause params: {"p1": "/"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (path = '/')
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (path = {p1:String})
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "/"}
```

### properties.*

**properties.* — is (single value)** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **1084/1084**; uniq V1/V2 = **360/360**; rows_read V1/V2 = 81866/81866; wall V1/V2 = 18 ms / 18 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "properties.__title", "operator": "is", "value": ["Secure Privacy Consent Management Platform"]}]
-- V1 clause
properties['__title'] = 'Secure Privacy Consent Management Platform'
-- V2 clause
properties['__title'] = {p1:String}
-- V2 clause params: {"p1": "Secure Privacy Consent Management Platform"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (properties['__title'] = 'Secure Privacy Consent Management Platform')
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (properties['__title'] = {p1:String})
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "Secure Privacy Consent Management Platform"}
```

### properties.__query.*

**properties.__query.* — bare utm_source routed into the __query map** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **41/41**; uniq V1/V2 = **20/20**; rows_read V1/V2 = 49113/49113; wall V1/V2 = 12 ms / 18 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "utm_source", "operator": "is", "value": ["chatgpt.com"]}]
-- V1 clause
properties['__query.utm_source'] = 'chatgpt.com'
-- V2 clause
properties['__query.utm_source'] = {p1:String}
-- V2 clause params: {"p1": "chatgpt.com"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (properties['__query.utm_source'] = 'chatgpt.com')
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (properties['__query.utm_source'] = {p1:String})
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "chatgpt.com"}
```

### profile.properties.*

**profile.properties.* — is (single value)** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **42927/42927**; uniq V1/V2 = **13651/13651**; rows_read V1/V2 = 401033/401033; wall V1/V2 = 109 ms / 82 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "profile.properties.country", "operator": "is", "value": ["US"]}]
-- V1 clause
profile.properties['country'] = 'US'
-- V2 clause
profile.properties['country'] = {p1:String}
-- V2 clause params: {"p1": "US"}
-- V1 statement
SELECT count() AS c, uniq(e.profile_id) AS u FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = 'secure-privacy') AS profile ON profile.id = e.profile_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') AND (profile.properties['country'] = 'US')
-- V2 statement
SELECT count() AS c, uniq(e.profile_id) AS u FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = {w1:String}) AS profile ON profile.id = e.profile_id WHERE e.project_id = {w1:String} AND e.created_at >= toDateTime({w2:String}) AND e.created_at < toDateTime({w3:String}) AND (profile.properties['country'] = {p1:String})
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "US"}
```

### wildcard array

**wildcard array — is** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **41/41**; uniq V1/V2 = **20/20**; rows_read V1/V2 = 49113/49113; wall V1/V2 = 13 ms / 14 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "properties.__query[*]", "operator": "is", "value": ["chatgpt.com"]}]
-- V1 clause
arrayExists(x -> x = 'chatgpt.com', arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.%'))))
-- V2 clause
arrayExists(x -> x = {p1:String}, arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.%'))))
-- V2 clause params: {"p1": "chatgpt.com"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(x -> x = 'chatgpt.com', arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.%')))))
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (arrayExists(x -> x = {p1:String}, arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.%')))))
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "chatgpt.com"}
```

### trailing .* wildcard

**trailing .* wildcard — properties.__query.* is (V1 defect: not a wildcard)** — IDENTICAL ERROR; wall V1/V2 = 4 ms / 4 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "properties.__query.*", "operator": "is", "value": ["chatgpt.com"]}]
-- V1 clause
arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.*'))) = 'chatgpt.com'
-- V2 clause
arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.*'))) = {p1:String}
-- V2 clause params: {"p1": "chatgpt.com"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.*'))) = 'chatgpt.com')
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.*'))) = {p1:String})
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "chatgpt.com"}
```

Both sides fail with the same ClickHouse error:

```
V1: Array does not start with '[' character: while converting 'chatgpt.com' to Array(String): while executing function equals on arguments arrayMap(x String -> trim
V2: Array does not start with '[' character: while converting 'chatgpt.com' to Array(String): while executing function equals on arguments arrayMap(x String -> trim
```

### group.*

**group.* — group.type is** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **997/997**; uniq V1/V2 = **31/31**; rows_read V1/V2 = 93416/93416; wall V1/V2 = 32 ms / 34 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "group.type", "operator": "is", "value": ["company"]}]
-- V1 clause
_g.type = 'company'
-- V2 clause
_g.type = {p1:String}
-- V2 clause params: {"p1": "company"}
-- V1 statement
SELECT count() AS c, uniq(e.profile_id) AS u FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') AS _g ON _g.id = _group_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') AND (_g.type = 'company')
-- V2 statement
SELECT count() AS c, uniq(e.profile_id) AS u FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {w1:String}) AS _g ON _g.id = _group_id WHERE e.project_id = {w1:String} AND e.created_at >= toDateTime({w2:String}) AND e.created_at < toDateTime({w3:String}) AND (_g.type = {p1:String})
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "company"}
```

### has_profile

**has_profile — has_profile true** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **2841/2841**; uniq V1/V2 = **91/91**; rows_read V1/V2 = 81866/81866; wall V1/V2 = 25 ms / 16 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "has_profile", "operator": "is", "value": ["true"]}]
-- V1 clause
profile_id != device_id
-- V2 clause
profile_id != device_id
-- V2 clause params: {}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (profile_id != device_id)
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (profile_id != device_id)
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00"}
```

### cohort

**cohort — inCohort (cohort_members is empty in the prod copy)** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **0/0**; uniq V1/V2 = **0/0**; rows_read V1/V2 = 0/0; wall V1/V2 = 8 ms / 8 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "profile", "operator": "inCohort", "value": [], "cohortIds": ["11111111-1111-1111-1111-111111111111"]}]
-- V1 clause
profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('11111111-1111-1111-1111-111111111111') AND project_id = 'secure-privacy')
-- V2 clause
profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN {p1:Array(String)} AND project_id = {p2:String})
-- V2 clause params: {"p1": ["11111111-1111-1111-1111-111111111111"], "p2": "secure-privacy"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('11111111-1111-1111-1111-111111111111') AND project_id = 'secure-privacy'))
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN {p1:Array(String)} AND project_id = {p2:String}))
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": ["11111111-1111-1111-1111-111111111111"], "p2": "secure-privacy"}
```

### typed cast

**typed cast — number is on a property** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **8/8**; uniq V1/V2 = **4/4**; rows_read V1/V2 = 16381/16381; wall V1/V2 = 17 ms / 15 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "properties.__query.adid", "operator": "is", "value": ["0"], "type": "number"}]
-- V1 clause
(toFloat64OrNull(toString(properties['__query.adid'])) = toFloat64OrNull(toString('0')))
-- V2 clause
(toFloat64OrNull(toString(properties['__query.adid'])) = toFloat64OrNull(toString({p1:String})))
-- V2 clause params: {"p1": "0"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND ((toFloat64OrNull(toString(properties['__query.adid'])) = toFloat64OrNull(toString('0'))))
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND ((toFloat64OrNull(toString(properties['__query.adid'])) = toFloat64OrNull(toString({p1:String}))))
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "0"}
```

### sessions scope

**sessions scope — bare entry_path is (no top-level allowlist)** — IDENTICAL ERROR; wall V1/V2 = 6 ms / 5 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "path", "operator": "is", "value": ["/"]}]
-- V1 clause
path = '/'
-- V2 clause
path = {p1:String}
-- V2 clause params: {"p1": "/"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM sessions FINAL WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (path = '/')
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM sessions FINAL WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (path = {p1:String})
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "/"}
```

Both sides fail with the same ClickHouse error:

```
V1: Unknown expression or function identifier `path` in scope SELECT count() AS c, uniq(profile_id) AS u FROM sessions FINAL WHERE (project_id = 'secure-privacy') A
V2: Unknown expression or function identifier `path` in scope SELECT count() AS c, uniq(profile_id) AS u FROM sessions FINAL WHERE (project_id = 'secure-privacy') A
```

### multiple filters

**multiple filters — three filters joined with AND** — IDENTICAL; rows V1/V2 = 1/1; count V1/V2 = **24996/24996**; uniq V1/V2 = **12289/12289**; rows_read V1/V2 = 90057/90057; wall V1/V2 = 23 ms / 24 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- filter input: [{"name": "path", "operator": "startsWith", "value": ["/blog"]}, {"name": "country", "operator": "is", "value": ["US"]}, {"name": "properties.__title", "operator": "contains", "value": ["Privacy"]}]
-- V1 clause
(path LIKE '/blog%') AND country = 'US' AND (properties['__title'] LIKE '%Privacy%')
-- V2 clause
(path LIKE {p1:String}) AND country = {p2:String} AND (properties['__title'] LIKE {p3:String})
-- V2 clause params: {"p1": "/blog%", "p2": "US", "p3": "%Privacy%"}
-- V1 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND ((path LIKE '/blog%') AND country = 'US' AND (properties['__title'] LIKE '%Privacy%'))
-- V2 statement
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND ((path LIKE {p1:String}) AND country = {p2:String} AND (properties['__title'] LIKE {p3:String}))
-- V2 statement params: {"w1": "secure-privacy", "w2": "2026-07-01 00:00:00", "w3": "2026-07-08 00:00:00", "p1": "/blog%", "p2": "US", "p3": "%Privacy%"}
```
## The three compile-time equivalences

These emit no clause on either side, so there is nothing to execute — the
evidence is that both compilers return an empty record for the same input.

| case | V1 keys | V2 keys |
|---|---|---|
| top-level column — unknown column is dropped | `[]` | `[]` |
| top-level column — empty value array with a value operator is dropped | `[]` | `[]` |
| cohort — inCohort with no cohort ids is dropped | `[]` | `[]` |

## IDENTICAL ERROR cases — V1 defects reproduced, not fixed

- **trailing .* wildcard — properties.__query.* is (V1 defect: not a wildcard)**
  - V1: `Array does not start with '[' character: while converting 'chatgpt.com' to Array(String): while executing function equals on arguments arrayMap(x String -> trim`
  - V2: `Array does not start with '[' character: while converting 'chatgpt.com' to Array(String): while executing function equals on arguments arrayMap(x String -> trim`
- **trailing .* wildcard — properties.__query.* isNotNull**
  - V1: `Array does not start with '[' character: while converting '' to Array(String): while executing function notEquals on arguments arrayMap(x String -> trimBoth(x),`
  - V2: `Array does not start with '[' character: while converting '' to Array(String): while executing function notEquals on arguments arrayMap(x String -> trimBoth(x),`
- **sessions scope — bare entry_path is (no top-level allowlist)**
  - V1: `Unknown expression or function identifier `path` in scope SELECT count() AS c, uniq(profile_id) AS u FROM sessions FINAL WHERE (project_id = 'secure-privacy') A`
  - V2: `Unknown expression or function identifier `path` in scope SELECT count() AS c, uniq(profile_id) AS u FROM sessions FINAL WHERE (project_id = 'secure-privacy') A`
The first two are the trailing-`.*` branch: `getSelectPropertyKey` treats
`properties.__query.*` as a literal map-key pattern rather than a wildcard, so
the compiler emits an `Array(String)` expression compared against a scalar. The
third is the sessions scope, where V1 skips the top-level-column allowlist —
`path` is not a `sessions` column, so both sides reach ClickHouse and both are
rejected. All three are pre-existing V1 behaviour and are reproduced, not fixed.

## `rewriteProfilePropertyRefs` — where the rewrite happens now

V1 ran the rewrite over finished TEXT: `sql.ts` and `funnel.sql.ts` called
`compiledTextWithProfileRefs(clause, keys)` on the compiler's string. With the
compiler returning fragments there is no string to rewrite, so the rewrite moved
to `compiled.ts`'s `fragmentWithProfileRefs(fragment, keys)`, which maps
`rewriteProfilePropertyRefs` over `fragment.strings` — **the literal parts
only** — and recurses into nested fragments, leaving every `SqlParam`
untouched. **It never runs on params.**

That is the same rewrite, and now it is the same rewrite *by construction*.
`compiled.ts` recorded why the text version was safe: an escaped literal cannot
contain `['`, so the rewrite never matched a value. A bound param is not in the
text at all, so it cannot match even in principle — the accident became an
invariant. Callers: `sql.ts:358` and `funnel.sql.ts:149`.
`compiledTextWithProfileRefs` survives for the ONE thing still rendering text,
the field resolver (`sql.ts:332`, `funnel.sql.ts:180`).

Two proof cases exercise it end to end against the narrowed profile CTE — the
wrapper selects ``properties['country'] as `profile.properties.country` `` and
``properties['device'] as `profile.properties.device` `` exactly as
`profilePropertiesCteSelect` does, so the rewritten ref has to resolve or the
query fails with UNKNOWN_IDENTIFIER:

- `profile.properties.* / is + rewriteProfilePropertyRefs narrows the ref` —
  keys `['country']`, 42,927 rows on both sides.
- `profile.properties.* / contains + rewriteProfilePropertyRefs (the value keeps
  its own text)` — keys `['device']`, value `'deskto'`, 70,431 rows on both
  sides. The value contains no `['`, but the point is structural: it is in
  `query_params`, not in the statement, so the rewrite pass cannot reach it.

The two un-narrowed `profile.properties.*` cases (`is (single value)`,
`multi value -> IN`) run against the full-Map CTE with no rewrite, and are
identical too — so both halves of the narrowing switch are covered.

## IN / GLOBAL IN — unchanged in both directions

The rule (recipe, *Traps 2*; `docs/ENVIRONMENT.md`): a conversion changes the
binding of values and nothing about distribution semantics. The two places
`filter-where.ts` emits `IN` against a `Distributed` table are the cohort
branches, and both are still plain `IN`, as V1 wrote them.

```
$ git diff -U0 | grep -nE '^[+-].*(\bGLOBAL +IN\b|\bGLOBAL +JOIN\b)'
310:+      // change IN/GLOBAL IN in either direction (docs/ENVIRONMENT.md).
```

The only line in the whole diff that mentions `GLOBAL IN` is the comment saying
it was not touched. No `GLOBAL` was added and none was removed.

The multi-value `IN (...)` list forms became `IN {pN:Array(String)}` (recipe
idiom 9) — a value list, not a subquery, so it carries no distribution
question. The cohort subselect kept its parentheses and its `IN`:

```sql
-- V1
profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('1111...') AND project_id = 'secure-privacy')
-- V2
profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN {p1:Array(String)} AND project_id = {p2:String})
```

## The `null` binding

`sqlstring.escape(null)` produced the SQL keyword `NULL`. `sql.string(null)`
would bind a `String` param, which ClickHouse parses as the **empty string** —
so the typed-cast path binds through `sql.nullable('String', null)`
(`filter-cast.ts`, `typedValueParam`). Measured against local ClickHouse
26.1.3.52, 2026-09-07:

```bash
curl -s -G 'http://127.0.0.1:8123/' --data-urlencode 'database=openpanel' \
  --data-urlencode 'default_format=JSONCompact' --data-urlencode 'param_p1=\N' \
  --data-urlencode "query=SELECT toFloat64OrNull(toString({p1:Nullable(String)})) AS v2, isNull(toFloat64OrNull(toString({p1:Nullable(String)}))) AS v2_isnull, toFloat64OrNull(toString(NULL)) AS v1, isNull(toFloat64OrNull(toString(NULL))) AS v1_isnull"
-- [[null,1,null,1]]

curl -s -G 'http://127.0.0.1:8123/' --data-urlencode 'database=openpanel' \
  --data-urlencode 'default_format=JSONCompact' --data-urlencode 'param_p1=\N' \
  --data-urlencode "query=SELECT {p1:String} AS as_string, isNull({p1:Nullable(String)}) AS as_nullable_isnull"
-- [["",1]]
```

V1's `NULL` and V2's `{p:Nullable(String)}` are both NULL; a plain `String` param
would have been `''`. The `typed cast / number is with a null value` proof case
returns 0 rows on both sides and always will — a comparison against NULL is
never true — so the binding probe above is what actually proves that branch;
the case proves the two statements agree.

The untyped branches never see a raw `null`: V1 wrote `String(val).trim()`, so a
`null` value becomes the four-character string `'null'`. The `top-level column /
null in the value array` case pins that (`path IN ('null','/')` vs
`path IN {p:Array(String)}` with `["null","/"]`, 3,066 rows both sides).

## Consumer conversion: referrer-spikes.ts (clix → sql)

Not in the task's consumer list, and forced by it: `getRawWhereClause` returns a
fragment carrying params, and clix's `execute()` (`query-builder.ts:552`) has no
`query_params` slot to carry them — it passes only `query` and
`clickhouse_settings`. `packages/db` is outside this task's scope, so the three
clix queries in `modules/insight/src/referrer-spikes.ts` moved onto the tag
instead. clix always sent `session_timezone` (`query-builder.ts:562`); `chQuery`
gets the same value, and `.transform({ date })` became the same per-row map in
JS. clix's `toStartOf` ignores its timezone argument (`query-builder.ts:717-734`),
so `bucketStart` emits the same expression.

Both sides were run through the REAL functions — V1 materialised from HEAD with
its `overviewService` import pointed at HEAD's `getRawWhereClause`, V2 as
committed — behind a recording ClickHouse client that still executes and returns
the real response, so no statement here was retyped. Filters:
`[{name:'country',operator:'is',value:['US']}]`, project `secure-privacy`,
window `2026-07-01` … `2026-07-08`, interval `day`, `session_timezone=UTC` on
both sides. Queries 2 and 3 race inside `Promise.all`, so they are matched by
shape, not by recording order. `getReferrerSpikes`'s own return value is
byte-identical between the two (`JSON.stringify(v1) === JSON.stringify(v2)`).

**topReferrers** — IDENTICAL; rows V1/V2 = 8/8; rows_read V1/V2 = 65436/65436; wall V1/V2 = 37 ms / 12 ms; `meta` identical ([{"name": "referrer_name", "type": "String"}, {"name": "total", "type": "Int64"}]); clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT referrer_name, sum(sign) AS total FROM sessions FINAL WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-01 00:00:00') AND toDateTime('2026-07-08 00:00:00') AND referrer_name != '' AND referrer_name IS NOT NULL AND country = 'US' GROUP BY referrer_name HAVING sum(sign) >= 10 ORDER BY total DESC LIMIT 50
-- V2
SELECT referrer_name, sum(sign) AS total FROM sessions FINAL WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) AND referrer_name != '' AND referrer_name IS NOT NULL AND country = {p4:String} GROUP BY referrer_name HAVING sum(sign) >= {p5:UInt64} ORDER BY total DESC LIMIT {p6:UInt64}
-- V2 params: {"p1": "secure-privacy", "p2": "2026-07-01 00:00:00", "p3": "2026-07-08 00:00:00", "p4": "US", "p5": 10, "p6": 50}
```

**perBucketSessions** — IDENTICAL; rows V1/V2 = 47/47; rows_read V1/V2 = 65436/65436; wall V1/V2 = 13 ms / 12 ms; `meta` identical ([{"name": "date", "type": "DateTime"}, {"name": "referrer_name", "type": "String"}, {"name": "sessions", "type": "Int64"}]); clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT toStartOfDay(created_at) AS date, referrer_name, sum(sign) AS sessions FROM sessions FINAL WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-01 00:00:00') AND toDateTime('2026-07-08 00:00:00') AND referrer_name IN ('Google', 'https://www.bwtrailerhitches.com', 'https://www.kingandprince.com', 'https://www.propper.com', 'Bing', 'DuckDuckGo', 'Twitter', 'https://www.packetsofhope.com') AND country = 'US' GROUP BY date, referrer_name HAVING sum(sign) > 0 ORDER BY date ASC
-- V2
SELECT toStartOfDay(created_at) AS date, referrer_name, sum(sign) AS sessions FROM sessions FINAL WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) AND referrer_name IN {p4:Array(String)} AND country = {p5:String} GROUP BY date, referrer_name HAVING sum(sign) > 0 ORDER BY date ASC
-- V2 params: {"p1": "secure-privacy", "p2": "2026-07-01 00:00:00", "p3": "2026-07-08 00:00:00", "p4": ["Google", "https://www.bwtrailerhitches.com", "https://www.kingandprince.com", "https://www.propper.com", "Bing", "DuckDuckGo", "Twitter", "https://www.packetsofhope.com"], "p5": "US"}
```

**bucketTotals** — IDENTICAL; rows V1/V2 = 7/7; rows_read V1/V2 = 65436/65436; wall V1/V2 = 14 ms / 10 ms; `meta` identical ([{"name": "date", "type": "DateTime"}, {"name": "total", "type": "Int64"}]); clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT toStartOfDay(created_at) AS date, sum(sign) AS total FROM sessions FINAL WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-01 00:00:00') AND toDateTime('2026-07-08 00:00:00') AND country = 'US' GROUP BY date HAVING sum(sign) > 0
-- V2
SELECT toStartOfDay(created_at) AS date, sum(sign) AS total FROM sessions FINAL WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) AND country = {p4:String} GROUP BY date HAVING sum(sign) > 0
-- V2 params: {"p1": "secure-privacy", "p2": "2026-07-01 00:00:00", "p3": "2026-07-08 00:00:00", "p4": "US"}
```
## `compiledText` callers left

Every `compiledText(` / `compiledTextWithProfileRefs(` call that wrapped a
`getEventFiltersWhereClause` result is gone — `sql.ts` (two sites),
`funnel.sql.ts`, `retention.sql.ts`, `conversion.sql.ts` (via `stepCondition`),
`sankey.sql.ts` (via `sessionEventCte`) and `overview.sql.ts` (via `rawWhere`)
all interpolate the fragment directly now. What remains wraps **only**
field-resolution output or a static SQL literal — M12-003's job — plus
`filter-where.ts`'s own two calls into the field resolver:

| file:line | what it wraps |
|---|---|
| `packages/core/src/modules/chart/src/filter-where.ts:144` | `getGroupPropertySql(name)` — field resolver |
| `packages/core/src/modules/chart/src/filter-where.ts:243` | `getSelectPropertyKey(...)` — field resolver |
| `packages/core/src/modules/chart/src/sql.ts:178` | a CTE name (static) |
| `packages/core/src/modules/chart/src/sql.ts:282` | a select-field list built from field-resolution output |
| `packages/core/src/modules/chart/src/sql.ts:332` | `spliced` — field resolver + profile-ref rewrite |
| `packages/core/src/modules/chart/src/sql.ts:348` | a cohort CTE name (static) |
| `packages/core/src/modules/chart/src/sql.ts:442` | a `label_N` alias (static) |
| `packages/core/src/modules/chart/src/sql.ts:443` | a `label_N` alias (static) |
| `packages/core/src/modules/chart/src/sql.ts:476` | a math aggregate name (closed set) |
| `packages/core/src/modules/chart/src/sql.ts:587` | a `label_N` alias (static) |
| `packages/core/src/modules/chart/src/sql.ts:691` | field-resolution select expression |
| `packages/core/src/modules/chart/src/sql.ts:700` | field-resolution select expression |
| `packages/core/src/modules/chart/src/sql.ts:713` | field-resolution select expression |
| `packages/core/src/modules/chart/src/sql.ts:797` | `getSelectPropertyKey(...)` — field resolver |
| `packages/core/src/modules/chart/src/funnel.sql.ts:79` | `STRICT_INCREASE_MODE` (static) |
| `packages/core/src/modules/chart/src/funnel.sql.ts:180` | `getSelectPropertyKey(...)` — field resolver |
| `packages/core/src/modules/chart/src/funnel.sql.ts:189` | a `b_N` alias (static) |
| `packages/core/src/modules/chart/src/funnel.sql.ts:303` | a `b_N` alias (static) |
| `packages/core/src/modules/chart/src/funnel.sql.ts:310` | a profile column list (`sql.id`-validated upstream) |
| `packages/core/src/modules/chart/src/funnel.sql.ts:323` | `buildInlineCohortJoin(...)` — field resolver |
| `packages/core/src/modules/chart/src/funnel.sql.ts:362` | a `b_N` alias (static) |
| `packages/core/src/modules/chart/src/funnel.sql.ts:387` | a `b_N` normalisation expression (static) |
| `packages/core/src/modules/chart/src/conversion.sql.ts:116` | a `b_N` alias (static) |
| `packages/core/src/modules/chart/src/conversion.sql.ts:131` | field-resolution breakdown selects |
| `packages/core/src/modules/chart/src/conversion.sql.ts:135` | field-resolution breakdown expressions |
| `packages/core/src/modules/chart/src/conversion.sql.ts:151` | `buildInlineCohortJoin(...)` — field resolver |
| `packages/core/src/modules/chart/src/retention.sql.ts:170` | `SQL_START_OF[interval]` (closed set) |
| `packages/core/src/modules/chart/src/retention.sql.ts:171` | an interval unit (closed set) |
| `packages/core/src/modules/chart/src/retention.sql.ts:172` | `COUNT_CRITERIA[criteria]` (closed set) |
| `packages/core/src/modules/chart/src/retention.sql.ts:200` | a numeric column index (static) |
| `packages/core/src/modules/chart/src/retention.sql.ts:206` | a numeric column index (static) |
| `packages/core/src/modules/chart/src/sankey.sql.ts:28` | `DEDUPE_CONSECUTIVE` (static) |
| `packages/core/src/modules/chart/src/sankey.sql.ts:38` | `TRUNCATE_AT_REPEAT` (static) |
| `packages/core/src/modules/chart/src/sankey.sql.ts:48` | `TRANSITION_PAIRS` (static) |
| `packages/core/src/modules/chart/src/sankey.sql.ts:187` | `BETWEEN_SLICE` (static) |
| `packages/core/src/modules/chart/src/sankey.sql.ts:201` | a CTE name (static) |
| `packages/core/src/modules/overview/src/overview.sql.ts:117` | `toIntervalStep(interval)` (closed set) |
| `packages/core/src/modules/overview/src/overview.sql.ts:672` | `getSelectPropertyKey('properties.href')` — field resolver |

(`grep -rn "compiledText" packages/core/src --include=*.ts | grep -v src/compiled.ts`,
2026-09-07, minus the two `import` lines.)

## Tests whose assertion moved from TEXT to statement + params

| test | before | after |
|---|---|---|
| `overview.service / getRawWhereClause (UTM remapping)` › `rewrites utm_* to properties[__query.utm_*] for the events table` | `expect(where).toContain("properties['__query.utm_source']")` on the returned string | same `toContain` on `rendered(...).query`, **plus** `expect(query_params).toEqual({ p1: 'awn' })` |
| … › `keeps utm_* as a top-level column for the sessions table` | `expect(where).toMatch(/(?<![._\w])utm_source\s*=/)` on the string | same `toMatch` on `.query`, **plus** `expect(query_params).toEqual({ p1: 'awn' })` |
| … › `drops non-whitelisted filters` | `expect(where).toBe('')` | `expect(where).toBeNull()` — `joinFilterClauses` returns `null`, not `''` |
| … › `events utm_source filter parses against real events table` | `EXPLAIN` of a string-spliced statement | `EXPLAIN` of `.query` **with `query_params` passed to `ch.command`** — the params now have to bind for the EXPLAIN to pass |
| … › `sessions utm_source filter parses against real sessions table` | as above | as above |

No other test changed what it asserts. `event.sql.test.ts`,
`profile.sql.test.ts` and `session.sql.test.ts` keep their expected SQL text
byte-for-byte; only their `filterClauses` INPUT fixtures moved from
`{ f0: "(path = '/')" }` to `compiledFilterClauses({ f0: "(path = '/')" })`,
because `CompiledFilterClauses` is now `Record<string, SqlFragment>` while
`buildFilterWhere` (M12-003) still returns text. `overview.sql.test.ts` moved
its `rawFilterWhere: ''` fixtures to `rawFilterWhere: null` for the same reason.
`sql.test.ts` and `funnel.sql.test.ts` are untouched — they assert on
column expressions, which still come from the field resolver.

## Reproducing a case

Every statement above runs as written. V1:

```bash
curl -s 'http://127.0.0.1:8123/?database=openpanel&session_timezone=UTC&default_format=JSONCompact' \
  --data-binary "SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (path = '/')"
```

V2 — bind each `{pN:...}` / `{wN:...}` as `param_pN=` / `param_wN=`:

```bash
curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=UTC' \
  --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode 'param_w1=secure-privacy' \
  --data-urlencode 'param_w2=2026-07-01 00:00:00' \
  --data-urlencode 'param_w3=2026-07-08 00:00:00' \
  --data-urlencode 'param_p1=/' \
  --data-urlencode "query=SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (path = {p1:String})"
```

Both return `[[3066,986]]`.

## Goldens

`verification/golden/compare.sh` against the harness (`verification/harness
start`, api and worker both V2), run 2026-09-07 on this box after
`apps/api pnpm run e2e:sessions`:

```
target:  http://127.0.0.1:3333
golden:  http://127.0.0.1:3333 @ 2026-09-07T02:43:29Z
passed:  137/137
OK: zero diffs
```

**137/137, zero diffs, and no `stale:` line** — every one of the 137 cases
compared; none was skipped for a rolled UTC day. `full.sh` re-ran the whole
manifest against a freshly started harness later in the same session and
reported `passed: 137/137` / `OK: zero diffs` again.

The known unstable case, `insights-event-property-values`, passed in both runs.
It reads `event_property_values_mv` — an `AggregatingMergeTree` whose `ORDER BY`
does not include `created_at`, queried `ORDER BY created_at DESC LIMIT 200`, so
its top-200 reshuffles whenever a background merge lands. It is not in this
task's path either way: it is served by `eventPropertyValuesQuery`
(`packages/core/src/modules/event/src/event.sql.ts`), which imports no filter
compiler and is not in this diff.

## Verification run

All commands run in `/home/deploy/openpanel` on 2026-09-07 against the tree as
committed. `verification/` paths are in `/home/deploy/rewrite-openpanel`.

| command | result |
|---|---|
| `pnpm run typecheck` | green — every workspace `Done` |
| `cd packages/core && bun test` | `1469 pass, 12 skip, 0 fail`, 4760 expect() calls, 1481 tests across 153 files |
| `pnpm test` (`bun test --isolate` at the root) | `1469 pass, 12 skip, 0 fail`, 1481 tests across 153 files |
| `pnpm run check:deps` | `no dependency violations found (2271 modules, 9839 dependencies cruised)` |
| `bash tooling/gates/p12-grep-gates.sh --report` | TOTAL `sqlstring 115 / clix 73 / sql-builder 6` (baseline `168 / 77 / 6`); `filter-where.ts` no longer appears in the table at all |
| `test -f packages/core/src/modules/chart/src/filter-where.sql.proof.md` | present (this file) |
| `verification/harness start` | `OK: api ready on :3333 (3s)` / `OK: worker ready on :9999 (3s)`, both V2 |
| `cd apps/api && timeout 900 pnpm run e2e:sessions` | **29/29 checks passed** |
| `verification/golden/compare.sh` | **`passed: 137/137`**, `OK: zero diffs`, no stale |
| `verification/harness stop` | `OK: api stopped` / `OK: worker stopped` |
| `verification/full.sh` | **`FULL: green`, RC=0** — 22 `OK:` stages, zero `FAIL:`, zero `BLOCKED`; includes forbidden-patterns, install, typecheck api + start, `pnpm test`, golden seed, harness, `golden/compare.sh` 137/137, `contracts/auth`, `contracts/sdk` (incl. the dist gate), `golden/openapi v2-diff` |

### Gate movement

`sqlstring` dropped by 53 — all of `filter-where.ts`, which leaves the table
with 0 in every column. `clix` dropped by 4: `referrer-spikes.ts`, converted
because the fragment's params cannot cross clix's `execute()` — see *Consumer
conversion* above. Nothing else moved; `sql-builder` is unchanged at 6.

### Lint

`npx ultracite check` on the 25 changed `.ts` files reports 4 errors, all
pre-existing: the identical 4 fire on the same two files restored from HEAD
(`overview.service.ts` `useConsistentTypeDefinitions` at HEAD:98 / here:101 and
`noUnusedVariables` at HEAD:45 / here:48; two `noMisplacedAssertion` in
`overview-raw-where.sql.test.ts`, where Biome does not recognise the file's
`itCH(...)` wrapper as a test call, at HEAD:95,108 / here:115,131). Only the
line numbers move. No new lint debt.
