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
