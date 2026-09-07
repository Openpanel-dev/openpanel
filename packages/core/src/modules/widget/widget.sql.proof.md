# widget.rpc.ts — V1 → V2 result-set proof (M12-008)

Every ClickHouse statement `packages/core/src/modules/widget/widget.rpc.ts`
runs — one in `badge`, five in `realtimeData` — executed V1 against V2 on the
local prod-copy `openpanel`. V1 is the file at commit `68fea1a7`
(`git show HEAD:packages/core/src/modules/widget/widget.rpc.ts`), which builds
all six with `clix`; V2 is the converted file, `projectId` and both `LIMIT`s
bound as `{pN:Type}` params.

**Both routers were imported into one Bun process and driven through
`createCaller`** — the real tRPC procedures, `badge({shareId})` and
`realtimeData({shareId})`, over one stubbed `ctx` (a `shareWidget.findUnique`
returning a public widget, a `project.findUniqueOrThrow` giving
`getSettingsForProject` its organisation timezone, and a `deps.ch.query` stub
that captures `{query, query_params, clickhouse_settings}`). `@openpanel/redis`
was replaced so `getCache` runs its producer instead of answering from cache;
nothing else was mocked, and no statement below was retyped by hand. Each
captured statement was then executed through one HTTP call to `127.0.0.1:8123`
at `format: 'JSON'` with the settings its own side asked for; `data` was
compared row-for-row and `meta` column-for-column.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,851,025 events at the time of the
  run. Project `pincali-production` (14,047,591 events). Nothing is empty here.
- **Reference time**: five of the six statements window on `now()`, and the
  prod copy's application data ends on **2026-08-25 08:49:53**, so the live
  30-minute window is empty by construction. Every statement is therefore run
  **twice**: once exactly as rendered, and once with `now()` textually replaced
  by `toDateTime('2026-08-25 08:49:53')` **on both sides** — the "(frozen now)"
  rows, which are the row-bearing ones (10, 10, 10, 1, 151 rows). The
  as-rendered `minuteCounts` still returns 30 rows because its `WITH FILL`
  synthesises the empty buckets, and the as-rendered `badge` returns a real
  804,374 because its window is 30 **days**. The four as-rendered zero-row
  results are recorded, not counted as evidence.
- **`session_timezone`**: `Europe/Stockholm` on all twelve runs, both sides.
  clix carried its constructor timezone into `clickhouse_settings`
  (`query-builder.ts:562`) and every statement here was built as
  `clix(ch, timezone)` with the project's organisation timezone, so `chQuery`
  is handed the same value. The value itself came from the one stubbed
  `getSettingsForProject`, shared by both sides — what the comparison needs is
  that both sides send the *same* setting, and the capture shows they do.
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). **No `IN` / `GLOBAL IN` was changed in either
  direction**: `git show HEAD:packages/core/src/modules/widget/widget.rpc.ts |
  grep -c GLOBAL` is `0`, `grep -c GLOBAL` on the converted file is `0`, and
  neither version emits an `IN` at all — so no `IN (subquery)` on a
  `Distributed` table arises here.
- **Verdict**: **12 statement pairs, all IDENTICAL.**

## What binds and what does not

- **`projectId` binds** — `{p1:String}` in all six statements. It is the only
  runtime value in the module.
- **`LIMIT 10` binds** — `{p2:UInt64}` on the three top-lists, from the named
  `REALTIME_TOP_LIST_LIMIT`.
- **The `now()` windows stay raw SQL text.** V1 passed them as
  `clix.exp('now() - INTERVAL 30 MINUTE')`, and clix wrapped an `Expression`
  comparand in parentheses (`query-builder.ts:134`), so V2 writes
  `created_at >= (now() - INTERVAL 30 MINUTE)` — parentheses included — into the
  template. A `SETTINGS`/interval operand cannot be a bound param anyway
  (the identifier matrix, `sql.clickhouse.test.ts:241-269`), and there is no
  value here to protect.
- **`!= ''` and `IS NOT NULL` stay literal**, as `referrer-spikes.ts` renders
  them after its own conversion. `''` is a constant in the source, not input.
- **The `WITH FILL FROM … TO … STEP …` clause** is the same raw text clix built
  from three `clix.exp()` arguments (`query-builder.ts:488-491`).
- `clix.toStartOf('created_at','minute')` (`query-builder.ts:719`) is
  `toStartOfMinute(created_at)`, written out.

## Tests

There is no test in the tree that touches the widget module — no
`widget*.test.ts` exists, and nothing else references `widgetRouter` except
`rpc.router.ts`. So no text-comparing test needed retargeting here. The router's
shape, its procedure names, its `protectedProcedure`/`publicProcedure` split and
every response field are untouched by this diff.

## Grep gate

```
$ bash tooling/gates/p12-grep-gates.sh --report
```

| | sqlstring | clix | sql-builder |
|---|---|---|---|
| `widget/widget.rpc.ts` before | 0 | 7 | 0 |
| `widget/widget.rpc.ts` after | **absent from the report (0/0/0)** | | |
| TOTAL before | 16 | 21 | 1 |
| TOTAL after | **16** | **1** | **1** |

The leftovers under `packages/core` are enumerated in
`insight/src/legacy-scan.sql.proof.md` § *still non-zero*; the last `clix` and
`sql-builder` lines in the tree are both `packages/db/index.ts`'s re-exports of
the definer files.

## Reading the case blocks, and reproducing them

`rows V1:` / `rows V2:` are the **first 300 characters** of each side's JSON
`data`, as an eyeball check. The comparison itself was made on the full arrays:
`JSON.stringify(v1.data) === JSON.stringify(v2.data)` and the same on `meta`,
which is what the `IDENTICAL` verdict on each block reports.

Either side of any block is reproducible with one `curl`. V1 goes as the body;
V2 goes as the body with its params as `param_pN`:

```bash
curl -s 'http://127.0.0.1:8123/?database=openpanel&session_timezone=<tz>&default_format=JSON' \
  --data-binary '<the -- V1 statement>'

curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=<tz>' \
  --data-urlencode 'default_format=JSON' \
  --data-urlencode 'param_p1=<value>' [--data-urlencode 'param_p2=<value>' ...] \
  --data-urlencode 'query=<the -- V2 statement>'
```

An `Array(String)` param is written in ClickHouse's own form, not JSON —
`param_p4=['Google','Bing']` — which is how the harness encoded it.

## Cases

### widget/badge/uniqueVisitors

_as rendered — window is now(), the prod copy ends 2026-08-25_

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 8115324/8115324; wall V1/V2 = 193 ms / 195 ms; `meta` V1/V2 = identical `[{"name":"count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT uniq(profile_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= (now() - INTERVAL 30 DAY)
-- V2
SELECT uniq(profile_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= (now() - INTERVAL 30 DAY)
-- V2 params: {"p1":"pincali-production"}
```

rows V1: `[{"count":804374}]`
rows V2: `[{"count":804374}]`

### widget/badge/uniqueVisitors (frozen now)

_now() -> toDateTime('2026-08-25 08:49:53') on both sides_

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 14187522/14187522; wall V1/V2 = 324 ms / 328 ms; `meta` V1/V2 = identical `[{"name":"count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT uniq(profile_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 DAY)
-- V2
SELECT uniq(profile_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 DAY)
-- V2 params: {"p1":"pincali-production"}
```

rows V1: `[{"count":1569024}]`
rows V2: `[{"count":1569024}]`

### widget/realtimeData/countries

_as rendered — window is now(), the prod copy ends 2026-08-25_

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 156/156; wall V1/V2 = 5 ms / 4 ms; `meta` V1/V2 = identical `[{"name":"country","type":"LowCardinality(FixedString(2))"},{"name":"count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT country, uniq(session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= (now() - INTERVAL 30 MINUTE) AND country != '' AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10
-- V2
SELECT country, uniq(session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= (now() - INTERVAL 30 MINUTE) AND country != '' AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"pincali-production","p2":10}
```

rows V1: `[]`
rows V2: `[]`

### widget/realtimeData/countries (frozen now)

_now() -> toDateTime('2026-08-25 08:49:53') on both sides_

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 73541/73541; wall V1/V2 = 6 ms / 7 ms; `meta` V1/V2 = identical `[{"name":"country","type":"LowCardinality(FixedString(2))"},{"name":"count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT country, uniq(session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) AND country != '' AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10
-- V2
SELECT country, uniq(session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) AND country != '' AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"pincali-production","p2":10}
```

rows V1: `[{"country":"MX","count":1049},{"country":"US","count":397},{"country":"IN","count":346},{"country":"VN","count":202},{"country":"MY","count":88},{"country":"JP","count":87},{"country":"TH","count":87},{"country":"BR","count":81},{"country":"ID","count":81},{"country":"CA","count":79}]`
rows V2: `[{"country":"MX","count":1049},{"country":"US","count":397},{"country":"IN","count":346},{"country":"VN","count":202},{"country":"MY","count":88},{"country":"JP","count":87},{"country":"TH","count":87},{"country":"BR","count":81},{"country":"ID","count":81},{"country":"CA","count":79}]`

### widget/realtimeData/referrers

_as rendered — window is now(), the prod copy ends 2026-08-25_

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 156/156; wall V1/V2 = 5 ms / 6 ms; `meta` V1/V2 = identical `[{"name":"referrer","type":"String"},{"name":"count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT referrer_name as referrer, uniq(session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= (now() - INTERVAL 30 MINUTE) AND referrer_name != '' AND referrer_name IS NOT NULL GROUP BY referrer_name ORDER BY count DESC LIMIT 10
-- V2
SELECT referrer_name as referrer, uniq(session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= (now() - INTERVAL 30 MINUTE) AND referrer_name != '' AND referrer_name IS NOT NULL GROUP BY referrer_name ORDER BY count DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"pincali-production","p2":10}
```

rows V1: `[]`
rows V2: `[]`

### widget/realtimeData/referrers (frozen now)

_now() -> toDateTime('2026-08-25 08:49:53') on both sides_

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 65349/65349; wall V1/V2 = 11 ms / 9 ms; `meta` V1/V2 = identical `[{"name":"referrer","type":"String"},{"name":"count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT referrer_name as referrer, uniq(session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) AND referrer_name != '' AND referrer_name IS NOT NULL GROUP BY referrer_name ORDER BY count DESC LIMIT 10
-- V2
SELECT referrer_name as referrer, uniq(session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) AND referrer_name != '' AND referrer_name IS NOT NULL GROUP BY referrer_name ORDER BY count DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"pincali-production","p2":10}
```

rows V1: `[{"referrer":"Google","count":351},{"referrer":"easybroker.com","count":100},{"referrer":"ChatGPT","count":85},{"referrer":"transactional","count":17},{"referrer":"Instagram","count":9},{"referrer":"ig","count":6},{"referrer":"Facebook","count":4},{"referrer":"https://monopolio.com.mx","count":3},{"`
rows V2: `[{"referrer":"Google","count":351},{"referrer":"easybroker.com","count":100},{"referrer":"ChatGPT","count":85},{"referrer":"transactional","count":17},{"referrer":"Instagram","count":9},{"referrer":"ig","count":6},{"referrer":"Facebook","count":4},{"referrer":"https://monopolio.com.mx","count":3},{"`

### widget/realtimeData/paths

_as rendered — window is now(), the prod copy ends 2026-08-25_

**statement** — IDENTICAL; rows V1/V2 = 0/0; rows_read V1/V2 = 156/156; wall V1/V2 = 5 ms / 7 ms; `meta` V1/V2 = identical `[{"name":"path","type":"String"},{"name":"count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT path, uniq(session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= (now() - INTERVAL 30 MINUTE) AND path != '' AND path IS NOT NULL GROUP BY path ORDER BY count DESC LIMIT 10
-- V2
SELECT path, uniq(session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= (now() - INTERVAL 30 MINUTE) AND path != '' AND path IS NOT NULL GROUP BY path ORDER BY count DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"pincali-production","p2":10}
```

rows V1: `[]`
rows V2: `[]`

### widget/realtimeData/paths (frozen now)

_now() -> toDateTime('2026-08-25 08:49:53') on both sides_

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 65349/65349; wall V1/V2 = 10 ms / 11 ms; `meta` V1/V2 = identical `[{"name":"path","type":"String"},{"name":"count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT path, uniq(session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) AND path != '' AND path IS NOT NULL GROUP BY path ORDER BY count DESC LIMIT 10
-- V2
SELECT path, uniq(session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) AND path != '' AND path IS NOT NULL GROUP BY path ORDER BY count DESC LIMIT {p2:UInt64}
-- V2 params: {"p1":"pincali-production","p2":10}
```

rows V1: `[{"path":"/","count":123},{"path":"/inmuebles/departamentos-en-renta","count":37},{"path":"/inmuebles/casas-en-renta-en-zapopan-jalisco","count":23},{"path":"/inmuebles/departamentos-en-renta-en-guadalajara-jalisco","count":22},{"path":"/inmuebles/departamentos-en-renta-en-coyoacan-ciudad-de-mexico"`
rows V2: `[{"path":"/","count":123},{"path":"/inmuebles/departamentos-en-renta","count":37},{"path":"/inmuebles/casas-en-renta-en-zapopan-jalisco","count":23},{"path":"/inmuebles/departamentos-en-renta-en-guadalajara-jalisco","count":22},{"path":"/inmuebles/departamentos-en-renta-en-coyoacan-ciudad-de-mexico"`

### widget/realtimeData/totalSessions

_as rendered — window is now(), the prod copy ends 2026-08-25_

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 156/156; wall V1/V2 = 5 ms / 4 ms; `meta` V1/V2 = identical `[{"name":"total_sessions","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT uniq(session_id) as total_sessions FROM events WHERE project_id = 'pincali-production' AND created_at >= (now() - INTERVAL 30 MINUTE)
-- V2
SELECT uniq(session_id) as total_sessions FROM events WHERE project_id = {p1:String} AND created_at >= (now() - INTERVAL 30 MINUTE)
-- V2 params: {"p1":"pincali-production"}
```

rows V1: `[{"total_sessions":0}]`
rows V2: `[{"total_sessions":0}]`

### widget/realtimeData/totalSessions (frozen now)

_now() -> toDateTime('2026-08-25 08:49:53') on both sides_

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 65349/65349; wall V1/V2 = 8 ms / 8 ms; `meta` V1/V2 = identical `[{"name":"total_sessions","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT uniq(session_id) as total_sessions FROM events WHERE project_id = 'pincali-production' AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE)
-- V2
SELECT uniq(session_id) as total_sessions FROM events WHERE project_id = {p1:String} AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE)
-- V2 params: {"p1":"pincali-production"}
```

rows V1: `[{"total_sessions":3686}]`
rows V2: `[{"total_sessions":3686}]`

### widget/realtimeData/minuteCounts

_as rendered — window is now(), the prod copy ends 2026-08-25_

**statement** — IDENTICAL; rows V1/V2 = 30/30; rows_read V1/V2 = 156/156; wall V1/V2 = 5 ms / 4 ms; `meta` V1/V2 = identical `[{"name":"minute","type":"DateTime"},{"name":"session_count","type":"UInt64"},{"name":"visitor_count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT toStartOfMinute(created_at) as minute, uniq(session_id) as session_count, uniq(profile_id) as visitor_count FROM events WHERE project_id = 'pincali-production' AND created_at >= (now() - INTERVAL 30 MINUTE) GROUP BY minute ORDER BY minute ASC WITH FILL FROM toStartOfMinute(now() - INTERVAL 30 MINUTE) TO toStartOfMinute(now()) STEP INTERVAL 1 MINUTE
-- V2
SELECT toStartOfMinute(created_at) as minute, uniq(session_id) as session_count, uniq(profile_id) as visitor_count FROM events WHERE project_id = {p1:String} AND created_at >= (now() - INTERVAL 30 MINUTE) GROUP BY minute ORDER BY minute ASC WITH FILL FROM toStartOfMinute(now() - INTERVAL 30 MINUTE) TO toStartOfMinute(now()) STEP INTERVAL 1 MINUTE
-- V2 params: {"p1":"pincali-production"}
```

rows V1: `[{"minute":"2026-09-07 10:12:00","session_count":0,"visitor_count":0},{"minute":"2026-09-07 10:13:00","session_count":0,"visitor_count":0},{"minute":"2026-09-07 10:14:00","session_count":0,"visitor_count":0},{"minute":"2026-09-07 10:15:00","session_count":0,"visitor_count":0},{"minute":"2026-09-07 1`
rows V2: `[{"minute":"2026-09-07 10:12:00","session_count":0,"visitor_count":0},{"minute":"2026-09-07 10:13:00","session_count":0,"visitor_count":0},{"minute":"2026-09-07 10:14:00","session_count":0,"visitor_count":0},{"minute":"2026-09-07 10:15:00","session_count":0,"visitor_count":0},{"minute":"2026-09-07 1`

### widget/realtimeData/minuteCounts (frozen now)

_now() -> toDateTime('2026-08-25 08:49:53') on both sides_

**statement** — IDENTICAL; rows V1/V2 = 151/151; rows_read V1/V2 = 65349/65349; wall V1/V2 = 7 ms / 10 ms; `meta` V1/V2 = identical `[{"name":"minute","type":"DateTime"},{"name":"session_count","type":"UInt64"},{"name":"visitor_count","type":"UInt64"}]`; clickhouse_settings: session_timezone=Europe/Stockholm/Europe/Stockholm.

```sql
-- V1
SELECT toStartOfMinute(created_at) as minute, uniq(session_id) as session_count, uniq(profile_id) as visitor_count FROM events WHERE project_id = 'pincali-production' AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) GROUP BY minute ORDER BY minute ASC WITH FILL FROM toStartOfMinute(toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) TO toStartOfMinute(toDateTime('2026-08-25 08:49:53')) STEP INTERVAL 1 MINUTE
-- V2
SELECT toStartOfMinute(created_at) as minute, uniq(session_id) as session_count, uniq(profile_id) as visitor_count FROM events WHERE project_id = {p1:String} AND created_at >= (toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) GROUP BY minute ORDER BY minute ASC WITH FILL FROM toStartOfMinute(toDateTime('2026-08-25 08:49:53') - INTERVAL 30 MINUTE) TO toStartOfMinute(toDateTime('2026-08-25 08:49:53')) STEP INTERVAL 1 MINUTE
-- V2 params: {"p1":"pincali-production"}
```

rows V1: `[{"minute":"2026-08-25 08:19:00","session_count":16,"visitor_count":16},{"minute":"2026-08-25 08:20:00","session_count":49,"visitor_count":48},{"minute":"2026-08-25 08:21:00","session_count":61,"visitor_count":62},{"minute":"2026-08-25 08:22:00","session_count":55,"visitor_count":54},{"minute":"2026`
rows V2: `[{"minute":"2026-08-25 08:19:00","session_count":16,"visitor_count":16},{"minute":"2026-08-25 08:20:00","session_count":49,"visitor_count":48},{"minute":"2026-08-25 08:21:00","session_count":61,"visitor_count":62},{"minute":"2026-08-25 08:22:00","session_count":55,"visitor_count":54},{"minute":"2026`

