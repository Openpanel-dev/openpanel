# Open issues from the 2026-09-21 QA run (branch `test-rewrite`, rebased on `rewrite/v2`)

How this list was produced: an interactive dashboard walkthrough, a headless crawl of 168
route loads, a sweep of all 177 tRPC procedures, the external HTTP API, and the product MCP
server, against the `large` seed (90 days, 4 projects). Findings were cross-checked against
ClickHouse and, where relevant, against V1 on the local `main` branch.

Seven critical findings were fixed in commits `9ee15582`..`5e92441f` (timezone validation,
client-secret hashing, assistant body parsing, share FORBIDDEN, MCP request gate, clustered
table verdict, funnel ordering).

A second pass (`9bd5fb4b`..`cfdb7c3c`) ported the outstanding `origin/main` changes into the
rewrite and closed more of this list: **H2 is fixed** (`7b885237`), and **H12 is partly
fixed** (`f3e9ae4e`: `profile.values` is a 400 now; the rest of that entry stands). Those
commits also closed five published advisories that were live here and are not otherwise in
this file: the webhook template sandbox escape, the share-password cookie bypass, the
unsubscribe-token default secret, the email fallback log, and the migration banner.

Everything below is still open.

For an agent working this list: one issue per commit, verify like the "Verify" line says
(the worktree API is `$API_URL`, loopback `http://127.0.0.1:21101`; ClickHouse HTTP is
`http://localhost:23123/?database=<db>`; sign in with `admin@openpanel.local` / `openpanel`,
see `AGENTS.md` for the curl recipes). Paths are repo-relative. `V1` means the code on `main`.
Severity: **high** = data leak, security, crash or wrong numbers; **medium** = broken or
misleading feature; **low** = cosmetic.

---

## High

### H1. Secrets logged: `console.log('ENVS', process.env)` on SSR
- **Symptom**: every dashboard SSR render prints the whole process env (`POLAR_WEBHOOK_SECRET`,
  DB URLs, …) into the web process log; plus `baseUrl` logged three times per page load in the
  browser console and `tabId` logs on three tab routes.
- **Files**: `apps/start/src/integrations/tanstack-query/root-provider.tsx:47-48,74`;
  `apps/start/src/routes/_app.$organizationId.$projectId.{events,profiles,notifications}._tabs.tsx`
  (`console.log('tabId', …)`).
- **Fix**: delete the four `console.log` calls. Consider a lint rule (`noConsole`) for `apps/start/src`.
- **Verify**: `grep -rn "console.log(" apps/start/src` is empty; `$HUB_LOG_DIR/web.log` has no `ENVS`.

### H2. `reference.getChartReferences` is public with no access check — FIXED (`7b885237`)
- **Symptom**: anonymous `GET /trpc/reference.getChartReferences?input={"json":{"projectId":"acme-web","range":"30d"}}`
  → 200 with the project's references (title, description, date).
- **Files**: `packages/core/src/modules/reference/reference.rpc.ts` (~line 60, `publicProcedure`).
  Every other public procedure takes a `shareId` and resolves access through it.
- **Fix**: make it `protectedProcedure` + `requireProjectAccess`, and add a `shareId` variant
  (or resolve via the share the way `overview.rpc.ts` does) for the share pages that need
  references on charts. Check `apps/start` callers (`reference.getChartReferences` in
  overview/report charts) for the share case.
- **Verify**: anonymous call → 401; share page still shows reference markers.

### H3. Client secret hashes returned to the browser and the management API
- **Symptom**: `client.list`, `project.getProjectWithClients` and `GET /manage/clients` (list and
  by id) include `secret` (the scrypt/argon2 hash) for every client.
- **Files**: `packages/core/src/modules/client/client.rpc.ts` (`list`),
  `packages/core/src/modules/client/client.service.ts:116` (`findMany` without `select`/`omit`),
  `packages/core/src/modules/project/project.service.ts` (`getProjectWithClients`),
  `packages/core/src/modules/client/client.routes.ts` (manage list/get).
- **Fix**: `omit: { secret: true }` (Prisma) or a `toPublicClient()` mapper used by all three; the
  plaintext secret is only ever returned once, from `create`.
- **Verify**: none of the three responses contain a `secret` key; `apps/start` client settings
  table still renders (it never used the hash).

### H4. No rate limiting on login and MCP auth; user enumeration
- **Symptom**: 30 wrong passwords to `auth.signInEmail` in 13 s all get 401; 20 wrong MCP tokens in
  1 s each run a hash verify; unknown email → 404 "User does not exists" vs 401 for a wrong
  password.
- **Files**: `packages/core/src/modules/auth/auth.rpc.ts:10-12` (note says V1's
  `rateLimitMiddleware` wrappers were not mounted), `auth.service.ts:484,499`,
  `packages/core/src/modules/mcp/mcp.routes.ts:8-14` (same note). V1: `packages/trpc/src/middlewares/rate-limit.ts`
  on `main`. The tools routes (`/ip-lookup`, `/site-checker`) already rate-limit — reuse that limiter.
- **Fix**: mount a Redis-backed limiter (per IP + per email) on `signInEmail`, `signInTotp`,
  `requestResetPassword`, `signInShare`, and on `/mcp` token verification (cache negative
  results briefly); return the same 401 message for unknown email and wrong password.
- **Verify**: 11th attempt in a minute → 429; unknown email and wrong password give identical bodies.

### H5. Malformed request bodies crash routes (500) and legacy `/event` stores nameless events
- **Symptom** (all with a valid write client, `content-type: application/json`):
  `POST /profile` empty body → 500 `payload.properties`; `POST /profile/increment` `{}`/`"x"`/empty
  → 500 (`input.property.split`, destructure of null); `POST /event` `"x"` → 500, `{"foo":1}`/`[1,2]`
  → 202 and rows with `name=''` in `events`; `POST /track` 5–20 MB body → 500 with the raw KafkaJS
  "message larger than the max message size" text. `/profile` also stores `email: 12345`,
  `firstName: {"a":1}`, array properties verbatim.
- **Files**: `packages/core/src/modules/profile/profile.routes.ts:86`, `profile.service.ts:669,702`;
  `packages/core/src/modules/ingest/ingest.service.ts:170` (`getTimestamp` from `ingestLegacyEvent`
  ~649); `packages/core/src/modules/ingest/ingest.routes.ts` (no body size limit;
  `maxRequestBodySize` is set nowhere).
- **Fix**: zod body schemas on `/profile*` and legacy `/event` (the routes header says "no
  request-body schema, V1 parity", but V1 parity does not include 500s); reject events with an
  empty name; cap `/track` bodies (e.g. 1 MB) at the route and answer 413.
- **Verify**: each case above → 400/413 with a message; `SELECT count() FROM events WHERE name=''` stays 0.

### H6. Client-controlled timestamps and device ids accepted unbounded
- **Symptom**: `__timestamp: 12345` → `created_at = 1970-01-01`; `"2020-01-01T…"` stored as-is;
  every date-filled series (e.g. `/insights/:id/active_users`, `WITH FILL`) then starts in 1970.
  `__deviceId: "../../etc/passwd<script>"` stored verbatim as `device_id` and `profile_id`.
- **Files**: `packages/core/src/modules/ingest/ingest.service.ts:154-161` (`sanitizeOverrideDeviceId`),
  `:164-193` (`getTimestamp`: only `> now + 1 min` is rejected; numbers are epoch-ms).
- **Fix**: reject/clamp timestamps older than a sane window (e.g. 30 days, configurable) and
  non-string values; enforce a shape (hex, max length) or hash the device-id override.
- **Verify**: the two `/track` bodies above → 400 or clamped `created_at`; `events` has no rows before the project's `firstEventAt`.

### H7. `user.delete` orphans an organization
- **Symptom**: a user who is the sole `org:admin` of an org: `user.deletionBlockers` → `[]`,
  `user.delete` → true, the org (and its project, client, dashboards, cohort, rules) stays with
  `createdByUserId = null` and 0 members. Admin of `acme` *is* blocked, so the check misses
  trial/new orgs (probably keyed on subscription state).
- **Files**: `packages/core/src/modules/user/user.service.ts` (`deletionBlockers`, `deleteUser`).
- **Fix**: block when the user is the last admin of any org (regardless of subscription), or
  cascade-schedule that org for deletion as the account page text promises.
- **Verify**: sign up a user, create an org, `user.delete` → blocker listed or org scheduled for deletion.

### H8. MCP data-correctness bugs
- **a. `endDate` exclusive** — every `zDateRange` tool drops the whole last day
  (`startDate=endDate` → zeros; the default range excludes today). Files:
  `packages/core/src/modules/mcp/src/tools/shared.ts:80-89` (bare `YYYY-MM-DD`),
  `packages/core/src/modules/overview/src/overview.sql.ts:118-124`, `pages.sql.ts:16-22`
  (`BETWEEN … AND toDateTime('<end> 00:00:00')`). Fix: `< end + 1 day`. Verify against
  ClickHouse: `get_analytics_overview` Aug 1–31 on acme-web → 283780 sessions (inclusive), not 276535.
- **b. `query_events` / `query_sessions` unordered** — `LIMIT` without `ORDER BY` while the
  response says "created_at desc". Files: `packages/core/src/modules/event/src/sql.ts:372-377`
  (`queryEventsQuery`), `packages/core/src/modules/session/src/sql.ts` (~296, `querySessionsQuery`).
  Fix: `ORDER BY created_at DESC`. (Note: commit `f37bb130` on rewrite/v2 touched event ordering
  — re-check before fixing.)
- **c. `get_rolling_active_users` returns future dates** — `date + n` ARRAY JOIN with no
  `WHERE date <= today()`. File: `packages/core/src/modules/chart/src/retention.sql.ts:107-127`.
- **d. `get_page_conversions` empty when users identify at conversion** — joins on raw
  `profile_id`; prior page views carry the anonymous device hash. File:
  `packages/core/src/modules/overview/src/pages.sql.ts:190-200`. Fix: join through
  `profile_aliases` or fall back to `session_id`. Verify: acme-web `signup_completed` Aug 1–8 → non-empty.
- **e. Descriptions** — `get_retention_cohort` says "retained per following week" but computes
  on-or-after (`retention.sql.ts:44-47`); `get_profile_metrics` never reports "not found"
  (`profile-metrics.ts:29`); Settings → MCP page says "38 tools", `tools/list` returns 48
  (`apps/start/src/routes/_app.$organizationId.$projectId.settings._tabs.mcp.tsx`).

### H9. Mobile Events page crashes
- **Symptom**: `/acme/acme-web/events` at 390 px → "Something went wrong";
  `Element type is invalid … EventIcon`.
- **Files**: `apps/start/src/components/events/event-icon.tsx:224`
  (`EventIconMapper[meta?.icon ?? EventIconRecords[name]?.icon ?? 'BotIcon']` — no fallback when
  the resolved key is not in the mapper), `apps/start/src/components/events/event-list-item.tsx:52`.
- **Fix**: `?? EventIconMapper.BotIcon` fallback after the lookup.
- **Verify**: Playwright at 390 px, events list renders for all four projects.

### H10. Hydration mismatches on every data page
React discards the SSR tree ("tree will be regenerated on the client") or logs attribute mismatches on 158/168 loads:
- `apps/start/src/components/widget-table.tsx:122` — class name from `Math.random()`; use `useId()`.
- `apps/start/src/components/report-chart/bar/index.tsx:75,93` — skeleton widths from `Math.random()`; use a fixed pattern.
- Locale time text (`21:35:55` server vs `9:35:55 PM` client) in `FieldValue`/`KeyValueGrid`
  (session detail, profile detail); dates elsewhere render Swedish abbreviations (`21 sep`, `20 okt`)
  because the server formats with the machine locale. Pin an explicit locale (`en-US`) in the
  date/number formatters (`apps/start/src/utils/date*.ts`, `number.ts`) or format only on the client.
- `<button>` inside `<button>` in the share-dashboard modal ("Copy link" `Tooltiper`),
  `apps/start/src/modals/share-dashboard.tsx` (see console trace) — make the outer element a `div`.
- framer-motion inline styles: `apps/start/src/components/organization/prompt-card.tsx:34`,
  `sidebar-project-menu.tsx:175`, `sidebar-organization-menu.tsx:153` (`motion.span`) — render
  `initial={false}` or client-only.
- `VirtualizedEventsTable` renders the empty state on the client where SSR rendered the table
  (`apps/start/src/components/events/virtualized-events-table.tsx`).
- Missing `key` warnings in `Chart` on `/events/stats` and realtime.
- **Verify**: `browser_console_messages` on overview, realtime, events, session and profile detail show no hydration errors.

### H11. Server errors rendered as empty states; stalled loads
- **Symptom**: a 500 from `profile.list` renders "No profiles — you haven't identified any
  profiles yet"; overview cards show 0 and the map "Error loading map" on 500; the crawl saw
  ~12 % of loads stuck on skeletons with data queries never resolving (blank sidebar, no
  console output) — `crawl` screenshots in the original run.
- **Files**: `apps/start/src/routes/_app.$organizationId.$projectId.profiles._tabs.*.tsx` and the
  shared data-table empty state (`apps/start/src/components/data-table/*`), overview metric
  cards; root query error handling in `root-provider.tsx`.
- **Fix**: distinguish `isError` from empty data in the list/table components (show an error
  card with a retry); investigate the stalled hydration (suspect Vite dep re-optimisation
  during the run — confirm it does not reproduce on a warm server).
- **Verify**: temporarily make `profile.list` throw; the tab shows an error, not "No profiles".

### H12. 500 instead of 400/404 for bad ids and inputs (raw Prisma/ClickHouse text leaks) — PARTLY FIXED (`f3e9ae4e`)
`profile.values` now answers 400. Everything else in this entry is untouched, including
`gsc_get_cannibalization` without a connected integration, which still returns a raw Prisma
error.
- **tRPC** (`{id:"nope"}` or garbage): `cohort.get/update`, `cohort.refresh` (static), `report.get/update/delete/move/create`,
  `dashboard.update`, `integration.get/delete`, `notification.deleteRule`, `reference.update/delete`,
  `client.update/remove`, `import.retry/delete`, `insight.explain`, `share.reportSettings`,
  `organization.revokeInvite`, `organization.removeMember` (self), `gsc.*` (no connection),
  `event.byId/details` ("Cannot parse uuid"), `session.byId`, `group.update/delete`,
  `chart.funnel {series:[]}`, `chart.sankey` (no options), share mismatches ("Project ID mismatch",
  "Share not found"), `project.list {organizationId:null}` (`rpc/base.ts` `enforceAccess`).
  Garbage dates/numbers: `overview.stats` custom range with ISO or reversed dates, `chart.chart`
  ISO dates, `event.events`/`session.list {cursor:"garbage"}`, negative `take`/`limit`, regex
  filter `"(("`, `profile.values {property:"country"}`, `cohort.preview` property-based.
- **REST**: `GET /manage/clients/nope` (Prisma UUID), `/insights/*` (project not found → 500,
  garbage/reversed dates → 500, unknown group → 500), `/misc/ping` out-of-range count,
  `/webhook/slack` puts an internal TypeError in the redirect URL.
- **MCP**: `get_report_data` non-UUID, `update_report_layout` huge ints, `gsc_get_*` without a
  connection, inverted date range on `get_analytics_overview` (raw "WITH FILL" error).
- **UI**: `/acme/acme-web/cohorts/does-not-exist` and `/reports/does-not-exist` show the Prisma
  invocation text; `/acme/does-not-exist` shows the generic error instead of the no-access page
  (`apps/start/src/routes/__root.tsx:71` only handles `TRPCClientError`).
- **Fix pattern**: `z.string().uuid()` on id inputs; `findUnique` + `TRPCNotFoundError` instead of
  `findUniqueOrThrow`; validate dates with `zDate` and reject reversed ranges with
  `TRPCBadRequestError`; wrap ClickHouse parse errors; a shared error mapper for `/insights`
  matching `/export`. The tRPC `errorFormatter` should also drop `stack` outside development.
- **Verify**: the list above returns 400/404 with a short message; `bun test` in the touched modules.

### H13. Slow `chart.chart` with breakdowns over long ranges
- **Symptom**: 12 months / day with three breakdowns (`path`, `country`, `device`) takes 14 s
  alone and 30 s under load (hits the deadline yet still returns 200).
- **Files**: `packages/core/src/modules/chart/src/*.sql.ts` (breakdown query), `chart.service.ts`.
- **Fix**: EXPLAIN the generated SQL against the large seed; likely candidates are a missing
  `LIMIT` on breakdown combinations before the time series join, or per-breakdown subqueries.
- **Verify**: same call under 5 s on the `large` seed.

---

## Medium

### M1. Event picker counts are meaningless
- **Symptom**: report builder shows "Any events 676" and "52" next to every event (real 30-day
  counts are 39,202 … 3,097).
- **Files**: `packages/core/src/modules/chart/src/sql.ts:610` (`count(name)` over
  `distinct_event_names_mv` rows — one row per insert part), `apps/start/src/components/ui/combobox-events.tsx`;
  `chart.service.test.ts:262` documents the current behaviour.
- **Fix**: `sum(event_count)`; update the test to assert the sum.
- **Verify**: picker count for `cta_clicked` on acme-web ≈ `SELECT count() FROM events WHERE name='cta_clicked'`.

### M2. Pages table: hidden session counts and near-zero durations
- **Symptom**: Sessions column shows `—` for every row when no previous-period value exists
  (the real count, e.g. 152,116, is hidden); `avg_duration` is 0.1–0.24 (renders "0s") while
  sessions average 61 s; acme-app pages show Bounce 0 % / 0s on every row.
- **Files**: `apps/start/src/components/pages/table/columns.tsx:104` (returns `—` when
  `prev == null`), the `event.pages` query in `packages/core/src/modules/event/` (duration unit).
- **Fix**: always render the count, show the delta only when `prev` exists; audit the duration
  column's unit (ms vs s) and the bounce computation for the app archetype.
- **Verify**: "Last 3 months" shows numbers in the Sessions column; `/` on acme-web shows a
  duration in the same order as the session average.

### M3. Dashboard "Create report" link loses the dashboard id
- **Files**: `apps/start/src/routes/_app.$organizationId.$projectId.dashboards_.$dashboardId.tsx:306-312`
  (`LinkButton to='/$organizationId/$projectId/reports'` with no search param), report save
  dialog in `apps/start/src/modals/save-report.tsx` (or wherever `dashboardId` is preselected).
- **Fix**: pass `search={{ dashboardId }}` and read it in the save dialog.
- **Verify**: from a dashboard, Create report → Save → the dashboard is preselected.

### M4. Cohort dialog event picker
- **Symptom**: typing a name that exactly matches an existing event logs 100+ "two children with
  the same key" errors (the "Pick '…'" custom option shares the key with the real option) and the
  click does not select; the unfiltered list shows only 12 events with no "more" hint; the first
  option is a literal `*`; the popover opens over the Name field far from its trigger; submitting
  with no event → `cohort.create` 400 with no UI feedback; "Refresh" on a cohort gives no feedback.
- **Files**: `apps/start/src/components/ui/combobox-advanced.tsx:91` (custom option key),
  `apps/start/src/modals/add-cohort.tsx` (or the cohort form), `apps/start/src/routes/_app.$organizationId.$projectId.cohorts_.$cohortId._tabs.index.tsx:67-79`
  (banner "will appear within a minute" regardless of job state).
- **Fix**: prefix the custom option key; hide the custom option when it equals an existing
  value; label `*` as "Any event"; raise the list limit or show "N more, type to search";
  surface the mutation error as a toast; have `cohort.get` return the last compute state
  (persist `lastComputeError`) so the banner can say "failed — retry".
- **Verify**: type `signup_completed` exactly → no console errors, option selectable.

### M5. Billing and account inconsistencies
- **Symptom**: "No active plan" badge beside "Your subscription renews on September 18th, 2036"
  (`subscriptionStatus = active`); Usage "Events count 0" for the period while events were
  ingested (`organizations.subscriptionPeriodEventsCount` never incremented by the rewrite's
  ingest path — check `packages/core/src/modules/session/src/usage.ts` and
  `subscription.service.ts`); "Weekly Events" chart empty with scrambled labels
  (`W41 W26 W9 …`, `apps/start/src/components/organization/billing-usage.tsx:108-130`); acme-app
  revenue delta "↓ 3300.0 %" on a 0.1 $ base; account page says the org "has an active subscription".
- **Fix**: derive the badge from `subscriptionStatus`; find where V1 incremented the period
  counter (`main:packages/db/src/services/organization.service.ts`) and port it; sort weekly
  buckets by date and format ISO week + year; cap or hide deltas on tiny bases.
- **Verify**: `/acme/billing` shows one consistent state; counter grows after `bun run send journey`.

### M6. Session and profile detail gaps
- **Symptom**: session detail "Events" row is blank (screenshot `ui/29-session-detail.png`);
  profile detail shows "Sessions 0" while ClickHouse has 1 session (and the Sessions tab lists
  it); "Page views" and "Events per day" show the placeholder "Stay calm, its coming 🙄"
  (`apps/start/src/components/report-chart/common/loading.tsx:83`) even for active profiles;
  "Most visted pages" typo.
- **Files**: session info `KeyValueGrid` data in `apps/start/src/routes/_app.$organizationId.$projectId.sessions_.$sessionId.tsx`;
  `profile.metrics` in `packages/core/src/modules/profile/profile.service.ts` (sessions count
  — possibly the `sign` collapse or the 3-month window); profile overview charts in
  `apps/start/src/components/profiles/*`.
- **Fix**: pass the event count into the grid; align `profile.metrics` sessions with `session.list`;
  either wire the two charts to `event.pageTimeseries` or remove them until they work.

### M7. AI filter command replaces filters and double-fetches
- **Symptom**: "last 30 days, mobile only" on the overview drops the existing referrer filter
  and commits range then filters separately, so every overview query runs twice.
- **Files**: `apps/start/src/components/overview/overview-ai-command.tsx` (or the
  `runFilterCommand` consumer), overview search-param store.
- **Fix**: merge with existing filters (or say it replaces them) and batch the URL update into one navigation.

### M8. Raw errors on public routes
- `/widget/badge|counter|realtime` and `/unsubscribe` without params show raw zod JSON, in two
  different error UIs (`apps/start/src/routes/widget/*.tsx`, `unsubscribe.tsx`). Fix: validate
  search params in the loader and render a small "missing share id" page.
- `/acme/does-not-exist` — see H12 (`__root.tsx:71`).

### M9. Notification rule form validation
- **Symptom**: submitting an empty form shows only an "Issues ⊘" marker on the name field, no
  message, nothing on event/integration; unknown integration id → `notification.createOrUpdateRule` 500.
- **Files**: `apps/start/src/modals/add-notification-rule.tsx` (or equivalent),
  `packages/core/src/modules/notification/notification.rpc.ts` (`getNotificationRulesByProjectId.clear`
  also runs before the access check).
- **Fix**: field-level messages; validate integration ids belong to the project → 400/404.

### M10. Empty and odd ids from names
- **Symptom**: `dashboard.create {name:""}` and MCP `create_dashboard` → id `""`;
  `POST /manage/projects {"name":"   "}` → project id `""` (listed but unfetchable/undeletable);
  `"🚀🚀"` → id `3457`; a 1000-char name → 1000-char id.
- **Files**: `packages/core/src/slug-id.ts:19-24`, `packages/shared/src/slug.ts:21`,
  `packages/core/src/modules/project/project.constants.ts:29`, `dashboard.rpc.ts` (no `min(1)`),
  `packages/core/src/modules/mcp/src/tools/dashboard-management.ts:320`.
- **Fix**: `.trim().min(1).max(100)` on names; fall back to a generated id when the slug is empty.

### M11. Ingest response/state mismatches
- Server-side (`clientSecretAuth`, non-browser UA) `/track` returns a `deviceId`/`sessionId` but
  the stored row has empty device/session/profile (`ingest.service.ts:313-317`, `isServer` branch).
  Either omit the ids from the response or store them.
- `identify` then immediate `increment`/`decrement` → 404 "Profile not found" until the worker
  flushes (~6 s). Read the profile buffer before ClickHouse, or return 202 and apply after flush.
- `__revenue` is only validated when `name === 'revenue'`; `1e400` properties are silently dropped.

### M12. CORS on `/mcp` and `/gsc`
- **Symptom**: `OPTIONS /mcp` with `origin: https://evil.example` → `access-control-allow-origin`
  echoed with `allow-credentials: true`; preflight without request headers →
  `access-control-allow-headers: undefined`; `expose-headers` echoes every request header name.
- **Files**: `packages/core/src/http/cors.ts:10-11` (documents `/mcp`,`/gsc` as an unported quirk),
  `@elysiajs/cors` config.
- **Fix**: `/mcp` needs no browser CORS at all (token auth) — restrict to no-credentials or a
  fixed origin list; `/gsc` should use the dashboard origin.

### M13. Silent acceptance of bad input
- `overview.*` filters are `z.array(z.any())`; unknown names/operators are dropped
  (`overview.service.ts:538` `WHITELISTED_FILTERS`), so a typo returns unfiltered totals —
  validate with the filter schema and 400.
- `report.updateLayout {x:-5,w:0,h:99999}` accepted; `organization.inviteUser` with an unknown
  project in `access`; `organization.updateMemberAccess` unknown user → 200 `[{count:0}]`;
  `organization.getInvite {inviteId:"nope"}` → 200 `{isExpired: undefined}`;
  `user.update {firstName:"",lastName:""}` → 200; `email.updatePreferences` unknown categories;
  `import.create` provider mismatch; `group.create` silently upserts an existing id;
  `profile.list {take:100000}` → 100k rows in 6.6 s (add a max); `cohort.listProfiles`/`event.events`
  with another org's cohortId → 200 empty (should be 403/404).
- `/export/events?limit=0|-5`, `start=garbage`, `includes=bogus` silently ignored;
  `integration.testConnection` for webhooks returns success without sending;
  `auth.signInOAuth {provider:"github"}` returns a URL with an empty `client_id` when unconfigured.

---

## Low / cosmetic

- **Copy**: "Pick atleast one event" (report builder empty state), "Most visted pages"
  (profile + cohort), three cards titled "Event distribution" on `/events/stats` with truncated
  pie labels, "Geo data provided by MaxMind" links to `https://ipdata.co`
  (`apps/start/src/components/overview/overview-top-geo.tsx:204`).
- **Locale**: Swedish month abbreviations (`21 sep`, `20 okt`) in an English UI — same root cause
  as H10 (server locale); pin `en-US` in the formatters.
- **Console noise**: `GET $API_URL/misc/favicon?url=https://www.acme.test` → 400 on every
  overview/pages/org page (seed domains do not resolve; safe-fetch rejects) and `?url=` → 404 on
  pages without origin (`apps/start/src/components/pages/table/columns.tsx:45` renders `<img>`
  even when `origin` is empty) — skip the request when the origin is empty, cache negatives.
  Integrations/imports load logos from `static.vecteezy.com` and `docs.brandfetch.com` (blocked by
  ORB, shows alt text) — bundle the assets.
- **Titles/URLs**: `/acme/account` has no `<title>`; profile → Sessions tab is titled
  "Dashboard | …"; changing the range rewrites the URL to `/acme/acme-web/?range=3m` (trailing slash).
- **Layout**: realtime page has a blank second card (recharts 0×0 warning) and no "no traffic"
  empty state; events/sessions virtualized containers are 4–8 k px tall for ~30 rows
  (`VirtualizedEventsTable` height not tied to row count); the feedback popup overlaps the
  overview chart; the cohort event popover opens far from its trigger.
- **Seed/product mismatch**: `packages/seed` advertises conversions per project in `.seed.json`
  but never writes `event_meta.conversion = true`, so the Conversions tab is empty everywhere
  (`packages/seed/src/postgres.ts`).
- **Insights**: empty until the 02:00 cron runs (`packages/core/src/modules/insight/insight.jobs.ts:35`)
  — consider running the insight job once at seed time or exposing a "compute now" in dev.
- **API nits**: `Authorization: bearer` (lowercase scheme) rejected on `/mcp`
  (`mcp/src/auth.ts:143`); GET/DELETE `/mcp` → 404 instead of 405; form-encoded JSON-RPC bodies
  accepted; `get_dashboard_urls` does not URL-encode ids; `/export/events` returns
  `"country":"\u0000\u0000"` for events without geo (FixedString(2) zero bytes); `/manage`
  missing-auth message says "Client ID must be a valid UUIDv4" (`http/client-auth.ts:189-193`);
  unmatched routes log a warn with a stack trace each; tRPC error bodies carry the full server
  `stack` (dev default — confirm it is off in production); the "cluster" note in
  `packages/core/src/modules/organization/organization.service.ts:548-560` hand-rolls the
  `_replicated` fragment — use `replicatedTarget` from `shared/ch-tables.ts`.
- **Cohort cap**: `cohort.service.ts` materialises at most 10,000 members per compute (documented);
  the seeded signup cohort has 18,760 — the UI should say the count is truncated.

---

### L1. `test/midnight-window.test.ts` rots with the calendar
- **Symptom**: three failures in `bun test --isolate` (`pass with the wall clock at
  2026-09-16T00:0*`). The suite pins the JS clock to a hardcoded `2026-09-16` and re-runs the
  mcp/chart fixture suites inside it, but `inactiveDays` and the last-seen buckets compare
  against ClickHouse's own `now()`, which cannot be faked — `test/fixture-clock.ts:8-10` says
  so. Once the real date drifts a week past the pinned one the fixture and the server disagree
  and `find_profiles` / `get_user_last_seen_distribution` fail.
- **Files**: `packages/core/test/midnight-window.test.ts:19-23` (the hardcoded dates),
  `packages/core/test/fixture-clock.ts`.
- **Fix**: derive the in-window clocks from today rather than hardcoding them — keep the time
  of day (00:01, 00:10, 00:19 UTC) and take the current date.
- **Verify**: `bun test --isolate test/midnight-window.test.ts` passes, and still passes if the
  machine clock is moved a month forward.

## Test debt worth adding while fixing the above
- A route test that mounts `requestLogging` for every body-forwarding route (assistant now has one;
  `/mcp` and `/trpc` do not).
- `apps/start/e2e/`: share page with password; mobile events page; create client → track.
- `packages/core`: `profile-backfill-buffer` in clustered mode (none exists);
  an integration test that creates a client through the service and authenticates with it.
