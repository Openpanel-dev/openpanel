# session/src/sql.ts — `sessionByIdQuery` PREWHERE proof (M39-001)

`sessionByIdQuery` keeps `FINAL`. It now reads
`FROM sessions FINAL PREWHERE id = … AND project_id = … WHERE sign = 1`; before, all three
conditions were in `WHERE`. This is rank 1 of `docs/FINAL_USAGE.md` §7 (M38-002).

**Why it helps.** On this server `optimize_move_to_prewhere_if_final = 0`, and `FINAL` widens the
`idx_id` bloom-filter hit (`use_skip_indexes_if_final_exact_mode = 1`). With `FINAL`, every column
was read for every widened granule. `EXPLAIN indexes=1` is the same for both spellings: bayse
`idx_id` Parts 2/9, Granules 4/101, then `FINAL` widens this to Parts 9/2, Granules 173/4. The
statements differ only in which columns are read for those granules. `EXPLAIN actions=1` on the
new statement shows `Prewhere filter column: and(equals(id, …), equals(project_id, …))`, and the
outer `Filter column: equals(__table1.sign, 1_UInt8)`.

**Why it is safe.** `project_id` is a sort-key column. `id` is not, but a −1 row is a full copy
of its +1 (`buffers/session-buffer.ts`), so both rows of a pair pass the PREWHERE and still
collapse. **`sign` stays in `WHERE`.** A PREWHERE on `sign` drops the −1 before the collapse, so
the stale +1 survives (control below).

## Setup

- **When and where:** 2026-09-16, 21:30–21:34 UTC, on the local prod-copy ClickHouse
  (`127.0.0.1:8123`, database `openpanel`), with load average 2.9–3.9.
- **Access:** SELECT and EXPLAIN only. `openpanel.events` read 321,192,117 rows.
- **Request settings:** every request used `use_query_cache=0`, `use_query_condition_cache=0` and
  `wait_end_of_query=1`. Ids were bound as `{p1:String}`/`{p2:String}`, exactly as the builder
  renders them.
- **Where the numbers come from:** `read_rows`, `read_bytes`, `elapsed_ns` and `memory_usage` are
  read off `X-ClickHouse-Summary`, from `FORMAT Null` runs. `memory_usage` is the summary figure,
  not a sampled peak.
- **Caching:** page cache was not controlled, so **every number is warm**.

## Result-set equality

Each check runs `SELECT count(), sum(h), cityHash64(groupArray(h)) FROM (SELECT
sipHash64(formatRow('TSV', *)) h FROM (<statement>))`. `sum(h)` is the order-independent
result-set hash.

| project | ids checked | old = new |
|---|---|--:|
| verdict | top 3 by row count + 5 `cityHash64(id,'m39')` samples | 8/8 |
| bayse | same | 8/8 |
| earlysalary-production | same | 8/8 |
| chatpaper | same | 8/8 |
| e2e-sessions | same (top id: 4 rows) | 8/8 |
| bayse | the id that reads the most (1,613,380 rows; M38-002's case) | 1/1 (2 rows) |
| website-8103 | no `sessions` rows on this box; unknown id | 0 rows = 0 rows |
| **e2e-sessions, unmerged** | **every id with a −1 row (21 ids, 21 −1 rows)** | **21/21** |
| e2e-sessions | 50 sampled ids with >1 `version` | 50/50 |

Controls on the 21 unmerged ids, which show that this probe can detect a wrong answer:
- **No `FINAL`** differs on **21/21**: 2 rows instead of 1, because the stale +1 is returned.
- **`FINAL PREWHERE id, project_id, sign = 1`** also differs on **21/21**, with the same hashes as
  no `FINAL`.

## Cost

Each variant was run 4 times on each project's top id (ordered by row count, then by id). The
bayse row uses the widest id instead. Each cell shows `read_rows`, then MiB read, the four run
times in ms, and `memory_usage` in MiB.

| project | old (`FINAL WHERE`) | new (`FINAL PREWHERE`) |
|---|---|---|
| **bayse (widest id)** | 1,613,380 · 364 MiB · **858/808/820/819 ms** · 432–475 MiB | 1,613,380 · 39 MiB · **35/32/42/28 ms** · 26 MiB |
| bayse (top id) | 90,109 · 21 · 87/106/81/88 · 66–70 | 90,109 · 4 · 17/16/15/16 · 17 |
| chatpaper | 5,913,071 · 1,308 · 3124/2912/2900/3072 · 438–450 | 5,913,071 · 148 · 75/55/55/56 · 34–38 |
| verdict | 146,882 · 28 · 99/113/114/104 · 82–94 | 146,882 · 4 · 17/20/26/20 · 17 |
| earlysalary-production | 545,014 · 149 · 314/308/339/328 · 265–299 | 545,014 · 15 · 28/25/28/26 · 25 |
| e2e-sessions | 141,898 · 35 · 108/96/96/99 · 96–120 | 141,898 · 5 · 16/17/18/16 · 17 |

M38-002 measured bayse at 846–994 ms → 32–36 ms and 363 → 38 MiB. This run reproduces those
figures: 808–858 ms → 28–42 ms and 364 → 39 MiB. `read_rows` does not change, because `FINAL`
still widens the ranges. Only the `id`/key columns are read for rows that the PREWHERE rejects.

# session/src/sql.ts — `sessionListQuery` without `FINAL` (M39-004)

`sessionListQuery` no longer reads `sessions FINAL`. It keeps `+1` rows only, and drops any row
whose `(id, version)` has a `−1` in the same window:

```sql
FROM sessions
LEFT JOIN (SELECT DISTINCT session_id FROM session_replay_chunks …) AS src ON src.session_id = id
WHERE project_id = … <lookback / cursor / calendar-day window>
  AND sign = 1
  AND (id, version) GLOBAL NOT IN (
    SELECT id, version FROM sessions
    WHERE project_id = … <the same window> AND sign = -1
  )
  <profile_id / search / compiled filters, unchanged>
ORDER BY created_at DESC
LIMIT …
```

This is rank 2 of `docs/FINAL_USAGE.md` §7 (M38-002).

**Why the subquery only repeats the window.** A `−1` is a full copy of its `+1`
(`buffers/session-buffer.ts`), so the two rows share `created_at` and fall in the same window.
The profile, search and filter predicates are applied to the `+1` in the outer query, so repeating
them in the subquery would not change the result.

**Cluster.** `sessions` and `session_replay_chunks` are `Distributed` on Cloud. `GLOBAL NOT IN`
builds the `−1` set once, on the initiator, and ships it to the shards. It is correct under any
`distributed_product_mode`. A plain `NOT IN` under the client's `'allow'` would run the subquery
against the Distributed table from every shard, which is also correct but costs N× more. It is
correct only because a `−1` and its `+1` share `created_at`, and so they share a shard: the shard
key is `cityHash64(project_id, toStartOfHour(created_at))`. On this single node the two spellings
cost the same (see the table below). Neither the replay `LEFT JOIN` nor its
`distributed_product_mode` behaviour changed.

## Setup

- **When and where:** 2026-09-16, 22:23–22:26 UTC, on the local prod-copy ClickHouse
  (`127.0.0.1:8123`, database `openpanel`, **single-node**). Load average was 0.1–1.2 at the start.
- **Access:** SELECT only.
- **How the statements were built:** both statements were rendered by the real builders, the
  HEAD `sql.ts` and the new one, with bound `{pN:Type}` params. The requests used the client's
  settings (`distributed_product_mode=allow`, `query_plan_convert_any_join_to_semi_or_anti_join=0`),
  plus `wait_end_of_query=1`, `use_query_cache=0` and `use_query_condition_cache=0`.
- **Where the numbers come from:** `read_rows`, `read_bytes`, `elapsed_ns` and `memory_usage` are
  read off `X-ClickHouse-Summary`, from `FORMAT Null` runs. `memory_usage` is the summary figure,
  not a sampled peak.
- **Caching:** page cache was not controlled, so **every number is warm**.
- **The replay join on this box:** `session_replay_chunks` holds 250 rows, all of them in
  `e2e-sessions`. For every real anchor, the join's right-hand side is therefore **empty**. The
  "all-replay" rows below replace it with *every* chatpaper session id, to bound the opposite
  case.

## Result-set equality

Each check runs `SELECT count(), sum(h), cityHash64(groupArray(h)) FROM (SELECT
sipHash64(formatRow('TSV', *)) h FROM (<statement>))`. The value compared is `(count, sum(h))`.
"FULL" means `take = 1e8`, so the whole window is returned. The top-N cases were also re-checked
with `ORDER BY created_at DESC, id`. The "control" column is the plain drop (`sign = 1`, no
anti-join); it shows whether a case can detect a wrong answer at all.

| project | cases (each: old = new?) | control = old? |
|---|---|---|
| chatpaper, verdict, bayse, earlysalary-production, website-8103 | cursor page (2026-08-30 12:00, 30 d) top 50 and FULL; first page anchored at now (30 d) top 50; date range 2026-08-01 → 08-15 top 50; cursor page + `search='a'` + filter `device='desktop'` top 50. **25/25 equal, plus 20/20 with the `id` tie-break.** (website-8103 has no sessions: 0 = 0. verdict search+filter: 0 = 0.) | equal everywhere, because the anchors hold no `−1` rows (§3 of FINAL_USAGE) |
| chatpaper, all-replay join | cursor page top 50: **equal** | — |
| **e2e-sessions (unmerged, 21 `−1` rows)** | cursor 2026-09-05 02:22:46 with 1 d lookback, top 50 and **top 500**; cursor 2026-09-15 23:59:59 with 30 d lookback, top 50 and **FULL** (647,079 rows); first page at now, **FULL**; date range September, **FULL**. **6/6 equal, plus 3/3 with the tie-break.** | **differs on top 500 and on all three FULL sets** (647,100 rows: the 21 stale `+1`) |

Mismatches between old and new: **0**.

## Cost: the whole statement, replay join included

Each cell shows `read_rows`, then MiB read, three runs in ms, and `memory_usage` in MiB. All pages
are cursor pages (2026-08-30 12:00, 30 d, top 50) unless the row says otherwise.

| project | old: `FINAL` + join | **new: anti-join + join** | new, local `NOT IN` | old, no join | new, no join | plain drop + join (unsafe) |
|---|---|---|---|---|---|---|
| chatpaper | 3,816,602 · 637 · **1147/1138/1124** · 210–241 | 7,289,150 · 586 · **453/473/473** · 73–81 | 464/485/455 | 1111/1148/1134 | 7,297,342 · 212 · 154/156/149 · 4 | 3,644,575 · 555 · 417/379/386 |
| chatpaper, range Aug 1–15 | 1,924,894 · 319 · **581/560/562** · 146–150 | 3,751,502 · 311 · **245/262/253** · 69–73 | 261/265/251 | 552/555/545 | 113 MiB · 88/87/94 | 212/204/209 |
| chatpaper, search + filter | 637 MiB · **1261/1240/1238** · 209–223 | 588 MiB · **561/577/579** · 77–82 | 590/571/583 | 1237/1212/1207 | 372 MiB · 351/330/344 | 485/510/490 |
| chatpaper, **all-replay join** | 9,844,399 · 896 · **2094/2550/2928** · 2208–2959 | 13,316,947 · 845 · **1933/1887/1644** · 2409–2806 | — | — | — | — |
| verdict | 1,006,503 · 121 · **292/304/299** · 174–186 | 1,673,436 · 83 · **96/98/98** · 61 | 95/89/86 | 279/281/296 | 44 MiB · 58/44/48 | 71/65/69 |
| bayse | 712,572 · 112 · **218/258/224** · 179–192 | 1,081,090 · 61 · **67/65/66** · 52–57 | 73/83/92 | 246/228/208 | 25 MiB · 34/30/31 | 52/47/50 |
| earlysalary-production | 745,388 · 163 · **246/255/278** · 207–246 | 1,146,732 · 96 · **97/76/75** · 65 | 83/85/95 | 251/245/254 | 34 MiB · 51/34/43 | 76/68/73 |
| website-8103 (0 sessions) | 55,634 · 11 · 57/54/46 | 111,268 · 3 · 19/23/15 | 16/16/16 | 42/41/41 | 16/15/16 | 10/11/11 |
| e2e-sessions, 1 d top 50 | 102,622 · 15 · 36/31/29 | 178,444 · 6 · 24/35/39 | 45/24/27 | 25/25/24 | 15/14/17 | 27/19/26 |
| e2e-sessions, FULL (647,079 rows) | 738,931 · 125 · 259/233/233 · 321–331 | 1,360,036 · 111 · 142/133/117 · 261–276 | 132/141/128 | 231/218/218 | 111/120/124 | 121/115/100 |

**The replay join changes the picture.** Without the join, this run reproduces M38-002:
chatpaper 1,111–1,148 → 149–156 ms, and 637 → 212 MiB. **With the join, the new statement costs
453–473 ms and reads 586 MiB.** The `LEFT JOIN` blocks the read-in-order / lazy-materialisation
top-N path, even with an empty right-hand side, so all 21 columns are read for the whole window
again. The plain (unsafe) drop is capped the same way (379–417 ms). The change is still worth
shipping:
- 2.4× on chatpaper, 3× on verdict, bayse and earlysalary, and 2.2× on ranges and search.
- `memory_usage` falls 2.5–3.5× (210–241 → 73–81 MiB on chatpaper).
- The result is identical, including on unmerged data.

With every session carrying a replay, both statements cost seconds and ≈2.2–3 GiB: old
2.1–2.9 s, new 1.6–1.9 s.

**Not shipped: the headroom.** A join-after-`LIMIT` form of the new statement returned the same
`(count, sum(h))`. It selects the top N in a subquery without the join, then `LEFT JOIN`s the
replay set onto those N rows. On chatpaper it ran in **150/147/152 ms and read 212 MiB**, measured
at 22:25 UTC. Moving the join is a further rewrite that M38-002 did not endorse. It is left as a
follow-up.

## Where the anti-join can differ from `FINAL` (FINAL_USAGE §6.2)

1. **One `(id, version)` with two `+1` rows and one `−1`.** `FINAL` collapses one pair and still
   shows the stale `+1` next to version V+1. The anti-join hides both copies of version V, until
   the merge. After the merge the `−1` is gone and the two forms agree again. **Reachable in
   production:** same-`(id, version)` `+1` duplicates exist on real projects on this box
   (chatpaper 69, verdict 3, tiptip-main-app-prod 5, …; e2e-sessions 1,043). If such a session is
   updated, the buffer writes one `−1`. On this box no `(id, version)` has both a `−1` and two
   `+1` rows (0), so this case could not be exercised. The visible effect is transient, only
   during the merge window: a stale duplicate row that `FINAL` would show is not shown.
2. **Cross-session cancel.** `FINAL` collapses on the sort key plus the version, and the sort key
   has no `id`. A `−1` whose own `+1` is missing could therefore cancel another session's `+1`
   with the same `created_at` and version. The anti-join matches on `id` and never does this.
   Reachable only if a `+1` is lost while its `−1` is written. That was not observed here (the one
   such group cancels cleanly).
3. **Unpaired `−1` rows.** The shipped statement had no `sign` filter, so `FINAL` would return a
   `−1` whose `+1` is absent. The new statement returns only `+1`. Reachable under the same
   condition as (2). On this box every `−1` has its `+1`: 0 of 21 unpaired.
4. **The `NOT IN` set lives in memory.** It holds the unmerged `−1` backlog of the window: 21 rows
   here. On live production its size is unknown (FINAL_USAGE open question 2).
