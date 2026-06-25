# Events & Profile pages: how they query ClickHouse

This doc covers the **row-explorer** read paths in the dashboard — the Events
list, the single-event detail, and the Profile detail page with its three tabs.
These are deliberately separate from the **chart engine** (aggregations) covered
in [database.md](database.md); they are mostly *raw-row lookups* with app-side
enrichment.

For each page we list: which tRPC procedures fire, how many ClickHouse (CH)
queries that is, the SQL shape, and where the bottlenecks are.

> Shared facts referenced throughout (current DDL = `code-migrations/8-order-keys.ts`,
> 2025-11-23, which superseded the original `3-init-ch.ts`):
> - `events` is `ORDER BY (project_id, toDate(created_at), created_at, name)`,
>   `PARTITION BY toYYYYMM(created_at)`. `created_at` is `DateTime64(3)` (a
>   millisecond timestamp), so `toDate(created_at)` truncates it to a calendar
>   day — kept as an explicit key column because the app filters heavily on that
>   exact expression (so the predicate hits the primary index), with the raw
>   `created_at` after it for intra-day ordering. **Migration 8 removed
>   `profile_id` from the sort key.** There is **no index on `id`** and **no
>   index on `profile_id`** — a `profile_id` filter can only prune on the
>   `project_id` prefix.
> - `profiles` is **ReplacingMergeTree(created_at)**; `sessions` is
>   **VersionedCollapsingMergeTree(sign, version)** (since migration 8). Read the
>   current row via `ORDER BY created_at DESC LIMIT 1`, `any()`/`last_value()`,
>   or `FINAL`.
> - Caching tiers stack on every read: **React Query** (1h `staleTime`, 2h
>   `gcTime`, no refetch-on-focus) → **tRPC Redis cache middleware**
>   (production-only, ~60 s) → service-level `cacheable()` wrappers → the
>   **Redis profile write-buffer** doubling as a read-through cache.

---

## 1. Events list page — `/events/events`

**Route:** `events._tabs.events.tsx` (parent `events._tabs.tsx` is just tab nav:
Events / Conversions / Stats — no query).

**tRPC fired:** a single `event.events` **infinite query** (`useInfiniteQuery`),
with `profileId: ''`, the URL-state filters, date range, event-name filter, and
`columnVisibility`.

### Query path

`event.events` (`routers/event.ts:119`) → `getEventList()`
(`event.service.ts:451`) → `getEvents()` enrichment (`event.service.ts:309`).

```sql
SELECT <only visible columns>
FROM events
WHERE project_id = ?
  AND created_at >= (cursor | now()) - INTERVAL 0.5 DAY   -- sliding window
  AND created_at <= cursor                                 -- only when paging
  [AND name IN (...)] [AND <filters>]
ORDER BY created_at DESC
LIMIT 50
```

Key mechanics:

- **Keyset pagination**, not OFFSET. The next cursor is the last row's
  `created_at` ISO string (`event.ts:172`).
- **Sliding time-window** (`event.service.ts:478-484`): the bottom bound
  `created_at >= cursor - 0.5 DAY` lets CH prune to recent granules via the
  `toDate(created_at)` sort key instead of scanning the whole project. If a page
  returns **0 rows**, `getEventList` recurses with the window **doubled**
  (0.5 → 1 → 2 … capped at 365 days, `event.service.ts:645-654`).
- **Column pruning**: only the columns toggled on in the UI
  (`columnVisibility`) are selected (`event.service.ts:510-596`) — a direct win
  on a columnar store.
- **Profile-field filters** add `LEFT ANY JOIN profiles FINAL` (`:629`).

### Enrichment (app-side, not SQL joins)

After the rows return, `getEvents` issues up to **two more lookups** and stitches
them on with JS `Map`s:

- `getProfilesCached(ids)` — attaches the profile object, **only for identified
  rows** (`device_id !== profile_id`); anonymous rows get an empty placeholder.
  5-min cache.
- `getEventMetasCached(projectId)` — attaches event metadata (icon/color/
  conversion flag) from Postgres. 5-min cache.

There's also a "hacky" session→profile backfill in the router (`event.ts:148`):
an identified profile seen on any event in a session is spread onto the other
events of that session (prefixed `* `).

### CH query count

| When | CH queries |
|---|---|
| First page (cache warm) | **1** (events) + 0 (profiles/meta cached) |
| First page (cache cold) | **1** events + **1** `getProfilesCached` + 0 (meta is Postgres) |
| First page on a **sparse** profile/project | 1 + N window-doubling retries |
| Each scroll page | **1** events (+ cached enrichment) |
| Total-count badge | `getEventsCountCached` — **1**, 10-min cache |

Filter dropdowns (event-name picker, property key/value autocomplete) fire
**lazily** when opened (`event.conversionNames`, `chart.properties`,
`chart.values`), not on page load.

---

## 2. Single event detail — clicking a row

**tRPC fired:** `event.byId` (basic) or `event.details` (with session context).
Both → `eventService.getById()` (`event.service.ts:964`), built with `clix`.

```sql
SELECT * FROM events
WHERE project_id = ?
  AND created_at BETWEEN (createdAt - 1s) AND (createdAt + 1s)  -- when provided
  AND id = ?
LIMIT 1
```

- The **±1 s `created_at` window** (`event.service.ts:978-985`) is the trick:
  there is no `id` index, so a bare `id = ?` would full-scan the project. The UI
  already has the row's `created_at`, so this prunes to a single granule. The
  window is conditional (`.when(!!createdAt, …)`) — without it, the lookup
  degrades to a scan.
- Event **metas** are fetched **in parallel** with the row (`Promise.all`, `:973`).
- **Profile** is fetched *after* (needs `event.profileId`) via `getProfileById`
  — read-through the Redis profile buffer (`:1000`).
- `event.details` additionally loads the full **session** if `sessionId` exists
  (`event.ts:108`), wrapped in `.catch(() => undefined)`.

### CH query count

| Procedure | CH queries (cache cold) |
|---|---|
| `event.byId` | **1** point lookup (+ meta cached, + profile via buffer/cache) |
| `event.details` | **1** lookup + **1** `session.byId` (sequential after row) |

Latency note: profile and session are **waterfalled** after the event row, not
parallel to it.

---

## 3. Profile detail page — `/profiles/:id`

**Parent layout:** `profiles.$profileId._tabs.tsx`. It prefetches +
`useSuspenseQuery` on **`profile.byId`** (1 CH or a Redis-buffer hit) for the
header (name, avatar, country/device/os/model/browser from `profile.properties`).
The three tabs render inside its `<Outlet/>`, so **`profile.byId` is shared
across all tabs**.

`getProfileById` (`profile.service.ts:109`):
1. reads the **Redis write-buffer first** (`profileBuffer.fetchFromCache`);
2. on miss: `SELECT … FROM profiles WHERE id=? ORDER BY created_at DESC LIMIT 1`
   (latest ReplacingMergeTree snapshot), with `bypassConcurrencyLimit=true` so
   profile reads use a separate CH concurrency pool;
3. writes the result back to the buffer cache.

### Tab 1 — Overview (`_tabs.index.tsx`)

The heaviest tab. It **prefetches 4 queries in parallel** then reads them via
`useSuspenseQuery` (so the page suspends until all four resolve), plus two
non-suspense widgets that stream in after:

| Component | tRPC | Service / SQL | CH |
|---|---|---|---|
| header (parent) | `profile.byId` | profiles snapshot | 1 (cached) |
| `ProfileMetrics` | `profile.metrics` | `getProfileMetrics` — **~13 CTEs** over `events` for this profile | **1 (heavy)** |
| `ProfileActivity` | `profile.activity` | `count() … GROUP BY toStartOfDay(created_at)` | 1 |
| `MostEvents` | `profile.mostEvents` | `count(), name … GROUP BY name` (excl. screen_view/session_*) | 1 |
| `PopularRoutes` | `profile.popularRoutes` | `count(), path … WHERE name='screen_view' GROUP BY path LIMIT 10` | 1 |
| `ProfileProperties` | — | reuses `profile.data` | 0 |
| `LatestEvents` | `event.events` (`profileId`) | `getEventList` (non-suspense `useQuery`) | 1 (+ enrich) |
| `ProfileCharts` | **2× chart engine** | two 30-day linear charts, `profile_id` filter, breakdown by `path` and by `name` | 2 |

**`getProfileMetrics`** (`profile.service.ts:33`) deserves attention: it's a
single round-trip but contains ~13 CTEs (`lastSeen`, `firstSeen`, `screenViews`,
`sessions`, `duration` avg + p90 via `quantilesExactInclusive`, `totalEvents`,
`uniqueDaysActive`, `bounceRate` via `properties['__bounce']`,
`avgEventsPerSession`, `conversionEvents`, `avgTimeBetweenSessions`, `revenue`).
**Each CTE is an independent scan of the same `events WHERE profile_id=?` rows** —
so one query, but ~9 aggregation passes over that profile's full history.

**Overview tab CH total: ~8 queries on cold load** (1 cached header + metrics +
activity + mostEvents + popularRoutes + latest-events + 2 charts). Perceived load
time ≈ the **slowest of the 4 suspense queries**, which is almost always
`profile.metrics`.

### Tab 2 — Events (`_tabs.events.tsx`)

`event.events` infinite query scoped with `profileId` + filters + dates +
event-names + `columnVisibility`. Same `getEventList` path as the global events
page (§1), just with `profile_id = ?` added to the WHERE. **1 CH per page** (+
cached enrichment) + the shared `profile.byId`.

### Tab 3 — Sessions (`_tabs.sessions.tsx`)

`session.list` infinite query (cursor is a base64 `{createdAt,id}`,
`session.ts:16`) → `getSessionList` (`session.service.ts:159`):

```sql
SELECT <session columns>
FROM sessions FINAL
WHERE project_id = ?
  AND created_at > now() - INTERVAL <N> DAY     -- N = 1 for big orgs, else 360
  [AND profile_id = ?] [AND <search ILIKE>] [AND <filters>]
ORDER BY created_at DESC
LIMIT 50
```

- Reads **`sessions FINAL`** (merge-on-read collapse of
  VersionedCollapsingMergeTree).
- The window `N` is **1 day** when the org's event limit > 1M, else 360
  (`session.service.ts:191-195`) — explicit large-org guard.
- Enrichment: `getProfilesCached` (cached) **+ `batchSessionHasReplay`** (1 CH on
  the replay table to flag which sessions have a recording).

**Sessions tab CH total: ~2 per page** (sessions FINAL + replay-flag) + cached
profiles + shared `profile.byId`. Opening a session adds replay queries
(`session.replayMeta`, `replayChunksFrom`/`AroundTime`).

---

## 4. Query-count summary

> **Updated after the events/profile rework.** The inline event dropdown replaced
> the click-through modal on the table, the `EventDetails` modal was slimmed to a
> single `event.byId`, and the profile **Overview tab was removed** (left pane now
> renders from `profile.byId` only). Current counts:

| Page / tab | tRPC procedures | CH queries (cold) | Notes |
|---|---|---|---|
| Events list | `event.events` | **1 / page** | sliding-window keyset; no count query |
| Event dropdown (row expand) | `event.byId` | **1 / expand** | ±1s lookup; cached on re-expand; **0** on row toggle |
| Single-event modal (profile widgets / realtime) | `event.byId` | **1** | slimmed from ~3 (session + chart removed) |
| Profile page · left pane | `profile.byId` | **1** (often buffer hit) | renders the whole pane; **0** extra |
| Profile page · default (Events) | `event.events` | 1 / page | index redirects here |
| Profile · Sessions | `session.list` | ~2 / page | `sessions FINAL` + replay flag |
| ~~Profile · Overview~~ | — | **removed** | tab deleted (was **~8**, incl. the metrics bottleneck) |

---

## 5. Bottlenecks

Ordered by impact. **Status reflects the events/profile rework** — the three
heaviest (B1, B2, B5) were eliminated by deleting the Overview tab; B7 was
halved. B3/B4/B6 remain but are all low-impact.

| | Bottleneck | Status |
|---|---|---|
| B1 | `profile.metrics` ~13-CTE full-history scan | ✅ **resolved** — Overview removed, never called |
| B2 | profile analytics bypass the MV fast-path | ✅ **resolved** — those queries deleted |
| B5 | Overview 8-query fan-out + Suspense blocking | ✅ **resolved** — tab deleted |
| B7 | single-event detail waterfall | 🟡 **partial** — `session.byId` gone (`details` deleted); `getProfileById` still sequential inside `getById` |
| B3 | `sessions FINAL` merge-on-read | ⚠️ **still valid** — Sessions tab unchanged |
| B4 | app-side enrichment round-trips (cached) | ⚠️ **still valid** — low impact |
| B6 | sliding-window retries on sparse data | ⚠️ **still valid** — `getEventList` unchanged |

### B1 — `profile.metrics` scans the whole profile history ~9× ✅ RESOLVED
**No longer reached** — the Overview tab that called `profile.metrics` was removed;
the profile left pane renders from `profile.byId` only. The procedure still exists
but is dead code. (Original analysis below.)

- The ~13-CTE query has **no date bound**, and **`profile_id` is not in the sort
  key at all** (migration 8 removed it) and has no skip index. A `profile_id = ?`
  filter can only prune on the `project_id` prefix, so CH must read **every
  granule in the project** across all partitions, filtering by `profile_id`,
  once per CTE (~9 passes over the same rows).
- For a power user with millions of events this is the single slowest query on
  the whole page, and the Overview tab **suspends on it**.
- Mitigations to consider: precompute per-profile metrics into a
  `profile_event_summary` / AggregatingMergeTree rollup; bound the metrics to a
  trailing window; or collapse the CTEs so the row set is scanned once.

### B2 — Profile analytics never use the materialized-view fast-path
- `events_daily_stats` is keyed by `(project_id, name, date)` with **no profile
  dimension**, so any `profile_id` filter disqualifies the MV
  (`canUseMaterializedView`). Every profile query — metrics, activity,
  mostEvents, popularRoutes, the two ProfileCharts — hits **raw `events`**.
- The two `ProfileCharts` at least carry a 30-day range (partition pruning
  works), but they also add breakdown CTEs (`top_breakdowns`, totals).

### B3 — `sessions FINAL`
- The Sessions tab reads with `FINAL`, forcing merge-on-read. Bounded by the
  time window (1 day for big orgs), but still the most expensive part of that
  tab on large session tables.

### B4 — App-side enrichment round-trips (N+1-style, but cached)
- `getEventList` / `getSessionList` / `getById` each do a **second** CH/cache
  call to hydrate profiles, plus event-meta lookups. The `cacheable()` wrappers
  (5 min) and the profile buffer absorb most of this, but a cold cache means
  extra serial round trips per page.

### B5 — Overview fan-out + Suspense head-of-line blocking
- The tab fires ~8 near-simultaneous queries sharing CH
  `max_concurrent_queries_for_user`. Because four of them are `useSuspenseQuery`,
  the page can't paint until the **slowest** (metrics, see B1) resolves —
  `LatestEvents` and `ProfileCharts` stream in afterward via plain `useQuery`.

### B6 — Sliding-window retries on sparse data
- A profile/project with few or old events makes the events list recurse,
  doubling the window each time (0.5 → … → 365 d), each retry a **fresh CH
  query**, before it finds 50 rows.

### B7 — Single-event detail waterfall
- `getProfileById` and (in `details`) `session.byId` run **after** the event row
  returns rather than in parallel — extra sequential latency, though each is a
  cheap cached/point lookup.

---

## 6. What keeps it fast anyway

- **Index-friendly queries**: keyset + time-window on the events sort key; the
  ±1 s window for single-event lookups; partition pruning wherever a date range
  exists.
- **Column pruning** driven by UI `columnVisibility`.
- **Layered caching**: React Query 1h `staleTime`, tRPC Redis (~60 s), service
  `cacheable()` (profiles/metas 5 min, counts 10 min), and the profile
  write-buffer as a read-through cache.
- **Dedicated concurrency pool** for profile reads (`bypassConcurrencyLimit`) so
  heavy dashboard queries don't starve them.
