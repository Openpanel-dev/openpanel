# Deployment — Pin Drop OpenPanel customisations

Handoff doc for Justin to roll these UI + API changes onto the live
self-hosted OpenPanel instance.

## What changed (high level)

All changes are scoped to three packages + the scripts folder — no
schema migrations, no breaking API changes for the SDKs.

**Dashboard (`apps/start`)**
- New profile detail cards: **Source** (referrer + UTM + channel
  classification + search keyword extraction) and **Platforms** (Web
  / iOS / Android split with app version + browser list).
- New profile metric tile: **Total Session Time** (replaces Bounce
  Rate); Conversion Events tile removed.
- Unified Profile Information card: curated field set (name, email,
  is subscriber, plan, team name, id, created, last known location).
  "Properties" tab merged into the Profile tab; noisy / duplicate
  keys (browser, os, model, path, referrer\_\*, biography, etc.) are
  hidden but still available in ClickHouse.
- Sortable column headers on the Identified / Anonymous / Power Users
  tables; all three tabs share one unified column set (Name / Plan /
  Events / Session time / Country / OS / Model / First seen / Last
  seen). Pagination bug fixed (wasn't counting deduped rows).
- Latest Events widget: replaced fragile self-measured scroll with a
  fixed max-height; empty state added. Hides profile name when already
  on that profile's page.
- Activity heatmap: 2 months by default on the profile page, 3 months
  on the group page where the card is full-width.
- Avatar fallback chain: Pin Drop avatar → Gravatar (SHA-256 of the
  email, zero extra deps) → facehash.
- Breadcrumbs added to profile + group detail pages; "Power user"
  badge on profiles with ≥100 events.
- Group list: removed Type column, added Plan column with coloured
  badges for the four Pin Drop SKUs (Solo / Team / Team+ / Team Pro).
  "Add group" button removed — groups flow in from Stripe/RevenueCat.
- Group detail: redesigned Group Information block (Name / Plan /
  Team Members / Owner / Created / Subscription term / Deal amount /
  Renewal date / Stripe ID); new **Platforms** and **Power users in
  this team** cards; Total Sessions + Total Session Time tiles.
- Layout fixes for overflowing text in the KeyValueGrid and metric
  cards (the "biography bleeding into next cell" and "25 minutes ago
  overflowing the tile" issues). Short timeAgo formatter ("5 mins
  ago" instead of "5 minutes ago").

**API + packages**
- `packages/db/src/services/profile.service.ts` — new
  `getEnrichedProfileList` that joins profiles with event + session
  aggregates in a single query. Pagination count now uses `profiles
  FINAL`. Added `totalSessionDuration` to `getProfileMetrics`.
- `packages/trpc/src/routers/profile.ts` — `profile.list` /
  `profile.powerUsers` now accept `sortBy` + `sortDirection`; new
  procedures: `profile.source`, `profile.platforms`.
- `packages/trpc/src/routers/group.ts` — new procedures:
  `group.platforms`, `group.topMembers`; `group.metrics` now returns
  total sessions + total session duration; `getGroupStats` unified
  onto profile-based member count so the table matches the detail
  page.
- `packages/db/src/services/group.service.ts` — getGroupStats split
  into two parallel queries (members from profiles table, activity
  from events table).

**Dev-only**
- `scripts/seed-local.mjs` — synthetic data generator for local dev.
  Not used in production.
- `LOCAL_SETUP.md` — doc for bringing up a local instance. Also not
  used in production but harmless to leave in the repo.

## Files changed

28 modified, 7 new. Full list at the bottom of this file.

## Handoff options

Pick whichever suits Pin Drop's workflow best. (1) is the cleanest if
you have a GitHub fork of OpenPanel you control; (2) is fine as a
one-shot.

### 1. Git branch / PR (preferred)

From the folder that holds the local checkout on Andy's Mac:

```bash
cd /Users/andy/Documents/Claude/Projects/OpenPanel/openpanel

# Sanity check you're on main and clean otherwise.
git status

# Branch it.
git checkout -b pindrop/dashboard-customisations

# Stage + commit. The scope is large so a single commit is fine.
git add -A
git commit -m "feat(dashboard): Pin Drop customisations

- Unified profile tables with sortable columns + pagination fix
- New Source / Platforms / Power-user cards on profile detail
- Group detail redesign (commercial info block + platforms + top members)
- Curated Profile Information card (merged tabs)
- Avatar fallback via Gravatar
- Seed + LOCAL_SETUP for local dev"

# Push to your fork.
git push -u origin pindrop/dashboard-customisations
```

Justin then either opens a PR against your fork's `main` and merges,
or pulls the branch directly onto his deployment copy.

### 2. Patch file

If Pin Drop doesn't have a fork to push to, or Justin prefers to
apply a single file:

```bash
cd /Users/andy/Documents/Claude/Projects/OpenPanel/openpanel

# Bundle every change (including new files) into one patch.
git add -A
git diff --cached --binary > pindrop-dashboard.patch

# Share pindrop-dashboard.patch (email / Slack / Drive).
```

Justin applies it on the production checkout:

```bash
cd /path/to/openpanel
git checkout -b pindrop/dashboard-customisations
git apply --index pindrop-dashboard.patch
git commit -m "Apply Pin Drop dashboard customisations"
```

### 3. Whole-folder handover

If Justin doesn't already have this OpenPanel checkout: zip the repo
(excluding `node_modules/`, `.git/` optional, `docker/data/`) and
send. Justin treats it as a new clone.

## Deploying to the self-hosted instance

### If Pin Drop runs OpenPanel from a built image in a registry

Most self-hosted setups use `docker compose` pointing at pre-built
images (e.g. `lindesvard/openpanel-dashboard:latest`). To ship our
changes, Justin needs to build and push custom images:

```bash
cd /path/to/openpanel-with-changes

# Build the three container images that embed the code we changed.
# (Adjust tags to your registry.)
docker build -f apps/start/Dockerfile \
  -t ghcr.io/pindrop/openpanel-dashboard:custom-$(date +%Y%m%d) .

docker build -f apps/api/Dockerfile \
  -t ghcr.io/pindrop/openpanel-api:custom-$(date +%Y%m%d) .

docker build -f apps/worker/Dockerfile \
  -t ghcr.io/pindrop/openpanel-worker:custom-$(date +%Y%m%d) .

# Push.
docker push ghcr.io/pindrop/openpanel-dashboard:custom-20260416
docker push ghcr.io/pindrop/openpanel-api:custom-20260416
docker push ghcr.io/pindrop/openpanel-worker:custom-20260416
```

Then on the production server, update `docker-compose.yml` to point
at the new tags and:

```bash
docker compose pull dashboard api worker
docker compose up -d dashboard api worker
```

ClickHouse / Postgres / Redis don't need restarting — no schema
migrations are required.

### If Pin Drop builds from source on the server

Simpler — pull the branch and rebuild in place:

```bash
cd /path/to/openpanel
git fetch origin
git checkout pindrop/dashboard-customisations
git pull

# Rebuild + restart the three services. Whichever build command
# your existing deploy script uses.
pnpm install
pnpm -r build
docker compose up -d --build dashboard api worker
```

## Rollback

No data-layer changes are involved, so rollback is plain container
revert:

```bash
# Point docker-compose back at the previous image tag or commit and
docker compose up -d dashboard api worker
```

## Smoke test after deploy

1. Log into the live dashboard.
2. Navigate to **Profiles → Power Users** — confirm pagination works
   past page 2 and the sortable columns reorder data when clicked.
3. Open any profile with recorded sessions — confirm the Source and
   Platforms cards render.
4. Open the **Groups** page — confirm the Plan badge column is
   populated and the "Add group" button is gone.
5. Open any group detail — confirm the Group Information block shows
   the curated fields and the Platforms + Power users cards render.

If any card shows a runtime error, check the dashboard container's
logs first (`docker compose logs dashboard --tail 100`); most
regressions would surface as a tRPC schema mismatch — a restart of
the api + worker usually clears it.

## Full list of files touched

### Modified
- apps/start/src/components/events/event-list-item.tsx
- apps/start/src/components/groups/table/columns.tsx
- apps/start/src/components/overview/overview-metric-card.tsx
- apps/start/src/components/profiles/latest-events.tsx
- apps/start/src/components/profiles/most-events.tsx
- apps/start/src/components/profiles/popular-routes.tsx
- apps/start/src/components/profiles/profile-activity.tsx
- apps/start/src/components/profiles/profile-avatar.tsx
- apps/start/src/components/profiles/profile-metrics.tsx
- apps/start/src/components/profiles/profile-properties.tsx
- apps/start/src/components/profiles/table/columns.tsx
- apps/start/src/components/profiles/table/index.tsx
- apps/start/src/components/ui/data-table/data-table-hooks.tsx
- apps/start/src/components/ui/key-value-grid.tsx
- apps/start/src/routes/_app.$organizationId.$projectId.groups.tsx
- apps/start/src/routes/_app.$organizationId.$projectId.groups_.$groupId._tabs.index.tsx
- apps/start/src/routes/_app.$organizationId.$projectId.groups_.$groupId._tabs.tsx
- apps/start/src/routes/_app.$organizationId.$projectId.profiles.$profileId._tabs.index.tsx
- apps/start/src/routes/_app.$organizationId.$projectId.profiles.$profileId._tabs.tsx
- apps/start/src/routes/_app.$organizationId.$projectId.profiles._tabs.anonymous.tsx
- apps/start/src/routes/_app.$organizationId.$projectId.profiles._tabs.identified.tsx
- apps/start/src/routes/_app.$organizationId.$projectId.profiles._tabs.power-users.tsx
- apps/start/src/utils/casing.ts
- apps/start/src/utils/date.ts
- packages/db/src/services/group.service.ts
- packages/db/src/services/profile.service.ts
- packages/trpc/src/routers/group.ts
- packages/trpc/src/routers/profile.ts

### New
- apps/start/src/components/groups/group-platforms.tsx
- apps/start/src/components/groups/group-top-members.tsx
- apps/start/src/components/profiles/profile-platforms.tsx
- apps/start/src/components/profiles/profile-source.tsx
- apps/start/src/utils/source.ts
- scripts/seed-local.mjs  (dev only)
- LOCAL_SETUP.md           (dev only)
