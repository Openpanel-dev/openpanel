# organization.service.ts — V1 → V2 result-set proof (M12-006)

Every ClickHouse statement `packages/core/src/modules/organization/organization.service.ts`
runs, executed V1 against V2. V1 is the file at commit `78098bdc`
(`git show HEAD:packages/core/src/modules/organization/organization.service.ts`),
which builds four counters with `createSqlBuilder` + `sqlstring.escape` and
`deleteFromClickhouse`'s filter with `sqlstring.escape`; V2 is the converted
file, every value bound as a `{pN:Type}` param. **Both files were imported into
one Bun process and called with the same inputs** — the SQL below was produced
by calling the real exported functions with a `deps.ch.query` / `deps.ch.command`
stub that captures `{query, query_params, clickhouse_settings}`, never by
retyping V1 by hand. Each captured statement was then executed through the local
HTTP interface at `format: 'JSON'` with the settings its own side asked for; V1
went as `query`, V2 as `query` + `param_pN`. `data` was compared row-for-row and
`meta` column-for-column.

No case needed set comparison: the four counters return one row or a fully
ordered `WITH FILL` series.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,850,903 events. Organization
  fixture: two projects, `verdict` (real: 41,921,451 non-session events) and
  `o'brien-prod` (**does not exist** — it is the quote-carrying value, present
  so the escaping case is covered; its contribution to every count is 0 on both
  sides). Billing window `2026-08-01 00:00:00` … `2026-08-20 00:00:00`, inside
  the copy's `2026-07-01` … `2026-08-25` range. Every SELECT case below returns
  a non-zero count.
- **Deletes run elsewhere, deliberately.** `deleteFromClickhouse` issues 14
  `DELETE` / `ALTER TABLE … DELETE` statements. Running those against the
  prod-copy would mutate the golden harness's data, so both sides were executed
  against a scratch database `m12_006_proof` holding 14 tables that carry only
  the column the statements filter on, seeded identically per side and dropped
  at the end of the run. §*deleteFromClickhouse* records the row counts.
- **Machine**: single-node ClickHouse 26.1.3.52 on this box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). **No `IN` / `GLOBAL IN` was changed in either
  direction.** `grep -c GLOBAL` is `0` on the V1 file and `0` on the V2 file.
  Every `IN` operand on both sides is a literal value list (V1 an inline tuple,
  V2 an `Array(String)` param) — there is no `IN (subquery)` anywhere in this
  module, so the distributed-`IN` trap does not arise.
- **Verdict**: **32 statement pairs, all IDENTICAL** — 18 IDENTICAL (4 counters
  + 14 scratch-database deletes) and 14 IDENTICAL ERROR (the clustered
  rendering, which cannot run on a single node; §*deleteFromClickhouse,
  clustered rendering*).

## `session_timezone`

None of the five statements came off `clix`, so none of them ever sent a
`session_timezone`. V1 sent no `clickhouse_settings` on the four counters and
`{lightweight_deletes_sync: '0'}` on the deletes; V2 sends exactly the same,
captured and compared per statement.

## `getOrganizationBillingEventsCount`

**statement** — IDENTICAL; rows V1/V2 = 1/1; `count` V1/V2 = **15080373/15080373**;
`meta` V1/V2 = `[{"name":"count","type":"UInt64"}]`; rows_read V1/V2 =
16008988/16008988; wall V1/V2 = 232 ms / 204 ms; clickhouse_settings: *(none)*
on both.

```sql
-- V1
SELECT COUNT(*) AS count FROM events e
WHERE project_id IN ('verdict','o\'brien-prod')
  AND created_at BETWEEN '2026-08-01 00:00:00' AND '2026-08-20 00:00:00'
  AND name NOT IN ('session_start', 'session_end')
-- V2
SELECT COUNT(*) AS count FROM events e
WHERE project_id IN {p1:Array(String)}
  AND created_at BETWEEN {p2:String} AND {p3:String}
  AND name NOT IN {p4:Array(String)}
-- V2 params: {"p1":["verdict","o'brien-prod"],"p2":"2026-08-01 00:00:00","p3":"2026-08-20 00:00:00","p4":["session_start","session_end"]}
```

## `getOrganizationEventsCount`

**statement** — IDENTICAL; rows V1/V2 = 1/1; `count` V1/V2 = **41921451/41921451**;
`meta` V1/V2 = `[{"name":"count","type":"UInt64"}]`; rows_read V1/V2 =
44371055/44371055; wall V1/V2 = 358 ms / 340 ms; clickhouse_settings: *(none)*
on both.

```sql
-- V1
SELECT COUNT(*) AS count FROM events e
WHERE project_id IN ('verdict','o\'brien-prod')
  AND name NOT IN ('session_start', 'session_end')
-- V2
SELECT COUNT(*) AS count FROM events e
WHERE project_id IN {p1:Array(String)}
  AND name NOT IN {p2:Array(String)}
-- V2 params: {"p1":["verdict","o'brien-prod"],"p2":["session_start","session_end"]}
```

## `getOrganizationEventsCountSince`

**statement** — IDENTICAL; rows V1/V2 = 1/1; `count` V1/V2 = **18487546/18487546**;
`meta` V1/V2 = `[{"name":"count","type":"UInt64"}]`; rows_read V1/V2 =
19697131/19697131; wall V1/V2 = 248 ms / 259 ms; clickhouse_settings: *(none)*
on both.

`since = 2026-08-01T00:00:00Z`, and `formatClickhouseDate(since, true)` narrows
it to the calendar day `'2026-08-01'` on both sides — kept as a bound `String`
compared against a `DateTime64`, exactly the comparison V1 wrote, not promoted
to `sql.date`.

```sql
-- V1
SELECT COUNT(*) AS count FROM events e
WHERE project_id IN ('verdict','o\'brien-prod')
  AND name NOT IN ('session_start', 'session_end')
  AND created_at >= '2026-08-01'
-- V2
SELECT COUNT(*) AS count FROM events e
WHERE project_id IN {p1:Array(String)}
  AND name NOT IN {p2:Array(String)}
  AND created_at >= {p3:String}
-- V2 params: {"p1":["verdict","o'brien-prod"],"p2":["session_start","session_end"],"p3":"2026-08-01"}
```

## `getOrganizationBillingEventsCountSerie`

**statement** — IDENTICAL; rows V1/V2 = **20/20**; `data` byte-identical
row-for-row (`2026-08-01` → 2852707, `2026-08-02` → 456447, `2026-08-03` → 360613,
`2026-08-04` → 298741, … through `2026-08-20`);
`meta` V1/V2 = `[{"name":"count","type":"UInt64"},{"name":"day","type":"Date"}]`;
rows_read V1/V2 = 16352596/16352596; wall V1/V2 = 269 ms / 455 ms;
clickhouse_settings: *(none)* on both.

This is the case that proves `WITH FILL FROM toDate({pN:String})` is accepted:
`WITH FILL` needs a constant bound, parameters are substituted at parse time, and
the filled series comes back with the same 20 days on both sides.

```sql
-- V1
SELECT COUNT(*) AS count, toDate(toStartOfDay(created_at)) AS day
FROM events e
WHERE project_id IN ('verdict','o\'brien-prod')
  AND day BETWEEN '2026-08-01' AND '2026-08-20'
  AND name NOT IN ('session_start', 'session_end')
GROUP BY day
ORDER BY day WITH FILL FROM toDate('2026-08-01') TO toDate('2026-08-20') STEP INTERVAL 1 DAY
-- V2
SELECT COUNT(*) AS count, toDate(toStartOfDay(created_at)) AS day
FROM events e
WHERE project_id IN {p1:Array(String)}
  AND day BETWEEN {p2:String} AND {p3:String}
  AND name NOT IN {p4:Array(String)}
GROUP BY day
ORDER BY day WITH FILL FROM toDate({p5:String}) TO toDate({p6:String}) STEP INTERVAL 1 DAY
-- V2 params: {"p1":["verdict","o'brien-prod"],"p2":"2026-08-01","p3":"2026-08-20","p4":["session_start","session_end"],"p5":"2026-08-01","p6":"2026-08-20"}
```

V1's `const interval = 'day'` was never anything but `'day'`; V2 writes the
bucket, the alias, the GROUP BY and the `STEP INTERVAL 1 DAY` out instead of
deriving four spellings of it. The emitted text is identical apart from the
bindings, as the two blocks above show.

## `deleteFromClickhouse`, non-clustered rendering (executed)

14 statements per side — 6 `DELETE FROM <t>` and 8 `ALTER TABLE <t> DELETE`,
in `TABLE_NAMES` order — each ending `WHERE project_id IN …;` and each sent with
`clickhouse_settings: {lightweight_deletes_sync: '0'}` on **both** sides.

Executed against scratch database `m12_006_proof`: 14 tables
`(project_id String, n UInt32) ENGINE = MergeTree ORDER BY project_id`, each
seeded with 5 rows — `('verdict',1), ('verdict',2), ('o''brien-prod',3),
('keepme',4), ('keepme',5)`. Each side got a freshly dropped + recreated +
reseeded database; after issuing all 14 statements the run waited for
`system.mutations` to drain and read every table back
`ORDER BY project_id, n`. The scratch database is dropped at the end
(`SELECT count() FROM system.databases WHERE name='m12_006_proof'` → 0).

**statement set** — IDENTICAL; rows before = **70/70**; rows deleted V1/V2 =
**42/42**; rows remaining V1/V2 = **28/28**; the post-delete contents of all 14
tables are byte-identical between the two sides (`[["keepme",4],["keepme",5]]`
in every table). The `o'brien-prod` row is deleted by both sides, which is the
quote-escaping case reaching a row rather than a count.

```sql
-- V1 (first and fifth of the fourteen)
DELETE FROM events WHERE project_id IN ('verdict','o\'brien-prod');
ALTER TABLE cohort_events_mv DELETE WHERE project_id IN ('verdict','o\'brien-prod');
-- V2
DELETE FROM events WHERE project_id IN {p1:Array(String)};
ALTER TABLE cohort_events_mv DELETE WHERE project_id IN {p1:Array(String)};
-- V2 params (every one of the 14): {"p1":["verdict","o'brien-prod"]}
```

## `deleteFromClickhouse`, clustered rendering (IDENTICAL ERROR)

`isClickhouseClustered()` is true unless `SELF_HOSTED` is set, and
`getReplicatedTableName` then appends `ON CLUSTER '{cluster}'` — a clause, not
an identifier, which is why V2 renders it as `sql.id(`${table}_replicated`)`
followed by literal template text rather than through a single identifier.

Both sides' 14 clustered statements were executed as rendered against
`openpanel`. This box has no `*_replicated` table
(`SELECT name FROM system.tables WHERE database='openpanel' AND name LIKE
'%_replicated'` → 0 rows) and no cluster, so all 28 fail — **and they fail
identically, statement for statement**:

| rendering | V1 error | V2 error |
|---|---|---|
| `DELETE FROM <t>_replicated ON CLUSTER '{cluster}' …` (6) | `Code: 60 … UNKNOWN_TABLE` | same |
| `ALTER TABLE <t>_replicated ON CLUSTER '{cluster}' DELETE …` (8) | `Code: 701 … Requested cluster 'openpanel_cluster' not found. (CLUSTER_DOESNT_EXIST)` | same |

The `CLUSTER_DOESNT_EXIST` rows are the load-bearing evidence: the `{cluster}`
macro expanded to `openpanel_cluster` on the V2 side **with `param_p1` supplied**,
so ClickHouse's `{name:Type}` substitution does not disturb the `ON CLUSTER
'{cluster}'` macro. 14 pairs, all IDENTICAL ERROR — V1 defects (well, V1
*environment* limits) reproduced byte-for-byte, not fixed here.

## Tests

No test in this module compares generated SQL text, so none had to be retargeted
to compare statement + params. `organization.service.test.ts` stubs
`deps.ch.command` and asserts only that it was called
(`expect(chCommand).toHaveBeenCalled()`); its assertions are unchanged. The one
edit to that file is its header comment, which described the per-function lazy
dynamic imports this task removed.

## Reproduce

```bash
# getOrganizationBillingEventsCount, V1
curl -s 'http://127.0.0.1:8123/?database=openpanel&default_format=JSONCompact' \
  --data-binary "SELECT COUNT(*) AS count FROM events e WHERE project_id IN ('verdict','o\\'brien-prod') AND created_at BETWEEN '2026-08-01 00:00:00' AND '2026-08-20 00:00:00' AND name NOT IN ('session_start', 'session_end')"

# getOrganizationBillingEventsCount, V2
curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode "param_p1=['verdict','o\\'brien-prod']" \
  --data-urlencode 'param_p2=2026-08-01 00:00:00' \
  --data-urlencode 'param_p3=2026-08-20 00:00:00' \
  --data-urlencode "param_p4=['session_start','session_end']" \
  --data-urlencode 'query=SELECT COUNT(*) AS count FROM events e WHERE project_id IN {p1:Array(String)} AND created_at BETWEEN {p2:String} AND {p3:String} AND name NOT IN {p4:Array(String)}'
```

Both return `[[15080373]]`.
