# field-resolution.ts + table-filter-where.ts — V1 → V2 result-set proof (M12-003)

V1 is `packages/core/src/modules/chart/src/field-resolution.ts` and
`.../table-filter-where.ts` at `4cd0d76b`
(`git show HEAD:<path>`, materialised as `__v1_*` sibling modules so their
relative imports resolve, together with V1's `filter-cast.ts` twins
`castSql`/`buildTypedClause`; all three deleted after the run). V2 is the
converted pair in this commit. Both were imported into ONE Bun process, called
with the SAME inputs, and each produced expression / clause was spliced into
the SAME surrounding statement and executed through ONE `@clickhouse/client`
with `format: 'JSON'` and `session_timezone=UTC` on both sides — V1 as `query`,
V2 as `query` + `query_params`. `data` and `meta` were compared field for
field, and the two failing cases' error messages in full, untruncated. Every
statement carries a total `ORDER BY` (`ORDER BY c DESC,
toString(v) ASC`) or returns a single aggregate row, so **no case needed set
comparison**.

- **Date**: 2026-09-07.
- **Data**: local prod-copy `openpanel`, 319,850,511 events. Project
  `secure-privacy` — window `2026-07-01 00:00:00` … `2026-07-08 00:00:00`
  (76,885 events, 23,565 sessions), 118,502 profiles, 347 group rows.
  **`cohort_members` is empty in the prod copy** (`SELECT count() FROM
  cohort_members` = 0), so the five cohort cases are 0-row statement
  equivalences; positive-row cohort coverage lives in `openpanel_test` (same
  precedent as `sql.proof.md` and `filter-where.sql.proof.md`). The other
  zero-count cases are listed under *Cases that return no rows, and why*.
- **Machine**: single-node ClickHouse 26.1.3.52 on a 4-vCPU box — timings are
  directional only; production is 2 shards × 2 replicas
  (`docs/ENVIRONMENT.md`). Several statements contain `IN (subquery)` on a
  `Distributed` table (cohort membership, the cross-table profile subselect,
  the group `arrayExists` subselect and `session.performed_event`); **no `IN`
  was converted to `GLOBAL IN` or back** — see *IN / GLOBAL IN* below.
- **Verdict**: **131 cases, all IDENTICAL.** 2 of the 131 are **IDENTICAL
  ERROR** — the same V1 defect (a numeric or boolean filter value compared
  against a String map property) reproduced with the same ClickHouse error
  code, the same type pair, the same operands and the same empty result set;
  listed in full under *The two IDENTICAL ERROR cases*, not fixed here. 10 more
  are compile-time equivalences where both compilers emit no clause at all and
  there is nothing to execute.

## compiled.ts kept because

`packages/core/src/modules/chart/src/compiled.ts` is **NOT deleted**. Neither
compiler's output crosses it any more — `getSelectPropertyKey` and every other
resolver return `SqlFragment`s, and no `compiledText(` /
`compiledTextWithProfileRefs(` call wraps them anywhere in `packages/core`
(`compiledTextWithProfileRefs` is deleted outright). What remains are callers
that splice a name the chart builders generated themselves, none of which is a
value and none of which `sql.id` can express (3+ dot-separated parts, backticks,
double quotes, or SQL keywords):

- `packages/core/src/modules/chart/src/field-resolution.ts:203,505` — the
  `` `cohort-<id>` `` CTE name and the backtick-quoted CTE alias
  `` `profile.properties.<key>` ``.
- `packages/core/src/modules/chart/src/sql.ts:175` — the CTE name in
  `WITH <name> AS (...)`.
- `packages/core/src/modules/chart/src/sql.ts:274` — the double-quoted
  `"profile.<field>"` CTE alias.
- `packages/core/src/modules/chart/src/sql.ts:340` — the
  `` `cohort-<id>` `` CTE name in a JOIN.
- `packages/core/src/modules/chart/src/sql.ts:434,435,469,580` — the
  `label_<n>` aliases / group-by keys and the `MATH_FUNCTION_BY_SEGMENT`
  aggregate keyword.
- `packages/core/src/modules/chart/src/conversion.sql.ts:117` and
  `packages/core/src/modules/chart/conversion.service.ts:137` — the `b_<index>`
  aliases.
- `packages/core/src/modules/chart/src/funnel.sql.ts:78,188,307,366,391` — the
  `b_<index>` aliases, the `windowFunnel` `'strict_increase'` mode keyword and
  the `trim(ifNull(toString(b_<n>), ''))` normalisation.
- `packages/core/src/modules/chart/src/retention.sql.ts:170,171,172,200,206` —
  the `toStartOf*` / `INTERVAL` unit / `>=`-vs-`=` keywords and the
  `interval_<n>_users` aliases.
- `packages/core/src/modules/chart/src/sankey.sql.ts:28,38,48,187,201` — the
  static `arrayFilter`/`arrayMap` expressions and the base CTE name.
- `packages/core/src/modules/overview/src/overview.sql.ts:115` — the
  `toInterval<Unit>(n)` step of a `WITH FILL` clause.

`compiled.ts` also keeps `rewriteProfilePropertyRefs` (moved here from
`field-resolution.ts`, which now imports `compiledText` — the move is what
breaks the cycle) and `fragmentWithProfileRefs`, which is where the
profile-property rewrite lives.

## The profile-ref rewrite, after binding

`rewriteProfilePropertyRefs` is a TEXT pass over `profile.properties['<key>']`
(recipe trap 4). Binding the map key moves that key out of the text, so a pass
over the rendered statement can no longer see it. The rewrite therefore moved
into the fragment, in `fragmentWithProfileRefs`:

1. the fragment tree is **flattened** into one (literals, params) interleaving,
   so "the literal immediately before this param" has an answer even though
   `sql.id` contributes a nested fragment of its own;
2. every literal still goes through the original text rewrite;
3. a `String` param whose value is a narrowed key, sitting between a literal
   ending `profile.properties[` and one starting `]`, is collapsed into
   `` `profile.properties.<key>` ``.

A value can no longer be rewritten even in principle: only a param the resolver
placed in that exact syntactic position is eligible, and it is replaced by an
identifier rather than edited. The negative control is the case *a VALUE equal
to a narrowed key is never rewritten*, where `profile.properties['country'] =
'country'` keeps its bound `'country'` value on both sides.

## `isWildcardPropertyKey`

`filter-where.ts` decided "is this an array expression?" by testing the
RENDERED text of `getSelectPropertyKey` for a `%`. With the key bound, that
test moved into `field-resolution.isWildcardPropertyKey`. Equivalence was
checked in the same process over every shape that reaches it:

```
[
  "properties.__query[*]",
  "properties.__query.*.type",
  "properties.__query.*",
  "properties.__title",
  "profile.properties.country",
  "profile.properties.a%b",
  "properties.a%b",
  "country",
  "has_profile",
  "utm_source",
  "group.name"
]
```

For each name, `V1.getSelectPropertyKey(name, undefined, undefined, undefined,
'e').includes('%')` was compared with `V2.isWildcardPropertyKey(name)`.
**Mismatches: []** — including the two V1
defects the predicate reproduces on purpose: `properties.__query.*` is NOT a
wildcard (its transformed pattern has no `%`, so V1 emitted `arrayMap(...) =
'x'` and failed), and `properties.a%b` IS treated as one (the literal `%` in
the key), which fails at ClickHouse. Neither is fixed here.

## IN / GLOBAL IN

Not rewritten in either direction. `grep -n "GLOBAL IN\|GLOBAL JOIN"` over
`packages/core/src`, `packages/db/src` and `apps/*/src` returns **no
application-code occurrence** — only the two comments that say the rule
(`filter-where.ts:115`, `table-filter-where.ts:13`), two more in
`retention.sql.ts`/`sankey.sql.ts`, and the `sql` tag's own R4 tests. Both
converted files contain zero `GLOBAL`.

`grep -n "\bIN \|NOT IN "` on the two files, V1 (`git show HEAD:<path>`) vs
V2:

| file | V1 | V2 |
|---|---|---|
| `field-resolution.ts` | none | none |
| `table-filter-where.ts` | 6 lines: `IN (…)` / `NOT IN (…)` value lists (97, 108), the cohort subselect (264), the group `arrayExists` subselect (283), the profile subselect (306), `performed_event`'s `IN (…)` (326) | 10 lines: the same six sites, with the cohort (298→300/301) and `performed_event` (363→370/371) ternaries split into an explicit `IN` / `NOT IN` pair each — same emitted keyword, no `GLOBAL` |

The value lists changed shape — V1's `IN ('a', 'b')` became
`IN {p:Array(String)}` (recipe idiom 9) — which is a binding change, not a
distribution one.

## Tests whose assertion moved from TEXT to statement + params

Binding the `properties[<key>]` map key (and the cohort labels) takes those
strings out of the SQL text, so every assertion that named one had to move off
the raw `query`. **No expectation changed what it says** — the expected
substrings are byte-identical to V1's; only the subject they run against
changed. Three test files did this with a local helper that renders
`toStatement()` and substitutes every `{pN:Type}` back to the literal V1
emitted (single-quoted, backslash-escaped, arrays as `(a, b)` — i.e.
`sqlstring.escape`'s output). `sql.test.ts` and `funnel.sql.test.ts`
expose it as a third field `.text` on their existing `render()` result,
alongside the untouched `.sql` / `.params`; `table-filter-where.test.ts` folds
it into the existing `build()` helper, so its call sites are unchanged, and
adds `paramsOf()` for the one new params assertion. A fourth,
`overview-raw-where.sql.test.ts`, has rendered `toStatement()` since M12-002
and has no such helper: its two affected assertions moved onto the placeholder
and the params directly.

| test | before | after |
|---|---|---|
| `sql.test.ts` › `getChartSql` › ``qualifies properties[...] with `e.` when group join is present (fixes AMBIGUOUS_IDENTIFIER)`` | `expect(rendered.sql).not.toMatch(/(?<![._\w])properties\[/)` and `.toContain("e.properties['__query.utm_source']")` | same two assertions on `rendered.text` |
| `sql.test.ts` › `getChartSql` › `property metric (property_sum) with group join is unambiguous` | `expect(rendered.sql).toContain("e.properties['revenue_amount']")` | same on `rendered.text` |
| `sql.test.ts` › `getChartSql` › `routes bare utm_source filter through properties map` | `expect(rendered.sql).toContain("properties['__query.utm_source']")`, `.not.toMatch(/(?<![._\w])utm_source\s*=/)` | same two on `rendered.text` |
| `sql.test.ts` › `getAggregateChartSql` › `properties + group breakdown is unambiguous` | `expect(rendered.sql).toContain("e.properties['__query.utm_source']")` | same on `rendered.text` |
| `sql.test.ts` › `profile-property narrowing` › all five non-EXPLAIN tests (`projects only the referenced keys as scalar columns in the profile CTE`, `falls back to the full Map for wildcard refs`, `never narrows identifier-unsafe keys (backtick falls back to the Map)`, `collects the math-metric property too`, `creates the profile join for a metric-only profile property`) | `const { sql } = await getChartSql(...)`, assertions on `sql` | `const { text } = ...`, the SAME assertions on `text`. Every one of these tests names a `properties['<key>']` access, so the whole destructure moved rather than half of it; the two assertions in the set that carry no bound value (`properties as "profile.properties"`, `LEFT ANY JOIN profile ON profile.id = profile_id`) would still hold on `.sql` |
| `funnel.sql.test.ts` › `profile breakdowns` › `adds the profiles join for a profile.properties breakdown` | ``expect(sql).toContain("properties['plan'] as `profile.properties.plan`")``; the two join assertions on `sql` | the first assertion on `text`; the two join assertions stay on `sql` |
| `funnel.sql.test.ts` › `cohort breakdowns` › `adds the cohort join for a cohort breakdown` | `expect(sql).toContain('Power users')`; the two alias assertions on `sql` | `expect(text).toContain('Power users')` — the cohort label is a bound value now; the two alias assertions stay on `sql` |
| `funnel.sql.test.ts` › `breakdown attribution` › `attributes event-property breakdowns at the entry step` | `expect(sql).toContain("argMinIf(properties['experiment'], created_at,")`; the GROUP BY assertions on `sql` | that one assertion on `chartText(...)`; the GROUP BY assertions stay on `sql` |
| `funnel.sql.test.ts` › `profile-property narrowing` › `joins scalar columns instead of the whole properties Map` | `const { sql } = render(statement)`, five assertions on `sql` | `const { text } = ...`, the same five on `text` |
| `table-filter-where.test.ts` › every `describe.each(TABLES)` case | `build()` returned `buildFilterWhere`'s `Record<string, string>` directly | `build()` renders each returned `SqlFragment` through `toStatement()` and substitutes its params back in. **Every `expect(where.fN).toBe(...)` string is unchanged** — that is the point of the helper, and it is what proves the emitted SQL is V1's |
| `table-filter-where.test.ts` › `escapes a quote in a properties key` | `expect(where.f0).toBe(profileWrap(table, "properties['pl\\'an'] = 'pro'"))` | unchanged, **plus** a new `expect(Object.values(paramsOf(table, filters)[0]!)).toContain("pl'an")` — the assertion that the quote now never reaches the SQL text at all |
| `overview-raw-where.sql.test.ts` › `rewrites utm_* to properties[__query.utm_*] for the events table` | `expect(query).toContain("properties['__query.utm_source']")`, `expect(query_params).toEqual({ p1: 'awn' })` | `expect(query).toContain('properties[{p1:String}]')`, `expect(query_params).toEqual({ p1: '__query.utm_source', p2: 'awn' })` — the map key binds, so it moved from the text into the params. The `not.toMatch(/(?<![._\w])utm_source\s*=/)` assertion is unchanged |
| `overview-raw-where.sql.test.ts` › `keeps utm_* as a top-level column for the sessions table` | `expect(query).not.toContain("properties['__query.utm_source']")` | `expect(query).not.toContain('properties[')` — strictly stronger: the old negative would now pass vacuously (the key is never in the text), this one still fails if a map access appears at all. The `toMatch` and `query_params` assertions are unchanged |

No other test changed what it asserts. `event.sql.test.ts`,
`profile.sql.test.ts` and `session.sql.test.ts` keep their expected SQL text
byte-for-byte; only their `filterClauses` INPUT fixtures changed, from
``compiledFilterClauses({ f0: "(path = '/')" })`` to ``{ f0: sql`(path = '/')` }``
— `compiledFilterClauses` was M12-002's text→fragment adapter for
`buildFilterWhere`'s output, and it dies here with the last text compiler, so
the fixtures build the fragment directly. `field-resolution.test.ts` is
untouched. No test was deleted, skipped or loosened; the only assertion added
anywhere is `table-filter-where.test.ts`'s params check (once per table, under
`describe.each`).

## Cases that return no rows, and why

Eleven of the 131 cases return zero matching rows on BOTH sides. Each is
listed here rather than hidden, per the recipe:

| case | why |
|---|---|
| `cohort resolvers / buildCohortMembershipQuery` | `cohort_members` is empty in the prod copy |
| `cohort resolvers / buildAllCohortsMembershipQuery` | same |
| `cohort / inCohort (cohortIds)` | same |
| `cohort / inCohort on the profiles table (profileIdExpr = id)` | same |
| `cohort / cohort:<id> filter name` | same |
| `profile-ref rewrite / a VALUE equal to a narrowed key is never rewritten` | negative control by construction: no profile has `properties['country'] = 'country'`. What it proves is the RENDERED pair, both of which keep the value bound/quoted rather than rewriting it to an identifier |
| `profile.properties.<key> / value with a quote` | no profile has `country = O'Brien`; the case exists for the escaping, which both sides agree on (V1 backslash-escapes, V2 never puts the value in the text) |
| `profile.properties.<key> / value with LIKE metacharacters (defect preserved)` | `a%b_` matches nothing; the case pins recipe trap 12 — the `%`/`_` stay wildcards on both sides |
| `value types / null value` | `properties['country'] = NULL` is never true. The binding itself (`NULL` keyword vs `Nullable(String)` param) is what the case pins |
| `group.* / group.name isNull` | every group reachable from this window has a non-empty name |
| `typed cast / boolean is (value true …)` | no `longitude` value is `true`/`1`/`yes`; the paired `value false` case matches 116,554 events |

## Numeric filter values bind as the type V1's literal had

V1 inlined a numeric filter value (`sqlstring.escape(5)` -> `5`) and let
ClickHouse infer the literal's type. A bound param has to **declare** one, so
`table-filter-where.ts`'s `valueParam` declares the type ClickHouse would have
inferred for the text V1 emitted, narrowest first — `5` is `UInt8`, `300`
`UInt16`, `-5` `Int8`, a fraction or an out-of-range magnitude `Float64`.
Declaring `Float64` for every number would bind a *different constant* from the
one V1 compared against, observable wherever the comparand's type takes part in
type resolution.

The mapping was cross-checked in one process against ClickHouse's own
inference: for each value, `toTypeName(<the text V1 emitted>)` from the server
vs the type the shipped compiler binds, read back out of the rendered clause
(`buildFilterWhere([{name: 'profile.properties.country', operator: 'is',
value: [v]}], …)`).

```
ok   v1-literal=0                        ch-infers=UInt8     v2-binds=UInt8
ok   v1-literal=1                        ch-infers=UInt8     v2-binds=UInt8
ok   v1-literal=5                        ch-infers=UInt8     v2-binds=UInt8
ok   v1-literal=255                      ch-infers=UInt8     v2-binds=UInt8
ok   v1-literal=256                      ch-infers=UInt16    v2-binds=UInt16
ok   v1-literal=300                      ch-infers=UInt16    v2-binds=UInt16
ok   v1-literal=65535                    ch-infers=UInt16    v2-binds=UInt16
ok   v1-literal=65536                    ch-infers=UInt32    v2-binds=UInt32
ok   v1-literal=4294967295               ch-infers=UInt32    v2-binds=UInt32
ok   v1-literal=4294967296               ch-infers=UInt64    v2-binds=UInt64
ok   v1-literal=10000000000000000000     ch-infers=UInt64    v2-binds=UInt64
ok   v1-literal=18446744073709552000     ch-infers=Float64   v2-binds=Float64
ok   v1-literal=100000000000000000000    ch-infers=Float64   v2-binds=Float64
ok   v1-literal=1e+21                    ch-infers=Float64   v2-binds=Float64
ok   v1-literal=-1                       ch-infers=Int8      v2-binds=Int8
ok   v1-literal=-5                       ch-infers=Int8      v2-binds=Int8
ok   v1-literal=-128                     ch-infers=Int8      v2-binds=Int8
ok   v1-literal=-129                     ch-infers=Int16     v2-binds=Int16
ok   v1-literal=-32768                   ch-infers=Int16     v2-binds=Int16
ok   v1-literal=-32769                   ch-infers=Int32     v2-binds=Int32
ok   v1-literal=-2147483648              ch-infers=Int32     v2-binds=Int32
ok   v1-literal=-2147483649              ch-infers=Int64     v2-binds=Int64
ok   v1-literal=-9223372036854776000     ch-infers=Float64   v2-binds=Float64
ok   v1-literal=-100000000000000000000   ch-infers=Float64   v2-binds=Float64
ok   v1-literal=5.5                      ch-infers=Float64   v2-binds=Float64
ok   v1-literal=10.5                     ch-infers=Float64   v2-binds=Float64
ok   v1-literal=-0.5                     ch-infers=Float64   v2-binds=Float64
ok   v1-literal=0.1                      ch-infers=Float64   v2-binds=Float64
ALL 28 MATCH
```

The two boundary rows are why the type is derived from the *digits* V1 printed
rather than from the JS number: `String(2 ** 64)` and `String(-(2 ** 63))` both
render decimals outside the UInt64 / Int64 range, and ClickHouse types them
`Float64` — which is exactly what V1 fed it.

`filter-cast.ts`'s twin (`typedValueParam`, M12-002) needs none of this: on the
typed path every value is wrapped in `toFloat64OrNull(toString(…))` or a
sibling cast, which erases the declared type before anything else observes it.
The ten `typed cast` cases below are identical either way.

## The two IDENTICAL ERROR cases

Two cases are a V1 defect: the compiler happily emits `properties['<key>'] =
<number>` / `= <boolean>` against a `Map(String, String)`, which ClickHouse
rejects. Both sides fail, both with code **386 `NO_COMMON_TYPE`**, on the same
operand pair, with the same type pair, and neither returns a row. The defect is
reproduced, not fixed.

Their messages are recorded **in full, untruncated**, and they are not
byte-equal. The whole of the difference is that ClickHouse prints a bound
constant as `_CAST(<literal>, '<Type>'…)` in the `while executing …` expression
trace where it prints an inlined literal bare:

```
-- numeric
V1: … arrayElement(__table1.properties, 'country'_String) String String(size = 0), 5_UInt8 UInt8 Const(size = 0, UInt8(size = 1)).
V2: … arrayElement(__table1.properties, 'country'_String) String String(size = 0), _CAST(5_UInt8, 'UInt8'_String) UInt8 Const(size = 0, UInt8(size = 1)).
-- boolean
V1: … arrayElement(__table1.properties, 'country'_String) String String(size = 0), 1_Bool Bool Const(size = 0, UInt8(size = 1)).
V2: … arrayElement(__table1.properties, 'country'_String) String String(size = 0), _CAST(1_Bool, 'Bool'_String) Bool Const(size = 0, UInt8(size = 1)).
```

That token is a property of parameter binding itself — ADR-013's whole point —
and not of either file converted here. Control, with nothing from this module
in it:

```bash
# inlined literal
curl -sG 'http://127.0.0.1:8123/' --data-urlencode "query=SELECT 'a' = 5"
Code: 53. DB::Exception: Cannot convert string 'a' to type UInt8: In scope SELECT 'a' = 5. (TYPE_MISMATCH)

# the same query with the constant bound
curl -sG 'http://127.0.0.1:8123/' --data-urlencode "query=SELECT 'a' = {p1:UInt8}" --data-urlencode 'param_p1=5'
Code: 53. DB::Exception: Cannot convert string 'a' to type UInt8: In scope SELECT 'a' = _CAST(5, 'UInt8'). (TYPE_MISMATCH)

# a bound STRING param renders exactly like the inlined literal — which is why
# every other IDENTICAL ERROR case in this proof and in filter-where.sql.proof.md
# comes out byte-equal
curl -sG 'http://127.0.0.1:8123/' --data-urlencode "query=SELECT [1,2] = {p1:String}" --data-urlencode 'param_p1=a'
Code: 130. DB::Exception: Array does not start with '[' character: while converting 'a' to Array(UInt8): In scope SELECT [1, 2] = 'a'. (CANNOT_READ_ARRAY_FROM_TEXT)
curl -sG 'http://127.0.0.1:8123/' --data-urlencode "query=SELECT [1,2] = 'a'"
Code: 130. DB::Exception: Array does not start with '[' character: while converting 'a' to Array(UInt8): In scope SELECT [1, 2] = 'a'. (CANNOT_READ_ARRAY_FROM_TEXT)
```

So the residue is ClickHouse's rendering of a bound constant in a debug trace,
identical for every bound non-String param anywhere in the repository, and it
carries no result-set, error-code or type information that differs. What *was*
a real difference — the declared type, `Float64` where V1's literal was `UInt8`
— is fixed above, and both cases are `IDENTICAL ERROR` per the recipe (§5:
"both sides failing with the same ClickHouse error").

## Per-case results

`rows_read` and wall time differ run to run and between an inline literal and a
bound param — recorded, not chased (recipe, *Proof-file template*). `rows` is
the number of result rows, not the number of matched events; the matched counts
are in each case's `result` line below.

| branch | case | verdict | rows V1/V2 | rows_read V1/V2 | wall ms V1/V2 |
|---|---|---|---|---|---|
| getSelectPropertyKey | top-level column (no map match) | IDENTICAL | 20/20 | 90057/90057 | 32/23 |
| getSelectPropertyKey | camelCase alias normalised (referrerName) | IDENTICAL | 20/20 | 90057/90057 | 21/17 |
| getSelectPropertyKey | has_profile | IDENTICAL | 2/2 | 90057/90057 | 17/17 |
| getSelectPropertyKey | properties.<key> | IDENTICAL | 20/20 | 90057/90057 | 24/19 |
| getSelectPropertyKey | bare utm_source -> properties.__query.* | IDENTICAL | 12/12 | 90057/90057 | 16/21 |
| getSelectPropertyKey | wildcard -> mapExtractKeyLike | IDENTICAL | 20/20 | 90057/90057 | 27/23 |
| getSelectPropertyKey | nested .*. wildcard | IDENTICAL | 3/3 | 90057/90057 | 33/17 |
| getSelectPropertyKey | group.* via getGroupPropertySql (name) | IDENTICAL | 20/20 | 93416/93416 | 14/12 |
| getSelectPropertyKey | group.* with eventsAlias present (e.properties untouched) | IDENTICAL | 20/20 | 93416/93416 | 27/25 |
| getGroupPropertySql | name | IDENTICAL | 20/20 | 93416/93416 | 15/17 |
| getGroupPropertySql | type | IDENTICAL | 2/2 | 93416/93416 | 17/12 |
| getGroupPropertySql | properties.<key> | IDENTICAL | 3/3 | 93416/93416 | 17/23 |
| getGroupPropertySql | fallback _group_id | IDENTICAL | 20/20 | 93416/93416 | 24/22 |
| getGroupPropertySelect | name | IDENTICAL | 20/20 | 3359/3359 | 6/8 |
| getGroupPropertySelect | type | IDENTICAL | 1/1 | 3359/3359 | 7/7 |
| getGroupPropertySelect | id | IDENTICAL | 20/20 | 3359/3359 | 6/7 |
| getGroupPropertySelect | properties.<key> | IDENTICAL | 4/4 | 3359/3359 | 8/8 |
| getGroupPropertySelect | fallback id | IDENTICAL | 20/20 | 3359/3359 | 3/5 |
| getProfilePropertySelect | id | IDENTICAL | 20/20 | 310976/310976 | 45/46 |
| getProfilePropertySelect | first_name | IDENTICAL | 20/20 | 310976/310976 | 30/31 |
| getProfilePropertySelect | last_name | IDENTICAL | 20/20 | 310976/310976 | 30/31 |
| getProfilePropertySelect | email | IDENTICAL | 20/20 | 310976/310976 | 29/28 |
| getProfilePropertySelect | avatar | IDENTICAL | 1/1 | 310976/310976 | 29/34 |
| getProfilePropertySelect | created_at | IDENTICAL | 20/20 | 310976/310976 | 34/35 |
| getProfilePropertySelect | last_seen_at | IDENTICAL | 20/20 | 310976/310976 | 34/34 |
| getProfilePropertySelect | properties.<key> | IDENTICAL | 20/20 | 310976/310976 | 83/68 |
| getProfilePropertySelect | fallback id | IDENTICAL | 20/20 | 310976/310976 | 41/39 |
| cohort resolvers | buildCohortMembershipQuery | IDENTICAL | 1/1 | 0/0 | 4/3 |
| cohort resolvers | buildAllCohortsMembershipQuery | IDENTICAL | 1/1 | 0/0 | 3/3 |
| cohort resolvers | buildInlineCohortJoin | IDENTICAL | 1/1 | 90057/90057 | 13/14 |
| cohort resolvers | buildAllCohortsLabelExpr (with cohorts, quote in a name) | IDENTICAL | 1/1 | 1/1 | 3/4 |
| cohort resolvers | buildAllCohortsLabelExpr (matching id) | IDENTICAL | 2/2 | 2/2 | 5/3 |
| cohort resolvers | buildAllCohortsLabelExpr (no cohorts) | IDENTICAL | 1/1 | 1/1 | 3/2 |
| cohort resolvers | getCohortCteName | IDENTICAL | 1/1 | 1/1 | 2/3 |
| getSelectPropertyKey | cohort breakdown label (named cohort) | IDENTICAL | 2/2 | 90057/90057 | 18/14 |
| getSelectPropertyKey | cohort breakdown label (unnamed cohort) | IDENTICAL | 2/2 | 90057/90057 | 22/13 |
| profile-ref rewrite | narrowed key: CTE scalar column + rewritten ref | IDENTICAL | 20/20 | 401033/401033 | 101/84 |
| profile-ref rewrite | needsFullMap: Map still selected, ref still narrowed | IDENTICAL | 20/20 | 401033/401033 | 85/80 |
| profile-ref rewrite | no narrowed keys: full Map, ref untouched | IDENTICAL | 20/20 | 401033/401033 | 82/81 |
| profile-ref rewrite | a VALUE equal to a narrowed key is never rewritten | IDENTICAL | 1/1 | 401033/401033 | 74/76 |
| profile.properties.<key> | is (single value) | IDENTICAL | 1/1 | 310976/310976 | 65/66 |
| profile.properties.<key> | is (multi value -> IN) | IDENTICAL | 1/1 | 310976/310976 | 63/63 |
| profile.properties.<key> | isNot (single value) | IDENTICAL | 1/1 | 310976/310976 | 62/64 |
| profile.properties.<key> | isNot (multi value -> NOT IN) | IDENTICAL | 1/1 | 310976/310976 | 65/64 |
| profile.properties.<key> | contains (ILIKE) | IDENTICAL | 1/1 | 310976/310976 | 64/64 |
| profile.properties.<key> | doesNotContain (NOT ILIKE, AND joiner) | IDENTICAL | 1/1 | 310976/310976 | 63/65 |
| profile.properties.<key> | startsWith | IDENTICAL | 1/1 | 310976/310976 | 66/64 |
| profile.properties.<key> | endsWith | IDENTICAL | 1/1 | 310976/310976 | 62/65 |
| profile.properties.<key> | regex (match) | IDENTICAL | 1/1 | 310976/310976 | 67/64 |
| profile.properties.<key> | isNull (empty value array) | IDENTICAL | 1/1 | 310976/310976 | 63/63 |
| profile.properties.<key> | isNotNull (empty value array) | IDENTICAL | 1/1 | 310976/310976 | 65/64 |
| profile.properties.<key> | gt (non-numeric column) | IDENTICAL | 1/1 | 310976/310976 | 66/67 |
| profile.properties.<key> | lt (non-numeric column) | IDENTICAL | 1/1 | 310976/310976 | 67/62 |
| profile.properties.<key> | gte (non-numeric column) | IDENTICAL | 1/1 | 310976/310976 | 66/67 |
| profile.properties.<key> | lte (non-numeric column) | IDENTICAL | 1/1 | 310976/310976 | 65/64 |
| profile.properties.<key> | value with a quote | IDENTICAL | 1/1 | 310976/310976 | 60/63 |
| profile.properties.<key> | value with LIKE metacharacters (defect preserved) | IDENTICAL | 1/1 | 310976/310976 | 67/65 |
| profile.properties.<key> | empty value array with a value operator (dropped) | IDENTICAL (no clause emitted) | – | – | – |
| profile.<column> | is (single value) | IDENTICAL | 1/1 | 433856/433856 | 42/41 |
| profile.<column> | is (multi value -> IN) | IDENTICAL | 1/1 | 442048/442048 | 42/44 |
| profile.<column> | isNot (single value) | IDENTICAL | 1/1 | 18749152/18749152 | 1293/1289 |
| profile.<column> | isNot (multi value -> NOT IN) | IDENTICAL | 1/1 | 18749152/18749152 | 1292/1291 |
| profile.<column> | contains (ILIKE) | IDENTICAL | 1/1 | 310976/310976 | 30/29 |
| profile.<column> | doesNotContain (NOT ILIKE, AND joiner) | IDENTICAL | 1/1 | 310976/310976 | 33/33 |
| profile.<column> | startsWith | IDENTICAL | 1/1 | 310976/310976 | 36/30 |
| profile.<column> | endsWith | IDENTICAL | 1/1 | 310976/310976 | 30/29 |
| profile.<column> | regex (match) | IDENTICAL | 1/1 | 310976/310976 | 32/31 |
| profile.<column> | isNull (empty value array) | IDENTICAL | 1/1 | 310976/310976 | 33/32 |
| profile.<column> | isNotNull (empty value array) | IDENTICAL | 1/1 | 310976/310976 | 30/29 |
| profile.<numeric column> | isNot on created_at (toFloat64 both sides) | IDENTICAL | 1/1 | 310976/310976 | 31/32 |
| profile.<numeric column> | gt on created_at (toFloat64 both sides) | IDENTICAL | 1/1 | 139104/139104 | 21/22 |
| profile.<numeric column> | lt on created_at (toFloat64 both sides) | IDENTICAL | 1/1 | 122880/122880 | 19/16 |
| profile.<numeric column> | gte on created_at (toFloat64 both sides) | IDENTICAL | 1/1 | 139104/139104 | 22/20 |
| profile.<numeric column> | lte on created_at (toFloat64 both sides) | IDENTICAL | 1/1 | 122880/122880 | 18/16 |
| profile.<numeric column> | is on created_at (exact unix second) | IDENTICAL | 1/1 | 73728/73728 | 10/11 |
| profile.<numeric column> | gte on last_seen_at | IDENTICAL | 1/1 | 310976/310976 | 37/29 |
| profile.* cross-table | events: wraps in profile_id IN (SELECT id FROM profiles …) | IDENTICAL | 1/1 | 540281/540281 | 40/38 |
| profile.* cross-table | sessions: wraps in profile_id IN (SELECT id FROM profiles …) | IDENTICAL | 1/1 | 376412/376412 | 37/38 |
| profile.* cross-table | unknown profile field is dropped | IDENTICAL (no clause emitted) | – | – | – |
| value types | numeric value on a String property (both sides fail, code 386) | **IDENTICAL ERROR** | –/– | –/– | 16/4 |
| value types | numeric value on a numeric column (session.duration) | IDENTICAL | 1/1 | 32720/32720 | 10/10 |
| value types | numeric value, gt on a numeric column (toFloat64 both sides) | IDENTICAL | 1/1 | 32720/32720 | 10/11 |
| value types | fractional numeric value on a numeric column | IDENTICAL | 1/1 | 32720/32720 | 16/9 |
| value types | boolean value (escape(true) -> Bool param) | **IDENTICAL ERROR** | –/– | –/– | 7/5 |
| value types | null value (escape(null) -> Nullable(String) param) | IDENTICAL | 1/1 | 0/0 | 5/4 |
| group.* | group.name is | IDENTICAL | 1/1 | 232664/232664 | 14/13 |
| group.* | group.name is (multi -> IN) | IDENTICAL | 1/1 | 232664/232664 | 11/13 |
| group.* | group.name isNot | IDENTICAL | 1/1 | 232664/232664 | 19/14 |
| group.* | group.name contains | IDENTICAL | 1/1 | 232664/232664 | 14/16 |
| group.* | group.name doesNotContain | IDENTICAL | 1/1 | 232664/232664 | 14/16 |
| group.* | group.name startsWith | IDENTICAL | 1/1 | 232664/232664 | 10/10 |
| group.* | group.name endsWith | IDENTICAL | 1/1 | 232664/232664 | 12/13 |
| group.* | group.name regex | IDENTICAL | 1/1 | 232664/232664 | 13/12 |
| group.* | group.name isNull | IDENTICAL | 1/1 | 232664/232664 | 9/12 |
| group.* | group.name isNotNull | IDENTICAL | 1/1 | 232664/232664 | 21/21 |
| group.* | group.type is | IDENTICAL | 1/1 | 232664/232664 | 18/25 |
| group.* | group.properties.<key> isNotNull | IDENTICAL | 1/1 | 232664/232664 | 17/17 |
| group.* | group.<unknown> falls back to id | IDENTICAL | 1/1 | 232664/232664 | 14/17 |
| group.* | no groupsExpr -> dropped | IDENTICAL (no clause emitted) | – | – | – |
| session.* | session.duration gt (numeric column) | IDENTICAL | 1/1 | 32720/32720 | 9/10 |
| session.* | session.event_count gte | IDENTICAL | 1/1 | 24553/24553 | 13/16 |
| session.* | session.screen_view_count lt | IDENTICAL | 1/1 | 32720/32720 | 20/18 |
| session.* | session.revenue lte | IDENTICAL | 1/1 | 32720/32720 | 14/9 |
| session.* | session.is_bounce true | IDENTICAL | 1/1 | 32720/32720 | 10/12 |
| session.* | session.is_bounce false | IDENTICAL | 1/1 | 32720/32720 | 9/8 |
| session.* | session.is_bounce isNot true (negates) | IDENTICAL | 1/1 | 32720/32720 | 8/9 |
| session.* | session.is_bounce empty value -> dropped | IDENTICAL (no clause emitted) | – | – | – |
| session.* | session.performed_event (single value) | IDENTICAL | 1/1 | 671556/671556 | 48/46 |
| session.* | session.performed_event (multi -> IN) | IDENTICAL | 1/1 | 671556/671556 | 49/41 |
| session.* | session.performed_event isNot -> NOT IN | IDENTICAL | 1/1 | 671556/671556 | 35/43 |
| session.* | session.performed_event with a date scope | IDENTICAL | 1/1 | 171877/171877 | 23/51 |
| session.* | session.performed_event empty value -> dropped | IDENTICAL (no clause emitted) | – | – | – |
| session.* | session.<unknown> -> dropped | IDENTICAL (no clause emitted) | – | – | – |
| session.* | session.* on a non-sessions table -> dropped | IDENTICAL (no clause emitted) | – | – | – |
| cohort | inCohort (cohortIds) | IDENTICAL | 1/1 | 0/0 | 10/10 |
| cohort | notInCohort | IDENTICAL | 1/1 | 229305/229305 | 16/15 |
| cohort | inCohort on the profiles table (profileIdExpr = id) | IDENTICAL | 1/1 | 0/0 | 7/7 |
| cohort | cohort:<id> filter name | IDENTICAL | 1/1 | 0/0 | 6/7 |
| cohort | inCohort with no ids -> dropped | IDENTICAL (no clause emitted) | – | – | – |
| typed cast | number is on profile.properties.longitude | IDENTICAL | 1/1 | 310976/310976 | 73/66 |
| typed cast | number gt on profile.properties.longitude | IDENTICAL | 1/1 | 310976/310976 | 68/66 |
| typed cast | number isNot (AND joiner) on profile.properties.longitude | IDENTICAL | 1/1 | 310976/310976 | 67/82 |
| typed cast | boolean is (value true — no truthy longitude here, 0 rows both sides) on profile.properties.longitude | IDENTICAL | 1/1 | 310976/310976 | 63/63 |
| typed cast | boolean is (value false — matches every non-truthy row) on profile.properties.longitude | IDENTICAL | 1/1 | 310976/310976 | 67/66 |
| typed cast | date gte on profile.properties.longitude | IDENTICAL | 1/1 | 310976/310976 | 64/65 |
| typed cast | datetime lt on profile.properties.longitude | IDENTICAL | 1/1 | 310976/310976 | 63/65 |
| typed cast | string type falls through to the raw path on profile.properties.longitude | IDENTICAL | 1/1 | 310976/310976 | 64/61 |
| typed cast | number gte on a group property | IDENTICAL | 1/1 | 232664/232664 | 13/14 |
| typed cast | number gt on a session numeric column | IDENTICAL | 1/1 | 32720/32720 | 9/9 |
| ignored | properties.* on the profiles table -> dropped | IDENTICAL (no clause emitted) | – | – | – |
| ignored | bare column -> dropped | IDENTICAL (no clause emitted) | – | – | – |

## Rendered statements, one per case

Every V1 statement below was produced by CALLING the V1 compiler, not retyped.
Each pair is reproducible with `curl 'http://127.0.0.1:8123/?database=openpanel&session_timezone=UTC'`,
binding V2's params as `param_pN=`.



### getSelectPropertyKey

**top-level column (no map match)** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 90057/90057; wall V1/V2 = 32 ms / 23 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT country AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT country AS v, count() AS c FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"US","c":43329},{"v":"SG","c":3873},{"v":"GB","c":3484},{"v":"IN","c":3110},{"v":"CA","c":2782},{"v":"ES","c":2368},{"v":"PL","c":2250},{"v":"JP","c":1448},{"v":"MX","c":1335},{"v":"BR","c":1214},{"v":"SE","c":1154},{"v":"CN","c":1041},{"v":"ZA","c":982},{"v":"NL","c":698},{"v":"TR","c":656},{"v":"IT","c":634},{"v":"BG","c":541},{"v":"DE","c":427},{"v":"PK","c":408},{"v":"FR","c":381}]`

**camelCase alias normalised (referrerName)** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 90057/90057; wall V1/V2 = 21 ms / 17 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT referrer_name AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT referrer_name AS v, count() AS c FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00"}
```

result (both sides): 20 rows, first: `{"v":"Google","c":58439}`

**has_profile** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 90057/90057; wall V1/V2 = 17 ms / 17 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT if(profile_id != device_id, 'true', 'false') AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT if(profile_id != device_id, 'true', 'false') AS v, count() AS c FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"false","c":74044},{"v":"true","c":2841}]`

**properties.<key>** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 90057/90057; wall V1/V2 = 24 ms / 19 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT properties['__title'] AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT properties[{p1:String}] AS v, count() AS c FROM events WHERE project_id = {p2:String} AND created_at >= toDateTime({p3:String}) AND created_at < toDateTime({p4:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"__title","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"2026-07-08 00:00:00"}
```

result (both sides): 20 rows, first: `{"v":"","c":23963}`

**bare utm_source -> properties.__query.*** — IDENTICAL; rows V1/V2 = 12/12; rows_read V1/V2 = 90057/90057; wall V1/V2 = 16 ms / 21 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT properties['__query.utm_source'] AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT properties[{p1:String}] AS v, count() AS c FROM events WHERE project_id = {p2:String} AND created_at >= toDateTime({p3:String}) AND created_at < toDateTime({p4:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"__query.utm_source","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"","c":76810},{"v":"chatgpt.com","c":41},{"v":"netranks","c":11},{"v":"www.theaienterprise.io","c":9},{"v":"dbt","c":3},{"v":"10words","c":2},{"v":"gralio.ai","c":2},{"v":"under%25252525252525252525252525252525252520site","c":2},{"v":"you.com","c":2},{"v":"aem-abm","c":1},{"v":"employsome","c":1},{"v":"infomotion","c":1}]`

**wildcard -> mapExtractKeyLike** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 90057/90057; wall V1/V2 = 27 ms / 23 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.%'))) AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, {p1:String}))) AS v, count() AS c FROM events WHERE project_id = {p2:String} AND created_at >= toDateTime({p3:String}) AND created_at < toDateTime({p4:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"__query.%","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"2026-07-08 00:00:00"}
```

result (both sides): 20 rows, first: `{"v":[],"c":74809}`

**nested .*. wildcard** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 90057/90057; wall V1/V2 = 33 ms / 17 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, '__query.%.type'))) AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, {p1:String}))) AS v, count() AS c FROM events WHERE project_id = {p2:String} AND created_at >= toDateTime({p3:String}) AND created_at < toDateTime({p4:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"__query.%.type","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":[],"c":76823},{"v":["login"],"c":57},{"v":["signup"],"c":5}]`

**group.* via getGroupPropertySql (name)** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 93416/93416; wall V1/V2 = 14 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT _g.name AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT _g.name AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = {p2:String} AND e.created_at >= toDateTime({p3:String}) AND e.created_at < toDateTime({p4:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"2026-07-08 00:00:00"}
```

result (both sides): 20 rows, first: `{"v":"","c":1856}`

**group.* with eventsAlias present (e.properties untouched)** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 93416/93416; wall V1/V2 = 27 ms / 25 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT e.properties['__title'] AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT e.properties[{p2:String}] AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = {p3:String} AND e.created_at >= toDateTime({p4:String}) AND e.created_at < toDateTime({p5:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"__title","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00"}
```

result (both sides): 20 rows, first: `{"v":"","c":349}`


### getGroupPropertySql

**name** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 93416/93416; wall V1/V2 = 15 ms / 17 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT _g.name AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT _g.name AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = {p2:String} AND e.created_at >= toDateTime({p3:String}) AND e.created_at < toDateTime({p4:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"2026-07-08 00:00:00"}
```

result (both sides): 20 rows, first: `{"v":"","c":1856}`

**type** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 93416/93416; wall V1/V2 = 17 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT _g.type AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT _g.type AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = {p2:String} AND e.created_at >= toDateTime({p3:String}) AND e.created_at < toDateTime({p4:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"","c":1856},{"v":"company","c":997}]`

**properties.<key>** — IDENTICAL; rows V1/V2 = 3/3; rows_read V1/V2 = 93416/93416; wall V1/V2 = 17 ms / 23 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT _g.properties['employees'] AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT _g.properties[{p2:String}] AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = {p3:String} AND e.created_at >= toDateTime({p4:String}) AND e.created_at < toDateTime({p5:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"employees","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"","c":1924},{"v":"1","c":859},{"v":"201","c":70}]`

**fallback _group_id** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 93416/93416; wall V1/V2 = 24 ms / 22 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = 'secure-privacy') SELECT _group_id AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH _g AS (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p1:String}) SELECT _group_id AS v, count() AS c FROM events e ARRAY JOIN groups AS _group_id LEFT ANY JOIN _g ON _g.id = _group_id WHERE e.project_id = {p2:String} AND e.created_at >= toDateTime({p3:String}) AND e.created_at < toDateTime({p4:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"secure-privacy","p3":"2026-07-01 00:00:00","p4":"2026-07-08 00:00:00"}
```

result (both sides): 20 rows, first: `{"v":"1316","c":830}`


### getGroupPropertySelect

**name** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 3359/3359; wall V1/V2 = 6 ms / 8 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT name AS v, count() AS c FROM groups FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT name AS v, count() AS c FROM groups FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"Secureprivacy","c":2}`

**type** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 3359/3359; wall V1/V2 = 7 ms / 7 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT type AS v, count() AS c FROM groups FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT type AS v, count() AS c FROM groups FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): `[{"v":"company","c":347}]`

**id** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 3359/3359; wall V1/V2 = 6 ms / 7 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT id AS v, count() AS c FROM groups FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT id AS v, count() AS c FROM groups FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"10070","c":1}`

**properties.<key>** — IDENTICAL; rows V1/V2 = 4/4; rows_read V1/V2 = 3359/3359; wall V1/V2 = 8 ms / 8 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT properties['employees'] AS v, count() AS c FROM groups FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT properties[{p1:String}] AS v, count() AS c FROM groups FINAL WHERE project_id = {p2:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"employees","p2":"secure-privacy"}
```

result (both sides): `[{"v":"1","c":287},{"v":"","c":50},{"v":"201","c":9},{"v":"5001","c":1}]`

**fallback id** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 3359/3359; wall V1/V2 = 3 ms / 5 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT id AS v, count() AS c FROM groups FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT id AS v, count() AS c FROM groups FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"10070","c":1}`


### getProfilePropertySelect

**id** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 310976/310976; wall V1/V2 = 45 ms / 46 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT id AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT id AS v, count() AS c FROM profiles FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"0000b966f4b0ac3190d964dc7990f4b6","c":1}`

**first_name** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 310976/310976; wall V1/V2 = 30 ms / 31 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT first_name AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT first_name AS v, count() AS c FROM profiles FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"","c":118176}`

**last_name** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 310976/310976; wall V1/V2 = 30 ms / 31 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT last_name AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT last_name AS v, count() AS c FROM profiles FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"","c":118345}`

**email** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 310976/310976; wall V1/V2 = 29 ms / 28 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT email AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT email AS v, count() AS c FROM profiles FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"","c":117249}`

**avatar** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 29 ms / 34 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT avatar AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT avatar AS v, count() AS c FROM profiles FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): `[{"v":"","c":118502}]`

**created_at** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 310976/310976; wall V1/V2 = 34 ms / 35 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT created_at AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT created_at AS v, count() AS c FROM profiles FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"2026-07-30 10:18:52.000","c":40}`

**last_seen_at** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 310976/310976; wall V1/V2 = 34 ms / 34 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT last_seen_at AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT last_seen_at AS v, count() AS c FROM profiles FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"2026-07-30 10:18:52.000","c":40}`

**properties.<key>** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 310976/310976; wall V1/V2 = 83 ms / 68 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT properties['country'] AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT properties[{p1:String}] AS v, count() AS c FROM profiles FINAL WHERE project_id = {p2:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"country","p2":"secure-privacy"}
```

result (both sides): `[{"v":"US","c":59816},{"v":"SG","c":12759},{"v":"GB","c":5163},{"v":"IN","c":4789},{"v":"CA","c":3673},{"v":"PL","c":2944},{"v":"CN","c":2558},{"v":"ES","c":2328},{"v":"MX","c":2024},{"v":"BR","c":1878},{"v":"DE","c":1847},{"v":"JP","c":1819},{"v":"SE","c":1579},{"v":"ZA","c":1326},{"v":"IT","c":1298},{"v":"TR","c":938},{"v":"NL","c":859},{"v":"BD","c":768},{"v":"FR","c":691},{"v":"PK","c":583}]`

**fallback id** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 310976/310976; wall V1/V2 = 41 ms / 39 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT id AS v, count() AS c FROM profiles FINAL WHERE project_id = 'secure-privacy' GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT id AS v, count() AS c FROM profiles FINAL WHERE project_id = {p1:String} GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): 20 rows, first: `{"v":"0000b966f4b0ac3190d964dc7990f4b6","c":1}`


### cohort resolvers

**buildCohortMembershipQuery** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 4 ms / 3 ms; clickhouse_settings: session_timezone=UTC (both).

cohort_members is empty here — 0-row statement equivalence.

```sql
-- V1
SELECT count() AS c FROM (
    SELECT profile_id
    FROM cohort_members FINAL
    WHERE cohort_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      AND project_id = 'secure-privacy'
  )
-- V2
SELECT count() AS c FROM (
    SELECT profile_id
    FROM cohort_members FINAL
    WHERE cohort_id = {p1:String}
      AND project_id = {p2:String}
  )
-- V2 params: {"p1":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","p2":"secure-privacy"}
```

result (both sides): `[{"c":0}]`

**buildAllCohortsMembershipQuery** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 3 ms / 3 ms; clickhouse_settings: session_timezone=UTC (both).

cohort_members is empty here — 0-row statement equivalence.

```sql
-- V1
SELECT count() AS c FROM (
    SELECT profile_id, cohort_id
    FROM cohort_members FINAL
    WHERE project_id = 'secure-privacy'
  )
-- V2
SELECT count() AS c FROM (
    SELECT profile_id, cohort_id
    FROM cohort_members FINAL
    WHERE project_id = {p1:String}
  )
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): `[{"c":0}]`

**buildInlineCohortJoin** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 90057/90057; wall V1/V2 = 13 ms / 14 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c FROM events LEFT ANY JOIN (
    SELECT profile_id
    FROM cohort_members FINAL
    WHERE cohort_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      AND project_id = 'secure-privacy'
  ) AS cohort_aaaaaaaa_bbbb_cccc_dddd_eeeeeeeeeeee ON cohort_aaaaaaaa_bbbb_cccc_dddd_eeeeeeeeeeee.profile_id = events.profile_id WHERE events.project_id = 'secure-privacy' AND events.created_at >= toDateTime('2026-07-01 00:00:00') AND events.created_at < toDateTime('2026-07-08 00:00:00')
-- V2
SELECT count() AS c FROM events LEFT ANY JOIN (
    SELECT profile_id
    FROM cohort_members FINAL
    WHERE cohort_id = {p1:String}
      AND project_id = {p2:String}
  ) AS cohort_aaaaaaaa_bbbb_cccc_dddd_eeeeeeeeeeee ON cohort_aaaaaaaa_bbbb_cccc_dddd_eeeeeeeeeeee.profile_id = events.profile_id WHERE events.project_id = {p3:String} AND events.created_at >= toDateTime({p4:String}) AND events.created_at < toDateTime({p5:String})
-- V2 params: {"p1":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","p2":"secure-privacy","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00"}
```

result (both sides): `[{"c":76885}]`

**buildAllCohortsLabelExpr (with cohorts, quote in a name)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 1/1; wall V1/V2 = 3 ms / 4 ms; clickhouse_settings: session_timezone=UTC (both).

cohort_members is empty, so the label is exercised over a synthetic one-row cohort_id.

```sql
-- V1
SELECT transform(_all_cohorts.cohort_id, ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '11111111-2222-3333-4444-555555555555'], ['Power users', 'O\'Brien\'s list'], 'Unknown') AS v, count() AS c FROM (SELECT 'zzz' AS cohort_id) AS _all_cohorts GROUP BY v
-- V2
SELECT transform(_all_cohorts.cohort_id, {p1:Array(String)}, {p2:Array(String)}, {p3:String}) AS v, count() AS c FROM (SELECT 'zzz' AS cohort_id) AS _all_cohorts GROUP BY v
-- V2 params: {"p1":["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","11111111-2222-3333-4444-555555555555"],"p2":["Power users","O'Brien's list"],"p3":"Unknown"}
```

result (both sides): `[{"v":"Unknown","c":1}]`

**buildAllCohortsLabelExpr (matching id)** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 2/2; wall V1/V2 = 5 ms / 3 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT transform(_all_cohorts.cohort_id, ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '11111111-2222-3333-4444-555555555555'], ['Power users', 'O\'Brien\'s list'], 'Unknown') AS v, count() AS c FROM (SELECT 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' AS cohort_id UNION ALL SELECT '11111111-2222-3333-4444-555555555555') AS _all_cohorts GROUP BY v ORDER BY v
-- V2
SELECT transform(_all_cohorts.cohort_id, {p1:Array(String)}, {p2:Array(String)}, {p3:String}) AS v, count() AS c FROM (SELECT {p4:String} AS cohort_id UNION ALL SELECT {p5:String}) AS _all_cohorts GROUP BY v ORDER BY v
-- V2 params: {"p1":["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","11111111-2222-3333-4444-555555555555"],"p2":["Power users","O'Brien's list"],"p3":"Unknown","p4":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","p5":"11111111-2222-3333-4444-555555555555"}
```

result (both sides): `[{"v":"O'Brien's list","c":1},{"v":"Power users","c":1}]`

**buildAllCohortsLabelExpr (no cohorts)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 1/1; wall V1/V2 = 3 ms / 2 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT 'Unknown' AS v, count() AS c FROM (SELECT 'zzz' AS cohort_id) AS _all_cohorts GROUP BY v
-- V2
SELECT {p1:String} AS v, count() AS c FROM (SELECT 'zzz' AS cohort_id) AS _all_cohorts GROUP BY v
-- V2 params: {"p1":"Unknown"}
```

result (both sides): `[{"v":"Unknown","c":1}]`

**getCohortCteName** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 1/1; wall V1/V2 = 2 ms / 3 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH `cohort-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` AS (SELECT 1 AS x) SELECT count() AS c FROM `cohort-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
-- V2
WITH `cohort-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` AS (SELECT 1 AS x) SELECT count() AS c FROM `cohort-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
-- V2 params: {}
```

result (both sides): `[{"c":1}]`


### getSelectPropertyKey

**cohort breakdown label (named cohort)** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 90057/90057; wall V1/V2 = 18 ms / 14 ms; clickhouse_settings: session_timezone=UTC (both).

The cohort JOIN alias is replaced by `profile_id` on BOTH sides so the label expression itself is exercised against real rows (cohort_members is empty).

```sql
-- V1
SELECT if(notEmpty(profile_id), 'Power users', 'Not Power users') AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT if(notEmpty(profile_id), {p1:String}, {p2:String}) AS v, count() AS c FROM events WHERE project_id = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at < toDateTime({p5:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"Power users","p2":"Not Power users","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"Power users","c":76568},{"v":"Not Power users","c":317}]`

**cohort breakdown label (unnamed cohort)** — IDENTICAL; rows V1/V2 = 2/2; rows_read V1/V2 = 90057/90057; wall V1/V2 = 22 ms / 13 ms; clickhouse_settings: session_timezone=UTC (both).

Same alias substitution as the case above.

```sql
-- V1
SELECT if(notEmpty(profile_id), 'In Cohort', 'Not In Cohort') AS v, count() AS c FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
SELECT if(notEmpty(profile_id), {p1:String}, {p2:String}) AS v, count() AS c FROM events WHERE project_id = {p3:String} AND created_at >= toDateTime({p4:String}) AND created_at < toDateTime({p5:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"In Cohort","p2":"Not In Cohort","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"In Cohort","c":76568},{"v":"Not In Cohort","c":317}]`


### profile-ref rewrite

**narrowed key: CTE scalar column + rewritten ref** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 401033/401033; wall V1/V2 = 101 ms / 84 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", properties['country'] as `profile.properties.country` FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT `profile.properties.country` AS v, count() AS c FROM events e LEFT ANY JOIN profile ON profile.id = e.profile_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH profile AS (SELECT id as "profile.id", properties[{p1:String}] as `profile.properties.country` FROM profiles FINAL WHERE project_id = {p2:String}) SELECT `profile.properties.country` AS v, count() AS c FROM events e LEFT ANY JOIN profile ON profile.id = e.profile_id WHERE e.project_id = {p3:String} AND e.created_at >= toDateTime({p4:String}) AND e.created_at < toDateTime({p5:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"country","p2":"secure-privacy","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"US","c":42927},{"v":"SG","c":3854},{"v":"GB","c":3486},{"v":"IN","c":2941},{"v":"CA","c":2782},{"v":"PL","c":2196},{"v":"ES","c":2077},{"v":"","c":1832},{"v":"JP","c":1434},{"v":"MX","c":1335},{"v":"BR","c":1214},{"v":"SE","c":1138},{"v":"CN","c":1030},{"v":"ZA","c":977},{"v":"NL","c":677},{"v":"TR","c":643},{"v":"IT","c":626},{"v":"BG","c":537},{"v":"PK","c":377},{"v":"FR","c":372}]`

**needsFullMap: Map still selected, ref still narrowed** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 401033/401033; wall V1/V2 = 85 ms / 80 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", properties['country'] as `profile.properties.country`, properties as "profile.properties" FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT `profile.properties.country` AS v, count() AS c FROM events e LEFT ANY JOIN profile ON profile.id = e.profile_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH profile AS (SELECT id as "profile.id", properties[{p1:String}] as `profile.properties.country`, properties as "profile.properties" FROM profiles FINAL WHERE project_id = {p2:String}) SELECT `profile.properties.country` AS v, count() AS c FROM events e LEFT ANY JOIN profile ON profile.id = e.profile_id WHERE e.project_id = {p3:String} AND e.created_at >= toDateTime({p4:String}) AND e.created_at < toDateTime({p5:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"country","p2":"secure-privacy","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"US","c":42927},{"v":"SG","c":3854},{"v":"GB","c":3486},{"v":"IN","c":2941},{"v":"CA","c":2782},{"v":"PL","c":2196},{"v":"ES","c":2077},{"v":"","c":1832},{"v":"JP","c":1434},{"v":"MX","c":1335},{"v":"BR","c":1214},{"v":"SE","c":1138},{"v":"CN","c":1030},{"v":"ZA","c":977},{"v":"NL","c":677},{"v":"TR","c":643},{"v":"IT","c":626},{"v":"BG","c":537},{"v":"PK","c":377},{"v":"FR","c":372}]`

**no narrowed keys: full Map, ref untouched** — IDENTICAL; rows V1/V2 = 20/20; rows_read V1/V2 = 401033/401033; wall V1/V2 = 82 ms / 81 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", properties as "profile.properties" FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT profile.properties['country'] AS v, count() AS c FROM events e LEFT ANY JOIN profile ON profile.id = e.profile_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2
WITH profile AS (SELECT id as "profile.id", properties as "profile.properties" FROM profiles FINAL WHERE project_id = {p1:String}) SELECT profile.properties[{p2:String}] AS v, count() AS c FROM events e LEFT ANY JOIN profile ON profile.id = e.profile_id WHERE e.project_id = {p3:String} AND e.created_at >= toDateTime({p4:String}) AND e.created_at < toDateTime({p5:String}) GROUP BY v ORDER BY c DESC, toString(v) ASC LIMIT 20
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00"}
```

result (both sides): `[{"v":"US","c":42927},{"v":"SG","c":3854},{"v":"GB","c":3486},{"v":"IN","c":2941},{"v":"CA","c":2782},{"v":"PL","c":2196},{"v":"ES","c":2077},{"v":"","c":1832},{"v":"JP","c":1434},{"v":"MX","c":1335},{"v":"BR","c":1214},{"v":"SE","c":1138},{"v":"CN","c":1030},{"v":"ZA","c":977},{"v":"NL","c":677},{"v":"TR","c":643},{"v":"IT","c":626},{"v":"BG","c":537},{"v":"PK","c":377},{"v":"FR","c":372}]`

**a VALUE equal to a narrowed key is never rewritten** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 401033/401033; wall V1/V2 = 74 ms / 76 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
WITH profile AS (SELECT id as "profile.id", properties['country'] as `profile.properties.country` FROM profiles FINAL WHERE project_id = 'secure-privacy') SELECT count() AS c, uniq(e.profile_id) AS u FROM events e LEFT ANY JOIN profile ON profile.id = e.profile_id WHERE e.project_id = 'secure-privacy' AND e.created_at >= toDateTime('2026-07-01 00:00:00') AND e.created_at < toDateTime('2026-07-08 00:00:00') AND `profile.properties.country` = 'country'
-- V2
WITH profile AS (SELECT id as "profile.id", properties[{p1:String}] as `profile.properties.country` FROM profiles FINAL WHERE project_id = {p2:String}) SELECT count() AS c, uniq(e.profile_id) AS u FROM events e LEFT ANY JOIN profile ON profile.id = e.profile_id WHERE e.project_id = {p3:String} AND e.created_at >= toDateTime({p4:String}) AND e.created_at < toDateTime({p5:String}) AND `profile.properties.country` = {p6:String}
-- V2 params: {"p1":"country","p2":"secure-privacy","p3":"secure-privacy","p4":"2026-07-01 00:00:00","p5":"2026-07-08 00:00:00","p6":"country"}
```

result (both sides): `[{"c":0,"u":0}]`


### profile.properties.<key>

**is (single value)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 65 ms / 66 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (properties['country'] = 'US')
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (properties[{p2:String}] = {p3:String})
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"US"}
```

result (both sides): `[{"c":59816,"u":59815}]`

**is (multi value -> IN)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 63 ms / 63 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (properties['country'] IN ('US', 'SE'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (properties[{p2:String}] IN {p3:Array(String)})
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":["US","SE"]}
```

result (both sides): `[{"c":61395,"u":61394}]`

**isNot (single value)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 62 ms / 64 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (properties['country'] != 'US')
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (properties[{p2:String}] != {p3:String})
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"US"}
```

result (both sides): `[{"c":58686,"u":58684}]`

**isNot (multi value -> NOT IN)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 65 ms / 64 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (properties['country'] NOT IN ('US', 'SE'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (properties[{p2:String}] NOT IN {p3:Array(String)})
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":["US","SE"]}
```

result (both sides): `[{"c":57107,"u":57105}]`

**contains (ILIKE)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 64 ms / 64 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] ILIKE '%u%'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] ILIKE {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"%u%"}
```

result (both sides): `[{"c":60860,"u":60859}]`

**doesNotContain (NOT ILIKE, AND joiner)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 63 ms / 65 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] NOT ILIKE '%u%' AND properties['country'] NOT ILIKE '%s%'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] NOT ILIKE {p3:String} AND properties[{p4:String}] NOT ILIKE {p5:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"%u%","p4":"country","p5":"%s%"}
```

result (both sides): `[{"c":40583,"u":40583}]`

**startsWith** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 66 ms / 64 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] ILIKE 'U%'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] ILIKE {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"U%"}
```

result (both sides): `[{"c":60148,"u":60147}]`

**endsWith** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 62 ms / 65 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] ILIKE '%E'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] ILIKE {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"%E"}
```

result (both sides): `[{"c":4602,"u":4602}]`

**regex (match)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 67 ms / 64 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((match(properties['country'], '^U')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((match(properties[{p2:String}], {p3:String})))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"^U"}
```

result (both sides): `[{"c":60148,"u":60147}]`

**isNull (empty value array)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 63 ms / 63 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] = '' OR properties['country'] IS NULL))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] = '' OR properties[{p3:String}] IS NULL))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"country"}
```

result (both sides): `[{"c":2,"u":2}]`

**isNotNull (empty value array)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 65 ms / 64 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] != '' AND properties['country'] IS NOT NULL))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] != '' AND properties[{p3:String}] IS NOT NULL))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"country"}
```

result (both sides): `[{"c":118500,"u":118461}]`

**gt (non-numeric column)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 66 ms / 67 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] > 'S'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] > {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"S"}
```

result (both sides): `[{"c":77915,"u":77720}]`

**lt (non-numeric column)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 67 ms / 62 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] < 'S'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] < {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"S"}
```

result (both sides): `[{"c":40587,"u":40587}]`

**gte (non-numeric column)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 66 ms / 67 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] >= 'S'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] >= {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"S"}
```

result (both sides): `[{"c":77915,"u":77720}]`

**lte (non-numeric column)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 65 ms / 64 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] <= 'S'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] <= {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"S"}
```

result (both sides): `[{"c":40587,"u":40587}]`

**value with a quote** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 60 ms / 63 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (properties['country'] = 'O\'Brien')
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (properties[{p2:String}] = {p3:String})
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"O'Brien"}
```

result (both sides): `[{"c":0,"u":0}]`

**value with LIKE metacharacters (defect preserved)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 67 ms / 65 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] ILIKE '%a%b_%'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((properties[{p2:String}] ILIKE {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":"%a%b_%"}
```

result (both sides): `[{"c":0,"u":0}]`

**empty value array with a value operator (dropped)** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```


### profile.<column>

**is (single value)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 433856/433856; wall V1/V2 = 42 ms / 41 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (email = 'jaden.meharry@gmail.com')
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (email = {p2:String})
-- V2 params: {"p1":"secure-privacy","p2":"jaden.meharry@gmail.com"}
```

result (both sides): `[{"c":2,"u":2}]`

**is (multi value -> IN)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 442048/442048; wall V1/V2 = 42 ms / 44 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (email IN ('jaden.meharry@gmail.com', 'lledua@warwickhotels.com'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (email IN {p2:Array(String)})
-- V2 params: {"p1":"secure-privacy","p2":["jaden.meharry@gmail.com","lledua@warwickhotels.com"]}
```

result (both sides): `[{"c":4,"u":4}]`

**isNot (single value)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 18749152/18749152; wall V1/V2 = 1293 ms / 1289 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (email != 'jaden.meharry@gmail.com')
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (email != {p2:String})
-- V2 params: {"p1":"secure-privacy","p2":"jaden.meharry@gmail.com"}
```

result (both sides): `[{"c":118500,"u":118461}]`

**isNot (multi value -> NOT IN)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 18749152/18749152; wall V1/V2 = 1292 ms / 1291 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (email NOT IN ('jaden.meharry@gmail.com', 'lledua@warwickhotels.com'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (email NOT IN {p2:Array(String)})
-- V2 params: {"p1":"secure-privacy","p2":["jaden.meharry@gmail.com","lledua@warwickhotels.com"]}
```

result (both sides): `[{"c":118498,"u":118456}]`

**contains (ILIKE)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 30 ms / 29 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((email ILIKE '%gmail%'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((email ILIKE {p2:String}))
-- V2 params: {"p1":"secure-privacy","p2":"%gmail%"}
```

result (both sides): `[{"c":861,"u":861}]`

**doesNotContain (NOT ILIKE, AND joiner)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 33 ms / 33 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((email NOT ILIKE '%gmail%' AND email NOT ILIKE '%yahoo%'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((email NOT ILIKE {p2:String} AND email NOT ILIKE {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":"%gmail%","p3":"%yahoo%"}
```

result (both sides): `[{"c":117640,"u":117534}]`

**startsWith** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 36 ms / 30 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((email ILIKE 'j%'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((email ILIKE {p2:String}))
-- V2 params: {"p1":"secure-privacy","p2":"j%"}
```

result (both sides): `[{"c":62,"u":62}]`

**endsWith** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 30 ms / 29 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((email ILIKE '%.com'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((email ILIKE {p2:String}))
-- V2 params: {"p1":"secure-privacy","p2":"%.com"}
```

result (both sides): `[{"c":1128,"u":1128}]`

**regex (match)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 32 ms / 31 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((match(email, 'gmail')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((match(email, {p2:String})))
-- V2 params: {"p1":"secure-privacy","p2":"gmail"}
```

result (both sides): `[{"c":861,"u":861}]`

**isNull (empty value array)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 33 ms / 32 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((email = '' OR email IS NULL))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((email = '' OR email IS NULL))
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): `[{"c":117249,"u":117120}]`

**isNotNull (empty value array)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 30 ms / 29 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((email != '' AND email IS NOT NULL))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((email != '' AND email IS NOT NULL))
-- V2 params: {"p1":"secure-privacy"}
```

result (both sides): `[{"c":1253,"u":1253}]`


### profile.<numeric column>

**isNot on created_at (toFloat64 both sides)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 31 ms / 32 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64(created_at) != toFloat64('1785000000')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64(created_at) != toFloat64({p2:String})))
-- V2 params: {"p1":"secure-privacy","p2":"1785000000"}
```

result (both sides): `[{"c":118502,"u":118465}]`

**gt on created_at (toFloat64 both sides)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 139104/139104; wall V1/V2 = 21 ms / 22 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64(created_at) > toFloat64('1785000000')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64(created_at) > toFloat64({p2:String})))
-- V2 params: {"p1":"secure-privacy","p2":"1785000000"}
```

result (both sides): `[{"c":51926,"u":51926}]`

**lt on created_at (toFloat64 both sides)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 122880/122880; wall V1/V2 = 19 ms / 16 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64(created_at) < toFloat64('1785000000')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64(created_at) < toFloat64({p2:String})))
-- V2 params: {"p1":"secure-privacy","p2":"1785000000"}
```

result (both sides): `[{"c":66576,"u":66464}]`

**gte on created_at (toFloat64 both sides)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 139104/139104; wall V1/V2 = 22 ms / 20 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64(created_at) >= toFloat64('1785000000')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64(created_at) >= toFloat64({p2:String})))
-- V2 params: {"p1":"secure-privacy","p2":"1785000000"}
```

result (both sides): `[{"c":51926,"u":51926}]`

**lte on created_at (toFloat64 both sides)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 122880/122880; wall V1/V2 = 18 ms / 16 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64(created_at) <= toFloat64('1785000000')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64(created_at) <= toFloat64({p2:String})))
-- V2 params: {"p1":"secure-privacy","p2":"1785000000"}
```

result (both sides): `[{"c":66576,"u":66464}]`

**is on created_at (exact unix second)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 73728/73728; wall V1/V2 = 10 ms / 11 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64(created_at) = toFloat64('1782864003')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64(created_at) = toFloat64({p2:String})))
-- V2 params: {"p1":"secure-privacy","p2":"1782864003"}
```

result (both sides): `[{"c":1,"u":1}]`

**gte on last_seen_at** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 37 ms / 29 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64(last_seen_at) >= toFloat64('1785000000')))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64(last_seen_at) >= toFloat64({p2:String})))
-- V2 params: {"p1":"secure-privacy","p2":"1785000000"}
```

result (both sides): `[{"c":52068,"u":52068}]`


### profile.* cross-table

**events: wraps in profile_id IN (SELECT id FROM profiles …)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 540281/540281; wall V1/V2 = 40 ms / 38 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (profile_id IN (SELECT id FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (email != '' AND email IS NOT NULL)))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (profile_id IN (SELECT id FROM profiles FINAL WHERE project_id = {p4:String} AND (email != '' AND email IS NOT NULL)))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy"}
```

result (both sides): `[{"c":1385,"u":54}]`

**sessions: wraps in profile_id IN (SELECT id FROM profiles …)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 376412/376412; wall V1/V2 = 37 ms / 38 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (profile_id IN (SELECT id FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (email != '' AND email IS NOT NULL)))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (profile_id IN (SELECT id FROM profiles FINAL WHERE project_id = {p4:String} AND (email != '' AND email IS NOT NULL)))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy"}
```

result (both sides): `[{"c":86,"u":48}]`

**unknown profile field is dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```


### value types

Re-run after `valueParam` started declaring the type ClickHouse infers for V1's
literal (see *Numeric filter values bind as the type V1's literal had*); the
wrapper parenthesises each compiled clause, hence the doubled parens.

**numeric value on a String property (both sides fail, code 386)** — IDENTICAL ERROR; rows V1/V2 = –/–; rows_read V1/V2 = –/–; wall V1/V2 = 16 ms / 4 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] = 5))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {w1:String} AND ((properties[{p1:String}] = {p2:UInt8}))
-- V2 params: {"w1": "secure-privacy","p1": "country","p2": 5}
```

```
V1 error: There is no supertype for types String, UInt8 because some of them are String/FixedString/Enum and some of them are not: while executing function equals on arguments arrayElement(__table1.properties, 'country'_String) String String(size = 0), 5_UInt8 UInt8 Const(size = 0, UInt8(size = 1)).
V2 error: There is no supertype for types String, UInt8 because some of them are String/FixedString/Enum and some of them are not: while executing function equals on arguments arrayElement(__table1.properties, 'country'_String) String String(size = 0), _CAST(5_UInt8, 'UInt8'_String) UInt8 Const(size = 0, UInt8(size = 1)).
```

**numeric value on a numeric column (session.duration)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 11 ms / 15 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (((toFloat64(duration) = toFloat64(0))))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (((toFloat64(duration) = toFloat64({p1:UInt8}))))
-- V2 params: {"w1": "secure-privacy","w2": "2026-07-01 00:00:00","w3": "2026-07-08 00:00:00","p1": 0}
```

result (both sides): `[{"c":22694,"u":22224}]`

**numeric value, gt on a numeric column (toFloat64 both sides)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 12 ms / 13 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (((toFloat64(duration) > toFloat64(10))))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (((toFloat64(duration) > toFloat64({p1:UInt8}))))
-- V2 params: {"w1": "secure-privacy","w2": "2026-07-01 00:00:00","w3": "2026-07-08 00:00:00","p1": 10}
```

result (both sides): `[{"c":868,"u":702}]`

**fractional numeric value on a numeric column** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 16 ms / 18 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (((toFloat64(duration) > toFloat64(10.5))))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {w1:String} AND created_at >= toDateTime({w2:String}) AND created_at < toDateTime({w3:String}) AND (((toFloat64(duration) > toFloat64({p1:Float64}))))
-- V2 params: {"w1": "secure-privacy","w2": "2026-07-01 00:00:00","w3": "2026-07-08 00:00:00","p1": 10.5}
```

result (both sides): `[{"c":868,"u":702}]`

**boolean value (escape(true) -> Bool param)** — IDENTICAL ERROR; rows V1/V2 = –/–; rows_read V1/V2 = –/–; wall V1/V2 = 7 ms / 5 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((properties['country'] = true))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {w1:String} AND ((properties[{p1:String}] = {p2:Bool}))
-- V2 params: {"w1": "secure-privacy","p1": "country","p2": true}
```

```
V1 error: There is no supertype for types String, Bool because some of them are String/FixedString/Enum and some of them are not: while executing function equals on arguments arrayElement(__table1.properties, 'country'_String) String String(size = 0), 1_Bool Bool Const(size = 0, UInt8(size = 1)).
V2 error: There is no supertype for types String, Bool because some of them are String/FixedString/Enum and some of them are not: while executing function equals on arguments arrayElement(__table1.properties, 'country'_String) String String(size = 0), _CAST(1_Bool, 'Bool'_String) Bool Const(size = 0, UInt8(size = 1)).
```

**null value (escape(null) -> Nullable(String) param)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 5 ms / 4 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (properties['country'] = NULL)
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (properties[{p2:String}] = {p3:Nullable(String)})
-- V2 params: {"p1":"secure-privacy","p2":"country","p3":null}
```

result (both sides): `[{"c":0,"u":0}]`


### group.*

**group.name is** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 14 ms / 13 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND name = 'Narrative'), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND name = {p5:String}), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"Narrative"}
```

result (both sides): `[{"c":138,"u":2}]`

**group.name is (multi -> IN)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 11 ms / 13 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND name IN ('Narrative', 'TLC DigiTech')), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND name IN {p5:Array(String)}), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":["Narrative","TLC DigiTech"]}
```

result (both sides): `[{"c":224,"u":3}]`

**group.name isNot** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 19 ms / 14 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND name != 'Narrative'), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND name != {p5:String}), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"Narrative"}
```

result (both sides): `[{"c":859,"u":29}]`

**group.name contains** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 14 ms / 16 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (name ILIKE '%e%')), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (name ILIKE {p5:String})), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"%e%"}
```

result (both sides): `[{"c":640,"u":22}]`

**group.name doesNotContain** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 14 ms / 16 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (name NOT ILIKE '%e%')), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (name NOT ILIKE {p5:String})), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"%e%"}
```

result (both sides): `[{"c":357,"u":9}]`

**group.name startsWith** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 10 ms / 10 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (name ILIKE 'N%')), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (name ILIKE {p5:String})), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"N%"}
```

result (both sides): `[{"c":159,"u":3}]`

**group.name endsWith** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 12 ms / 13 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (name ILIKE '%h')), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (name ILIKE {p5:String})), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"%h"}
```

result (both sides): `[{"c":86,"u":1}]`

**group.name regex** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 13 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (match(name, '^N'))), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (match(name, {p5:String}))), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"^N"}
```

result (both sides): `[{"c":159,"u":3}]`

**group.name isNull** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 9 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (name = '' OR name IS NULL)), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (name = '' OR name IS NULL)), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy"}
```

result (both sides): `[{"c":0,"u":0}]`

**group.name isNotNull** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 21 ms / 21 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (name != '' AND name IS NOT NULL)), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (name != '' AND name IS NOT NULL)), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy"}
```

result (both sides): `[{"c":997,"u":31}]`

**group.type is** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 18 ms / 25 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND type = 'company'), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND type = {p5:String}), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"company"}
```

result (both sides): `[{"c":997,"u":31}]`

**group.properties.<key> isNotNull** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 17 ms / 17 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (properties['employees'] != '' AND properties['employees'] IS NOT NULL)), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (properties[{p5:String}] != '' AND properties[{p6:String}] IS NOT NULL)), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"employees","p6":"employees"}
```

result (both sides): `[{"c":929,"u":29}]`

**group.<unknown> falls back to id** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 14 ms / 17 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (id != '' AND id IS NOT NULL)), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (id != '' AND id IS NOT NULL)), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy"}
```

result (both sides): `[{"c":997,"u":31}]`

**no groupsExpr -> dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```


### session.*

**session.duration gt (numeric column)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 9 ms / 10 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND ((toFloat64(duration) > toFloat64('10')))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND ((toFloat64(duration) > toFloat64({p4:String})))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"10"}
```

result (both sides): `[{"c":868,"u":702}]`

**session.event_count gte** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 24553/24553; wall V1/V2 = 13 ms / 16 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND ((toFloat64(event_count) >= toFloat64('2')))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND ((toFloat64(event_count) >= toFloat64({p4:String})))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"2"}
```

result (both sides): `[{"c":37,"u":36}]`

**session.screen_view_count lt** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 20 ms / 18 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND ((toFloat64(screen_view_count) < toFloat64('3')))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND ((toFloat64(screen_view_count) < toFloat64({p4:String})))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"3"}
```

result (both sides): `[{"c":23129,"u":22592}]`

**session.revenue lte** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 14 ms / 9 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND ((toFloat64(revenue) <= toFloat64('0')))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND ((toFloat64(revenue) <= toFloat64({p4:String})))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"0"}
```

result (both sides): `[{"c":23565,"u":22863}]`

**session.is_bounce true** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 10 ms / 12 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (is_bounce = 1)
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (is_bounce = 1)
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00"}
```

result (both sides): `[{"c":22726,"u":22251}]`

**session.is_bounce false** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 9 ms / 8 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (is_bounce = 0)
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (is_bounce = 0)
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00"}
```

result (both sides): `[{"c":839,"u":676}]`

**session.is_bounce isNot true (negates)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 8 ms / 9 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (is_bounce = 0)
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (is_bounce = 0)
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00"}
```

result (both sides): `[{"c":839,"u":676}]`

**session.is_bounce empty value -> dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```

**session.performed_event (single value)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 671556/671556; wall V1/V2 = 48 ms / 46 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (id IN (SELECT DISTINCT session_id FROM events WHERE project_id = 'secure-privacy' AND name = 'screen_view'))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (id IN (SELECT DISTINCT session_id FROM events WHERE project_id = {p4:String} AND name = {p5:String}))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"screen_view"}
```

result (both sides): `[{"c":23564,"u":22863}]`

**session.performed_event (multi -> IN)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 671556/671556; wall V1/V2 = 49 ms / 41 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (id IN (SELECT DISTINCT session_id FROM events WHERE project_id = 'secure-privacy' AND name IN ('screen_view', 'session_start')))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (id IN (SELECT DISTINCT session_id FROM events WHERE project_id = {p4:String} AND name IN {p5:Array(String)}))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":["screen_view","session_start"]}
```

result (both sides): `[{"c":23565,"u":22863}]`

**session.performed_event isNot -> NOT IN** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 671556/671556; wall V1/V2 = 35 ms / 43 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (id NOT IN (SELECT DISTINCT session_id FROM events WHERE project_id = 'secure-privacy' AND name = 'screen_view'))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (id NOT IN (SELECT DISTINCT session_id FROM events WHERE project_id = {p4:String} AND name = {p5:String}))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"screen_view"}
```

result (both sides): `[{"c":1,"u":1}]`

**session.performed_event with a date scope** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 171877/171877; wall V1/V2 = 23 ms / 51 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (id IN (SELECT DISTINCT session_id FROM events WHERE project_id = 'secure-privacy' AND toDate(created_at) BETWEEN toDate('2026-07-01 00:00:00') AND toDate('2026-07-08 00:00:00') AND name = 'screen_view'))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (id IN (SELECT DISTINCT session_id FROM events WHERE project_id = {p4:String} AND toDate(created_at) BETWEEN toDate({p5:String}) AND toDate({p6:String}) AND name = {p7:String}))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"2026-07-01 00:00:00","p6":"2026-07-08 00:00:00","p7":"screen_view"}
```

result (both sides): `[{"c":23564,"u":22863}]`

**session.performed_event empty value -> dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```

**session.<unknown> -> dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```

**session.* on a non-sessions table -> dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```


### cohort

**inCohort (cohortIds)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 10 ms / 10 ms; clickhouse_settings: session_timezone=UTC (both).

cohort_members is empty in the prod copy — 0 matching rows on both sides.

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') AND project_id = 'secure-privacy'))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN {p4:Array(String)} AND project_id = {p5:String}))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],"p5":"secure-privacy"}
```

result (both sides): `[{"c":0,"u":0}]`

**notInCohort** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 229305/229305; wall V1/V2 = 16 ms / 15 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (profile_id NOT IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') AND project_id = 'secure-privacy'))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (profile_id NOT IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN {p4:Array(String)} AND project_id = {p5:String}))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],"p5":"secure-privacy"}
```

result (both sides): `[{"c":76885,"u":22983}]`

**inCohort on the profiles table (profileIdExpr = id)** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 7 ms / 7 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') AND project_id = 'secure-privacy'))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN {p2:Array(String)} AND project_id = {p3:String}))
-- V2 params: {"p1":"secure-privacy","p2":["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],"p3":"secure-privacy"}
```

result (both sides): `[{"c":0,"u":0}]`

**cohort:<id> filter name** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 0/0; wall V1/V2 = 6 ms / 7 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') AND project_id = 'secure-privacy'))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id IN {p4:Array(String)} AND project_id = {p5:String}))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],"p5":"secure-privacy"}
```

result (both sides): `[{"c":0,"u":0}]`

**inCohort with no ids -> dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```


### typed cast

**number is on profile.properties.longitude** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 73 ms / 66 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64OrNull(toString(properties['longitude'])) = toFloat64OrNull(toString('-77.4903'))))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64OrNull(toString(properties[{p2:String}])) = toFloat64OrNull(toString({p3:String}))))
-- V2 params: {"p1":"secure-privacy","p2":"longitude","p3":"-77.4903"}
```

result (both sides): `[{"c":10852,"u":10852}]`

**number gt on profile.properties.longitude** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 68 ms / 66 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64OrNull(toString(properties['longitude'])) > toFloat64OrNull(toString('0'))))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64OrNull(toString(properties[{p2:String}])) > toFloat64OrNull(toString({p3:String}))))
-- V2 params: {"p1":"secure-privacy","p2":"longitude","p3":"0"}
```

result (both sides): `[{"c":41665,"u":41663}]`

**number isNot (AND joiner) on profile.properties.longitude** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 67 ms / 82 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toFloat64OrNull(toString(properties['longitude'])) != toFloat64OrNull(toString('0')) AND toFloat64OrNull(toString(properties['longitude'])) != toFloat64OrNull(toString('1'))))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toFloat64OrNull(toString(properties[{p2:String}])) != toFloat64OrNull(toString({p3:String})) AND toFloat64OrNull(toString(properties[{p4:String}])) != toFloat64OrNull(toString({p5:String}))))
-- V2 params: {"p1":"secure-privacy","p2":"longitude","p3":"0","p4":"longitude","p5":"1"}
```

result (both sides): `[{"c":118501,"u":118462}]`

**boolean is (value true — no truthy longitude here, 0 rows both sides) on profile.properties.longitude** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 63 ms / 63 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((if(lower(trim(toString(properties['longitude']))) IN ('true', '1', 'yes'), 1, 0) = if(lower(trim(toString('true'))) IN ('true', '1', 'yes'), 1, 0)))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((if(lower(trim(toString(properties[{p2:String}]))) IN ('true', '1', 'yes'), 1, 0) = if(lower(trim(toString({p3:String}))) IN ('true', '1', 'yes'), 1, 0)))
-- V2 params: {"p1":"secure-privacy","p2":"longitude","p3":"true"}
```

result (both sides): `[{"c":0,"u":0}]`

**boolean is (value false — matches every non-truthy row) on profile.properties.longitude** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 67 ms / 66 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((if(lower(trim(toString(properties['longitude']))) IN ('true', '1', 'yes'), 1, 0) = if(lower(trim(toString('false'))) IN ('true', '1', 'yes'), 1, 0)))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((if(lower(trim(toString(properties[{p2:String}]))) IN ('true', '1', 'yes'), 1, 0) = if(lower(trim(toString({p3:String}))) IN ('true', '1', 'yes'), 1, 0)))
-- V2 params: {"p1":"secure-privacy","p2":"longitude","p3":"false"}
```

result (both sides): `[{"c":118502,"u":118465}]`

**date gte on profile.properties.longitude** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 64 ms / 65 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((toDate(parseDateTimeBestEffortOrNull(toString(properties['longitude']))) >= toDate(parseDateTimeBestEffortOrNull(toString('2019-01-01')))))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((toDate(parseDateTimeBestEffortOrNull(toString(properties[{p2:String}]))) >= toDate(parseDateTimeBestEffortOrNull(toString({p3:String})))))
-- V2 params: {"p1":"secure-privacy","p2":"longitude","p3":"2019-01-01"}
```

result (both sides): `[{"c":84,"u":84}]`

**datetime lt on profile.properties.longitude** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 63 ms / 65 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND ((parseDateTimeBestEffortOrNull(toString(properties['longitude'])) < parseDateTimeBestEffortOrNull(toString('2030-01-01 00:00:00'))))
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND ((parseDateTimeBestEffortOrNull(toString(properties[{p2:String}])) < parseDateTimeBestEffortOrNull(toString({p3:String}))))
-- V2 params: {"p1":"secure-privacy","p2":"longitude","p3":"2030-01-01 00:00:00"}
```

result (both sides): `[{"c":84,"u":84}]`

**string type falls through to the raw path on profile.properties.longitude** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 310976/310976; wall V1/V2 = 64 ms / 61 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = 'secure-privacy' AND (properties['longitude'] = '-77.4903')
-- V2
SELECT count() AS c, uniq(id) AS u FROM profiles FINAL WHERE project_id = {p1:String} AND (properties[{p2:String}] = {p3:String})
-- V2 params: {"p1":"secure-privacy","p2":"longitude","p3":"-77.4903"}
```

result (both sides): `[{"c":10852,"u":10852}]`

**number gte on a group property** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 232664/232664; wall V1/V2 = 13 ms / 14 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = 'secure-privacy' AND (toFloat64OrNull(toString(properties['employees'])) >= toFloat64OrNull(toString('0')))), groups))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM events WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND (arrayExists(g -> g IN (SELECT id FROM groups FINAL WHERE project_id = {p4:String} AND (toFloat64OrNull(toString(properties[{p5:String}])) >= toFloat64OrNull(toString({p6:String})))), groups))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"secure-privacy","p5":"employees","p6":"0"}
```

result (both sides): `[{"c":929,"u":29}]`

**number gt on a session numeric column** — IDENTICAL; rows V1/V2 = 1/1; rows_read V1/V2 = 32720/32720; wall V1/V2 = 9 ms / 9 ms; clickhouse_settings: session_timezone=UTC (both).

```sql
-- V1
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = 'secure-privacy' AND created_at >= toDateTime('2026-07-01 00:00:00') AND created_at < toDateTime('2026-07-08 00:00:00') AND ((toFloat64OrNull(toString(duration)) > toFloat64OrNull(toString('0'))))
-- V2
SELECT count() AS c, uniq(profile_id) AS u FROM sessions WHERE project_id = {p1:String} AND created_at >= toDateTime({p2:String}) AND created_at < toDateTime({p3:String}) AND ((toFloat64OrNull(toString(duration)) > toFloat64OrNull(toString({p4:String}))))
-- V2 params: {"p1":"secure-privacy","p2":"2026-07-01 00:00:00","p3":"2026-07-08 00:00:00","p4":"0"}
```

result (both sides): `[{"c":871,"u":702}]`


### ignored

**properties.* on the profiles table -> dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```

**bare column -> dropped** — IDENTICAL: both compilers emit no clause.

Both compilers emit no clause — compile-time equivalence, nothing executed.

```sql
-- V1
<no clause>
-- V2
<no clause>
-- V2 params: {}
```

