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
