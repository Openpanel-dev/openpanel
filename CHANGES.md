# Pin Drop OpenPanel — Full Change Log

Detailed rundown of every change made in this branch, grouped by
feature. Written for Justin + anyone else reviewing the diff before
deploy. Nothing here requires a schema migration — all changes are
code-only on the dashboard, API, and shared packages.

---

## 1. Bug fixes

### 1.1 Pagination broken past page 2
**Before:** On Profiles → Identified / Anonymous / Power Users, clicking
past page 2 returned an empty table.

**Root cause:**
- `getProfileListCount` was querying the raw `profiles` table. Because
  profiles use a ReplacingMergeTree engine, historical row versions
  were still being counted — inflating `meta.count` and making the UI
  render pages that had no actual data.
- `powerUsers` returned `meta.count = data.length` rather than the
  total distinct profile count, so `pageCount` was always stuck at 1
  even though the UI let you click "next".

**Fix:** `getProfileListCount` now reads from `profiles FINAL`;
`powerUsers` (now folded into the unified `list` endpoint) runs a
proper `count(distinct profile_id)`.

Files: `packages/db/src/services/profile.service.ts`,
`packages/trpc/src/routers/profile.ts`.

### 1.2 Text bleeding across cells
**Before:** Long values in the Profile Information grid bled into
neighbouring cells (the "Biography" label overlapping the value). In
the profile-summary metric strip, long times like "25 minutes ago"
overflowed the tile and overwrote the next tile.

**Root cause:** CSS grid's default track sizing is `minmax(auto, 1fr)`
which allows content to push a column wider than its nominal share.
Without explicit `min-w-0` on the child, `truncate` can't fire.

**Fix:**
- `KeyValueGrid` cells use explicit `grid-cols-[minmax(0,1fr)_…]`
  templates; each cell has `min-w-0 overflow-hidden`.
- `OverviewMetricCard` button gets `min-w-0 overflow-hidden` so grid
  tracks resolve to `minmax(0, 1fr)`.

Files: `apps/start/src/components/ui/key-value-grid.tsx`,
`apps/start/src/components/overview/overview-metric-card.tsx`.

### 1.3 "Last seen" on Power Users was actually first seen
**Before:** The Power Users tab header said "Last seen" but the cell
rendered the profile's `createdAt` (when we first identified them).

**Fix:** The unified `getEnrichedProfileList` returns both real
`lastSeen` (max of event created_at) and `firstSeenActivity` (min of
event created_at) from the events table. The columns now map to the
correct data.

Files: `packages/db/src/services/profile.service.ts`,
`apps/start/src/components/profiles/table/columns.tsx`.

### 1.4 Latest Events widget collapsing to zero height
**Before:** The Latest Events card on the profile page would render
empty even when there was data, because its scroll area height was
computed from the outer Widget's bounding rect — which resolved to 0
when the grid row around it was short.

**Fix:** Swapped the self-measured scroll for a fixed `max-h-[420px]`
scroll area. Added a proper empty state ("No events for this profile
yet"). Also hides the per-row profile name when rendered on a
profile's own page (it's always the same person).

Files: `apps/start/src/components/profiles/latest-events.tsx`,
`apps/start/src/components/events/event-list-item.tsx`.

### 1.5 "5 minutes ago" overflow
**Before:** `timeAgo` in the metric cards produced strings like
"5 minutes ago" that wouldn't fit in a narrow tile.

**Fix:** Added `timeAgoShort` which normalises both the library's
`short` format and the long form to a consistent terse output (e.g.
"5 mins ago", "3 hrs ago", "2 mos ago", "1 yr ago"). Singular "1 min"
stays singular.

Files: `apps/start/src/utils/date.ts`,
`apps/start/src/components/overview/overview-metric-card.tsx`.

### 1.6 Group member count mismatch
**Before:** Groups page showed, say, "Umbrella Holdings · 15 members"
but clicking in showed 20 in the Members tab. The two counts used
different data sources.

**Root cause:** `getGroupStats` was doing
`uniqExact(profile_id) FROM events WHERE has(groups, ...)` —
event-based. The group detail's Members tab does
`FROM profiles FINAL WHERE has(groups, ...)` — profile-based. Any
profile assigned to a group but without group-tagged events got
dropped from the stats count.

**Fix:** Split `getGroupStats` into two parallel queries: members
from `profiles FINAL` (matches the Members tab exactly), activity
from `events` (still event-derived because *activity* is an event
concept, not a membership one).

Files: `packages/db/src/services/group.service.ts`.

### 1.7 "Os" / "Id" / acronym capitalisation
**Before:** Keys like `os`, `id`, `url` rendered as "Os", "Id", "Url".

**Fix:** `camelCaseToWords` now knows about common acronyms (OS, URL,
ID, API, IP, UI, URI, UTM, SDK, SSL, UUID, iOS, etc.) and uppercases
them in place.

Files: `apps/start/src/utils/casing.ts`.

---

## 2. Unified profile tables + sorting

### 2.1 One column set across Identified / Anonymous / Power Users
**Before:** Different columns per tab, including Referrer (low value
at table level) and Browser (rarely actionable).

**After:** All three tabs share this set:

| Column         | Notes                                               |
| -------------- | --------------------------------------------------- |
| Name           | Avatar + profile name (links to detail)             |
| Plan           | Solo / Team / Team+ / Team Pro badge + subscriber ✓ |
| Events         | Total event count                                   |
| Session time   | Total session duration across all platforms         |
| Country        | Flag + city                                         |
| OS             | Icon + OS name                                      |
| Model          | Brand / model                                       |
| First seen     | Earliest event                                      |
| Last seen      | Most recent event                                   |
| Groups (hidden default) | Any team badges                            |

Removed: Referrer, Browser.

### 2.2 Sortable headers
Every column is clickable. Sort direction toggles asc/desc. URL is
synced (`?sort=eventCount&dir=desc`) so the state survives reload and
is bookmarkable.

Default sort: `createdAt DESC` for Identified/Anonymous, `eventCount
DESC` for Power Users.

### 2.3 Unified backend query
New `getEnrichedProfileList` in `profile.service.ts` does the whole
thing in one ClickHouse query:

- `profiles FINAL` joined with two CTEs (event aggregates, session
  aggregates) on `profile_id`.
- Filter: `is_external = true/false` or neither (depending on tab).
- Sort: profile column or any aggregate (event count, session time,
  first/last seen activity, session count).
- Pagination: `LIMIT take OFFSET cursor * take`.

`profile.powerUsers` is now a thin wrapper over `profile.list` with
`isExternal: true` and `sortBy: 'eventCount'` defaults.

Files: `packages/db/src/services/profile.service.ts`,
`packages/trpc/src/routers/profile.ts`,
`apps/start/src/components/profiles/table/columns.tsx`,
`apps/start/src/components/profiles/table/index.tsx`,
`apps/start/src/components/ui/data-table/data-table-hooks.tsx` (new
`useDataTableSort` hook),
`apps/start/src/routes/_app.$organizationId.$projectId.profiles._tabs.*.tsx`.

---

## 3. Profile detail redesign

### 3.1 Merged Profile + Properties tabs
**Before:** Two tabs. Profile tab had curated fields, Properties tab
dumped every raw property including noise like `browser`, `path`,
`__referrer`.

**After:** Single card, one view. Curated order:

1. First name
2. Last name
3. Email
4. Is Subscriber
5. Plan
6. Team Name (fetched from `profile.groups`, resolves first group of
   type `team`, falls back to the first group, or "N/A")
7. ID
8. Created at
9. Last Known Location (City, Country — flagged as "last known"
   because users travel)

Any additional custom properties Pin Drop sends via `identify()` (not
in the hidden list) appear below automatically.

**Hidden on both previous tabs:**
`browser`, `browser_version`, `os`, `os_version`, `device`, `brand`,
`model`, `path`, `referrer`, `referrer_name`, `referrer_type`,
`__referrer`, `__query`, `__version`, `__buildNumber`, `biography`,
`bio`, `description`, plus any string value longer than 120 chars.

Everything is still in ClickHouse — we're just filtering for UI
clarity.

Files: `apps/start/src/components/profiles/profile-properties.tsx`.

### 3.2 Source card (new)
Answers "where did this user come from?". Two sections:

- **First seen via** — first session's referrer / UTM / channel with
  the campaign name + search keyword + entry page.
- **All sources** — every distinct source/UTM combination this user
  has arrived through, ranked by session count.

Channel classifier rules live in `apps/start/src/utils/source.ts`:

- **Paid search / Paid social / Paid video** — when utm_source is
  set and utm_medium is paid (`cpc`, `ppc`, `paid`, `paidsocial`,
  `display`, `cpm`, `retargeting`, `sponsored`, `video`, etc.).
  Recognises Google Ads, Meta, TikTok, Apple Search Ads, LinkedIn,
  Reddit, X/Twitter Ads, Pinterest, Snapchat, Microsoft (Bing Ads),
  YouTube.
- **Email** — `utm_medium=email` or `newsletter`.
- **Organic social** — referrer from a social site without paid UTM.
- **Organic search** — referrer type `search`.
- **Referral** — any other referrer. Also falls into here when only
  `utm_campaign` is set (e.g. QR codes).
- **Direct** — nothing at all.

Search keyword extraction tries `utm_term` first, then parses the
referrer URL for query params from Google / Bing / DuckDuckGo / Yahoo
/ Yandex / Baidu / Ecosia / Brave / Startpage. Google strips their
`q=` for organic so usually only utm_term will have a value there.

Files: `apps/start/src/components/profiles/profile-source.tsx`,
`apps/start/src/utils/source.ts`,
new `profile.source` procedure in `packages/trpc/src/routers/profile.ts`.

### 3.3 Platforms card (new)
Answers "does this user use web + app, and which one most?". Stacked
bar visualising session share + per-platform legend, rows show
session count, events, last seen, and:

- Web rows: comma-separated list of every distinct browser + version
  the user has used (e.g. "Chrome 124.0, Safari 17.4").
- iOS / Android rows: current app version + build number
  (`v4.12.0 · build 4120`), pulled via `argMax` over the
  `__version` / `__buildNumber` event properties.

Platform recognition: `sdk_name` header maps `web`/`js`/`browser` →
Web, `op-ios`/`swift` → iOS, `op-android`/`kotlin` → Android,
`react-native` → React Native, `node` → Server. Falls back to OS when
the SDK field is empty.

Files: `apps/start/src/components/profiles/profile-platforms.tsx`,
new `profile.platforms` procedure in `packages/trpc/src/routers/profile.ts`.

### 3.4 Metric strip changes
- **Conversion Events tile removed** (low signal on a single profile).
- **Total Session Time tile added** (replaces Bounce Rate, which was
  a cohort metric that didn't make sense per-profile). Data source:
  `round(sum(duration) / 60, 2)` in `getProfileMetrics`, rendered via
  the existing `fancyMinutes` formatter so it shows "1h 24m" etc.
- Revenue tile no longer hides on zero — "$0" is real information.

Files: `apps/start/src/components/profiles/profile-metrics.tsx`,
`packages/db/src/services/profile.service.ts`.

### 3.5 Avatar with Gravatar fallback
Resolution order:
1. Pin Drop avatar if `profile.avatar` is a URL.
2. Gravatar — SHA-256 of the lowercased email, requested with
   `d=404` so missing matches fail cleanly.
3. Facehash (the pre-existing deterministic initials fallback).

Hashed in-browser via `crypto.subtle.digest` — no extra dependency.

Files: `apps/start/src/components/profiles/profile-avatar.tsx`.

### 3.6 Layout restructure
- **Source** + **Platforms** in the first content row after the
  summary.
- **Activity heatmap** full-width, 3 months side-by-side (previously
  4 months, 2-col, made the card tall).
- **Latest Events** on the left of the next row; **Popular Events +
  Most Visited Pages** stacked on the right (fills what used to be
  an empty cell). Popular events and Most visited pages scroll
  internally at `max-h-[220px]`.

### 3.7 Header additions
- **Breadcrumb** above the name: `Profiles › Identified › [Name]` or
  `Anonymous` depending on `isExternal`.
- **Power User badge** next to the name when `totalEvents ≥ 100`
  (constant exported at the top of the route file for easy tuning).

Files: `apps/start/src/routes/_app.$organizationId.$projectId.profiles.$profileId._tabs.tsx`,
`apps/start/src/routes/_app.$organizationId.$projectId.profiles.$profileId._tabs.index.tsx`.

---

## 4. Groups redesign

### 4.1 Groups list
- **"Add group" button removed.** Description updated to explain
  groups flow in from Stripe / RevenueCat webhooks. The modal + tRPC
  mutation remain so SDK integrations can still upsert.
- **Type column removed** (all groups are `team` in Pin Drop's setup).
- **Plan column added** — reads `properties.plan`, maps to the four
  SKUs (Solo / Team / Team+ / Team Pro), coloured badge per plan.
  Mapping supports `solo`, `free`, `team`, `team-plus`/`team+`,
  `team-pro`/`pro`/`enterprise`.
- **Member count unified** with the Members tab (see bug fix 1.6).

Files: `apps/start/src/routes/_app.$organizationId.$projectId.groups.tsx`,
`apps/start/src/components/groups/table/columns.tsx`,
`packages/db/src/services/group.service.ts`.

### 4.2 Group detail — commercial info block
Replaced the old raw property dump with a curated 9-field grid:

| Field              | Source                                      |
| ------------------ | ------------------------------------------- |
| Name               | `group.name`                                |
| Plan               | `properties.plan` → badge-mapped label      |
| Team Members       | Count from `getGroupMemberProfiles`         |
| Owner              | `properties.owner_name`                     |
| Created at         | `group.createdAt` → DD/MM/YYYY              |
| Subscription term  | `properties.subscription_term` (Monthly / Annual / 24 months) |
| Deal amount        | `properties.deal_amount` formatted as currency (`properties.currency` or USD) |
| Renewal date       | `properties.renewal_date` → DD/MM/YYYY      |
| Stripe ID          | `properties.stripe_customer_id`             |

Any field with no value shows "—".

Files: `apps/start/src/routes/_app.$organizationId.$projectId.groups_.$groupId._tabs.index.tsx`.

### 4.3 Group detail — metrics
Replaced **First Seen** + **Last Seen** tiles with **Total Sessions**
+ **Total Session Time**. Total session aggregation joins the
sessions table against every member profile (so it covers sessions
not explicitly tagged with the group).

Files: `packages/trpc/src/routers/group.ts` (extended `group.metrics`).

### 4.4 Group detail — new cards
- **GroupPlatforms** (same visuals as ProfilePlatforms but aggregated
  across every member) — shows team-wide web-vs-app split with app
  versions + browser lists.
- **GroupTopMembers** (new) — top 5 members ranked by event count,
  each row links to the profile. Flame icon badge. Empty state when
  the group has no events.

New tRPC procedures: `group.platforms`, `group.topMembers`.

Files: `apps/start/src/components/groups/group-platforms.tsx`,
`apps/start/src/components/groups/group-top-members.tsx`,
`packages/trpc/src/routers/group.ts`.

### 4.5 Group detail — layout + header
- Breadcrumb added (`Groups › [Name]`) matching the profile page.
- Activity heatmap full-width.
- Popular routes full-width (balances the row).

---

## 5. Dev tooling (optional, dev-only)

These are in the repo but don't affect production. Leave them in or
delete on deploy — either is fine.

- **`LOCAL_SETUP.md`** — bring-up guide for a local dev instance
  (Docker Desktop, Node 20+, pnpm, env, seed).
- **`scripts/seed-local.mjs`** — synthetic data generator. Creates
  ~220 profiles with a realistic mix of web-only / iOS-only /
  android-only / web+iOS / web+android / all-three usage patterns,
  plus 17 fake teams split across the four SKUs with realistic
  commercial properties (owner, deal amount, term, renewal, Stripe
  ID). Assigns ~60% of identified profiles to a team with a weighted
  pick that respects the declared team size. Solo groups get exactly
  one member each. Also stamps each tracked event with the assigned
  team so the Groups aggregates populate.

---

## 6. Files touched

**Modified (28):**
- `apps/start/src/components/events/event-list-item.tsx`
- `apps/start/src/components/groups/table/columns.tsx`
- `apps/start/src/components/overview/overview-metric-card.tsx`
- `apps/start/src/components/profiles/latest-events.tsx`
- `apps/start/src/components/profiles/most-events.tsx`
- `apps/start/src/components/profiles/popular-routes.tsx`
- `apps/start/src/components/profiles/profile-activity.tsx`
- `apps/start/src/components/profiles/profile-avatar.tsx`
- `apps/start/src/components/profiles/profile-metrics.tsx`
- `apps/start/src/components/profiles/profile-properties.tsx`
- `apps/start/src/components/profiles/table/columns.tsx`
- `apps/start/src/components/profiles/table/index.tsx`
- `apps/start/src/components/ui/data-table/data-table-hooks.tsx`
- `apps/start/src/components/ui/key-value-grid.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.groups.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.groups_.$groupId._tabs.index.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.groups_.$groupId._tabs.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.profiles.$profileId._tabs.index.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.profiles.$profileId._tabs.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.profiles._tabs.anonymous.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.profiles._tabs.identified.tsx`
- `apps/start/src/routes/_app.$organizationId.$projectId.profiles._tabs.power-users.tsx`
- `apps/start/src/utils/casing.ts`
- `apps/start/src/utils/date.ts`
- `packages/db/src/services/group.service.ts`
- `packages/db/src/services/profile.service.ts`
- `packages/trpc/src/routers/group.ts`
- `packages/trpc/src/routers/profile.ts`

**New (7):**
- `apps/start/src/components/groups/group-platforms.tsx`
- `apps/start/src/components/groups/group-top-members.tsx`
- `apps/start/src/components/profiles/profile-platforms.tsx`
- `apps/start/src/components/profiles/profile-source.tsx`
- `apps/start/src/utils/source.ts`
- `scripts/seed-local.mjs` (dev only)
- `LOCAL_SETUP.md` (dev only)

Plus this file and `DEPLOYMENT.md` at the repo root.
