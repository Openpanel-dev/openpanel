# property-values.ts — V1 → V2 result-set proof (M12-006)

Both ClickHouse statements
`packages/core/src/modules/mcp/src/tools/analytics/property-values.ts` runs
(three cases, because `list_event_properties` has an optional `eventName`
branch), executed V1 against V2 on the local prod-copy `openpanel`. V1 is the
file at commit `78098bdc`
(`git show HEAD:packages/core/src/modules/mcp/src/tools/analytics/property-values.ts`),
which builds both statements with `clix`; V2 is the converted file, every value
bound as a `{pN:Type}` param. **Both files were imported into one Bun process
and their tools registered against the same stub MCP server**, then invoked with
the same inputs — the SQL below was produced by calling the real registered tool
handlers with a `deps.ch.query` stub that captures
`{query, query_params, clickhouse_settings}`, never by retyping V1 by hand. Each
captured statement was then executed through the local HTTP interface at
`format: 'JSON'` with the settings its own side asked for; V1 went as `query`,
V2 as `query` + `param_pN`. `data` was compared row-for-row and `meta`
column-for-column.

No case needed set comparison: both statements carry a total `ORDER BY`
(`property_key ASC, name ASC` on the first, `created_at DESC` on the second) and
both sides returned byte-identical row order.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,850,903 events. Project fixture
  `pincali-production`, whose `event_property_values_mv` rows cover 500+
  `(property_key, name)` pairs, 299 of them under `screen_view`, and 1,288,989+
  rows under `(viewed_property, property_id)`. Nothing is empty here — every
  case below returns its full `LIMIT` window or close to it.
- **Machine**: single-node ClickHouse 26.1.3.52 on this box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). **No `IN` / `GLOBAL IN` was changed in either
  direction.** `grep -c 'GLOBAL'` is `0` on the V1 file and `0` on the V2 file,
  and `grep -c ' IN '` is `0` on both — neither statement contains an `IN` of
  any kind, so the distributed-`IN` trap does not arise here at all.
- **Verdict**: **3 cases, all IDENTICAL.**

## `session_timezone`

`clix(client)` with no timezone argument defaults to `'UTC'`
(`query-builder.ts:696-697`) and sends it as
`clickhouse_settings.session_timezone` on every `execute()` (`:562`). Both
statements came off `clix`, so both sent it; V2 sends it through
`CLIX_SESSION_TIMEZONE` and the capture confirms `session_timezone=UTC` on both
sides of all three cases. Dropping it would have changed the meaning of
`created_at DESC` ordering under a non-UTC server default, which is why it is
pinned rather than inherited.

## `list_event_properties` — no `eventName`

**statement** — IDENTICAL; rows V1/V2 = **500/500** (the `LIMIT` window, full);
`meta` V1/V2 =
`[{"name":"property_key","type":"String"},{"name":"event_name","type":"LowCardinality(String)"}]`;
rows_read V1/V2 = 131456/131456; wall V1/V2 = 16 ms / 13 ms;
clickhouse_settings: `session_timezone=UTC` (both). First rows on both sides:
`{"property_key":"__bot","event_name":"applied_filters"}`,
`{"property_key":"__bot","event_name":"authentication_modal_opened"}`, …

```sql
-- V1
SELECT property_key, name as event_name FROM event_property_values_mv
WHERE project_id = 'pincali-production'
GROUP BY property_key, name
ORDER BY property_key ASC, name ASC
LIMIT 500
-- V2
SELECT property_key, name as event_name FROM event_property_values_mv
WHERE project_id = {p1:String}
GROUP BY property_key, name
ORDER BY property_key ASC, name ASC
LIMIT {p2:UInt64}
-- V2 params: {"p1":"pincali-production","p2":500}
```

`LIMIT {p2:UInt64}` is a bound parameter, not inlined text: `UInt64` is the
right type because the scan limit is a compile-time constant that cannot be
negative (recipe, *Numbers*). V1's `500` and V2's bound `500` produce the same
window, which the equal 500-row results and equal `rows_read` show.

## `list_event_properties` — `eventName = 'screen_view'`

**statement** — IDENTICAL; rows V1/V2 = **299/299**; `meta` V1/V2 as above;
rows_read V1/V2 = 98688/98688; wall V1/V2 = 14 ms / 11 ms; clickhouse_settings:
`session_timezone=UTC` (both).

This is the conditional-fragment case: V1 appended a second `.where('name','=',…)`
to the builder after `orderBy`/`limit` and clix folded it into the WHERE in call
order; V2 splices `sql\` AND name = ${sql.string(eventName)}\`` (or `sql.empty`)
into the same position. The two texts below differ only in the binding.

```sql
-- V1
SELECT property_key, name as event_name FROM event_property_values_mv
WHERE project_id = 'pincali-production' AND name = 'screen_view'
GROUP BY property_key, name
ORDER BY property_key ASC, name ASC
LIMIT 500
-- V2
SELECT property_key, name as event_name FROM event_property_values_mv
WHERE project_id = {p1:String} AND name = {p2:String}
GROUP BY property_key, name
ORDER BY property_key ASC, name ASC
LIMIT {p3:UInt64}
-- V2 params: {"p1":"pincali-production","p2":"screen_view","p3":500}
```

The no-`eventName` case above is the other half of that branch: `sql.empty`
renders to nothing, and the resulting text is byte-for-byte V1's minus the
`AND name = …` clause.

## `get_event_property_values`

**statement** — IDENTICAL; rows V1/V2 = **2000/2000** (the `LIMIT` window,
full); `meta` V1/V2 = `[{"name":"value","type":"String"}]`; rows_read V1/V2 =
1082520/1081344; wall V1/V2 = 39 ms / 42 ms; clickhouse_settings:
`session_timezone=UTC` (both). First rows on both sides: `EB-RG9481`,
`EB-SS0279`, `EB-WN5258`, `EB-WH9815`, …

```sql
-- V1
SELECT property_value as value FROM event_property_values_mv
WHERE project_id = 'pincali-production'
  AND name = 'viewed_property'
  AND property_key = 'property_id'
ORDER BY created_at DESC
LIMIT 2000
-- V2
SELECT property_value as value FROM event_property_values_mv
WHERE project_id = {p1:String}
  AND name = {p2:String}
  AND property_key = {p3:String}
ORDER BY created_at DESC
LIMIT {p4:UInt64}
-- V2 params: {"p1":"pincali-production","p2":"viewed_property","p3":"property_id","p4":2000}
```

**Known instability of this table, not of this conversion.** The
`event_property_values_mv` is an AggregatingMergeTree read without `FINAL` whose
`created_at` is outside the sort key, so the top-2000 window reshuffles when a
background merge lands (`docs/TECH_DEBT.md`, *Golden coverage hole:
`insights-event-property-values`*). Both sides of this case were executed back to
back through the same client against the same parts and returned identical rows;
a re-run days later may return a different — but still identical-between-sides —
2000. V1 runs the same query, so the conversion neither introduces nor fixes it.

## The lazy loaders

V1 opened each handler with
`const [ch, { clix, TABLE_NAMES }] = await Promise.all([loadCompatCh(), loadCompatChHelpers()])`
— two awaited dynamic `import('../../../../v1-compat')` hops per tool call, one
of them only to fetch `clix` and `TABLE_NAMES`. V2 imports `sql`, `chQuery` and
core's own `TABLE_NAMES` statically and takes the ClickHouse scope from
`loadCompatChScope()` (ADR-007: no lazy loaders; MCP handlers have a fixed
`@modelcontextprotocol/sdk` signature with no `Ctx` slot, so the v1-compat seam
stays — it is the *dynamic import* that goes). `tools/shared.ts` lost its
dynamic form too: its surviving `loadCompat*` helpers all read a static import
of `v1-compat` (which that file already value-imported for
`resolveClientProjectId`, so the dynamic form deferred nothing), and
`organization.service.ts` lost the last one in its own module. Consequences visible in the capture: the statement
now carries `deps.logger`, so the `query info` line carries the request's scope,
and `tools/shared.ts` no longer exports `loadCompatChHelpers` (property-values
was its only caller) nor `loadCompatCh` (same) — with them the comment saying
property-values "still builds its query with `clix`" is gone.

**The `await`-dynamic-import gate is 0 across the three module trees' source
files**, which is what the acceptance criterion asks for:

```
$ grep -rn "await imp"'ort' --include='*.ts' --exclude='*.test.ts' \
    packages/core/src/modules/mcp packages/core/src/modules/project \
    packages/core/src/modules/organization
$ echo $?
1
```

Measured 2026-09-07 on this tree. The `--exclude=*.test.ts` is not a loophole
around this task, it is the ADR: the modules' 10 test files hold 55 awaited
dynamic imports that are the mandated `bun:test` idiom, not lazy loaders.
ADR-010's acceptance note and `packages/core/AGENTS.md` require top-level
`mock.module` followed by an awaited dynamic import of the subject inside
`beforeAll`, and state that "a static `import` of the subject at the top of the
file defeats it". They are unchanged by this task.

| scope | occurrences |
|---|---:|
| `*.ts` source in the three module trees | **0** |
| `*.test.ts` in the three module trees (the ADR-010 idiom) | 55 |
| the three `*.sql.proof.md` files this task adds (deliberately phrased so they add none) | 0 |

## Tests

No test compares this tool's generated SQL text, so none had to be retargeted to
compare statement + params. `src/integration/tools.test.ts` invokes both tools
against the isolated `openpanel_test` databases and asserts on the returned
shape (`res.columns`, `res.properties`, `res.event`, `res.property`,
`res.values`); its assertions are unchanged and the file is untouched.
(`src/tools/analytics/profiles.test.ts` is the module's one statement+params
comparison, and it belongs to the profile service, not to this file.)

## Reproduce

```bash
# get_event_property_values, V1
curl -s 'http://127.0.0.1:8123/?database=openpanel&session_timezone=UTC&default_format=JSONCompact' \
  --data-binary "SELECT property_value as value FROM event_property_values_mv WHERE project_id = 'pincali-production' AND name = 'viewed_property' AND property_key = 'property_id' ORDER BY created_at DESC LIMIT 2000"

# get_event_property_values, V2
curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=UTC' \
  --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode 'param_p1=pincali-production' \
  --data-urlencode 'param_p2=viewed_property' \
  --data-urlencode 'param_p3=property_id' \
  --data-urlencode 'param_p4=2000' \
  --data-urlencode 'query=SELECT property_value as value FROM event_property_values_mv WHERE project_id = {p1:String} AND name = {p2:String} AND property_key = {p3:String} ORDER BY created_at DESC LIMIT {p4:UInt64}'
```

Both return 2,000 rows.
