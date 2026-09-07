# SQL migration recipe — `sqlstring` / clix → the `sql` tag

The eight P12 conversion tasks after this one share one procedure, written here
so it is not re-derived eight times. ADR-013 decision 21 is the target:
`sqlstring` = 0, clix = 0, no builder, all three definer files deleted.

The gate is `tooling/gates/p12-grep-gates.sh`. Run `--report` before and after
every conversion; the wave is finished when `--assert` exits 0.

## Baseline 448fa219a68bcc6929b6a11276fbcb414511e8f9

`bash tooling/gates/p12-grep-gates.sh --report`, run 2026-09-07 on this box.
Reproduced verbatim. This commit adds only `tooling/gates/` and `docs/`, neither
of which the gate scans, so the table is byte-identical at the parent and at
this commit.

```
   sqlstring        clix sql-builder  file
----------------------------------------------------------------------------
           1           0           0  apps/start/package.json
           2           0           0  packages/core/package.json
           3           0           0  packages/core/src/buffers/group-buffer.ts
           3           0           0  packages/core/src/buffers/profile-backfill-buffer.ts
           2           0           0  packages/core/src/buffers/profile-buffer.ts
          13           0           0  packages/core/src/modules/chart/src/field-resolution.ts
           2           0           0  packages/core/src/modules/chart/src/filter-cast.ts
          53           0           0  packages/core/src/modules/chart/src/filter-where.ts
          13           0           0  packages/core/src/modules/chart/src/table-filter-where.ts
          49           0           0  packages/core/src/modules/cohort/cohort.service.ts
           0          13           0  packages/core/src/modules/insight/src/cached-clix.ts
           0           2           0  packages/core/src/modules/insight/src/engine.ts
           0          11           0  packages/core/src/modules/insight/src/legacy-scan.ts
           0           5           0  packages/core/src/modules/insight/src/modules/devices.module.ts
           0           5           0  packages/core/src/modules/insight/src/modules/entry-pages.module.ts
           0           5           0  packages/core/src/modules/insight/src/modules/geo.module.ts
           0           5           0  packages/core/src/modules/insight/src/modules/page-trends.module.ts
           0           5           0  packages/core/src/modules/insight/src/modules/referrers.module.ts
           0           4           0  packages/core/src/modules/insight/src/referrer-spikes.ts
           0           1           0  packages/core/src/modules/insight/src/types.ts
           0           2           0  packages/core/src/modules/mcp/src/tools/analytics/property-values.ts
          10           0           5  packages/core/src/modules/organization/organization.service.ts
           2           0           0  packages/core/src/modules/profile/src/profile.sql.ts
           2           2           0  packages/core/src/modules/project/project.service.ts
           8           7           0  packages/core/src/modules/realtime/realtime.service.ts
           0           7           0  packages/core/src/modules/widget/widget.rpc.ts
           0           2           0  packages/core/src/v1-compat.ts
           0           1           1  packages/db/index.ts
           2           0           0  packages/db/package.json
           3           0           0  packages/db/src/clickhouse/client.ts
----------------------------------------------------------------------------
         168          77           6  TOTAL
```

Read the totals as three separate deletions:

- **`sqlstring` 168** — 6 files hold 133 of them: `filter-where.ts` (53),
  `cohort.service.ts` (49), `table-filter-where.ts` (13), `field-resolution.ts`
  (13), `organization.service.ts` (10), `realtime.service.ts` (8). Every one is
  `escape()`; there is no `format()` and no `escapeId()` in the tree.
- **clix 77** — the insight modules (5 × 5 through `createCachedClix`),
  `legacy-scan.ts` (11), `cached-clix.ts` (13, the wrapper itself),
  `realtime.service.ts` (7), `widget.rpc.ts` (7), `referrer-spikes.ts` (4),
  `property-values.ts` (2), `project.service.ts` (2), `engine.ts` (2),
  `types.ts` (1), `v1-compat.ts` (2), `packages/db/index.ts` (1).
- **sql-builder 6** — `organization.service.ts` (5 sites) plus the
  `packages/db/index.ts` re-export.

The three files that DEFINE the builders are excluded from the scan and checked
separately by `--assert`: `packages/db/src/clickhouse/query-builder.ts`, its
`.test.ts`, and `packages/db/src/sql-builder.ts`. `packages/db/index.ts` still
re-exports the first and third with a comment saying they are dead per ADR-013
and blocked on exactly this conversion; that line is the last one to go.

Comment-only mentions do not count. `funnel.sql.ts`, `retention.sql.ts`,
`compiled.ts`, `mcp/src/tools/shared.ts`, `event|profile|session/src/filter-clauses.ts`
and `overview-raw-where.sql.test.ts` all name `sqlstring` or `clix` in prose and
score 0 — that is correct, and it is what makes 0 reachable without editing
history.

## The `sql` tag as it is

`packages/db/src/clickhouse/sql.ts`. Every exported member, with the line it is
defined on:

| Export | Line | What it is |
|---|---|---|
| `sql` (the tag) | 261 (`tag` at 258) | `` sql`…${slot}…` `` → `SqlFragment`. Slots are typed `SqlFragment \| SqlParam`, so a bare string or number in a slot is a **compile-time error**. There is deliberately no `sql.raw()`. |
| `sql.empty` | 262 (`EMPTY_FRAGMENT` 206) | A fragment that renders to nothing. The identity element for conditionals — `cond ? sql\`…\` : sql.empty`. |
| `sql.param(type, value)` | 264 (`param` 162) | Escape hatch for a ClickHouse type with no shortcut. `sql.param('Int64', -1)`, `sql.param('DateTime', …)`. |
| `sql.string(v)` | 265 | `{pN:String}` |
| `sql.uint64(v)` | 266 | `{pN:UInt64}` — `number \| bigint \| string` |
| `sql.float64(v)` | 267 | `{pN:Float64}` |
| `sql.date(v)` | 268 (`toClickhouseDate` 200) | `{pN:Date}`. A `Date` is truncated to `YYYY-MM-DD` **in JS** — ClickHouse rejects a unix timestamp for `Date`, and the driver would send one. |
| `sql.dateTime64(v, precision = 3)` | 269 | `{pN:DateTime64(3)}` |
| `sql.uuid(v)` | 273 | `{pN:UUID}` |
| `sql.bool(v)` | 274 | `{pN:Bool}` |
| `sql.array(itemType, values)` | 275 | `{pN:Array(<itemType>)}` |
| `sql.map(keyType, valueType, v)` | 277 | `{pN:Map(<k>,<v>)}`; accepts a `Map` or a plain object |
| `sql.nullable(innerType, v)` | 284 | `{pN:Nullable(<inner>)}` — the only correct binding for a value that may be `null` |
| `sql.identifier(name)` | 286 | `{pN:Identifier}`, bound server-side. Positional limits below. |
| `sql.id(name, allowed?)` | 288 (`assertSafeIdentifier` 166) | Validated identifier **inlined as text**, for positions `{x:Identifier}` cannot reach. Throws `SqlIdentifierError`; never falls back to interpolation (ADR-013 R3). Pass `allowed` wherever the call site has a closed column set. |
| `sql.join(fragments, separator?)` | 293 | Composes fragments. `separator` is a closed union (`SQL_JOIN_SEPARATORS`, line 151): `', '`, `' AND '`, `' OR '`, `' UNION ALL '`, `' '`, `'\n'`. Empty input → `sql.empty`. |
| `SqlFragment` (class) | 87 | `strings` + `slots`; `new SqlFragment([text], [])` is the one text bridge (see `compiledText` below). |
| `SqlFragment#toStatement()` | 92 | `{ query, query_params }`. Placeholder names are assigned **here**, from one counter, which is why nesting and reuse never collide (ADR-013 R2). |
| `toStatement(query)` | 132 | Accepts `string \| SqlFragment`, so `chQuery` has one code path. |
| `isSqlFragment(v)` | 110 | Type guard. |
| `SqlIdentifierError` | 138 | What `sql.id` throws. |
| `SqlParam` / `SqlParamValue` / `SqlParamType` / `SqlSlot` / `SqlStatement` / `SqlJoinSeparator` | 61 / 46 / 58 / 68 / 71 / 159 | Types. |

`{name:Identifier}` does not work everywhere. The measured matrix is a comment
in `packages/db/src/clickhouse/sql.clickhouse.test.ts:241-269` (ClickHouse
26.1.3.52, 2026-09-02) — SELECT / alias / function argument / WHERE / GROUP BY /
ORDER BY / FROM / JOIN / FROM-inside-a-CTE all work; a qualified
`'alias.column'` in ONE param and a `SETTINGS` value both FAIL. Do not re-derive
it; read it.

## Idiom mapping

`v` is the V1 value. `n` is a column name. Every V2 form below composes; none of
them is a special case.

| # | V1 | V2 | Note |
|---|---|---|---|
| 1 | `` `${n} = ${sqlstring.escape(v)}` `` | ``sql`${sql.id(n, ALLOWED)} = ${sql.string(v)}` `` | The default. `escape` produces `'…'`; the tag produces `{p1:String}` + a param. |
| 2 | `` `${n} = ${sqlstring.escape(String(v).trim())}` `` on a numeric column | ``sql`${col} = ${sql.uint64(v)}` `` **only if** the column is unsigned and the V1 text had no `toFloat64` wrapper | See "numbers" below. When V1 wrote `toFloat64(${n}) > toFloat64('5')`, keep the wrapper and bind `sql.string(v)` — the cast is the behaviour. |
| 3 | `` `${n} > ${sqlstring.escape(v)}` `` where `v` may be negative | ``sql`${col} > ${sql.param('Int64', v)}` `` | `sql.uint64(-1)` throws `BAD_QUERY_PARAMETER` (code 457) at the server. Measured 2026-09-07. |
| 4 | fractional | `sql.float64(v)` | |
| 5 | `` `toDateTime('${d}')` `` / `` toDateTime(${sqlstring.escape(d)}) `` | ``sql`toDateTime(${sql.string(d)})` `` | **Keep `toDateTime(...)` and bind the string.** This is what every landed M7 conversion did (`chart.sql.ts`, `funnel.sql.ts`, `retention.sql.ts`). Do not "improve" it to `sql.dateTime64` — that changes the emitted expression and its parse rules. |
| 6 | `toDate('${d}')` on a calendar day | `sql.date(d)` where the expression is genuinely a `Date` column comparison; otherwise `toDate(${sql.string(d)})` | `sql.date` truncates a JS `Date` to `YYYY-MM-DD` in JS (line 200). |
| 7 | `sqlstring.escape(true)` → `true` | `sql.bool(v)` → `{p:Bool}` | |
| 8 | `sqlstring.escape(null)` → **`NULL`** | `sql.nullable('String', v)` | `sql.string(null as any)` sends `null`, which ClickHouse parses as **`''`** for `String`. Measured 2026-09-07: `SELECT {p1:String}` with `p1=null` returns `""`, while `{p1:Nullable(String)}` returns `null` and `isNull()` = 1. Getting this wrong turns `IS NULL` into `= ''` silently. |
| 9 | `` `${n} IN (${v.map(escape).join(', ')})` `` | ``sql`${col} IN ${sql.array('String', v)}` `` | **Drop the parentheses.** `IN {p:Array(String)}` and `IN ({p:Array(String)})` both work (measured), but the array form is the idiom in every landed conversion. |
| 10 | `IN ()` on an empty list | `IN ${sql.array('String', [])}` | Both return 0 rows; ClickHouse accepts a literal `IN ()`. Measured 2026-09-07. An empty array is a legal param — it does not need a `sql.empty` guard for correctness, only for readability. |
| 11 | `` `${n} LIKE ${sqlstring.escape(`%${v}%`)}` `` | ``sql`${col} LIKE ${sql.string(`%${v}%`)}` `` | **Build the `%` in JS, on the value, exactly as V1 did.** Do not move `%` into the SQL text as `'%' \|\| {p}`; that is a different expression. |
| 12 | `%` / `_` inside `v` | unchanged | Neither `sqlstring.escape` nor a bound param escapes LIKE metacharacters. A user value of `a%b` is a wildcard on both sides. Preserve the defect; do not fix it during a conversion. |
| 13 | `` `${n} = ${escape(v)}` `` where `n` came from user input | ``sql`${sql.id(n, ALLOWED)} = …` `` — **`sql.id` only** | Never `compiledText(n)`, never a template hole. `sql.id` throws on anything that is not a bare or once-qualified identifier (≤64 chars, `[A-Za-z_][A-Za-z0-9_]*`). Pass the closed set as `allowed` whenever one exists — `EVENT_TOP_LEVEL_COLUMNS`, `PROFILE_COLUMNS`, `SESSION_LIST_COLUMNS` are already used this way. |
| 14 | a dynamic column list joined with `', '` | `sql.join(cols.map((c) => sql.id(c, ALLOWED)))` | Default separator is `', '`. For a WHERE conjunction use `sql.join(parts, ' AND ')`; for a disjunction `' OR '`. |
| 15 | a nested builder / sub-select spliced as text | a nested `SqlFragment` in a slot | Nesting is free: names are assigned once at `toStatement()`, depth-first, from one counter. Three levels deep is tested (`sql.test.ts`, "auto-named params (R2)"). |
| 16 | `properties[${escape(k)}]` | ``sql`properties[${sql.string(k)}]` `` | A map **key** is a value, not an identifier. |

### Numbers: which ClickHouse type, and why

There is no "the number type". Pick by the column and by what V1 emitted:

- **`UInt64`** (`sql.uint64`) for counts, limits, offsets, `range(n)` bounds and
  `INTERVAL n` operands — anything that cannot be negative. This is 50 of the 55
  numeric bindings already in core (`retention.sql.ts:97,202,233,243`,
  `sankey.sql.ts:115,175,192`, `chart.sql.ts:620`). It **throws at the server**
  on a negative value (measured: `Value -1 cannot be parsed as UInt64 … code
  457`), which is the point — a limit that went negative is a bug, not a row.
- **`Int64`** via `sql.param('Int64', v)` when the value is a signed offset or a
  user-supplied comparand that may be negative. There is no `sql.int64`
  shortcut; `sql.param` is the sanctioned form (line 264).
- **`Float64`** (`sql.float64`) for fractional values —
  `event.sql.ts:167` and `session.sql.ts:124` bind a lookback in days this way.
- **`String`** when V1 wrapped the value in a cast. `filter-where.ts:489` emits
  ``toFloat64(${name}) > toFloat64('5')`` — a *quoted* comparand fed to
  `toFloat64`. The V2 form is
  ``sql`toFloat64(${col}) > toFloat64(${sql.string(v)})` ``. Binding `Float64`
  there deletes the cast and changes the comparison for a non-numeric input,
  which is exactly the kind of silent drift the per-query proof exists to catch.

One precision note, measured: `sql.uint64('9007199254740993')` binds correctly
but comes back through `format: 'JSON'` as `9007199254740992`. That is the
JSON response, not the parameter. If a converted query returns an id above 2^53,
compare it as a string.

### The `compiledText` seam

`packages/core/src/modules/chart/src/compiled.ts` is the ONE place the chart
module splices pre-compiled SQL text into a fragment:

- `compiledText(text)` (line 14) — `new SqlFragment([text], [])`. Not a
  `sql.raw()`: it is a named export in one file, so the conversion's endpoint is
  "this file has no callers left", which is a grep.
- `compiledTextWithProfileRefs(text, keys)` (line 23) — the same, after running
  `rewriteProfilePropertyRefs`.

**What crosses it today:** the output of `field-resolution.ts` and
`filter-where.ts` — V1's field resolver and filter compiler, both of which still
render `sqlstring`-escaped text. ADR-013 left the shared compilers alone ("two
behaviours, not two builders"), so M7 bridged them rather than rewriting them.
Those two files are 66 of the baseline's 168 `sqlstring` lines.

**Why it disappears:** once `getEventFiltersWhereClause` and the field resolver
return `SqlFragment` instead of `string`, their output is already a fragment and
there is nothing to bridge. Every caller that today writes
`compiledText(getEventFiltersWhereClause(...))` writes the fragment directly.
`compiled.ts` is then deleted whole, and with it the last legitimate
`new SqlFragment([text], [])` in core. The conversion order therefore matters:
**convert the compilers, then delete the seam** — not the other way round.

## clix to sql

A clix chain is a fragment sum. `packages/db/src/clickhouse/query-builder.ts`
defines the methods being replaced (`select`/`from` 117, `where` 150,
`groupBy` 205, `orderBy` 237, `limit` 246, `offset` 253, `having` 211,
`with` 266, joins 297-345, `settings` 261, `toSQL` 570, `execute` 552).

```ts
// V1
const rows = await clix(ch, timezone)
  .select<Row>(['name', 'count() as count'])
  .from(TABLE_NAMES.events)
  .where('project_id', '=', projectId)
  .where('created_at', '>=', clix.datetime(start))
  .groupBy(['name'])
  .orderBy('count', 'DESC')
  .limit(10)
  .execute();

// V2
const statement = sql`
  SELECT ${sql.join([sql.id('name'), sql`count() as count`])}
  FROM ${sql.id(TABLE_NAMES.events)}
  WHERE project_id = ${sql.string(projectId)}
    AND created_at >= toDateTime(${sql.string(start)})
  GROUP BY name
  ORDER BY count DESC
  LIMIT ${sql.uint64(10)}
`;
const rows = await chQuery<Row>(deps, statement, { session_timezone: timezone });
```

Rules that fall out of the shape:

- **Clause order becomes textual, so write the whole statement.** clix let
  `.where()` calls accumulate in any order; a fragment does not. Collect the
  conditions into an array and `sql.join(conditions, ' AND ')`, with
  `sql.empty` for the absent ones — that is what `event.sql.ts`,
  `profile.sql.ts` and `group.sql.ts` do.
- **`.if()` / `.endIf()` has no successor and needs none.** clix's `_skipNext`
  (`query-builder.ts:578-589`) silently swallows the next clause when an
  `endIf()` is missing. A ternary into `sql.empty` cannot.
- **`.rawWhere()` / `.rawJoin()` / `.rawHaving()` / `clix.exp()` are already raw
  text** — those are the easy ones. They become the literal parts of a template,
  with any value in them pulled out into a param.
- **`.settings({ session_timezone })` does not become SQL text.** A `SETTINGS`
  value cannot be a bound param (matrix, above), and clix itself had already
  moved it to `clickhouse_settings` (`query-builder.ts:556` is the commented-out
  text form, `:562` the live one). Pass it as `chQuery`'s settings argument.
- **`.execute()` becomes `chQuery(deps, statement, settings)`** — one code path
  for `string` and `SqlFragment` via `toStatement` (sql.ts:132), keeping
  `withRetry` and round-robin (ADR-013 R1).

### `createCachedClix`

`packages/core/src/modules/insight/src/cached-clix.ts` wraps `clix` so that
`execute()` memoises on `sha256(query.toSQL() + '|' + timezone)` into a
caller-supplied `Map` (lines 22-55). It is used by the five insight modules
(`devices`, `entry-pages`, `geo`, `page-trends`, `referrers`) plus `engine.ts`,
which is 27 of the baseline's 77 clix lines.

The replacement keys on the **rendered statement plus its params**, because two
statements with identical text and different params are different queries — the
whole point of binding:

```ts
// modules/insight/src/cached-query.ts (the shape; write it in the task that needs it)
export function createStatementCache(cache?: Map<string, unknown>) {
  return async function run<T>(
    deps: ServiceDeps,
    fragment: SqlFragment,
    settings?: ClickHouseSettings
  ): Promise<T[]> {
    const { query, query_params } = fragment.toStatement();
    if (!cache) {
      return chQuery<T>(deps, fragment, settings);
    }
    const key = createHash('sha256')
      .update(`${query}|${JSON.stringify(query_params)}|${settings?.session_timezone ?? 'UTC'}`)
      .digest('hex');
    const hit = cache.get(key);
    if (hit !== undefined) {
      return hit as T[];
    }
    const rows = await chQuery<T>(deps, fragment, settings);
    cache.set(key, rows);
    return rows;
  };
}
```

Three things that must hold, and are worth asserting in the task's test:

1. **`query_params` is serialized deterministically.** `toStatement` assigns
   `p1, p2, …` in render order from one counter, so the same fragment always
   produces the same names in the same order and `JSON.stringify` is stable. Do
   not sort the keys — two fragments that differ only in param *order* are
   different queries.
2. **The timezone stays in the key.** clix folded it in (`|${queryTimezone}`,
   line 35) and it defaulted to `'UTC'` (line 24). Keep both, including the
   default, or a cache built under one project's timezone serves another's.
3. **The cache is per-request, not global** — `createCachedClix` takes the `Map`
   from its caller and that does not change. A module-level cache would be a
   cross-tenant read.

## Traps

Every one of these is a way to write a conversion that typechecks, passes
locally, and is wrong.

### 1. Date-shaped substrings — clix re-quoted them, binding cannot

clix's `escapeDate` regex-replaced any `\d{4}-\d{2}-\d{2}` substring **anywhere**
in a SELECT expression or JOIN condition with a quoted literal; `clix.exp()`
existed to opt out. A bound param does not do this, and that is a **behaviour
change per conversion, not a bug fix to celebrate silently**.

Evidence: `packages/db/src/clickhouse/sql.test.ts:221-250`, the
`describe('injection (ported from query-builder.test.ts)')` block — in
particular the case at `:236` named "leaves a path containing a date substring
intact (the escapeDate bug)", asserting
`/blog/2024-03-17-supabase-activity-scheduler` arrives at
`query_params.p1` verbatim.

Consequence for a conversion: if a V1 expression relied on `escapeDate` to quote
something for it, the V2 text must quote it explicitly. The side-by-side proof
is what surfaces this — the two texts will differ visibly.

### 2. `IN` vs `GLOBAL IN` — never rewritten, in either direction

Read `/home/deploy/rewrite-openpanel/docs/ENVIRONMENT.md` before touching any
query on a `Distributed` table. On one node the two are **indistinguishable**;
production Cloud is 2 shards × 2 replicas, where a plain `IN (subquery)` runs
per-shard against that shard's local data and silently returns wrong answers.
`docs/ENVIRONMENT.md` calls it "the single most dangerous edit in this repo".

**The rule for this wave: a conversion changes the binding of values and nothing
about the distribution semantics.** If V1 wrote `IN`, V2 writes `IN`. If V1 wrote
`GLOBAL IN`, V2 writes `GLOBAL IN`. Whether a given site *should* be `GLOBAL IN`
is a separate, pre-existing question — `retention.sql.ts:14` and
`sankey.sql.ts:14-16` are the precedent: the M7 conversions recorded the question
in a comment and did not answer it. Do the same.

The tag does not obstruct either form — `sql.test.ts:143` and
`sql.clickhouse.test.ts:393,410` pin `GLOBAL IN`, `GLOBAL JOIN`, `PREWHERE`,
`FINAL`, `LIMIT BY`, `WITH FILL`, `ARRAY JOIN` and a trailing `SETTINGS` clause
(ADR-013 R4). `packages/db/src/clickhouse/client.ts:118` sets
`distributed_product_mode: 'allow'` globally, which is what keeps today's plain
joins from erroring.

### 3. `session_timezone` — clix always sent `'UTC'`

`clix(client, timezone)` defaults to `'UTC'` when no timezone is passed
(`query-builder.ts:696-697`) and sends it as
`clickhouse_settings.session_timezone` (`:562`). Almost every clix call site
passes no timezone, so almost every clix query ran under `session_timezone =
'UTC'` — including queries whose date expressions would otherwise have used the
server default.

A converted query that just drops the setting changes every `toStartOfDay`,
`toDate` and `toDateTime` in it. The landed conversions pin it explicitly:

```ts
// clix always sent `session_timezone: 'UTC'`; the two queries converted from
// clix keep sending it so their result sets stay identical.
const CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' } as const;
```

— `packages/core/src/modules/session/session.service.ts:178-180`, and the
byte-identical comment at `event.service.ts:94-96` and
`profile.service.ts:66-68`. Copy that constant into any module you convert off
clix. (`chart/src/run-query.ts:21` documents the other half: where a real
project timezone was passed, it still travels as `session_timezone`.)

Also, from the identifier matrix: a `SETTINGS` value **cannot** be a bound
param, of any type. It goes through `chQuery`'s settings argument or nowhere.

### 4. `rewriteProfilePropertyRefs` ran over finished text

`packages/core/src/modules/chart/src/field-resolution.ts:457-467` rewrites
`profile.properties['<key>']` → `` `profile.properties.<key>` `` by string
`split`/`join` over the **whole finished query**. V1 could do that because
everything was text.

The reason it survives the conversion at all is stated at
`compiled.ts:18-22`: bound params were never matched by it — an escaped literal
cannot contain `['`, so the rewrite only ever hit generated column expressions,
never values. That is why applying it per compiled piece before splicing
(`compiledTextWithProfileRefs`, line 23) is provably the same rewrite.

**The trap:** it is a textual pass. If a conversion moves a
`profile.properties['x']` reference out of `field-resolution.ts`'s output and
into a `sql` template's literal part, the rewrite will still match it — and if a
conversion moves one into a *param*, it will silently stop matching. When
converting the field resolver, the rewrite must be applied to the fragment's
literal parts or folded into the resolver itself; it cannot be left as a pass
over `toStatement().query`, because by then the params are gone and the CTE
column names would no longer line up.

### 5. Nullable columns and `null` values

`sqlstring.escape(null)` produces the SQL keyword `NULL`. `sql.string(v)` with
`v === null` produces `{p:String}` bound to `null`, which ClickHouse parses as
the **empty string**. Measured 2026-09-07 against local ClickHouse 26.1.3.52:

```
SELECT {p1:String} AS v            p1=null  ->  [{"v":""}]
SELECT {p1:Nullable(String)} AS v  p1=null  ->  [{"v":null}]   isNull() = 1
```

So: any value whose type is `T | null | undefined` binds through
`sql.nullable('T', v)`, not `sql.string`. If the V1 branch tested for null
before escaping and emitted `IS NULL` / `= ''` instead (as `filter-where.ts:420-425`
does for `isNull`/`isNotNull`), keep that branch — do not collapse it into a
nullable param.

### 6. Empty arrays

`sql.array('String', [])` renders `{p:Array(String)}` bound to `[]`. Measured:
ClickHouse accepts it and `n IN {p:Array(String)}` returns 0 rows, matching
V1's literal `IN ()`, which it also accepts and which also returns 0. So an
empty list is not a correctness hazard — but it is a *semantic* one wherever V1
had an early return. `filter-where.ts:67-69` returns without emitting a clause
when `cohortIds.length === 0`; converting that to `IN ${sql.array('String', [])}`
would turn "no filter" into "match nothing". Preserve the guard.

## Side-by-side proof

M7 produced ten `*.proof.md` files by one method. This is that method, written
as a procedure. It is not optional: `CLAUDE.md` requires that a replaced query
be run against local ClickHouse with the old and new result sets shown side by
side, and "looks equivalent" is explicitly not evidence.

### Procedure

1. **Get the PRE-change file.** `git show HEAD:<path> > /tmp/v1-<name>.ts`, or
   `git worktree add /tmp/v1 HEAD` if the V1 code needs its imports to resolve.
   Import V1 and V2 **side by side in one process** — that is what makes "the
   same inputs" checkable rather than asserted. Do not retype the V1 text by
   hand; generate it by calling the V1 function.
2. **Execute both through one `@clickhouse/client`**, `format: 'JSON'`, the same
   `session_timezone` for both (trap 3 — if V1 appended
   `SETTINGS session_timezone = '<tz>'` to its text, pass that same value as
   `clickhouse_settings.session_timezone` for both sides). V1 goes as `query`;
   V2 goes as `query` + `query_params`.
3. **Compare `data` row for row and `meta` column for column.** Compare as
   **sets** where V1 has no total `ORDER BY` — `ORDER BY date ASC WITH FILL`
   leaves rows sharing a `date` in arbitrary order, and three V1-vs-V1 runs of
   the same case produced three different orders. State in the proof which cases
   were compared as sets and why. Never sort away a difference you have not
   explained.
4. **Record row counts on both sides, for every case.** A case that returns
   **zero rows proves nothing** — it proves the two texts are both syntactically
   valid. Every case in a proof needs a non-zero row count, or an explicit note
   saying which fixture would have produced one and why it does not exist here
   (the `chart.sql.proof.md` cohort cases are the precedent: `cohort_members` is
   empty in the prod-copy, so those cases are stated as 0-row statement
   equivalence with positive-row coverage moved to `openpanel_test`).
5. **A difference is either fixed or explained as a V1 defect reproduced
   identically.** `IDENTICAL ERROR` — both sides failing with the same ClickHouse
   error — is a passing case and must be listed. A difference you cannot explain
   is a failed conversion.
6. **Reproducibility.** Every statement in the proof must be runnable with
   `curl 'http://127.0.0.1:8123/?database=openpanel'`, binding V2's params as
   `param_pN=`. Write the params out.

### Proof-file template

Save as `<module>/src/<name>.sql.proof.md`. The four header lines are mandatory.

````markdown
# <name>.sql.ts — V1 → V2 result-set proof (<TASK-ID>)

<One paragraph: which V1 file and commit sha, how both sides were executed,
what was compared (`data` + `meta`), and which cases were compared as sets
because V1 has no total ORDER BY.>

- **Date**: YYYY-MM-DD.
- **Data**: local prod-copy `openpanel` (<N> events). Projects: <ids and their
  timezones>. Name every fixture that is empty here, and say where its
  positive-row coverage lives instead.
- **Machine**: single-node ClickHouse <version> on a <N>-vCPU box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). <One sentence on whether the statements contain
  `IN (subquery)` on a Distributed table, and that no `IN`/`GLOBAL IN` was
  changed.>
- **Verdict**: N cases, all IDENTICAL.
  <or: N cases, all IDENTICAL; M of the N are IDENTICAL ERROR — V1 defects
  reproduced byte-for-byte, listed below, not fixed here.>

## <case name>

**statement** — IDENTICAL; rows V1/V2 = <n>/<n>; rows_read V1/V2 = <n>/<n>;
wall V1/V2 = <n> ms / <n> ms; clickhouse_settings: session_timezone=<tz> (both).

```sql
-- V1
<text>
-- V2
<text>
-- V2 params: {"p1": …}
```
````

`rows_read` differing between the two sides is normal and is a perf note, not a
semantic one: ClickHouse's index analysis treats a bound `{p:String}` differently
from an inline literal for a `created_at` range. Record it; do not chase it.

## Worked example

One real `sqlstring.escape()` site, converted and executed. Documentation only —
`git diff --stat` for this task shows `tooling/gates/` and `docs/` and nothing
else.

**Site:** `packages/core/src/modules/chart/src/filter-where.ts:439-446`, the
`contains` branch for a top-level column:

```ts
case 'contains': {
  where[id] = `(${value
    .map(
      (val) =>
        `${name} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
    )
    .join(' OR ')})`;
  break;
}
```

**V2** — idiom 11 for the `%` wrapping, idiom 13 for the column, idiom 14 for
the disjunction:

```ts
const where = sql`(${sql.join(
  value.map(
    (val) =>
      sql`${sql.id(name, [...EVENT_TOP_LEVEL_COLUMNS])} LIKE ${sql.string(`%${String(val).trim()}%`)}`
  ),
  ' OR '
)})`;
```

**Inputs** — `filter = { name: 'path', operator: 'contains', value: ['/blog', "o'brien-%_"] }`,
`projectId = 'secure-privacy'`, window `2026-07-01 00:00:00` … `2026-07-08 00:00:00`.
The second value carries a quote (the escaping case) and a `%` and a `_` (the
LIKE-metacharacter case, trap idiom 12).

V1 text, produced by calling the real `getEventFiltersWhereClause`:

```sql
(path LIKE '%/blog%' OR path LIKE '%o\'brien-%_%')
```

V2 fragment, rendered:

```sql
(path LIKE {p1:String} OR path LIKE {p2:String})
-- params: {"p1":"%/blog%","p2":"%o'brien-%_%"}
```

Spliced into the same surrounding count, both sides were executed against local
prod-copy `openpanel` through one `@clickhouse/client` with
`session_timezone: 'UTC'`, `format: 'JSON'`:

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events e
WHERE project_id = 'secure-privacy'
  AND created_at >= toDateTime('2026-07-01 00:00:00')
  AND created_at <  toDateTime('2026-07-08 00:00:00')
  AND (path LIKE '%/blog%' OR path LIKE '%o\'brien-%_%')

-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events e
WHERE project_id = {p1:String}
  AND created_at >= toDateTime({p2:String})
  AND created_at <  toDateTime({p3:String})
  AND (path LIKE {p4:String} OR path LIKE {p5:String})
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"%/blog%","p5":"%o'brien-%_%"}
```

**statement** — IDENTICAL; rows V1/V2 = 1/1; matched events V1/V2 = **60795/60795**;
distinct profiles V1/V2 = **19723/19723**; `meta` V1/V2 =
`[{"name":"c","type":"UInt64"},{"name":"u","type":"UInt64"}]` on both sides;
rows_read V1/V2 = 90057/90057; wall V1/V2 = 33 ms / 31 ms; clickhouse_settings:
`session_timezone=UTC` (both).

- **Date**: 2026-09-07. **Data**: local prod-copy `openpanel`, 319,850,223 events.
- **Machine**: single-node ClickHouse 26.1.3.52 on this box — timings are
  directional only; production is 2 shards × 2 replicas. The statement contains
  no `IN (subquery)`, so no `IN`/`GLOBAL IN` question arises.
- **Verdict**: 1 case, IDENTICAL.

Reproduce either side with `curl`:

```bash
curl -s 'http://127.0.0.1:8123/?database=openpanel&session_timezone=UTC&default_format=JSONCompact' \
  --data-binary "SELECT count() AS c, uniq(profile_id) AS u FROM events e WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (path LIKE '%/blog%' OR path LIKE '%o\\'brien-%_%')"

curl -s -G 'http://127.0.0.1:8123/' \
  --data-urlencode 'database=openpanel' --data-urlencode 'session_timezone=UTC' \
  --data-urlencode 'default_format=JSONCompact' \
  --data-urlencode 'param_p1=secure-privacy' \
  --data-urlencode 'param_p2=2026-07-01 00:00:00' \
  --data-urlencode 'param_p3=2026-07-08 00:00:00' \
  --data-urlencode 'param_p4=%/blog%' \
  --data-urlencode "param_p5=%o'brien-%_%" \
  --data-urlencode "query=SELECT count() AS c, uniq(profile_id) AS u FROM events e WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (path LIKE {p4:String} OR path LIKE {p5:String})"
```

Both return `[[60795, 19723]]`.

Two things this one case already demonstrates, and which the eight conversion
tasks should expect:

- The quote in `o'brien` is handled on both sides — V1 by `sqlstring`'s
  backslash escape, V2 by never putting the value in the text at all.
- The `%` and `_` inside that value are LIKE wildcards on **both** sides. That
  is trap 12: the conversion preserves the defect. `%o'brien-%_%` matches
  nothing here, so its contribution to the count is zero on both sides — which
  is why the case pairs it with `/blog`, whose 60,795 matching rows are what
  makes the proof mean something.

## Checklist per conversion task

1. `bash tooling/gates/p12-grep-gates.sh --report | tail -3` — record the before.
2. Convert. Values become params; identifiers become `sql.id`/`sql.identifier`;
   structure becomes `sql.join`. No `IN`/`GLOBAL IN` change. Keep
   `CLIX_SESSION_TIMEZONE` where clix implied it.
3. Write the proof file from the template. Every case has a non-zero row count
   or a stated reason.
4. `bash tooling/gates/p12-grep-gates.sh --report | tail -3` — the numbers went
   down, and nothing else moved.
5. `pnpm run typecheck` and `cd packages/core && bun test`.
6. When all three totals reach 0, delete `query-builder.ts`,
   `query-builder.test.ts`, `sql-builder.ts` and their `packages/db/index.ts`
   re-exports, drop `sqlstring` and `@types/sqlstring` from the three manifests,
   add `sql.ts` to the barrel (the comment at `sql.ts:21-23` says it joins then),
   and `--assert` exits 0.
