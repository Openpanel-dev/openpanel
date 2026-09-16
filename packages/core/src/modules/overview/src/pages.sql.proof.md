# pages.sql.ts — V1 -> V2 result-set proof (M7-005)

Same methodology and data as `overview.sql.proof.md` (whole-method comparison against
unmodified V1, plus a per-query render + execution pass) — see that file for the full
writeup. This file covers `PagesService` and `getPageConversionsCore`.

- **Date**: 2026-09-04. **Data**: local prod-copy `openpanel`. Project: `skills-directory`,
  window `2026-08-01 00:00:00`..`2026-08-08 00:00:00` UTC.

## Whole-method comparison — verdict

| Case | Verdict |
|---|---|
| `PagesService.getTopPages` | title column non-deterministic in **V1 itself** — see `overview.sql.proof.md`'s `anyLast` section. `sessions`/`pageviews`/`avg_duration`/`bounce_rate` IDENTICAL for all 20 rows. |
| `PagesService.getTopPages` (search: `'a'`) | same title-driven flicker (the search clause itself matches on `pt.title LIKE '%a%'`, so a flickering title changes which rows the search *keeps* — a downstream, not independent, effect); numeric columns IDENTICAL where titles agree. |
| `PagesService.getPageTimeseries` | **IDENTICAL** — 3103 rows |
| `getPageConversionsCore` | **IDENTICAL** — 20 rows |

`getPageConversionsCore` was already parameter-safe-ish (V1 used `sqlstring.escape` inline
rather than clix) but not through the `sql` tag; converted the same way as every other query
here — literals to `{pN:Type}` params, identical row order and values proven against the same
data.

## Per-query render + execution proof

| Query | Rows | Rows read | Wall |
|---|---|---|---|
| `topPagesQuery` | 20 | 229,342 | 62 ms |
| `topPagesQuery` (search: `'a'`) | 20 | 229,342 | 50 ms |
| `pageTimeseriesQuery` | 3103 | 49,152 | 18 ms |
| `pageConversionsQuery` | 20 | 147,456 | 68 ms |

```sql
-- pageConversionsQuery
WITH
  conversion_events AS (
    SELECT profile_id, created_at AS conv_time FROM events
    WHERE project_id = {p1:String} AND name = {p2:String}
      AND created_at BETWEEN toDateTime({p3:String}) AND toDateTime({p4:String})
  ),
  views_before_conversions AS (
    SELECT DISTINCT e.profile_id, e.path, e.origin FROM events AS e
    INNER JOIN conversion_events AS c ON e.profile_id = c.profile_id
    WHERE e.project_id = {p5:String} AND e.name = 'screen_view' AND e.path != ''
      AND e.created_at BETWEEN toDateTime({p6:String}) AND toDateTime({p7:String})
      AND e.created_at < c.conv_time AND e.created_at >= c.conv_time - INTERVAL {p8:UInt64} HOUR
  ),
  total_visitors AS (
    SELECT path, origin, uniq(session_id) AS visitors FROM events
    WHERE project_id = {p9:String} AND name = 'screen_view' AND path != ''
      AND created_at BETWEEN toDateTime({p10:String}) AND toDateTime({p11:String})
    GROUP BY path, origin
  )
SELECT vbc.path, vbc.origin, count() AS unique_converters, any(tv.visitors) AS total_visitors,
  round(100.0 * count() / any(tv.visitors), 2) AS conversion_rate
FROM views_before_conversions AS vbc
LEFT JOIN total_visitors AS tv ON vbc.path = tv.path AND vbc.origin = tv.origin
GROUP BY vbc.path, vbc.origin ORDER BY unique_converters DESC LIMIT {p12:UInt64}
-- params: {"p1":"skills-directory","p2":"screen_view","p3":"2026-08-01 00:00:00","p4":"2026-08-08 00:00:00","p5":"skills-directory","p6":"2026-08-01 00:00:00","p7":"2026-08-08 00:00:00","p8":24,"p9":"skills-directory","p10":"2026-08-01 00:00:00","p11":"2026-08-08 00:00:00","p12":20}
```

Full renders exercised by `pages.sql.test.ts`'s `EXPLAIN`-based parse gate.

## M31-002 — `topPagesPerBucket`, the optional bound on `pageTimeseriesQuery`

- **Date**: 2026-09-16. **Data**: local prod-copy `openpanel` (read-only `SELECT`/`EXPLAIN`).
  Window `2026-07-26 00:00:00`..`2026-08-25 00:00:00` UTC, `interval: 'day'`,
  `use_query_condition_cache=0`, `max_memory_usage=6 GB`, statements rendered by the builder
  itself (`toStatement()`) and executed with their bound `param_pN`.

Unbounded, the query is one row per `(origin, path, bucket)`, so its size is the project's page
cardinality rather than its traffic. `topPagesPerBucket` keeps the `n` busiest pages per bucket.

**Result sets — bounded vs unbounded, `sum(cityHash64(...))` over the whole set:**

| project | unbounded rows | `n = 50` rows | verdict |
|---|---:|---:|---|
| `chatpaper` | 5,050,763 | 1,500 | truncated (2.68 M distinct pages) |
| `website-8103` | 200,687 | 1,500 | truncated |
| `bayse` | 14,604 | 1,500 | truncated |
| `earlysalary-production` | 33 | 33 | **IDENTICAL hash** — 2 pages, always under the bound |
| `verdict` | 30 | 30 | **IDENTICAL hash** — no `screen_view`; all 30 are `WITH FILL` rows |

`verdict` is the proof that the bound does not eat the fill: `EXPLAIN PLAN` shows
`Filling > LimitBy`, i.e. ClickHouse fills **after** `LIMIT BY`, so an empty bucket still gets
its filled row and never spends the bucket's quota.

The truncated set is exactly the top `n`: an independent `row_number() OVER (PARTITION BY date
ORDER BY pageviews DESC, origin ASC, path ASC) <= 50` produced the identical hash on all three
truncated projects (`bayse` 13709211731794099286, `website-8103` 6888520080080211176,
`chatpaper` 566149299824503912).

**Why `origin ASC, path ASC` is part of the ranking, not decoration.** On `chatpaper` the 50th
place is 4–5 pageviews with **17–30 pages tied at that value** in every bucket. Without the
tiebreak the endpoint returned a different top-50 on every single call (3 runs, 3 different
hashes); with it, 3 runs, 1 hash. It costs nothing on four of five anchors and ~0.9–1.1 s on
`chatpaper`, whose 2.68 M-row sort is the only one large enough to notice.

**Timing and response size** (median of 3, `FORMAT Null`):

| project | unbounded | `n = 50` | response unbounded -> bounded |
|---|---|---|---|
| `chatpaper` | 1,603 ms / 1,556 MiB peak | 2,539 ms / 1,556 MiB peak | **485.7 MiB -> 0.67 MiB** |
| `website-8103` | 512 ms | 545 ms | 23.5 MiB -> 0.29 MiB |
| `bayse` | 336 ms | 344 ms | 2.06 MiB -> 0.20 MiB |
| `earlysalary-production` | 378 ms | 385 ms | unchanged |
| `verdict` | 39 ms | 34 ms | unchanged |

ClickHouse server time is **not** the win here and was not expected to be: the scan is
unchanged (13,401,914 rows read either way on `chatpaper`) and the added sort columns cost
~1 s there. What disappears is the response — and with it the ~5 s of serialisation M25-001
measured between this query's ClickHouse time and `event.pagesTimeseries`' procedure time.

Omitting `topPagesPerBucket` renders the query exactly as before: token-identical and
parameter-identical to the version at `4b7afb8e`, differing only by trailing whitespace where
the two conditional fragments render empty. `event.pageTimeseries` (the `origin`+`path`-filtered
variant) never passes it and is unchanged.
