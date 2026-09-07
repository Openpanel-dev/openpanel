# legacy-scan.ts — V1 → V2 result-set proof (M12-008)

Every ClickHouse statement `packages/core/src/modules/insight/src/legacy-scan.ts`
runs, executed V1 against V2 on the local prod-copy `openpanel`. **This proof
also covers `packages/core/src/modules/insight/src/referrer-spikes.ts`**, the
task's second insight file — see *referrer-spikes.ts* at the bottom: it was
already converted off clix by M12-002 and scores 0/0/0 on the grep gate today,
so what is recorded here is a re-execution of its three statements V1 against
V2, not a second conversion.

V1 is the `legacy-scan.ts` at commit `68fea1a7`
(`git show HEAD:packages/core/src/modules/insight/src/legacy-scan.ts`), which
builds all ten statements with `clix`; V2 is the converted file, every runtime
value bound as a `{pN:Type}` param. **Both were imported into one Bun process
and driven through the same public entry point** — `createLegacyInsightsScanner(deps)
.generateInsights('pincali-production')` on each, with `Date.now()` frozen at
`2026-08-25T08:49:53Z` so the ten computed windows are identical on both sides,
behind a `deps.ch.query` stub that captures `{query, query_params,
clickhouse_settings}`. No statement below was retyped by hand. Each captured
statement was then executed through one HTTP call to `127.0.0.1:8123` at
`format: 'JSON'` with the settings its own side asked for; `data` was compared
row-for-row and `meta` column-for-column.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,851,025 events at the time of the
  run. Project `pincali-production` (14,047,591 events, 2,160,074 sessions).
  Nothing needed here is empty — see the row-bearing twins below for why the
  live statements still return no rows.
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). **No `IN` / `GLOBAL IN` was changed in either
  direction.** `git show HEAD:<file> | grep -c GLOBAL` is `0` and `grep -c
  GLOBAL <file>` is `0` for `legacy-scan.ts`; the file emits no `IN` at all, in
  either version, so no `IN (subquery)` on a `Distributed` table arises. For
  `referrer-spikes.ts` both counts are `0` for `GLOBAL` and `1` for ` IN `
  (`referrer_name IN`, a literal value list on both sides — never a subquery).
- **Verdict**: **22 statement pairs, all IDENTICAL** — 13 IDENTICAL and
  **9 IDENTICAL ERROR**, the nine V1 defects reproduced byte-for-byte, error
  text included. Nothing was fixed. (19 pairs for `legacy-scan.ts` — its ten
  statements plus nine row-bearing twins — and 3 for `referrer-spikes.ts`. The
  twelve `widget.rpc.ts` pairs are in `widget/widget.sql.proof.md`.)

## The nine defects, and why they are not this task's to fix

`legacy-scan.ts` has **no live callers** — `scanLegacyInsights` is exported from
`insight.service.ts` and reached by nothing but its own unit test, which mocks
the module. Nine of its ten statements have never been able to return a row:

| # | statement | defect | ClickHouse |
|---|---|---|---|
| 1 | `getTrafficSpikes` | `having('visitor_count','>','avg_previous_7_days * 2')` — clix escapes a `having` comparand as a **value**, so the threshold is a quoted string | 53 TYPE_MISMATCH |
| 2 | `getEventSurges` | same | 53 TYPE_MISMATCH |
| 3 | `getNewVisitorTrends` | `sessions.is_new` does not exist (+ the string threshold) | 47 UNKNOWN_IDENTIFIER |
| 4 | `getReferralSourceHighlights` | a window function (`sum(COUNT(*)) OVER ()`) referenced from `HAVING` | 184 ILLEGAL_AGGREGATION |
| 5 | `getSessionDurationChanges` | string threshold | 53 TYPE_MISMATCH |
| 6 | `getTopPerformingContent` | **none — this is the one that works** | 1 row |
| 7 | `getBounceRateImprovements` | string threshold | 53 TYPE_MISMATCH |
| 8 | `getReturningVisitorTrends` | `sessions.is_returning` does not exist (+ string threshold) | 47 UNKNOWN_IDENTIFIER |
| 9 | `getGeographicInterestShifts` | string threshold | 53 TYPE_MISMATCH |
| 10 | `getEventCompletionChanges` | `events.event_name` and `events.status` do not exist (+ string threshold) | 47 UNKNOWN_IDENTIFIER |

A conversion changes how values reach the server and nothing else, so all nine
are reproduced exactly. `IDENTICAL ERROR` is a passing case
(`docs/SQL_MIGRATION_RECIPE.md`, *Side-by-side proof*, step 5) and every one is
listed below with both error strings.

Because a failing statement proves only that two texts are equally invalid,
**each of the nine also has a row-bearing twin**: the same pair with the single
defective token removed — the string comparand replaced by a numeric literal on
both sides, `AND is_new = true` / `AND is_returning = true` / `AND status = …`
dropped from both, `event_name` → `name` on both, the illegal `HAVING` dropped
from both. Nothing else is touched, so the twin still differs between V1 and V2
in exactly the thing being proven: V1 carries inline literals where V2 carries
`{pN:Type}` params. The twins return 1–692 rows each and every one is IDENTICAL.
(A twin's `-- V2 params` line still lists the param the removed token used to
bind; ClickHouse ignores an unreferenced `param_pN`.)

**One twin is not deterministic, and it is V1 that is not deterministic.**
`getGeographicInterestShifts`'s twin selects
`lag(COUNT(*)) OVER (ORDER BY toWeek(created_at))` over a grouping in which many
rows share a week, so `prev_week_count` depends on the order ClickHouse happens
to feed the window — an earlier run of this harness reported the pair
`DIFFERENT`. Measured directly, 2026-09-07, running the **V1 text twice**:
`V1 run1 vs V1 run2` was `ordered: false, set: false`, while the same two runs
compared on `(country, visitor_count)` alone — every column except the window
one — were identical, as were V1-vs-V2 on those columns. So the instability is
V1's own and pre-dates the conversion; the run recorded below happened to agree
column-for-column. It costs nothing to say so: the shipped statement is
`IDENTICAL ERROR` and returns no rows at all.

## What binds and what does not

The rule applied, and the one measurement behind its exception:

- **Runtime values bind.** `projectId` and the ten `Date.now()`-derived windows
  are `{pN:String}`. clix escaped a `Date` to `'YYYY-MM-DD HH:mm:ss'`
  (`query-builder.ts:286`); `since()` uses core's `formatClickhouseDate`, which
  the parity test pins against `@openpanel/db`'s, and binds the same text.
- **Module constants that clix escaped as values also bind** — the eight string
  thresholds as `{pN:String}`, `0.5` as `{pN:Float64}`, `LIMIT 1` as
  `{pN:UInt64}`. This is `referrer-spikes.ts`'s precedent (`MIN_SESSIONS_FLOOR`
  and `MAX_REFERRERS` bind there).
- **The two boolean keywords stay SQL text.** `is_new = true` /
  `is_returning = true` are written into the template rather than bound.
  Measured 2026-09-07: ClickHouse substitutes a `Bool` parameter as a cast, so
  `is_new = {p3:Bool}` is analysed as `is_new = _CAST('true', 'Bool')` and the
  UNKNOWN_IDENTIFIER message — which echoes the whole normalised query — would
  no longer match V1's byte-for-byte. A `String` parameter substitutes as a
  plain quoted literal and matches, which is why `status = {p3:String}` binds
  and prints as `status = 'completed'` inside V1's own error text. Both facts
  are visible in the two error blocks below.
- **`session_timezone`** was `'UTC'` on every statement on both sides: clix
  defaults its constructor timezone to `'UTC'` (`query-builder.ts:696-697`) and
  sends it on every `execute()` (`:562`), and `CLIX_SESSION_TIMEZONE` keeps
  sending it.

## Tests

There is no test in the tree that compares a statement built by this file.
`insight.service.test.ts` `mock.module`s `./src/legacy-scan` wholesale and
asserts only that `scanLegacyInsights` delegates to it; that test is unchanged
and passes. The factory's parameter widened from `Pick<ServiceDeps,'ch'>` to
`ChScope` (`Pick<ServiceDeps,'ch'|'logger'>`) because core's `chQuery` logs the
`query info` line with the request's id — `insight.service.ts` already passes a
full `ServiceDeps`.

## Grep gate

```
$ bash tooling/gates/p12-grep-gates.sh --report
```

| | sqlstring | clix | sql-builder |
|---|---|---|---|
| `insight/src/legacy-scan.ts` before | 0 | 11 | 0 |
| `insight/src/legacy-scan.ts` after | **absent from the report (0/0/0)** | | |
| `insight/src/referrer-spikes.ts` | **absent already (0/0/0)** — M12-002 | | |
| `widget/widget.rpc.ts` after | **absent from the report (0/0/0)** | | |
| TOTAL before | 16 | 21 | 1 |
| TOTAL after | **16** | **1** | **1** |

The one remaining `clix` line and the one remaining `sql-builder` line are both
`packages/db/index.ts`'s re-exports of the two definer files — the last line to
go, in M12-009.

## still non-zero

Files under `packages/core` that the report still lists after this task, and why
each is not this task's:

| file | column | count | why not this task's |
|---|---|---|---|
| `packages/core/package.json` | sqlstring | 2 | the `sqlstring` / `@types/sqlstring` dependency entries. They come out with the last `sqlstring` call site, which is in the buffers below — a manifest edit ahead of that would break the build. |
| `packages/core/src/buffers/group-buffer.ts` | sqlstring | 3 | ClickHouse **write**-path buffer, not a read query; not one of this task's three files and not in the P12 wave's read-path conversion list. |
| `packages/core/src/buffers/profile-backfill-buffer.ts` | sqlstring | 3 | same |
| `packages/core/src/buffers/profile-buffer.ts` | sqlstring | 2 | same |

`packages/core/src/v1-compat.ts` **was** on this list (clix 2) and is not any
more: its `compatChHelpers()` seam exposed `clix` for consumers that no longer
exist, and `legacy-scan.ts` and `widget.rpc.ts` were the last two files in core
reaching the builder. The dead member is removed in this task's diff — that is
what makes "nothing in core imports the builders" true, which is M12-009's
precondition. `TABLE_NAMES` / `chQuery` / the date helpers stay on that seam for
`misc.service.ts`.

Every other column for every other `packages/core` file is 0, and both the
`clix` and `sql-builder` TOTALs are now made up entirely of `packages/db`.

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

### legacy/traffic_spike

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 6 ms / 5 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT referrer_name, toDate(created_at) as date, COUNT(*) as visitor_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= '2026-07-26 08:49:53' AND project_id = 'pincali-production' GROUP BY referrer_name, date HAVING visitor_count > 'avg_previous_7_days * 2' ORDER BY visitor_count DESC
-- V2
SELECT referrer_name, toDate(created_at) as date, COUNT(*) as visitor_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY referrer_name, date HAVING visitor_count > {p3:String} ORDER BY visitor_count DESC
-- V2 params: {"p1":"2026-07-26 08:49:53","p2":"pincali-production","p3":"avg_previous_7_days * 2"}
```

```
V1: Code: 53. DB::Exception: Cannot convert string 'avg_previous_7_days * 2' to type UInt64: while executing function greater on arguments count() UInt64 UInt64(size = 0), 'avg_previous_7_days * 2'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
V2: Code: 53. DB::Exception: Cannot convert string 'avg_previous_7_days * 2' to type UInt64: while executing function greater on arguments count() UInt64 UInt64(size = 0), 'avg_previous_7_days * 2'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
```

### legacy/traffic_spike (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 603/603; rows_read V1/V2 = 14187522/14187522; wall V1/V2 = 307 ms / 288 ms; `meta` V1/V2 = identical `[{"name":"referrer_name","type":"String"},{"name":"date","type":"Date"},{"name":"visitor_count","type":"UInt64"},{"name":"avg_previous_7_days","type":"Float64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT referrer_name, toDate(created_at) as date, COUNT(*) as visitor_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= '2026-07-26 08:49:53' AND project_id = 'pincali-production' GROUP BY referrer_name, date HAVING visitor_count > 100 ORDER BY visitor_count DESC
-- V2
SELECT referrer_name, toDate(created_at) as date, COUNT(*) as visitor_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY referrer_name, date HAVING visitor_count > 100 ORDER BY visitor_count DESC
-- V2 params: {"p1":"2026-07-26 08:49:53","p2":"pincali-production","p3":"avg_previous_7_days * 2"}
```

rows V1: `[{"referrer_name":"","date":"2026-07-28","visitor_count":421997,"avg_previous_7_days":6199.142857142857},{"referrer_name":"","date":"2026-08-03","visitor_count":370152,"avg_previous_7_days":26041.714285714286},{"referrer_name":"","date":"2026-07-29","visitor_count":363868,"avg_previous_7_days":8478}`
rows V2: `[{"referrer_name":"","date":"2026-07-28","visitor_count":421997,"avg_previous_7_days":6199.142857142857},{"referrer_name":"","date":"2026-08-03","visitor_count":370152,"avg_previous_7_days":26041.714285714286},{"referrer_name":"","date":"2026-07-29","visitor_count":363868,"avg_previous_7_days":8478}`

### legacy/event_surge

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 3 ms / 2 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toDate(created_at) as date, COUNT(*) as event_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= '2026-07-26 08:49:53' AND project_id = 'pincali-production' GROUP BY date HAVING event_count > 'avg_previous_7_days * 1.3' ORDER BY event_count DESC
-- V2
SELECT toDate(created_at) as date, COUNT(*) as event_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY date HAVING event_count > {p3:String} ORDER BY event_count DESC
-- V2 params: {"p1":"2026-07-26 08:49:53","p2":"pincali-production","p3":"avg_previous_7_days * 1.3"}
```

```
V1: Code: 53. DB::Exception: Cannot convert string 'avg_previous_7_days * 1.3' to type UInt64: while executing function greater on arguments count() UInt64 UInt64(size = 0), 'avg_previous_7_days * 1.3'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
V2: Code: 53. DB::Exception: Cannot convert string 'avg_previous_7_days * 1.3' to type UInt64: while executing function greater on arguments count() UInt64 UInt64(size = 0), 'avg_previous_7_days * 1.3'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
```

### legacy/event_surge (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 30/30; rows_read V1/V2 = 14187522/14187522; wall V1/V2 = 127 ms / 130 ms; `meta` V1/V2 = identical `[{"name":"date","type":"Date"},{"name":"event_count","type":"UInt64"},{"name":"avg_previous_7_days","type":"Float64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toDate(created_at) as date, COUNT(*) as event_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= '2026-07-26 08:49:53' AND project_id = 'pincali-production' GROUP BY date HAVING event_count > 100 ORDER BY event_count DESC
-- V2
SELECT toDate(created_at) as date, COUNT(*) as event_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY date HAVING event_count > 100 ORDER BY event_count DESC
-- V2 params: {"p1":"2026-07-26 08:49:53","p2":"pincali-production","p3":"avg_previous_7_days * 1.3"}
```

rows V1: `[{"date":"2026-07-28","event_count":649909,"avg_previous_7_days":73284},{"date":"2026-07-29","event_count":596082,"avg_previous_7_days":361596.5},{"date":"2026-08-19","event_count":591628,"avg_previous_7_days":483219.28571428574},{"date":"2026-08-03","event_count":578025,"avg_previous_7_days":455115`
rows V2: `[{"date":"2026-07-28","event_count":649909,"avg_previous_7_days":73284},{"date":"2026-07-29","event_count":596082,"avg_previous_7_days":361596.5},{"date":"2026-08-19","event_count":591628,"avg_previous_7_days":483219.28571428574},{"date":"2026-08-03","event_count":578025,"avg_previous_7_days":455115`

### legacy/new_visitor_trend

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 2 ms / 2 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toMonth(created_at) as month, COUNT(DISTINCT device_id) as new_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY month) as prev_month_visitors FROM sessions WHERE created_at >= '2026-06-26 08:49:53' AND project_id = 'pincali-production' AND is_new = true GROUP BY month HAVING new_visitors > 'prev_month_visitors * 1.2' ORDER BY month DESC
-- V2
SELECT toMonth(created_at) as month, COUNT(DISTINCT device_id) as new_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY month) as prev_month_visitors FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} AND is_new = true GROUP BY month HAVING new_visitors > {p3:String} ORDER BY month DESC
-- V2 params: {"p1":"2026-06-26 08:49:53","p2":"pincali-production","p3":"prev_month_visitors * 1.2"}
```

```
V1: Code: 47. DB::Exception: Unknown expression or function identifier `is_new` in scope SELECT toMonth(created_at) AS month, COUNTDistinct(device_id) AS new_visitors, lag(COUNTDistinct(device_id)) OVER (ORDER BY month ASC) AS prev_month_visitors FROM sessions WHERE (created_at >= '2026-06-26 08:49:53') AND (project_id = 'pincali-production') AND (is_new = true) GROUP BY month HAVING new_visitors > 'prev_month_visitors * 1.2' ORDER BY month DESC. (UNKNOWN_IDENTIFIER) (version 26.1.3.52 (official build))
V2: Code: 47. DB::Exception: Unknown expression or function identifier `is_new` in scope SELECT toMonth(created_at) AS month, COUNTDistinct(device_id) AS new_visitors, lag(COUNTDistinct(device_id)) OVER (ORDER BY month ASC) AS prev_month_visitors FROM sessions WHERE (created_at >= '2026-06-26 08:49:53') AND (project_id = 'pincali-production') AND (is_new = true) GROUP BY month HAVING new_visitors > 'prev_month_visitors * 1.2' ORDER BY month DESC. (UNKNOWN_IDENTIFIER) (version 26.1.3.52 (official build))
```

### legacy/new_visitor_trend (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 2243553/2243553; wall V1/V2 = 303 ms / 260 ms; `meta` V1/V2 = identical `[{"name":"month","type":"UInt8"},{"name":"new_visitors","type":"UInt64"},{"name":"prev_month_visitors","type":"UInt64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toMonth(created_at) as month, COUNT(DISTINCT device_id) as new_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY month) as prev_month_visitors FROM sessions WHERE created_at >= '2026-06-26 08:49:53' AND project_id = 'pincali-production' GROUP BY month HAVING new_visitors > 100 ORDER BY month DESC
-- V2
SELECT toMonth(created_at) as month, COUNT(DISTINCT device_id) as new_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY month) as prev_month_visitors FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY month HAVING new_visitors > 100 ORDER BY month DESC
-- V2 params: {"p1":"2026-06-26 08:49:53","p2":"pincali-production","p3":"prev_month_visitors * 1.2"}
```

rows V1: `[{"month":8,"new_visitors":1640718,"prev_month_visitors":316069},{"month":7,"new_visitors":316069,"prev_month_visitors":0}]`
rows V2: `[{"month":8,"new_visitors":1640718,"prev_month_visitors":316069},{"month":7,"new_visitors":316069,"prev_month_visitors":0}]`

### legacy/referral_source

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 2 ms / 1 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT referrer_name, COUNT(*) as count, COUNT(*) / sum(COUNT(*)) OVER () as percentage FROM sessions WHERE created_at >= '2026-08-18 08:49:53' AND project_id = 'pincali-production' GROUP BY referrer_name HAVING percentage >= 0.5 ORDER BY count DESC
-- V2
SELECT referrer_name, COUNT(*) as count, COUNT(*) / sum(COUNT(*)) OVER () as percentage FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY referrer_name HAVING percentage >= {p3:Float64} ORDER BY count DESC
-- V2 params: {"p1":"2026-08-18 08:49:53","p2":"pincali-production","p3":0.5}
```

```
V1: Code: 184. DB::Exception: Window function sum(COUNT(*)) OVER () is found in HAVING in query. (ILLEGAL_AGGREGATION) (version 26.1.3.52 (official build))
V2: Code: 184. DB::Exception: Window function sum(COUNT(*)) OVER () is found in HAVING in query. (ILLEGAL_AGGREGATION) (version 26.1.3.52 (official build))
```

### legacy/referral_source (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 692/692; rows_read V1/V2 = 761519/761519; wall V1/V2 = 18 ms / 18 ms; `meta` V1/V2 = identical `[{"name":"referrer_name","type":"String"},{"name":"count","type":"UInt64"},{"name":"percentage","type":"Float64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT referrer_name, COUNT(*) as count, COUNT(*) / sum(COUNT(*)) OVER () as percentage FROM sessions WHERE created_at >= '2026-08-18 08:49:53' AND project_id = 'pincali-production' GROUP BY referrer_name ORDER BY count DESC
-- V2
SELECT referrer_name, COUNT(*) as count, COUNT(*) / sum(COUNT(*)) OVER () as percentage FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY referrer_name ORDER BY count DESC
-- V2 params: {"p1":"2026-08-18 08:49:53","p2":"pincali-production","p3":0.5}
```

rows V1: `[{"referrer_name":"","count":488272,"percentage":0.7115530904713745},{"referrer_name":"Google","count":90187,"percentage":0.13142846317286647},{"referrer_name":"easybroker.com","count":71608,"percentage":0.10435350317543128},{"referrer_name":"ChatGPT","count":13048,"percentage":0.019014698210158467}`
rows V2: `[{"referrer_name":"","count":488272,"percentage":0.7115530904713745},{"referrer_name":"Google","count":90187,"percentage":0.13142846317286647},{"referrer_name":"easybroker.com","count":71608,"percentage":0.10435350317543128},{"referrer_name":"ChatGPT","count":13048,"percentage":0.019014698210158467}`

### legacy/session_duration

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 2 ms / 2 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toWeek(created_at) as week, avg(duration) as avg_duration, lag(avg(duration)) OVER (ORDER BY week) as prev_week_duration FROM sessions WHERE created_at >= '2026-08-11 08:49:53' AND project_id = 'pincali-production' GROUP BY week HAVING avg_duration > 'prev_week_duration * 1.25' ORDER BY week DESC
-- V2
SELECT toWeek(created_at) as week, avg(duration) as avg_duration, lag(avg(duration)) OVER (ORDER BY week) as prev_week_duration FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY week HAVING avg_duration > {p3:String} ORDER BY week DESC
-- V2 params: {"p1":"2026-08-11 08:49:53","p2":"pincali-production","p3":"prev_week_duration * 1.25"}
```

```
V1: Code: 53. DB::Exception: Cannot convert string 'prev_week_duration * 1.25' to type Float64: while executing function greater on arguments avg(__table1.duration) Float64 Float64(size = 0), 'prev_week_duration * 1.25'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
V2: Code: 53. DB::Exception: Cannot convert string 'prev_week_duration * 1.25' to type Float64: while executing function greater on arguments avg(__table1.duration) Float64 Float64(size = 0), 'prev_week_duration * 1.25'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
```

### legacy/session_duration (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 4/4; rows_read V1/V2 = 1162483/1162483; wall V1/V2 = 23 ms / 28 ms; `meta` V1/V2 = identical `[{"name":"week","type":"UInt8"},{"name":"avg_duration","type":"Float64"},{"name":"prev_week_duration","type":"Float64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toWeek(created_at) as week, avg(duration) as avg_duration, lag(avg(duration)) OVER (ORDER BY week) as prev_week_duration FROM sessions WHERE created_at >= '2026-08-11 08:49:53' AND project_id = 'pincali-production' GROUP BY week HAVING avg_duration > 10 ORDER BY week DESC
-- V2
SELECT toWeek(created_at) as week, avg(duration) as avg_duration, lag(avg(duration)) OVER (ORDER BY week) as prev_week_duration FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY week HAVING avg_duration > 10 ORDER BY week DESC
-- V2 params: {"p1":"2026-08-11 08:49:53","p2":"pincali-production","p3":"prev_week_duration * 1.25"}
```

rows V1: `[{"week":35,"avg_duration":63509.807911080155,"prev_week_duration":127541.13198440011},{"week":34,"avg_duration":127541.13198440011,"prev_week_duration":165461.89794130405},{"week":33,"avg_duration":165461.89794130405,"prev_week_duration":151476.37365892096},{"week":32,"avg_duration":151476.37365892`
rows V2: `[{"week":35,"avg_duration":63509.807911080155,"prev_week_duration":127541.13198440011},{"week":34,"avg_duration":127541.13198440011,"prev_week_duration":165461.89794130405},{"week":33,"avg_duration":165461.89794130405,"prev_week_duration":151476.37365892096},{"week":32,"avg_duration":151476.37365892`

### legacy/top_content

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 14187522/14187522; wall V1/V2 = 1205 ms / 1167 ms; `meta` V1/V2 = identical `[{"name":"path","type":"String"},{"name":"view_count","type":"UInt64"},{"name":"unique_viewers","type":"UInt64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT path, COUNT(*) as view_count, COUNT(DISTINCT device_id) as unique_viewers FROM events WHERE created_at >= '2026-07-26 08:49:53' AND project_id = 'pincali-production' GROUP BY path ORDER BY view_count DESC LIMIT 1
-- V2
SELECT path, COUNT(*) as view_count, COUNT(DISTINCT device_id) as unique_viewers FROM events WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY path ORDER BY view_count DESC LIMIT {p3:UInt64}
-- V2 params: {"p1":"2026-07-26 08:49:53","p2":"pincali-production","p3":1}
```

rows V1: `[{"path":"/","view_count":474556,"unique_viewers":82587}]`
rows V2: `[{"path":"/","view_count":474556,"unique_viewers":82587}]`

### legacy/bounce_rate

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 3 ms / 2 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toMonth(created_at) as month, sum(is_bounce) / COUNT(*) as bounce_rate, lag(sum(is_bounce) / COUNT(*)) OVER (ORDER BY month) as prev_month_bounce_rate FROM sessions WHERE created_at >= '2026-06-26 08:49:53' AND project_id = 'pincali-production' GROUP BY month HAVING bounce_rate < 'prev_month_bounce_rate * 0.85' ORDER BY month DESC
-- V2
SELECT toMonth(created_at) as month, sum(is_bounce) / COUNT(*) as bounce_rate, lag(sum(is_bounce) / COUNT(*)) OVER (ORDER BY month) as prev_month_bounce_rate FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY month HAVING bounce_rate < {p3:String} ORDER BY month DESC
-- V2 params: {"p1":"2026-06-26 08:49:53","p2":"pincali-production","p3":"prev_month_bounce_rate * 0.85"}
```

```
V1: Code: 53. DB::Exception: Cannot convert string 'prev_month_bounce_rate * 0.85' to type Float64: while executing function less on arguments divide(sum(__table1.is_bounce), count()) Float64 Float64(size = 0), 'prev_month_bounce_rate * 0.85'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
V2: Code: 53. DB::Exception: Cannot convert string 'prev_month_bounce_rate * 0.85' to type Float64: while executing function less on arguments divide(sum(__table1.is_bounce), count()) Float64 Float64(size = 0), 'prev_month_bounce_rate * 0.85'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
```

### legacy/bounce_rate (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 2243553/2243553; wall V1/V2 = 31 ms / 38 ms; `meta` V1/V2 = identical `[{"name":"month","type":"UInt8"},{"name":"bounce_rate","type":"Float64"},{"name":"prev_month_bounce_rate","type":"Float64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toMonth(created_at) as month, sum(is_bounce) / COUNT(*) as bounce_rate, lag(sum(is_bounce) / COUNT(*)) OVER (ORDER BY month) as prev_month_bounce_rate FROM sessions WHERE created_at >= '2026-06-26 08:49:53' AND project_id = 'pincali-production' GROUP BY month HAVING bounce_rate < 0.85 ORDER BY month DESC
-- V2
SELECT toMonth(created_at) as month, sum(is_bounce) / COUNT(*) as bounce_rate, lag(sum(is_bounce) / COUNT(*)) OVER (ORDER BY month) as prev_month_bounce_rate FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY month HAVING bounce_rate < 0.85 ORDER BY month DESC
-- V2 params: {"p1":"2026-06-26 08:49:53","p2":"pincali-production","p3":"prev_month_bounce_rate * 0.85"}
```

rows V1: `[{"month":8,"bounce_rate":0.7916161871668908,"prev_month_bounce_rate":0.8395492525786178},{"month":7,"bounce_rate":0.8395492525786178,"prev_month_bounce_rate":0}]`
rows V2: `[{"month":8,"bounce_rate":0.7916161871668908,"prev_month_bounce_rate":0.8395492525786178},{"month":7,"bounce_rate":0.8395492525786178,"prev_month_bounce_rate":0}]`

### legacy/returning_visitors

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 2 ms / 2 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toQuarter(created_at) as quarter, COUNT(DISTINCT device_id) as returning_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY quarter) as prev_quarter_visitors FROM sessions WHERE created_at >= '2026-02-26 08:49:53' AND project_id = 'pincali-production' AND is_returning = true GROUP BY quarter HAVING returning_visitors > 'prev_quarter_visitors * 1.1' ORDER BY quarter DESC
-- V2
SELECT toQuarter(created_at) as quarter, COUNT(DISTINCT device_id) as returning_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY quarter) as prev_quarter_visitors FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} AND is_returning = true GROUP BY quarter HAVING returning_visitors > {p3:String} ORDER BY quarter DESC
-- V2 params: {"p1":"2026-02-26 08:49:53","p2":"pincali-production","p3":"prev_quarter_visitors * 1.1"}
```

```
V1: Code: 47. DB::Exception: Unknown expression or function identifier `is_returning` in scope SELECT toQuarter(created_at) AS quarter, COUNTDistinct(device_id) AS returning_visitors, lag(COUNTDistinct(device_id)) OVER (ORDER BY quarter ASC) AS prev_quarter_visitors FROM sessions WHERE (created_at >= '2026-02-26 08:49:53') AND (project_id = 'pincali-production') AND (is_returning = true) GROUP BY quarter HAVING returning_visitors > 'prev_quarter_visitors * 1.1' ORDER BY quarter DESC. (UNKNOWN_IDENTIFIER) (version 26.1.3.52 (official build))
V2: Code: 47. DB::Exception: Unknown expression or function identifier `is_returning` in scope SELECT toQuarter(created_at) AS quarter, COUNTDistinct(device_id) AS returning_visitors, lag(COUNTDistinct(device_id)) OVER (ORDER BY quarter ASC) AS prev_quarter_visitors FROM sessions WHERE (created_at >= '2026-02-26 08:49:53') AND (project_id = 'pincali-production') AND (is_returning = true) GROUP BY quarter HAVING returning_visitors > 'prev_quarter_visitors * 1.1' ORDER BY quarter DESC. (UNKNOWN_IDENTIFIER) (version 26.1.3.52 (official build))
```

### legacy/returning_visitors (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 2243553/2243553; wall V1/V2 = 247 ms / 277 ms; `meta` V1/V2 = identical `[{"name":"quarter","type":"UInt8"},{"name":"returning_visitors","type":"UInt64"},{"name":"prev_quarter_visitors","type":"UInt64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toQuarter(created_at) as quarter, COUNT(DISTINCT device_id) as returning_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY quarter) as prev_quarter_visitors FROM sessions WHERE created_at >= '2026-02-26 08:49:53' AND project_id = 'pincali-production' GROUP BY quarter HAVING returning_visitors > 100 ORDER BY quarter DESC
-- V2
SELECT toQuarter(created_at) as quarter, COUNT(DISTINCT device_id) as returning_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY quarter) as prev_quarter_visitors FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY quarter HAVING returning_visitors > 100 ORDER BY quarter DESC
-- V2 params: {"p1":"2026-02-26 08:49:53","p2":"pincali-production","p3":"prev_quarter_visitors * 1.1"}
```

rows V1: `[{"quarter":3,"returning_visitors":1956782,"prev_quarter_visitors":0}]`
rows V2: `[{"quarter":3,"returning_visitors":1956782,"prev_quarter_visitors":0}]`

### legacy/geographic_shift

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 3 ms / 2 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT country, COUNT(*) as visitor_count, lag(COUNT(*)) OVER (ORDER BY toWeek(created_at)) as prev_week_count FROM sessions WHERE created_at >= '2026-08-11 08:49:53' AND project_id = 'pincali-production' GROUP BY country, toWeek(created_at) HAVING visitor_count > 'prev_week_count * 1.5' ORDER BY visitor_count DESC
-- V2
SELECT country, COUNT(*) as visitor_count, lag(COUNT(*)) OVER (ORDER BY toWeek(created_at)) as prev_week_count FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY country, toWeek(created_at) HAVING visitor_count > {p3:String} ORDER BY visitor_count DESC
-- V2 params: {"p1":"2026-08-11 08:49:53","p2":"pincali-production","p3":"prev_week_count * 1.5"}
```

```
V1: Code: 53. DB::Exception: Cannot convert string 'prev_week_count * 1.5' to type UInt64: while executing function greater on arguments count() UInt64 UInt64(size = 0), 'prev_week_count * 1.5'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
V2: Code: 53. DB::Exception: Cannot convert string 'prev_week_count * 1.5' to type UInt64: while executing function greater on arguments count() UInt64 UInt64(size = 0), 'prev_week_count * 1.5'_String String Const(size = 0, String(size = 1)). (TYPE_MISMATCH) (version 26.1.3.52 (official build))
```

### legacy/geographic_shift (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 220/220; rows_read V1/V2 = 1162483/1162483; wall V1/V2 = 29 ms / 27 ms; `meta` V1/V2 = identical `[{"name":"country","type":"LowCardinality(FixedString(2))"},{"name":"visitor_count","type":"UInt64"},{"name":"prev_week_count","type":"UInt64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT country, COUNT(*) as visitor_count, lag(COUNT(*)) OVER (ORDER BY toWeek(created_at)) as prev_week_count FROM sessions WHERE created_at >= '2026-08-11 08:49:53' AND project_id = 'pincali-production' GROUP BY country, toWeek(created_at) HAVING visitor_count > 100 ORDER BY visitor_count DESC
-- V2
SELECT country, COUNT(*) as visitor_count, lag(COUNT(*)) OVER (ORDER BY toWeek(created_at)) as prev_week_count FROM sessions WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY country, toWeek(created_at) HAVING visitor_count > 100 ORDER BY visitor_count DESC
-- V2 params: {"p1":"2026-08-11 08:49:53","p2":"pincali-production","p3":"prev_week_count * 1.5"}
```

rows V1: `[{"country":"MX","visitor_count":208577,"prev_week_count":140},{"country":"MX","visitor_count":202338,"prev_week_count":234},{"country":"MX","visitor_count":146394,"prev_week_count":1904},{"country":"US","visitor_count":109085,"prev_week_count":128},{"country":"US","visitor_count":37021,"prev_week_c`
rows V2: `[{"country":"MX","visitor_count":208577,"prev_week_count":140},{"country":"MX","visitor_count":202338,"prev_week_count":234},{"country":"MX","visitor_count":146394,"prev_week_count":1904},{"country":"US","visitor_count":109085,"prev_week_count":128},{"country":"US","visitor_count":37021,"prev_week_c`

### legacy/event_completion

**statement** — IDENTICAL ERROR; both sides fail; wall V1/V2 = 2 ms / 1 ms; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT event_name, toMonth(created_at) as month, COUNT(*) as completion_count, lag(COUNT(*)) OVER (ORDER BY month) as prev_month_count FROM events WHERE created_at >= '2026-06-26 08:49:53' AND project_id = 'pincali-production' AND status = 'completed' GROUP BY event_name, month HAVING completion_count > 'prev_month_count * 1.05' ORDER BY month DESC
-- V2
SELECT event_name, toMonth(created_at) as month, COUNT(*) as completion_count, lag(COUNT(*)) OVER (ORDER BY month) as prev_month_count FROM events WHERE created_at >= {p1:String} AND project_id = {p2:String} AND status = {p3:String} GROUP BY event_name, month HAVING completion_count > {p4:String} ORDER BY month DESC
-- V2 params: {"p1":"2026-06-26 08:49:53","p2":"pincali-production","p3":"completed","p4":"prev_month_count * 1.05"}
```

```
V1: Code: 47. DB::Exception: Unknown expression identifier `event_name` in scope SELECT event_name, toMonth(created_at) AS month, COUNT(*) AS completion_count, lag(COUNT(*)) OVER (ORDER BY month ASC) AS prev_month_count FROM events WHERE (created_at >= '2026-06-26 08:49:53') AND (project_id = 'pincali-production') AND (status = 'completed') GROUP BY event_name, month HAVING completion_count > 'prev_month_count * 1.05' ORDER BY month DESC. (UNKNOWN_IDENTIFIER) (version 26.1.3.52 (official build))
V2: Code: 47. DB::Exception: Unknown expression identifier `event_name` in scope SELECT event_name, toMonth(created_at) AS month, COUNT(*) AS completion_count, lag(COUNT(*)) OVER (ORDER BY month ASC) AS prev_month_count FROM events WHERE (created_at >= '2026-06-26 08:49:53') AND (project_id = 'pincali-production') AND (status = 'completed') GROUP BY event_name, month HAVING completion_count > 'prev_month_count * 1.05' ORDER BY month DESC. (UNKNOWN_IDENTIFIER) (version 26.1.3.52 (official build))
```

### legacy/event_completion (row-bearing twin)

_defective token removed identically on both sides_

**statement** — IDENTICAL; rows V1/V2 = 99/99; rows_read V1/V2 = 14187522/14187522; wall V1/V2 = 266 ms / 267 ms; `meta` V1/V2 = identical `[{"name":"name","type":"LowCardinality(String)"},{"name":"month","type":"UInt8"},{"name":"completion_count","type":"UInt64"},{"name":"prev_month_count","type":"UInt64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT name, toMonth(created_at) as month, COUNT(*) as completion_count, lag(COUNT(*)) OVER (ORDER BY month) as prev_month_count FROM events WHERE created_at >= '2026-06-26 08:49:53' AND project_id = 'pincali-production' GROUP BY name, month HAVING completion_count > 100 ORDER BY month DESC
-- V2
SELECT name, toMonth(created_at) as month, COUNT(*) as completion_count, lag(COUNT(*)) OVER (ORDER BY month) as prev_month_count FROM events WHERE created_at >= {p1:String} AND project_id = {p2:String} GROUP BY name, month HAVING completion_count > 100 ORDER BY month DESC
-- V2 params: {"p1":"2026-06-26 08:49:53","p2":"pincali-production","p3":"completed","p4":"prev_month_count * 1.05"}
```

rows V1: `[{"name":"viewed_properties_search_list","month":8,"completion_count":1007534,"prev_month_count":7070},{"name":"copied_location_link","month":8,"completion_count":3733,"prev_month_count":4142},{"name":"view_board","month":8,"completion_count":7070,"prev_month_count":2976968},{"name":"screen_view","m`
rows V2: `[{"name":"viewed_properties_search_list","month":8,"completion_count":1007534,"prev_month_count":7070},{"name":"copied_location_link","month":8,"completion_count":3733,"prev_month_count":4142},{"name":"view_board","month":8,"completion_count":7070,"prev_month_count":2976968},{"name":"screen_view","m`


## referrer-spikes.ts

`packages/core/src/modules/insight/src/referrer-spikes.ts` is the task's second
insight file. It was already converted off clix by **M12-002** (commit
`4cd0d76b`) — `getRawWhereClause` started returning a `SqlFragment` carrying
params and clix's `execute()` (`query-builder.ts:552`) has no `query_params`
slot to carry them — and it scores **0/0/0** on the grep gate today. There was
nothing left in it for this task to convert.

What is recorded below is a re-execution, today, of its three statements V1
against V2 on the same data and the same inputs. **Provenance, stated plainly:**
the V2 side was captured from the real `getReferrerSpikes(deps, input)` in this
process, behind a recording client that *also executes*, so the second and third
statements receive the real referrer list the first one returns. The V1 side is
the clix text recorded by M12-002's own side-by-side proof
(`packages/core/src/modules/chart/src/filter-where.sql.proof.md`, §*Consumer
conversion: referrer-spikes.ts*) — the clix builder is gone from this module, so
V1 could not be re-derived by calling it, and re-deriving it would only
reproduce that record. Both texts were executed here, today, against local
prod-copy `openpanel`.

Inputs: project `secure-privacy`, filters
`[{name:'country',operator:'is',value:['US']}]`, window
`2026-07-01 00:00:00` … `2026-07-08 00:00:00`, interval `day`,
`session_timezone=UTC` on both sides. The eight referrer names the second
statement binds are the ones the first statement returned in this run, and they
match M12-002's recorded list exactly.

`referrer_name IN (…)` (V1) → `referrer_name IN {p4:Array(String)}` (V2) is a
**literal value list on both sides, never a subquery**, so the distributed-`IN`
trap does not arise and no `GLOBAL` was added or removed.

### referrer-spikes/topReferrers

**statement** — IDENTICAL; rows V1/V2 = 8/8; rows_read V1/V2 = 65436/65436; wall V1/V2 = 7 ms / 11 ms; `meta` V1/V2 = identical `[{"name":"referrer_name","type":"String"},{"name":"total","type":"Int64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT referrer_name, sum(sign) AS total FROM sessions FINAL WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-01 00:00:00') AND toDateTime('2026-07-08 00:00:00') AND referrer_name != '' AND referrer_name IS NOT NULL AND country = 'US' GROUP BY referrer_name HAVING sum(sign) >= 10 ORDER BY total DESC LIMIT 50
-- V2
SELECT referrer_name, sum(sign) AS total FROM sessions FINAL WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) AND referrer_name != '' AND referrer_name IS NOT NULL AND country = {p4:String} GROUP BY referrer_name HAVING sum(sign) >= {p5:UInt64} ORDER BY total DESC LIMIT {p6:UInt64}
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"US","p5":10,"p6":50}
```

rows V1: `[{"referrer_name":"Google","total":12327},{"referrer_name":"https://www.bwtrailerhitches.com","total":54},{"referrer_name":"https://www.kingandprince.com","total":48},{"referrer_name":"https://www.propper.com","total":31},{"referrer_name":"Bing","total":20},{"referrer_name":"DuckDuckGo","total":13},`
rows V2: `[{"referrer_name":"Google","total":12327},{"referrer_name":"https://www.bwtrailerhitches.com","total":54},{"referrer_name":"https://www.kingandprince.com","total":48},{"referrer_name":"https://www.propper.com","total":31},{"referrer_name":"Bing","total":20},{"referrer_name":"DuckDuckGo","total":13},`

### referrer-spikes/perBucketSessions

**statement** — IDENTICAL; rows V1/V2 = 47/47; rows_read V1/V2 = 65436/65436; wall V1/V2 = 8 ms / 7 ms; `meta` V1/V2 = identical `[{"name":"date","type":"DateTime"},{"name":"referrer_name","type":"String"},{"name":"sessions","type":"Int64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toStartOfDay(created_at) AS date, referrer_name, sum(sign) AS sessions FROM sessions FINAL WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-01 00:00:00') AND toDateTime('2026-07-08 00:00:00') AND referrer_name IN ('Google', 'https://www.bwtrailerhitches.com', 'https://www.kingandprince.com', 'https://www.propper.com', 'Bing', 'DuckDuckGo', 'Twitter', 'https://www.packetsofhope.com') AND country = 'US' GROUP BY date, referrer_name HAVING sum(sign) > 0 ORDER BY date ASC
-- V2
SELECT toStartOfDay(created_at) AS date, referrer_name, sum(sign) AS sessions FROM sessions FINAL WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) AND referrer_name IN {p4:Array(String)} AND country = {p5:String} GROUP BY date, referrer_name HAVING sum(sign) > 0 ORDER BY date ASC
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":["Google","https://www.bwtrailerhitches.com","https://www.kingandprince.com","https://www.propper.com","Bing","DuckDuckGo","Twitter","https://www.packetsofhope.com"],"p5":"US"}
```

rows V1: `[{"date":"2026-07-01 00:00:00","referrer_name":"https://www.bwtrailerhitches.com","sessions":4},{"date":"2026-07-01 00:00:00","referrer_name":"https://www.kingandprince.com","sessions":9},{"date":"2026-07-01 00:00:00","referrer_name":"https://www.propper.com","sessions":8},{"date":"2026-07-01 00:00:`
rows V2: `[{"date":"2026-07-01 00:00:00","referrer_name":"https://www.bwtrailerhitches.com","sessions":4},{"date":"2026-07-01 00:00:00","referrer_name":"https://www.kingandprince.com","sessions":9},{"date":"2026-07-01 00:00:00","referrer_name":"https://www.propper.com","sessions":8},{"date":"2026-07-01 00:00:`

### referrer-spikes/bucketTotals

**statement** — IDENTICAL; rows V1/V2 = 7/7; rows_read V1/V2 = 65436/65436; wall V1/V2 = 7 ms / 8 ms; `meta` V1/V2 = identical `[{"name":"date","type":"DateTime"},{"name":"total","type":"Int64"}]`; clickhouse_settings: session_timezone=UTC/UTC.

```sql
-- V1
SELECT toStartOfDay(created_at) AS date, sum(sign) AS total FROM sessions FINAL WHERE project_id = 'secure-privacy' AND created_at BETWEEN toDateTime('2026-07-01 00:00:00') AND toDateTime('2026-07-08 00:00:00') AND country = 'US' GROUP BY date HAVING sum(sign) > 0
-- V2
SELECT toStartOfDay(created_at) AS date, sum(sign) AS total FROM sessions FINAL WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) AND country = {p4:String} GROUP BY date HAVING sum(sign) > 0
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"US"}
```

rows V1: `[{"date":"2026-07-07 00:00:00","total":2384},{"date":"2026-07-01 00:00:00","total":1045},{"date":"2026-07-02 00:00:00","total":678},{"date":"2026-07-04 00:00:00","total":2099},{"date":"2026-07-05 00:00:00","total":2152},{"date":"2026-07-03 00:00:00","total":3065},{"date":"2026-07-06 00:00:00","total`
rows V2: `[{"date":"2026-07-07 00:00:00","total":2384},{"date":"2026-07-01 00:00:00","total":1045},{"date":"2026-07-02 00:00:00","total":678},{"date":"2026-07-04 00:00:00","total":2099},{"date":"2026-07-05 00:00:00","total":2152},{"date":"2026-07-03 00:00:00","total":3065},{"date":"2026-07-06 00:00:00","total`

