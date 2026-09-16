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

## M34-002 — `page_titles` bounded to the query's own range (Group C fix 8, remainder)

- **Date**: 2026-09-16, 09:02–09:06 UTC. **Data**: local prod-copy `openpanel`, read-only `SELECT`
  (`events` read 321,191,847 before the run). `use_query_condition_cache=0`,
  `session_timezone=UTC`, `max_memory_usage=6 GB`. Both statements rendered by the builders
  themselves — "before" is `pages.sql.ts` at `26a56aa0`, "after" is this change — and bound through
  `param_pN=`. Timings interleave old/new, median of 3, `FORMAT Null`, from `X-ClickHouse-Summary`.
- Windows: `1d` = 2026-08-24, `7d` = 2026-08-18 -> 08-24, `30d` = 2026-07-26 -> 08-24 (all
  `23:59:59`-closed).

The `page_titles` CTE read `created_at >= now() - INTERVAL 30 DAY`, whatever the caller asked for.
It now reads `created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String})` — the
spelling the other two CTEs and M31-003 already use. Only the title column can change: the pages
and their numbers come from `screen_view_durations` and `sessions`, which were already bounded.

**The approved change:** a page whose title shows up **only outside the requested range** now gets
an empty title. The reverse also happens: a page viewed in the range whose only titles are more than
30 days before *now* used to have an empty title and now gets one.

### Result sets — before vs after, joined on `(origin, path)`, no `LIMIT`

| project | window | pages (both) | numeric columns differ | title differs |
|---|---|---:|---:|---:|
| `verdict` | 1d / 7d / 30d | 0 / 0 / 0 (no `screen_view`) | 0 | 0 |
| `earlysalary-production` | 1d / 7d / 30d | 1 / 2 / 2 | 0 | 0 |
| `website-8103` | 1d / 7d / 30d | 3,918 / 13,995 / 104,824 | 0 | 0 |
| `bayse` | 1d / 7d / 30d | 440 / 2,036 / 7,653 | 0 | 67 / 124 / 4,638 |
| `chatpaper` | 1d / 7d | 62,198 / 594,845 | 0 | 192 / 12,915 |

(`chatpaper` 30d was not joined: each side is 2.68 M pages.) **The pages and every numeric column
are identical everywhere.** Only titles differ, and part of that difference is not caused by this
change: `anyLast` already flickered **before** it (see the M7-005 section above). The old statement
compared with itself gave 14 differing titles on `bayse` 7d and 888 on `chatpaper` 1d. The new
statement compared with itself gave 75 on `bayse` 7d.

To measure only the approved effect, I counted **whether any non-empty title exists** for each
page in each window. That count does not flicker:

| project | window | loses its only title (titled only outside range, inside old window) | gains a title (titled only in range, outside old window) |
|---|---|---:|---:|
| `bayse` | 1d / 7d / 30d | 7 / 3 / 1 | 0 / 0 / **4,950** |
| `chatpaper` | 1d / 7d | 70 / **3,311** | 0 / 0 |
| `website-8103` | 1d / 7d / 30d | 0 / 0 / 0 | 0 / 0 / 0 |

On this copy, the old window was 2026-08-17 -> "now" (2026-09-16), so it held only the last eight
days of data. That is why a 30-day report on `bayse` *gained* 4,950 titles: those pages were titled
only before 08-17.

### Timing (median of 3, `LIMIT 50`)

| project / window | before (`now() - 30 DAY`) | after (range) |
|---|---|---|
| `verdict` 1d | 50 ms / 596,328 rows / 7 MiB read | 39 ms / 186,788 / 5 MiB |
| `verdict` 30d | 159 ms / 2,752,863 / 49 MiB | 164 ms / 3,784,293 / 52 MiB |
| `bayse` 1d | 452 ms / 6,691,332 / 1,743 MiB | **103 ms / 1,809,700 / 241 MiB** |
| `bayse` 7d | 563 ms / 10,991,899 / 1,944 MiB | 533 ms / 10,394,455 / 1,765 MiB |
| `bayse` 30d | 1,047 ms / 23,230,204 / 2,502 MiB | 1,937 ms / 34,436,987 / 6,122 MiB |
| `earlysalary-production` 1d | 860 ms / 4,549,922 / 9,208 MiB | **232 ms / 1,482,682 / 1,314 MiB** |
| `earlysalary-production` 7d | 968 ms / 7,146,746 / 9,457 MiB | 930 ms / 6,651,762 / 8,265 MiB |
| `earlysalary-production` 30d | 1,583 ms / 19,631,267 / 10,618 MiB | 4,120 ms / 31,137,529 / 39,818 MiB |
| `website-8103` 1d | 986 ms / 3,025,109 / 4,542 MiB | **326 ms / 879,433 / 459 MiB** |
| `website-8103` 7d | 1,196 ms / 4,822,514 / 4,708 MiB | 1,083 ms / 4,474,243 / 4,069 MiB |
| `website-8103` 30d | 2,285 ms / 14,965,439 / 5,661 MiB | 5,702 ms / 24,735,702 / 23,842 MiB |
| `chatpaper` 1d | 452 ms / 3,456,236 / 537 MiB | **143 ms / 950,030 / 67 MiB** |
| `chatpaper` 7d | 1,168 ms / 6,208,658 / 759 MiB | 1,079 ms / 5,865,077 / 695 MiB |
| `chatpaper` 30d | 6,706 ms / 19,798,407 / 1,848 MiB | 8,671 ms / 30,300,939 / 3,957 MiB |

(`verdict` 7d: 51 ms either way.) **Short windows get rid of the 30-day floor: 3–4x faster at 1d.**
The 30d rows get slower, and **this copy exaggerates that**. With the copy's last event on
2026-08-25, the old CTE read only eight days of data here. In production, "now" is current, so the
old CTE always read a full 30 days, and a 30d report reads about the same amount either way. The
real cost is for windows **longer than 30 days**: they now read the `properties` Map over the whole
range (§6.5 flagged this as the price of fix 8). Removing that Map read altogether is the separate
`__title` materialisation option in §6.5, and it was not proposed.

### Golden coverage

Only `getPagePerformanceCore` (`/insights/:projectId/pages/performance`) reaches this builder from
the REST surface. That covers the three `insights-pages-performance-*` cases, all on
`secure-privacy`, 2026-08-20. I ran each case's statement (`limit: 1000`, with the case's
`search`) and compared the results. The new statement matches both the old one as of today and the
old one with `now()` pinned to the capture instant (`2026-09-07 02:43:03`): same pages, numbers and
titles. It also matches every page in the captured response: 28/28, 28/28 and 6/6 titles equal.
These cases are `clock-anchored` (`require-same-utc-day`), so the gate reports them as stale. The
reason given for that rule is this CTE's `now()`, which no longer exists.
