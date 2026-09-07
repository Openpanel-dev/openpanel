# realtime.service.ts — V1 → V2 result-set proof (M12-005)

Every ClickHouse statement `packages/core/src/modules/realtime/realtime.service.ts`
runs, executed V1 against V2 on the local prod-copy `openpanel`. V1 is the file
at commit `794bef39` (`git show HEAD:packages/core/src/modules/realtime/realtime.service.ts`),
which builds four statements with `clix` and six with `sqlstring.escape`; V2 is
the converted file, every value bound as a `{pN:Type}` param. **Both were
imported into one Bun process and called with the same inputs** — the SQL below
was produced by calling the real functions with a `deps.ch.query` stub that
captures `{query, query_params, clickhouse_settings}`, never by retyping V1 by
hand — and each captured statement was then executed through one
`@clickhouse/client` at `format: 'JSON'` with the settings its own side asked
for. `data` was compared row-for-row and `meta` column-for-column.

No case needed set comparison: every statement either has a total `ORDER BY`
over a unique key, returns one row, or (`coordinates`, `geo`, `paths`,
`referrals`, `activeSessions`) was byte-identical in the emitted row order on
both sides.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,850,758 events. Project
  `pincali-production` (the primary fixture: 3,523 events, 74 distinct
  countries in the reference window) plus `verdict` during harness bring-up.
  Nothing is empty here — every statement below returns rows.
- **Reference time**: the prod copy's newest event is `2026-08-25 08:49:53`, so
  a realtime window anchored on the wall clock is empty by construction. Both
  sides were run with `Date` frozen at **`2026-08-25 08:49:53Z`**, which makes
  `since()` = `2026-08-25 08:19:53` on both. `getRealtimeCoordinates` computes
  its window in SQL (`now() - INTERVAL 30 MINUTE`), so for the row-bearing runs
  `now()` was textually replaced with `toDateTime('2026-08-25 08:49:53')`
  **on both sides**; run R7 in the results table is the same pair executed
  exactly as rendered, with the real `now()`, and returns 0/0 — recorded because
  a zero-row case proves only that both texts parse.
- **Machine**: single-node ClickHouse 26.1.3.52 on this box — timings are
  directional only; production is 2 shards × 2 replicas (`docs/ENVIRONMENT.md`).
  **No `IN` / `GLOBAL IN` was changed in either direction.** `grep -c GLOBAL`
  is `0` on the V1 file and `0` on the V2 file; V1 emits `IN (` 3× plus one
  `NOT IN`, V2 emits `IN (` 2× plus one `IN ${...}` (the country list, now an
  `Array(String)` param) plus one `NOT IN`. Every `IN` operand on both sides is
  a literal value list — there is no `IN (subquery)` anywhere in this module, so
  the distributed-`IN` trap does not arise.
- **Verdict**: **70 statement pairs, all IDENTICAL** — 65 IDENTICAL and 5
  IDENTICAL ERROR (one V1 defect, reproduced byte-for-byte; §*Filter shapes*,
  "country, 7-character value").

## `session_timezone`, per statement

The behaviour the conversion had to preserve: `clix(client)` with no timezone
argument defaults to `'UTC'` (`query-builder.ts:696-697`) and sends it as
`clickhouse_settings.session_timezone` on every `execute()`
(`query-builder.ts:562`). The three statements that were already raw
`chQuery(deps, text)` calls sent **no** `session_timezone` at all. V2 keeps both
halves: `CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' }` on the seven that
came off clix, nothing on the three that did not.

| statement | built by (V1) | V1 sent | V2 sends |
|---|---|---|---|
| `getRealtimeCoordinates` | raw `chQuery` | *(none)* | *(none)* |
| mapBadge `summary` | `clix` | `UTC` | `UTC` |
| mapBadge `topReferrers` | `clix` | `UTC` | `UTC` |
| mapBadge `topPaths` | `clix` | `UTC` | `UTC` |
| mapBadge `topEvents` | `clix` | `UTC` | `UTC` |
| mapBadge `recentSessions` | raw `chQuery` | *(none)* | *(none)* |
| `getRealtimeActiveSessions` | raw `chQuery` | *(none)* | *(none)* |
| `getRealtimePaths` | `clix` | `UTC` | `UTC` |
| `getRealtimeReferrals` | `clix` | `UTC` | `UTC` |
| `getRealtimeGeo` | `clix` | `UTC` | `UTC` |

The `session_timezone V1 -> V2` column of the results table is not a
restatement of this table: it is what the harness read back off each captured
call, on every one of the 70 pairs.

## No lazy loads left

The task's gate is a recursive `grep` for the two-token phrase *await* +
*import* across `packages/core/src/modules/realtime`, negated. It exits 0 on
this tree: **there is no deferred module load left in the module, source or
test.** (This file deliberately does not spell that phrase out, so the proof
does not become the match it is certifying.)

`loadChHelpers()` — `import('../../v1-compat').then((m) => m.compatChHelpers())`,
whose `compatChHelpers` is a `Promise.all([import('@openpanel/db/src/clickhouse/client'),
import('@openpanel/db/src/clickhouse/query-builder')])` — is gone. `TABLE_NAMES`
and `formatClickhouseDate`/`convertClickhouseDateToJs` are static imports of
core's own pure copies (`shared/ch-tables.ts`, `shared/ch-dates.ts`, both
parity-tested against `@openpanel/db`), and the ClickHouse client is `deps.ch`
as it already was. That is ADR-007's deps rule and docs/TECH_DEBT.md §4 step 2.

`loadRedis()` stays, and is the one deliberate exception: it is an intra-package
deferral with its own header (several other modules' tests replace
`@openpanel/redis` wholesale with a partial factory, and a static named import
here would demand `subscribeToPublishedEvent` on every one of those subsets the
moment this module joins the eager barrel chain). It is not a `@openpanel/db`
load and it reaches no client — `deps` still carries every connection.

## Grep gate

```
$ bash tooling/gates/p12-grep-gates.sh --report | grep -E 'realtime|TOTAL'
```

| | sqlstring | clix | sql-builder |
|---|---|---|---|
| `realtime.service.ts` before | 8 | 7 | 0 |
| `realtime.service.ts` after | **absent from the report (0/0/0)** | | |
| TOTAL before | 36 | 73 | 6 |
| TOTAL after | **28** | **66** | 6 |

The module-header paragraph that said its queries "still go through
clix/sqlstring" is deleted.

## Tests that compared statement text

`realtime.service.test.ts`'s `getRealtimeActiveSessions` case asserted
`query` contained `project_id = 'proj_1'` and `LIMIT 50`. Its assertions are
unchanged in what they check — the same project scoping, the same 30-minute
window, the same limit — but they now read the statement **and its params**:
`project_id = {p1:String}` / `created_at >= {p2:String}` / `LIMIT {p3:UInt64}`
in the text, and `p1 === 'proj_1'`, `p2` inside the 30-minute window, `p3 === 50`
in `query_params`. It is the only text-comparing test in the module; nothing
else in `packages/core` asserts on realtime SQL.

## Reproducing a case

Every statement below runs under
`curl 'http://127.0.0.1:8123/?database=openpanel'`, binding V2's params as
`param_pN=`. Worked example — `getRealtimeGeo`, both sides:

```bash
curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=UTC' \
  --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode "query=SELECT country, city, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM events WHERE project_id = 'pincali-production' AND created_at >= '2026-08-25 08:19:53' GROUP BY country, city ORDER BY count DESC LIMIT 50"

curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=UTC' \
  --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode 'param_p1=pincali-production' \
  --data-urlencode 'param_p2=2026-08-25 08:19:53' \
  --data-urlencode 'param_p3=50' \
  --data-urlencode "query=SELECT country, city, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM events WHERE project_id = {p1:String} AND created_at >= {p2:String} GROUP BY country, city ORDER BY count DESC LIMIT {p3:UInt64}"
```

Both return the same 50 rows, the first being
`["MX","Iztapalapa",277,9,55.82]`.

## The ten statements

Texts and numbers below are run **R3** (`detailScope: 'city'`,
`locations = [{MX, Iztapalapa}, {MX, Iztapalapa}, {MX, O'Brien}]` — the
duplicate exercises V1's tuple de-duplication, the apostrophe exercises the
escaping V2 replaces with binding). The other five location shapes are in
*Filter shapes*; all ten statements were run under every shape, and the full
70-pair table is at the end.

### getRealtimeCoordinates

**statement** — IDENTICAL; rows V1/V2 = 440/440; rows_read V1/V2 = 8192/8192; wall V1/V2 = 37 ms / 11 ms; clickhouse_settings: no session_timezone sent (both). `meta` identical: `[{"name": "country", "type": "LowCardinality(FixedString(2))"}, {"name": "city", "type": "String"}, {"name": "long", "type": "Nullable(Float32)"}, {"name": "lat", "type": "Nullable(Float32)"}, {"name": "count", "type": "UInt64"}]`.

```sql
-- V1
SELECT
      country,
      city,
      longitude as long,
      latitude as lat,
      COUNT(DISTINCT session_id) as count
    FROM events
    WHERE project_id = 'pincali-production'
      AND created_at >= now() - INTERVAL 30 MINUTE
      AND longitude IS NOT NULL
      AND latitude IS NOT NULL
    GROUP BY country, city, longitude, latitude
    ORDER BY count DESC
    LIMIT 5000

-- V2
SELECT
      country,
      city,
      longitude as long,
      latitude as lat,
      COUNT(DISTINCT session_id) as count
    FROM events
    WHERE project_id = {p1:String}
      AND created_at >= now() - INTERVAL {p2:UInt64} MINUTE
      AND longitude IS NOT NULL
      AND latitude IS NOT NULL
    GROUP BY country, city, longitude, latitude
    ORDER BY count DESC
    LIMIT {p3:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": 30, "p3": 5000}
```

First row, both sides:

```json
{"country": "US", "city": "", "long": -97.822, "lat": 37.751, "count": 30}
```

### getRealtimeMapBadgeDetails - summary

**statement** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 30440/8192; wall V1/V2 = 14 ms / 8 ms; clickhouse_settings: session_timezone=UTC (both). `meta` identical: `[{"name": "total_sessions", "type": "UInt64"}, {"name": "total_profiles", "type": "UInt64"}]`.

```sql
-- V1
SELECT COUNT(DISTINCT session_id) as total_sessions, COUNT(DISTINCT nullIf(profile_id, '')) as total_profiles FROM events WHERE project_id = 'pincali-production' AND created_at >= '2026-08-25 08:19:53' AND (coalesce(country, ''), coalesce(city, '')) IN (('MX', 'Iztapalapa'), ('MX', 'O\'Brien'))

-- V2
SELECT COUNT(DISTINCT session_id) as total_sessions, COUNT(DISTINCT nullIf(profile_id, '')) as total_profiles FROM events WHERE project_id = {p1:String} AND created_at >= {p2:String} AND (coalesce(country, ''), coalesce(city, '')) IN (({p3:String}, {p4:String}), ({p5:String}, {p6:String}))
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": "MX", "p4": "Iztapalapa", "p5": "MX", "p6": "O'Brien"}
```

First row, both sides:

```json
{"total_sessions": 9, "total_profiles": 9}
```

### getRealtimeMapBadgeDetails - topReferrers

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 30440/8192; wall V1/V2 = 9 ms / 11 ms; clickhouse_settings: session_timezone=UTC (both). `meta` identical: `[{"name": "referrer_name", "type": "String"}, {"name": "count", "type": "UInt64"}]`.

```sql
-- V1
SELECT referrer_name, COUNT(DISTINCT session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= '2026-08-25 08:19:53' AND referrer_name != '' AND (coalesce(country, ''), coalesce(city, '')) IN (('MX', 'Iztapalapa'), ('MX', 'O\'Brien')) GROUP BY referrer_name ORDER BY count DESC LIMIT 3

-- V2
SELECT referrer_name, COUNT(DISTINCT session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= {p2:String} AND referrer_name != {p3:String} AND (coalesce(country, ''), coalesce(city, '')) IN (({p4:String}, {p5:String}), ({p6:String}, {p7:String})) GROUP BY referrer_name ORDER BY count DESC LIMIT {p8:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": "", "p4": "MX", "p5": "Iztapalapa", "p6": "MX", "p7": "O'Brien", "p8": 3}
```

First row, both sides:

```json
{"referrer_name": "Instagram", "count": 5}
```

### getRealtimeMapBadgeDetails - topPaths

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 30440/8192; wall V1/V2 = 15 ms / 16 ms; clickhouse_settings: session_timezone=UTC (both). `meta` identical: `[{"name": "origin", "type": "String"}, {"name": "path", "type": "String"}, {"name": "count", "type": "UInt64"}]`.

```sql
-- V1
SELECT origin, path, COUNT(DISTINCT session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= '2026-08-25 08:19:53' AND path != '' AND (coalesce(country, ''), coalesce(city, '')) IN (('MX', 'Iztapalapa'), ('MX', 'O\'Brien')) GROUP BY origin, path ORDER BY count DESC LIMIT 3

-- V2
SELECT origin, path, COUNT(DISTINCT session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= {p2:String} AND path != {p3:String} AND (coalesce(country, ''), coalesce(city, '')) IN (({p4:String}, {p5:String}), ({p6:String}, {p7:String})) GROUP BY origin, path ORDER BY count DESC LIMIT {p8:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": "", "p4": "MX", "p5": "Iztapalapa", "p6": "MX", "p7": "O'Brien", "p8": 3}
```

First row, both sides:

```json
{"origin": "https://www.pincali.com", "path": "/inmuebles/departamentos-en-renta-en-lomas-de-angelopolis-san-andres-cholula-puebla", "count": 4}
```

### getRealtimeMapBadgeDetails - topEvents

**statement** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 30440/30440; wall V1/V2 = 11 ms / 13 ms; clickhouse_settings: session_timezone=UTC (both). `meta` identical: `[{"name": "name", "type": "LowCardinality(String)"}, {"name": "count", "type": "UInt64"}]`.

```sql
-- V1
SELECT name, COUNT(DISTINCT session_id) as count FROM events WHERE project_id = 'pincali-production' AND created_at >= '2026-08-25 08:19:53' AND name NOT IN ('screen_view', 'session_start', 'session_end') AND (coalesce(country, ''), coalesce(city, '')) IN (('MX', 'Iztapalapa'), ('MX', 'O\'Brien')) GROUP BY name ORDER BY count DESC LIMIT 3

-- V2
SELECT name, COUNT(DISTINCT session_id) as count FROM events WHERE project_id = {p1:String} AND created_at >= {p2:String} AND name NOT IN {p3:Array(String)} AND (coalesce(country, ''), coalesce(city, '')) IN (({p4:String}, {p5:String}), ({p6:String}, {p7:String})) GROUP BY name ORDER BY count DESC LIMIT {p8:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": ["screen_view", "session_start", "session_end"], "p4": "MX", "p5": "Iztapalapa", "p6": "MX", "p7": "O'Brien", "p8": 3}
```

First row, both sides:

```json
{"name": "viewed_property", "count": 8}
```

### getRealtimeMapBadgeDetails - recentSessions

**statement** — IDENTICAL; rows V1/V2 = 8/8; rows_read V1/V2 = 30440/8192; wall V1/V2 = 13 ms / 10 ms; clickhouse_settings: no session_timezone sent (both). `meta` identical: `[{"name": "session_id", "type": "String"}, {"name": "profile_id", "type": "String"}, {"name": "created_at", "type": "DateTime64(3)"}, {"name": "path", "type": "String"}, {"name": "name", "type": "LowCardinality(String)"}, {"name": "country", "type": "LowCardinality(FixedString(2))"}, {"name": "city", "type": "String"}]`.

```sql
-- V1
SELECT
          session_id,
          profile_id,
          created_at,
          path,
          name,
          country,
          city
        FROM (
          SELECT
            session_id,
            profile_id,
            created_at,
            path,
            name,
            country,
            city,
            row_number() OVER (
              PARTITION BY session_id ORDER BY created_at DESC
            ) AS rn
          FROM events
          WHERE project_id = 'pincali-production'
            AND created_at >= '2026-08-25 08:19:53'
            AND ((coalesce(country, ''), coalesce(city, '')) IN (('MX', 'Iztapalapa'), ('MX', 'O\'Brien')))
        ) AS latest_event_per_session
        WHERE rn = 1
        ORDER BY created_at DESC
        LIMIT 8

-- V2
SELECT
          session_id,
          profile_id,
          created_at,
          path,
          name,
          country,
          city
        FROM (
          SELECT
            session_id,
            profile_id,
            created_at,
            path,
            name,
            country,
            city,
            row_number() OVER (
              PARTITION BY session_id ORDER BY created_at DESC
            ) AS rn
          FROM events
          WHERE project_id = {p1:String}
            AND created_at >= {p2:String}
            AND ((coalesce(country, ''), coalesce(city, '')) IN (({p3:String}, {p4:String}), ({p5:String}, {p6:String})))
        ) AS latest_event_per_session
        WHERE rn = 1
        ORDER BY created_at DESC
        LIMIT {p7:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": "MX", "p4": "Iztapalapa", "p5": "MX", "p6": "O'Brien", "p7": 8}
```

First row, both sides:

```json
{"session_id": "lQLYoMO0FxZQscKsbvv-nA", "profile_id": "965388", "created_at": "2026-08-25 08:45:01.457", "path": "/inmueble/departamento-en-torre-uma-puebla-8fafd079-af3d-4436-9b2d-274a1fd92d0e", "name": "session_end", "country": "MX", "city": "Iztapalapa"}
```

### getRealtimeActiveSessions

**statement** — IDENTICAL; rows V1/V2 = 50/50; rows_read V1/V2 = 16384/16384; wall V1/V2 = 11 ms / 20 ms; clickhouse_settings: no session_timezone sent (both). `meta` identical: `[{"name": "name", "type": "LowCardinality(String)"}, {"name": "session_id", "type": "String"}, {"name": "created_at", "type": "DateTime64(3)"}, {"name": "path", "type": "String"}, {"name": "origin", "type": "String"}, {"name": "referrer", "type": "String"}, {"name": "referrer_name", "type": "String"}, {"name": "country", "type": "LowCardinality(FixedString(2))"}, {"name": "city", "type": "String"}, {"name": "region", "type": "LowCardinality(String)"}, {"name": "os", "type": "LowCardinality(String)"}, {"name": "os_version", "type": "LowCardinality(String)"}, {"name": "browser", "type": "LowCardinality(String)"}, {"name": "browser_version", "type": "LowCardinality(String)"}, {"name": "device", "type": "LowCardinality(String)"}]`.

```sql
-- V1
SELECT
      name, session_id, created_at, path, origin, referrer, referrer_name,
      country, city, region, os, os_version, browser, browser_version,
      device
    FROM events
    WHERE project_id = 'pincali-production'
      AND created_at >= '2026-08-25 08:19:53'
    ORDER BY created_at DESC
    LIMIT 50

-- V2
SELECT
      name, session_id, created_at, path, origin, referrer, referrer_name,
      country, city, region, os, os_version, browser, browser_version,
      device
    FROM events
    WHERE project_id = {p1:String}
      AND created_at >= {p2:String}
    ORDER BY created_at DESC
    LIMIT {p3:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": 50}
```

First row, both sides:

```json
{"name": "screen_view", "session_id": "ITvWNzUlSBMtKLgwxnbqGg", "created_at": "2026-08-25 08:49:53.034", "path": "/inmobiliarios/lucas_vazquez/inmueble/excelente-departamento-en-renta-en-la-colonia-roma-roma-norte", "origin": "https://www.pincali.com", "referrer": "", "referrer_name": "easybroker.com", "country": "MX", "city": "Miguel Hidalgo", "region": "Mexico City", "os": "Android", "os_version": "10", "browser": "Mobile Chrome", "browser_version": "151.0.0.0", "device": "mobile"}
```

### getRealtimePaths

**statement** — IDENTICAL; rows V1/V2 = 50/50; rows_read V1/V2 = 8192/8192; wall V1/V2 = 11 ms / 11 ms; clickhouse_settings: session_timezone=UTC (both). `meta` identical: `[{"name": "origin", "type": "String"}, {"name": "path", "type": "String"}, {"name": "count", "type": "UInt64"}, {"name": "unique_sessions", "type": "UInt64"}, {"name": "avg_duration", "type": "Float64"}]`.

```sql
-- V1
SELECT origin, path, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM events WHERE project_id = 'pincali-production' AND path != '' AND created_at >= '2026-08-25 08:19:53' GROUP BY path, origin ORDER BY count DESC LIMIT 50

-- V2
SELECT origin, path, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM events WHERE project_id = {p1:String} AND path != {p2:String} AND created_at >= {p3:String} GROUP BY path, origin ORDER BY count DESC LIMIT {p4:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": "", "p3": "2026-08-25 08:19:53", "p4": 50}
```

First row, both sides:

```json
{"origin": "https://www.pincali.com", "path": "/inmuebles/casas-en-venta", "count": 109, "unique_sessions": 1, "avg_duration": 6.55}
```

### getRealtimeReferrals

**statement** — IDENTICAL; rows V1/V2 = 10/10; rows_read V1/V2 = 8192/8192; wall V1/V2 = 15 ms / 10 ms; clickhouse_settings: session_timezone=UTC (both). `meta` identical: `[{"name": "referrer_name", "type": "String"}, {"name": "count", "type": "UInt64"}, {"name": "unique_sessions", "type": "UInt64"}, {"name": "avg_duration", "type": "Float64"}]`.

```sql
-- V1
SELECT referrer_name, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM events WHERE project_id = 'pincali-production' AND referrer_name IS NOT NULL AND created_at >= '2026-08-25 08:19:53' GROUP BY referrer_name ORDER BY count DESC LIMIT 50

-- V2
SELECT referrer_name, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM events WHERE project_id = {p1:String} AND referrer_name IS NOT NULL AND created_at >= {p2:String} GROUP BY referrer_name ORDER BY count DESC LIMIT {p3:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": 50}
```

First row, both sides:

```json
{"referrer_name": "", "count": 2677, "unique_sessions": 582, "avg_duration": 10.43}
```

### getRealtimeGeo

**statement** — IDENTICAL; rows V1/V2 = 50/50; rows_read V1/V2 = 8192/8192; wall V1/V2 = 8 ms / 8 ms; clickhouse_settings: session_timezone=UTC (both). `meta` identical: `[{"name": "country", "type": "LowCardinality(FixedString(2))"}, {"name": "city", "type": "String"}, {"name": "count", "type": "UInt64"}, {"name": "unique_sessions", "type": "UInt64"}, {"name": "avg_duration", "type": "Float64"}]`.

```sql
-- V1
SELECT country, city, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM events WHERE project_id = 'pincali-production' AND created_at >= '2026-08-25 08:19:53' GROUP BY country, city ORDER BY count DESC LIMIT 50

-- V2
SELECT country, city, COUNT(*) as count, COUNT(DISTINCT session_id) as unique_sessions, round(avg(duration)/1000, 2) as avg_duration FROM events WHERE project_id = {p1:String} AND created_at >= {p2:String} GROUP BY country, city ORDER BY count DESC LIMIT {p3:UInt64}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": 50}
```

First row, both sides:

```json
{"country": "MX", "city": "Iztapalapa", "count": 277, "unique_sessions": 9, "avg_duration": 55.82}
```

## Filter shapes

`buildRealtimeBadgeDetailsFilter` picks one of three filters by `detailScope`,
with two fallbacks (`coordinate` with no numeric lat/long falls back to the city
filter; the city filter with no locations falls back to the country filter).
Every branch below is the same five mapBadge statements with only the filter
fragment changed; the `summary` statement's WHERE tail is shown.

### country (`detailScope: "country"`)

**IDENTICAL**; rows V1/V2 = 1/1.

```sql
-- V1
AND coalesce(country, '') IN ('MX', 'O\'')

-- V2
AND coalesce(country, '') IN {p3:Array(String)}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": ["MX", "O'"]}
```

### country, 7-character value (`detailScope: "country"`)

**IDENTICAL ERROR**; rows V1/V2 = None/None. Both sides fail with `Too large string for FixedString column.`

```sql
-- V1
AND coalesce(country, '') IN ('MX', 'O\'Brien')

-- V2
AND coalesce(country, '') IN {p3:Array(String)}
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": ["MX", "O'Brien"]}
```

### city (`detailScope: "city"`)

**IDENTICAL**; rows V1/V2 = 1/1.

```sql
-- V1
AND (coalesce(country, ''), coalesce(city, '')) IN (('MX', 'Iztapalapa'), ('MX', 'O\'Brien'))

-- V2
AND (coalesce(country, ''), coalesce(city, '')) IN (({p3:String}, {p4:String}), ({p5:String}, {p6:String}))
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": "MX", "p4": "Iztapalapa", "p5": "MX", "p6": "O'Brien"}
```

### merged (`detailScope: "merged"`)

**IDENTICAL**; rows V1/V2 = 1/1.

```sql
-- V1
AND (coalesce(country, ''), coalesce(city, '')) IN (('MX', 'Iztapalapa'), ('MX', 'Mexico City'))

-- V2
AND (coalesce(country, ''), coalesce(city, '')) IN (({p3:String}, {p4:String}), ({p5:String}, {p6:String}))
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": "MX", "p4": "Iztapalapa", "p5": "MX", "p6": "Mexico City"}
```

### coordinate (`detailScope: "coordinate"`)

**IDENTICAL**; rows V1/V2 = 1/1.

```sql
-- V1
AND (coalesce(country, ''), coalesce(city, ''), toDecimal64(longitude, 4), toDecimal64(latitude, 4)) IN (('MX', 'Iztapalapa', toDecimal64(-99.0539, 4), toDecimal64(19.3474, 4)), ('MX', '', toDecimal64(-99.0111, 4), toDecimal64(19.4371, 4)))

-- V2
AND (coalesce(country, ''), coalesce(city, ''), toDecimal64(longitude, 4), toDecimal64(latitude, 4)) IN (({p3:String}, {p4:String}, toDecimal64({p5:String}, 4), toDecimal64({p6:String}, 4)), ({p7:String}, {p8:String}, toDecimal64({p9:String}, 4), toDecimal64({p10:String}, 4)))
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": "MX", "p4": "Iztapalapa", "p5": "-99.0539", "p6": "19.3474", "p7": "MX", "p8": "", "p9": "-99.0111", "p10": "19.4371"}
```

### coordinate with no lat/long -> city fallback

**IDENTICAL**; rows V1/V2 = 1/1.

```sql
-- V1
AND (coalesce(country, ''), coalesce(city, '')) IN (('MX', 'Iztapalapa'), ('MX', 'Mexico City'))

-- V2
AND (coalesce(country, ''), coalesce(city, '')) IN (({p3:String}, {p4:String}), ({p5:String}, {p6:String}))
-- V2 params: {"p1": "pincali-production", "p2": "2026-08-25 08:19:53", "p3": "MX", "p4": "Iztapalapa", "p5": "MX", "p6": "Mexico City"}
```

## All 70 pairs

| run | statement | verdict | rows V1/V2 | rows_read V1/V2 | ms V1/V2 | session_timezone V1 → V2 |
|---|---|---|---|---|---|---|
| R1 country | coordinates | IDENTICAL | 440/440 | 8192/8192 | 28/9 | — → — |
| R1 country | summary | IDENTICAL | 1/1 | 30440/30440 | 9/8 | UTC → UTC |
| R1 country | topReferrers | IDENTICAL | 3/3 | 30440/30440 | 10/8 | UTC → UTC |
| R1 country | topPaths | IDENTICAL | 3/3 | 30440/30440 | 9/13 | UTC → UTC |
| R1 country | topEvents | IDENTICAL | 3/3 | 30440/30440 | 15/10 | UTC → UTC |
| R1 country | recentSessions | IDENTICAL | 8/8 | 30440/30440 | 14/16 | — → — |
| R1 country | activeSessions | IDENTICAL | 50/50 | 16384/16384 | 16/18 | — → — |
| R1 country | paths | IDENTICAL | 50/50 | 8192/8192 | 15/17 | UTC → UTC |
| R1 country | referrals | IDENTICAL | 10/10 | 8192/8192 | 9/7 | UTC → UTC |
| R1 country | geo | IDENTICAL | 50/50 | 8192/8192 | 7/10 | UTC → UTC |
| R2 country, 7-char value | coordinates | IDENTICAL | 440/440 | 8192/8192 | 37/9 | — → — |
| R2 country, 7-char value | summary | IDENTICAL ERROR | error/error | — | 4/4 | UTC → UTC |
| R2 country, 7-char value | topReferrers | IDENTICAL ERROR | error/error | — | 3/4 | UTC → UTC |
| R2 country, 7-char value | topPaths | IDENTICAL ERROR | error/error | — | 3/3 | UTC → UTC |
| R2 country, 7-char value | topEvents | IDENTICAL ERROR | error/error | — | 3/3 | UTC → UTC |
| R2 country, 7-char value | recentSessions | IDENTICAL ERROR | error/error | — | 4/4 | — → — |
| R2 country, 7-char value | activeSessions | IDENTICAL | 50/50 | 16384/16384 | 11/21 | — → — |
| R2 country, 7-char value | paths | IDENTICAL | 50/50 | 8192/8192 | 15/10 | UTC → UTC |
| R2 country, 7-char value | referrals | IDENTICAL | 10/10 | 8192/8192 | 9/12 | UTC → UTC |
| R2 country, 7-char value | geo | IDENTICAL | 50/50 | 8192/8192 | 9/10 | UTC → UTC |
| R3 city | coordinates | IDENTICAL | 440/440 | 8192/8192 | 37/11 | — → — |
| R3 city | summary | IDENTICAL | 1/1 | 30440/8192 | 14/8 | UTC → UTC |
| R3 city | topReferrers | IDENTICAL | 3/3 | 30440/8192 | 9/11 | UTC → UTC |
| R3 city | topPaths | IDENTICAL | 3/3 | 30440/8192 | 15/16 | UTC → UTC |
| R3 city | topEvents | IDENTICAL | 3/3 | 30440/30440 | 11/13 | UTC → UTC |
| R3 city | recentSessions | IDENTICAL | 8/8 | 30440/8192 | 13/10 | — → — |
| R3 city | activeSessions | IDENTICAL | 50/50 | 16384/16384 | 11/20 | — → — |
| R3 city | paths | IDENTICAL | 50/50 | 8192/8192 | 11/11 | UTC → UTC |
| R3 city | referrals | IDENTICAL | 10/10 | 8192/8192 | 15/10 | UTC → UTC |
| R3 city | geo | IDENTICAL | 50/50 | 8192/8192 | 8/8 | UTC → UTC |
| R4 merged | coordinates | IDENTICAL | 440/440 | 8192/8192 | 36/11 | — → — |
| R4 merged | summary | IDENTICAL | 1/1 | 30440/8192 | 13/9 | UTC → UTC |
| R4 merged | topReferrers | IDENTICAL | 3/3 | 30440/8192 | 9/8 | UTC → UTC |
| R4 merged | topPaths | IDENTICAL | 3/3 | 30440/8192 | 12/14 | UTC → UTC |
| R4 merged | topEvents | IDENTICAL | 3/3 | 30440/30440 | 23/18 | UTC → UTC |
| R4 merged | recentSessions | IDENTICAL | 8/8 | 30440/8192 | 21/14 | — → — |
| R4 merged | activeSessions | IDENTICAL | 50/50 | 16384/16384 | 11/9 | — → — |
| R4 merged | paths | IDENTICAL | 50/50 | 8192/8192 | 9/11 | UTC → UTC |
| R4 merged | referrals | IDENTICAL | 10/10 | 8192/8192 | 8/11 | UTC → UTC |
| R4 merged | geo | IDENTICAL | 50/50 | 8192/8192 | 11/9 | UTC → UTC |
| R5 coordinate | coordinates | IDENTICAL | 440/440 | 8192/8192 | 35/10 | — → — |
| R5 coordinate | summary | IDENTICAL | 1/1 | 30440/8192 | 16/10 | UTC → UTC |
| R5 coordinate | topReferrers | IDENTICAL | 3/3 | 30440/8192 | 14/15 | UTC → UTC |
| R5 coordinate | topPaths | IDENTICAL | 3/3 | 30440/8192 | 23/12 | UTC → UTC |
| R5 coordinate | topEvents | IDENTICAL | 3/3 | 30440/30440 | 18/15 | UTC → UTC |
| R5 coordinate | recentSessions | IDENTICAL | 8/8 | 30440/8192 | 13/11 | — → — |
| R5 coordinate | activeSessions | IDENTICAL | 50/50 | 16384/16384 | 20/18 | — → — |
| R5 coordinate | paths | IDENTICAL | 50/50 | 8192/8192 | 14/15 | UTC → UTC |
| R5 coordinate | referrals | IDENTICAL | 10/10 | 8192/8192 | 13/13 | UTC → UTC |
| R5 coordinate | geo | IDENTICAL | 50/50 | 8192/8192 | 8/8 | UTC → UTC |
| R6 coordinate -> city fallback | coordinates | IDENTICAL | 440/440 | 8192/8192 | 28/9 | — → — |
| R6 coordinate -> city fallback | summary | IDENTICAL | 1/1 | 8192/8192 | 9/8 | UTC → UTC |
| R6 coordinate -> city fallback | topReferrers | IDENTICAL | 3/3 | 8192/8192 | 8/9 | UTC → UTC |
| R6 coordinate -> city fallback | topPaths | IDENTICAL | 3/3 | 8192/8192 | 9/13 | UTC → UTC |
| R6 coordinate -> city fallback | topEvents | IDENTICAL | 3/3 | 8192/8192 | 12/22 | UTC → UTC |
| R6 coordinate -> city fallback | recentSessions | IDENTICAL | 8/8 | 8192/8192 | 17/15 | — → — |
| R6 coordinate -> city fallback | activeSessions | IDENTICAL | 50/50 | 16384/16384 | 16/13 | — → — |
| R6 coordinate -> city fallback | paths | IDENTICAL | 50/50 | 8192/8192 | 9/8 | UTC → UTC |
| R6 coordinate -> city fallback | referrals | IDENTICAL | 10/10 | 8192/8192 | 8/11 | UTC → UTC |
| R6 coordinate -> city fallback | geo | IDENTICAL | 50/50 | 8192/8192 | 8/10 | UTC → UTC |
| R7 as rendered, real now() | coordinates | IDENTICAL | 0/0 | 193/193 | 30/8 | — → — |
| R7 as rendered, real now() | summary | IDENTICAL | 1/1 | 30440/30440 | 16/14 | UTC → UTC |
| R7 as rendered, real now() | topReferrers | IDENTICAL | 3/3 | 30440/30440 | 11/12 | UTC → UTC |
| R7 as rendered, real now() | topPaths | IDENTICAL | 3/3 | 30440/30440 | 23/20 | UTC → UTC |
| R7 as rendered, real now() | topEvents | IDENTICAL | 3/3 | 30440/30440 | 11/16 | UTC → UTC |
| R7 as rendered, real now() | recentSessions | IDENTICAL | 8/8 | 30440/30440 | 17/18 | — → — |
| R7 as rendered, real now() | activeSessions | IDENTICAL | 50/50 | 16384/16384 | 19/17 | — → — |
| R7 as rendered, real now() | paths | IDENTICAL | 50/50 | 8192/8192 | 14/11 | UTC → UTC |
| R7 as rendered, real now() | referrals | IDENTICAL | 10/10 | 8192/8192 | 15/15 | UTC → UTC |
| R7 as rendered, real now() | geo | IDENTICAL | 50/50 | 8192/8192 | 11/13 | UTC → UTC |

`rows_read` differing between the two sides on some pairs (e.g. R3 `summary`,
30440 V1 / 8192 V2) is ClickHouse's index analysis treating a bound
`{p:String}` differently from an inline literal on the `created_at` range — a
performance note, not a semantic one, and the returned `data` is byte-identical.

**Verdict: 70 cases, all IDENTICAL** (5 of them IDENTICAL ERROR — V1's
FixedString(2) overflow, reproduced byte-for-byte and not fixed here).
