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

A third pass (2026-09-23) triaged the list against the no-breaking-change rule below and
closed four more: **H1** (`7b254dc9`), **H3** (`e37d15cc`), **H9** (`ebc68650`) and **L1**
(`7e7eb4ef`). With L1 gone `bun test --isolate` in `packages/core` is green: 1797 pass,
12 skip, 0 fail. H8a followed (`908bf0d1`).

The fourth pass then fixed, in order: **M1** (`048177e9`), **H8b + the rest of H8a**
(`3304948b`), **H8c** (`23dfd554`), **H8e** (`d0c64225`), **H6** (`aeaccdf6`) and **M2**
(`91cb6b0d`). **H8 is now closed apart from H8d, which is deferred.** Core suite 1810 pass,
12 skip, 0 fail.

A fourth pass (2026-09-27) re-investigated the open entries against the running databases
rather than trusting the QA text. **Several diagnoses in this file were wrong and have been
rewritten in place.** In particular: **H7 is not a bug** and is closed; **H13 is not a SQL
problem** (ClickHouse answers in 0.3 s, the 14 s is superjson); **H8b is half fixed**;
**H8d's proposed `profile_aliases` fix cannot work** and the entry is deferred; **H12 has three
shared seams** and its "partly fixed" note was an overstatement; **H10's locale bug is one
line**; **H11 is ~11 places, not twenty**; and two Low claims do not reproduce. Each entry now
carries its own evidence. Where an entry says something was measured, it was.

The fourth pass then closed, in order: **M1**, **H8b + the rest of H8a**, **H8c**, **H8e**,
**H6**, **M2**, **H5**, **H13**, **H11**, **H12** (its systemic half), **H10** (most), the
low-hanging batch, the seed conversions, and **H4** (both halves). **H7 is closed as not a
bug.** Core suite 1830 pass, 12 skip, 0 fail.

### Fifth pass (2026-09-29): every M-entry and the Low section re-verified

Four sub-agents re-checked the M-entries and the Low section against the running
API, ClickHouse and Postgres rather than trusting the QA text. **A large part of
this file was stale.** Per-entry verdicts are inline below; the summary:

**Fixed during this pass** (`cd489afb`): the notification rule-cache ordering
(M9), `/export/events` 500 on an unparseable date (M13), `subscription.getUsage`
bucketing the whole term instead of the billing period (M5), both "Create
report" links dropping the dashboard id (M3), and the combobox duplicate-key
crash (M4).

**Found already fixed, no work needed**: M5's events counter, M6's session
Events row and the "Most visted" typo, M9's unknown-integration 500, M4's
missing error toast, the cohort popover position, every Low copy string, the
ipdata.co credit, the favicon `?url=` on origin-less rows, the seed's
`event_meta` rows (10 present, matching `.seed.json`), and all six sanctioned
API nits. `getLocale()` is pinned to `en-US` (`1d92441a`) — one agent reported
it unfixed and was wrong; the file's own comment records the fix.

**Confirmed NOT a bug**: M2's acme-app bounce rate — every acme-app session
genuinely hits two or more screens, so 0 % is the seed's data, not a formatting
fault (all 91,015 sessions have `is_bounce=false`, against acme-web's
430,023 true). M12's origin echo, which `cors.ts` documents deliberately.

### Still open

- **H8d** — deferred by the owner; the diagnosis is settled above.
- **H10** — the virtualized tables (also the oversized-container item in Low)
  and the pie-label `key`. Both re-confirmed still broken; the pie label needs a
  browser to see the warning.
- **H11** — the "~12 % stuck on skeletons" half. Still unsized; needs a warm
  browser crawl, which no agent could do.
- **H12** — the per-case validation tail; see M13, which overlaps it.
- **H13** — the default series limit, deferred as a product decision.
- **M6** — profile "Sessions 0" while a session exists. Real, and the cause is
  now known: `profileMetricsQuery` counts `session_start` events by
  `profile_id`, which is never backfilled when a device is later identified, so
  the first session keeps its pre-identify id. This is the same identity-
  stitching gap as H8d. Counting from the `sessions` table instead would fix
  the number without touching ingest.
- **M5** — the billing badge. `subscriptionStatus` is `active` while
  `subscriptionProductId` is NULL, so the page shows "No active plan" beside
  "renews on …". The seed creates exactly that state; Polar would not. Either
  make the badge derive from `getSubscriptionStateMeta` or stop the seed
  claiming an active subscription with no product. Same root cause as the
  account page refusing deletion.
- **M7, M8** — both re-confirmed broken and both small; see their entries.
- **M11, M13** — a long tail of validation and response-shape defects, each
  re-verified with live calls. None breaks the public contract to fix. The
  highest-value ones left: `/track` returning a deviceId/sessionId it does not
  store, `organization.getInvite` answering 200 for an unknown id,
  `auth.signInOAuth` handing back a URL with an empty `client_id` when the
  provider is unconfigured, and `profile.list` having no `take` cap.
- **M12** — two header defects on `/mcp`: `Access-Control-Allow-Headers:
  undefined` when a preflight asks for no headers, and
  `Access-Control-Expose-Headers` echoing request header names. Both cosmetic.
  **Not the one-liners they look like**: `@elysiajs/cors` takes
  `true | string | string[]`, so replacing the echo means an explicit list, and
  that TIGHTENS what a browser may send — which the ground rule forbids.
- **Low** — the insights cron (product call), the cohort cap (migration), the
  trailing-slash router option, the 36-route `head:` sweep, bundling the
  external logos, negative favicon caching, the realtime empty states, and the
  feedback popup overlap.
- **Test debt** — untouched.

### Carried over from `docs/TECH_DEBT.md` (deleted 2026-09-28)

That file was a dated log of work that landed, not a to-do list. Four of its
"known debt" items had already been fixed by the time it was read (the tracked
`package-lock.json`, the inert `rolldown` override, the unused `jiti`
devDependencies, and `verification/golden/queue-keys/`, whose directory is
gone). These are what was left, each re-checked against the tree on 2026-09-28:

- ~~**`tooling/gates/conformance/rules.test.ts` runs in no suite.**~~ Fixed
  2026-09-29: the root `test` script now ends with
  `bun test tooling/gates/conformance` (19 pass, 0 fail).
- **The conformance R14 residue scan does not reach `packages/`.**
  `tooling/gates/conformance/cli.ts` builds `residueFiles` from `packages/core`,
  `apps/api` and `apps/start` only, so the one surviving `NEXT_PUBLIC_`
  reference outside `apps/public` —
  `packages/payments/src/polar.ts:63`'s `process.env.NEXT_PUBLIC_DASHBOARD_URL`
  — is invisible to the rule whose label says "elsewhere outside
  `apps/public/`". Widening the scan changes what that gate asserts, so it is a
  decision, not a fix.

### Pre-existing, found while verifying (2026-09-28)

- **The Bun pin has drifted.** `.bun-version` says `1.4.0` and
  `apps/api/Dockerfile`'s `ARG BUN_VERSION` agrees, but this machine runs Bun
  1.4.2, so `scripts/doctor.sh` reports a failure and
  `apps/api/src/config/bun-version.test.ts`'s "doctor.sh passes" case is red.
  Confirmed pre-existing by stashing the comment-cleanup diff and re-running:
  same single failure. Either install 1.4.0 or bump `.bun-version` and the
  Dockerfile `ARG` together — the test exists to stop those two drifting, and
  right now it is the installed toolchain that has moved.

### Found while cleaning comments (2026-09-28)

- ~~**`notification.constants.ts` duplicates three schemas from
  `report.constants.ts`.**~~ Fixed 2026-09-29: the local `zChartEvent`,
  `zChartEventFilter` and `zChartEventSegment` copies, and the three inlined
  enum tuples behind them, are gone; the file imports `zChartEvent` from the
  report module instead. All three enum sets were confirmed identical
  (15 operators, 5 value types, 10 segments) and the report schema was
  confirmed to parse a notification-shaped payload before the swap.
  `constants-stay-isomorphic` still passes, since a `*.constants.ts` may
  import another. 107 lines removed.

Everything else below is still open.

---

## Ground rule (2026-09-23): no breaking changes

The owner's constraint on this list: **nothing here may break a self-hoster or the public
API** (`/track`, `/profile`, `/event`, `/import`, `/export`, `/insights`, `/manage`,
`/mcp`). A fix that would reject a payload those endpoints accept today, change a
documented response shape, or add a mandatory env var is out of scope *even when this
file's own "Fix" line proposes it*.

Six entries propose exactly that. The Fix lines below are **superseded** by this table;
the entry text is kept for context.

| Entry | The proposed fix that would break callers | Do this instead |
|---|---|---|
| **H5** | cap `/track` bodies at 1 MB | cap at the *current* effective ceiling (Kafka's `max.message.bytes`) so nothing that succeeds today starts failing, and answer 413 instead of a raw KafkaJS 500 |
| **H6** | reject `__timestamp` older than ~30 days | **Do not.** Back-dating is documented and deliberate — `docs/(tracking)/how-it-works.mdx` § Timestamps, and the Mixpanel migration guide imports years-old events through it. Only reject values that do not parse to a real date; `__timestamp: 12345` landing in 1970 is the bug, `2020-01-01` is not |
| **H6** | enforce a shape on `__deviceId`, or hash it | **Won't fix.** Hashing rewrites `profile_id` and orphans every existing profile. The value binds as a query parameter and React escapes it, so the `<script>` example is inert |
| **M10** | `.trim().min(1).max(100)` on names | rejecting a name `/manage/projects` accepts today is breaking. Fix the actual defect: generate a fallback id when the slug comes out empty, so the project stops being unfetchable and undeletable |
| **M11** | omit `deviceId`/`sessionId` from the `/track` response | removing response fields is breaking. Either store the ids on the `isServer` branch or leave the entry |
| **M12** | restrict CORS on `/mcp` | `http/cors.ts` documents the open scope as deliberate V1 parity, and a browser MCP client would break. Fix only the two header bugs (`allow-headers: undefined`, `expose-headers` echoing every request header name) and leave the origin policy alone |
| **M13** | 400 on `/export` `limit=0\|-5`, `includes=bogus` | clamp, do not reject. M13's tRPC half (`overview.*` filter validation, a `profile.list` take cap) is dashboard-only and safe to make strict |

**H8a was a judgement call and the owner took it (2026-09-23): fixed in `908bf0d1`.**
A bare `YYYY-MM-DD` end bound now names the whole day, as it already did on the
dashboard path. MCP numbers change, by design — `get_analytics_overview` for
acme-web August went from 276535 sessions to 283780, which is the ClickHouse count.

**H4 is larger than the entry says.** There is no rate limiter in the rewrite at all:
`grep -rn rateLimit packages/core/src` finds only the unmounted `createRateLimitMiddleware`
seam in `rpc/base.ts` and an in-memory one under `modules/tools/src/`. Meanwhile
`apps/public/content/docs/api-reference/rate-limits.mdx` publishes 100 req/10 s for
Insights and Export and 20 req/10 s for Manage. Porting V1's `packages/trpc/src/rate-limit.ts`
therefore *restores* documented behaviour rather than imposing a new limit — keep V1's
numbers exactly, and leave `/track`, `/profile` and `/import` unlimited as the docs promise.

**H3 is the reverse case**: `docs/api/manage/clients.mdx:34` already states that secrets
are "only returned once at creation time and are never retrievable afterwards". Removing
the hash from the list/get responses makes the code match the published contract.


For an agent working this list: one issue per commit, verify like the "Verify" line says
(the worktree API is `$API_URL`, loopback `http://127.0.0.1:21101`; ClickHouse HTTP is
`http://localhost:23123/?database=<db>`; sign in with `admin@openpanel.local` / `openpanel`,
see `AGENTS.md` for the curl recipes). Paths are repo-relative. `V1` means the code on `main`.
Severity: **high** = data leak, security, crash or wrong numbers; **medium** = broken or
misleading feature; **low** = cosmetic.

---

## High

### H1. Secrets logged: `console.log('ENVS', process.env)` on SSR — FIXED (`7b254dc9`)
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

### H3. Client secret hashes returned to the browser and the management API — FIXED (`e37d15cc`)
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

### H4. No rate limiting on login and MCP auth; user enumeration — FIXED (`5583e782`, `d84d1d48`)
> **Wider than written: the rewrite has no rate limiter at all. See the ground rule.**
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

### H5. Malformed request bodies crash routes (500) and legacy `/event` stores nameless events — FIXED (`f577ad85`)
> **Narrowed by the ground rule above — the Fix line below is breaking as written.**
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
- **Fix — and it must NOT add body schemas.** ADR-003 is an accepted decision, quoted at
  `profile.routes.ts:13-15`: "/profile, /import, /event and /tools have no request schemas
  today, and adding them would be a behaviour change". The 500s are fixable without touching
  it: guard the three `/profile*` handlers (`profile.routes.ts:61,87,110` destructure
  `body as …` with no null check), keep `/event` answering 202 but **skip the write** when the
  name is empty so the HTTP contract is byte-unchanged, and cap `/track` at the broker's
  configured maximum with a 413 instead of a raw KafkaJS 500.
- **Verify**: each case above → 400/413 with a message; `SELECT count() FROM events WHERE name=''` stays 0.

### H6. Client-controlled timestamps and device ids accepted unbounded — FIXED (`aeaccdf6`)
> **Narrowed by the ground rule above — the Fix line below is breaking as written.**
- **Symptom**: `__timestamp: 12345` → `created_at = 1970-01-01`; `"2020-01-01T…"` stored as-is;
  every date-filled series (e.g. `/insights/:id/active_users`, `WITH FILL`) then starts in 1970.
  `__deviceId: "../../etc/passwd<script>"` stored verbatim as `device_id` and `profile_id`.
- **Files**: `packages/core/src/modules/ingest/ingest.service.ts:154-161` (`sanitizeOverrideDeviceId`),
  `:164-193` (`getTimestamp`: only `> now + 1 min` is rejected; numbers are epoch-ms).
- **Fix — reduced to one thing.** The device-id half is **already handled**:
  `sanitizeOverrideDeviceId` (`ingest.service.ts:142-151`) already requires a string, trims it,
  rejects empty and enforces `MAX_OVERRIDE_DEVICE_ID_LENGTH`. Character-shape enforcement is
  unnecessary (the value binds as a query parameter and React escapes it) and hashing would
  orphan every existing profile. What remains is a **sanity floor** in `getTimestamp`
  (`ingest.service.ts:163-193`) so a resolved timestamp before the floor falls back to server
  time. A floor, not a window: real epoch-ms numbers and ISO strings both resolve correctly
  today, and historical imports must keep working.
- **Verify**: the two `/track` bodies above → 400 or clamped `created_at`; `events` has no rows before the project's `firstEventAt`.

### H7. `user.delete` orphans an organization — NOT A BUG, closed 2026-09-27
The organization is not orphaned. It is swept within the hour, and the UI says so.
- `organization.service.ts:602` `runDeleteCron` selects
  `{ members: { none: { role: 'org:admin' } } }` and deletes those organizations and their
  projects from both ClickHouse and Postgres.
- It runs hourly: `organization.jobs.ts:29`, `cron: { pattern: '0 * * * *' }`.
- `apps/start/src/components/settings/delete-account.tsx:25-27` already promises exactly this:
  "Organizations you created that have no other admin will also be deleted, along with their
  projects and events."
- `user.service.ts:73` `listUserDeletionBlockers` blocks only on an active subscription **by
  design** — do not delete a paying org. That is why the admin of `acme` was blocked and a
  trial org was not. It is not "keyed on subscription state" by accident.

The QA run observed the state inside the one-hour window before the sweep. The only thing
worth noting is that the sweep is hourly rather than immediate.

### H8. MCP data-correctness bugs
- **a. `endDate` exclusive — FIXED (`908bf0d1`)** — every `zDateRange` tool drops the whole last day
  (`startDate=endDate` → zeros; the default range excludes today). Files:
  `packages/core/src/modules/mcp/src/tools/shared.ts:80-89` (bare `YYYY-MM-DD`),
  `packages/core/src/modules/overview/src/overview.sql.ts:118-124`, `pages.sql.ts:16-22`
  (`BETWEEN … AND toDateTime('<end> 00:00:00')`). Fix: `< end + 1 day`. Verify against
  ClickHouse: `get_analytics_overview` Aug 1–31 on acme-web → 283780 sessions (inclusive), not 276535.
- **b. `query_sessions` unordered — FIXED (`3304948b`)** — `queryEventsQuery` got its
  `ORDER BY created_at DESC` from `f37bb130` and is fine today
  (`packages/core/src/modules/event/src/sql.ts:384-393`, with a comment explaining why).
  Only `packages/core/src/modules/session/src/sql.ts:315` `querySessionsQuery` still has a
  bare `LIMIT` while the response claims "created_at desc". Verified: asking for the 5 newest
  sessions returns rows from 26 Aug, four seconds apart. Fix: one line, that file only.
- **c. `get_rolling_active_users` returns future dates — FIXED (`23dfd554`)** — `date + n` ARRAY JOIN with no
  `WHERE date <= today()`. File: `packages/core/src/modules/chart/src/retention.sql.ts:107-127`.
- **d. `get_page_conversions` empty when users identify at conversion — DEFERRED by the
  owner 2026-09-27; diagnosis below is settled, do not re-derive it.** The join at
  `packages/core/src/modules/overview/src/pages.sql.ts:190` is `e.profile_id = c.profile_id`,
  and page views seen before the visitor identified carry the anonymous device hash.
  **This entry's proposed `profile_aliases` fix does not work**: that table holds 0 rows for
  every project, because `alias` is not implemented at all — `ingest.service.ts:468` returns
  `alias-not-supported`. The other stitching mechanism is `EXPERIMENTAL_PROFILE_BACKFILL`
  (`env.ts:579`), **off unless explicitly set**, optionally limited to named projects
  (`session-end.ts:136-144`), and even when on it only rewrites `profile_id` for events in the
  same session within 6 hours (`profile-backfill-buffer.ts:103-108`). So the seed is faithful
  to the default configuration, not unrepresentative. Joining on `session_id` returns 3,004
  rows where the current join returns 0 (acme-web / `signup_completed` / Aug 1-8), and gives
  the same attribution the backfill would. It is deferred because it narrows attribution to a
  single session and makes the tool's `windowHours` parameter close to meaningless.
- **e. Descriptions — FIXED (`d0c64225`)** — three, and one was worse than reported.
  `get_retention_cohort` says "retained per following week" but computes on-or-after, because
  `retention.service.ts:256` defaults `criteria` to `'on_or_after'` which `retention.sql.ts:44-47`
  compiles to `>=`. `get_profile_metrics` has a not-found guard at `profile-metrics.ts:28` that
  **can never fire**, because `profile.service.ts:203` is `const metrics = data!` over an
  unconditional aggregate that always returns a row — fix belongs there, not in the tool.
  The MCP settings page (`settings._tabs.mcp.tsx:196-198`) says the server is **"read-only and
  exposes 38 tools"**: there are 48, and **9 of them mutate** (`create_dashboard`,
  `create_report`, `update_dashboard`, `update_report`, `update_report_layout`,
  `reset_dashboard_layout`, `delete_dashboard`, `delete_report`, `duplicate_report`).
  "Read-only" is the more important error of the two.

### H9. Mobile Events page crashes — FIXED (`ebc68650`)
- **Symptom**: `/acme/acme-web/events` at 390 px → "Something went wrong";
  `Element type is invalid … EventIcon`.
- **Files**: `apps/start/src/components/events/event-icon.tsx:224`
  (`EventIconMapper[meta?.icon ?? EventIconRecords[name]?.icon ?? 'BotIcon']` — no fallback when
  the resolved key is not in the mapper), `apps/start/src/components/events/event-list-item.tsx:52`.
- **Fix**: `?? EventIconMapper.BotIcon` fallback after the lookup.
- **Verify**: Playwright at 390 px, events list renders for all four projects.

### H10. Hydration mismatches on every data page — MOSTLY FIXED (`1d92441a`)
React discards the SSR tree ("tree will be regenerated on the client") or logs attribute mismatches on 158/168 loads:
- `apps/start/src/components/widget-table.tsx:121-123` — class name from `Math.random()`, used
  both as a `className` at `:163` and inside injected `<style>` text at `:141-154`, so the CSS
  itself differs between server and client. Use `useId()`, but strip the colons — `:r3:` is not
  a valid CSS selector.
- `apps/start/src/components/report-chart/bar/index.tsx:74,92` — skeleton widths from `Math.random()`; use a fixed array indexed by the `index` already in scope at `:53`.
- **Locale — this is ONE LINE, not a formatter sweep.** `apps/start/src/utils/date.ts:11-17`
  `getLocale()` returns `'en-US'` only when `typeof navigator === 'undefined'`, which is dead
  code on modern runtimes: node and the browser both define `navigator`, so the server formats
  with the machine locale. Pinning that one function covers `formatDate`, `formatDateTime`,
  `formatTime` and `TimeAgo`, and through them **104 call sites across 19 files**. Numbers are
  already pinned (`use-numer-formatter.ts:76` hardcodes `en-US`). A separate sweep of 42 raw
  `.toLocaleString()` call sites across 21 files is optional and mechanical. Note the fix pins
  the *locale* but not the *timezone*, so a server in a different zone from the browser still
  mismatches on times.
- **`<button>` inside `<button>` — 10 sites, not 1.** `ui/tooltip.tsx:63-72` `Tooltiper`
  renders a real `<button>` unless `asChild` is passed. The offenders are
  `share-dashboard-modal.tsx:127,141,151` (note: `-modal`, the path in the original entry was
  wrong), `share-report-modal.tsx:119,133,143`, `share-overview-modal.tsx:118,132,142` and
  `fullscreen-toggle.tsx:44`. Of 38 `Tooltiper` uses only 9 pass `asChild`.
- framer-motion inline styles: `apps/start/src/components/organization/prompt-card.tsx:25-35`,
  `sidebar-project-menu.tsx:173-184`, `sidebar-organization-menu.tsx:161+` (`motion.span`;
  the original entry's `:153` points at the enclosing button) — render `initial={false}` or
  client-only. `initial={false}` removes the entry animation, so `prompt-card` is a small
  design call.
- **The virtualized table is a real bug, not just a hydration warning.** The file is
  `apps/start/src/components/events/table/index.tsx` (not `virtualized-events-table.tsx`).
  Two divergences: `:195` flips the empty-state branch because `isLoading`/`data` resolve
  differently on the server, and `useWindowVirtualizer` at `:150-155` yields a different
  `getTotalSize()` with no window. The oversized container in the Low section is the same
  defect: `:206` sets the body height from `getTotalSize()`, and the infinite-scroll sentinel
  at `:314` then sits below an 8k-px container and keeps firing `fetchNextPage` at `:301`.
  Same pattern in `components/sessions/table/index.tsx:179` and
  `components/ui/data-table/virtualized-data-table.tsx:45`.
- Missing `key` warnings in `Chart` on `/events/stats`. **The realtime half does not
  reproduce** — every `.map()` on that page is keyed. The best candidate for `/events/stats` is
  `report-chart/pie/chart.tsx:132-188`, whose `renderLabel` is passed to recharts at `:103` and
  returns a bare fragment; recharts renders one per slice, so a keyless fragment per element
  matches the warning. **Needs a console run to confirm.**
- **Verify**: `browser_console_messages` on overview, realtime, events, session and profile detail show no hydration errors.

### H11. Server errors rendered as empty states; stalled loads — FIXED (`ce090a6e`) except the stalled-loads half
- **Symptom**: a 500 from `profile.list` renders "No profiles — you haven't identified any
  profiles yet"; overview cards show 0 and the map "Error loading map" on 500; the crawl saw
  ~12 % of loads stuck on skeletons with data queries never resolving (blank sidebar, no
  console output) — `crawl` screenshots in the original run.
- **Scope is ~11 places, and one of them is the whole bug.** The shared component is
  `apps/start/src/components/ui/data-table/data-table.tsx` (the path in the original entry,
  `components/data-table/*`, does not exist). Its props at `:18-26` are `loading` and `empty`
  with **no error concept at all**, and `:75` / `:107-118` branch on
  `rows?.length ? rows : <FullPageEmptyState …>` — an error produces zero rows, so it renders
  the same pixels as "nothing here yet".
- **Files**: one component above, plus eight wrappers that destructure only `isLoading` and
  drop `isError`: `profiles/table/index.tsx:36,64`, `groups/table/index.tsx:42,54`,
  `clients/table/index.tsx:17,38`, `notifications/table/index.tsx:17,29`,
  `settings/invites/index.tsx:19,39`, `settings/members/index.tsx:16,28`,
  `pages/table/index.tsx:101,127` and `routes/…references.tsx:172`. Plus two `arePropsEqual`
  key lists that must learn about `isError` or the error will not re-render:
  `profiles/table/index.tsx:105` and `groups/table/index.tsx:99`.
- **The report charts already do this correctly** (`overview-map.tsx:57` renders "Error loading
  map"), so they are the pattern to copy. `grep -rn "isError" apps/start/src` finds 16 hits in
  15 files and **not one is a list**.
- **An error boundary does not save you**: `__root.tsx:70-91` only catches `beforeLoad`/loader
  throws, and these lists fetch in the component body. `root-provider.tsx:126`'s `QueryCache`
  `onError` handles 401 only, and `shouldRetryQuery` (`:13-21`) retries a 500 once first, so
  the user waits two round-trips for the wrong empty state.
- **Fix**: add an `error` prop to `data-table.tsx` and branch before the empty branch; pass
  `error={query.isError}` from the eight wrappers. Optionally add a toast in the `QueryCache`
  `onError`, which would cover every query in the app.
- **Verify**: temporarily make `profile.list` throw; the tab shows an error, not "No profiles".
- **The "~12 % stuck on skeletons" half is unsized.** No evidence found either way; it needs a
  warm-server re-run, as the entry itself suggests. Treat it as a separate item.

### H12. 500 instead of 400/404 for bad ids and inputs (raw Prisma/ClickHouse text leaks) — SYSTEMIC HALF FIXED (`047ce12a`)
**No error-mapping work has landed.** The earlier "partly fixed (`f3e9ae4e`)" note overstated
things: that commit was a SQL-allowlist security port, and the `profile.values` 400 was an
incidental side effect of allowlisting a column name, not a deliberate error mapping.

**Do not work the enumeration below item by item.** There are three shared seams, and they
cover most of it at once:
- **tRPC**: every one of the 177 procedures passes through `rpc/base.ts:117`
  (`export const procedure = t.procedure.use(stopWhenCancelled)`); all three public builders
  derive from it and `grep -rn "t\.procedure" | grep -v rpc/base.ts` returns zero hits. One
  `.use()` there reaches all of them. Note `errorFormatter` at `:77-88` is **not** the seam —
  tRPC derives the HTTP status from `error.code` before it runs. It *is* the right place for
  the separate `stack`-stripping ask.
- **REST**: `.onError({ as: 'global' })` in `http/errors.ts` delegates to `normalizeError`
  (`shared/errors.ts:52-103`), covering `/insights` and `/manage` together.
- **MCP**: the leak is one line, `mcp/src/tools/shared.ts:358`
  (`const message = err instanceof Error ? err.message : String(err)`).

**The culprit is also not the one this entry names.** `findUniqueOrThrow` has ~41 real call
sites, but the bigger cause is the Prisma column type: `Report`, `Cohort`, `Integration`,
`Client`, `Reference`, `NotificationRule` and `Import` ids are `@db.Uuid` (`Dashboard` is
not), so a malformed id raises Prisma **P2023 before any guard runs**. `cohort.get`
(`cohort.rpc.ts:98-105`), `report.get` (`report.rpc.ts:145-148`) and `event.byId/details`
(`event.rpc.ts:96-98,110-112`) **already throw `TRPCNotFoundError` correctly** for a
well-formed-but-absent id — they fail only on garbage, so the entry's "`findUniqueOrThrow` →
`findUnique`" fix pattern does not describe them. `event.byId` is worse than written: the
ClickHouse error (code 376, `CANNOT_PARSE_UUID`) echoes the generated SQL including the scope
clause. No `.uuid()` appears in any `*.rpc.ts`.

Suggested approach: land the three seams, re-run the 177-procedure sweep, and let the
**remaining** 500s define the tail (expect ~8-12 genuine validation bugs). Several items below
are already fixed.
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
- **UI**: mostly evaporates once the server returns proper codes. `__root.tsx:70-91` already
  renders "No access" on 403 and a clean error state otherwise; it shows Prisma text only
  because the server hands it Prisma text in `error.message`. The entry's claim that it "only
  handles `TRPCClientError`" is misleading. One small follow-up remains: render a 404 as a
  not-found page rather than "Something went wrong".
- **Fix pattern**: `z.string().uuid()` on id inputs; `findUnique` + `TRPCNotFoundError` instead of
  `findUniqueOrThrow`; validate dates with `zDate` and reject reversed ranges with
  `TRPCBadRequestError`; wrap ClickHouse parse errors; a shared error mapper for `/insights`
  matching `/export`. The tRPC `errorFormatter` should also drop `stack` outside development.
- **Verify**: the list above returns 400/404 with a short message; `bun test` in the touched modules.

### H13. Slow `chart.chart` with breakdowns over long ranges — FIXED (`e826a05a`); was never a SQL problem
- **Symptom**: 12 months / day with three breakdowns (`path`, `country`, `device`) takes 14 s
  alone and 30 s under load (hits the deadline yet still returns 200).
- **The original diagnosis in this entry was wrong.** There is no missing `LIMIT` problem and
  no per-breakdown subquery. The generated statement is ONE `GROUP BY`, no join; `path`,
  `country` and `device` are native columns, not Map lookups. **ClickHouse answers in 0.3 s**,
  reading 3.7M rows / 179 MB with 69 MB of memory.
- **The cost is `superjson.serialize` at `rpc/base.ts:76`**, measured at 6.7-10.3 s:

  | stage | 12 months |
  |---|---|
  | ClickHouse | 0.32 s |
  | `JSON.parse` | 0.06 s |
  | `runQuery` Int coercion (`src/run-query.ts:47-58`) | 0.13 s |
  | `groupByLabels` (`src/shared/group-by-labels.ts:24-75`) | 0.52 s |
  | `format` (`src/engine/format.ts:11`) | 0.40 s |
  | **superjson.serialize** | **6.7-10.3 s** |
  | `JSON.stringify` | 0.37-0.61 s |

- **Two multiplicative causes.**
  **(a)** 4,640 series × 365 dates = 1,693,600 points. `group-by-labels.ts:63-74` pads every
  group to the union of all dates seen, and `WITH FILL` put all 365 calendar days in that union
  even though the seed holds 91 days of data, so a 12-month window costs 4× a 90-day one purely
  in JS padding over empty days.
  **(b)** `format.ts:134-143` emits `previous: undefined` on every point when `previousSeries`
  is null, and superjson records one metadata entry per `undefined` **with its full path
  string**: 1,693,602 entries, **77 MB of metadata whose entire content is "this field is
  undefined"**. Dropping the key cuts meta to 2 entries.
- **Fix (chosen)**: build the data point without the `previous` key rather than with
  `previous: undefined` (`format.ts:134-143`, same pattern at `:79`), then narrow the date
  union in `group-by-labels.ts:63-74` to the span the data covers. **Nothing changes over the
  wire** — superjson already erased those keys to nothing, so `data[i].previous` reads
  `undefined` either way. Measured 10.3 s → 5.1 s, response 175 MB → ~98 MB.
- **Rejected**: a default series `limit`. It is a much bigger win (`limit=500` takes superjson
  to 0.5 s and the payload to 19 MB) but it **drops series** — 4,640 → 500 — so saved reports,
  CSV export and the MCP `get_report_data` tool would silently return less. Deferred as a
  product decision. Note `offset` is accepted by the schema and threaded to `fetch.ts:167` but
  **never consumed**, so paging is not actually implemented.
- **Also rejected**: pushing a `LIMIT` into SQL. The database is already fast; it would save
  ~0.3 s and change results the same way a JS limit does.
- **Verify**: same call under 5 s on the `large` seed, and diff the JSON before/after to show
  it is identical apart from absent `previous` keys.

---

## Medium

### M1. Event picker counts are meaningless — FIXED (`048177e9`)
- **Symptom**: report builder shows "Any events 676" and "52" next to every event (real 30-day
  counts are 39,202 … 3,097).
- **Files**: `packages/core/src/modules/chart/src/sql.ts:610` (`count(name)` over
  `distinct_event_names_mv` rows — one row per insert part), `apps/start/src/components/ui/combobox-events.tsx`;
  `chart.service.test.ts:262` documents the current behaviour.
- **Fix**: `sum(event_count)` in `eventNamesWithCountQuery` (`chart/src/sql.ts:616`); update
  `chart.service.test.ts:262`, which pins the current behaviour.
- **Confirmed with numbers** (acme-web): the picker shows **52** for `screen_view`, which has
  **974,387** occurrences. `sum(event_count)` matches the `events` table exactly for every
  name — 974387 / 659361 / 659361 / 95582 / 46334 / 34533 across the top six.
- **Verify**: picker count for `cta_clicked` on acme-web equals `SELECT count() FROM events
  WHERE project_id='acme-web' AND name='cta_clicked'` (95,582).

### M2. Pages table: hidden session counts and near-zero durations — FIXED (`91cb6b0d`), except the acme-app bounce-rate note
- **Symptom**: Sessions column shows `—` for every row when no previous-period value exists
  (the real count, e.g. 152,116, is hidden); `avg_duration` is 0.1–0.24 (renders "0s") while
  sessions average 61 s; acme-app pages show Bounce 0 % / 0s on every row.
- **Files**: `apps/start/src/components/pages/table/columns.tsx:104` (returns `—` when
  `prev == null`), the `event.pages` query in `packages/core/src/modules/event/` (duration unit).
- **Confirmed**: `pages/table/columns.tsx:102-104` returns an em dash whenever `prev == null`,
  hiding the real count; `pages.sql.ts:88` is `round(avg(e.duration) / 1000 / 60, 2)`, i.e.
  **minutes**, which the UI renders as seconds — a 61-second average becomes "1.02" and is
  shown as "0s".
- **Fix**: always render the count, show the delta only when `prev` exists; make the duration
  unit and the formatter agree (seconds is the simpler of the two).
- **Verify**: "Last 3 months" shows numbers in the Sessions column; `/` on acme-web shows a
  duration in the same order as the session average.

### M3. Dashboard "Create report" link loses the dashboard id — FIXED (`cd489afb`)
> Verified 2026-09-29: both LinkButtons (`:307`, `:372`) lacked `search`, while
> `reports.tsx:19` and `save-report.tsx:40` already read the param. Both now pass it.
- **Files**: `apps/start/src/routes/_app.$organizationId.$projectId.dashboards_.$dashboardId.tsx:306-312`
  (`LinkButton to='/$organizationId/$projectId/reports'` with no search param), report save
  dialog in `apps/start/src/modals/save-report.tsx` (or wherever `dashboardId` is preselected).
- **Fix**: pass `search={{ dashboardId }}` and read it in the save dialog.
- **Verify**: from a dashboard, Create report → Save → the dashboard is preselected.

### M4. Cohort dialog event picker — PARTLY FIXED (`cd489afb`)
> Verified 2026-09-29. **Fixed**: the duplicate-key crash — the "Pick '…'" entry is no
> longer offered when the text matches an existing option. **Already fixed**: the missing
> error toast (`add-cohort.tsx` wires `onError: handleError`) and the popover position
> (`combobox-advanced.tsx:123` now uses `--radix-popover-trigger-width`). **Does not
> reproduce**: the "only 12 events" cap — `chart.events` returns 44 for acme-shop with no
> server LIMIT; the popover is virtualised and scrollable, it just has no "N more" hint.
> **Still open**: the `*` first option (one-liner — pass `anyEvents:false` or label it "Any
> event") and the compute banner, which needs a persisted `lastComputeError` field.
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

### M5. Billing and account inconsistencies — PARTLY FIXED (`cd489afb`)
> Verified 2026-09-29. **Fixed**: the Weekly Events chart — `getUsage` bucketed
> `subscriptionStartsAt`→`subscriptionEndsAt`, a ten-year span for the seeded org, giving
> 3,650 daily rows and repeating week numbers. It now takes one interval from
> `subscriptionStartsAt`, which is overwritten at each renewal. **Already fixed**: the
> events counter — live `organization.list` shows a non-zero
> `subscriptionPeriodEventsCount`, wired from `session.jobs.ts:113`. **Still open**: the
> badge, below.
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

### M6. Session and profile detail gaps — PARTLY STALE
> Verified 2026-09-29. **Already fixed**: the session detail Events row
> (`sessions_.$sessionId.tsx:246` passes `eventCount`; live `session.byId` returns it) and
> the "Most visted pages" typo. **Not a backend bug**: the two profile charts — a direct
> `chart.chart` call with the page's own report definition returns data; if the placeholder
> persists it is `useInViewport` never flipping, which needs a browser. **Still open**: the
> sessions count, see the summary above.
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

### M7. AI filter command replaces filters and double-fetches — CONFIRMED STILL BROKEN
> Verified live 2026-09-29: `overview.runFilterCommand` with an active `referrer_name`
> filter returned only the new `device` filter. The merge is a prompt instruction
> (`filter-command.ts:79`), not code. The double-fetch is two sequential `pushUrl` calls in
> `overview-ai-command.tsx:43-64`.
- **Symptom**: "last 30 days, mobile only" on the overview drops the existing referrer filter
  and commits range then filters separately, so every overview query runs twice.
- **Files**: `apps/start/src/components/overview/overview-ai-command.tsx` (or the
  `runFilterCommand` consumer), overview search-param store.
- **Fix**: merge with existing filters (or say it replaces them) and batch the URL update into one navigation.

### M8. Raw errors on public routes — CONFIRMED STILL BROKEN
> Verified live 2026-09-29: all four routes render the raw `ZodError` issues array through
> `__root.tsx:71`, which prints `error.message`. A route-level `errorComponent` on each,
> or optional search params with a "missing share id" state, closes it.
- `/widget/badge|counter|realtime` and `/unsubscribe` without params show raw zod JSON, in two
  different error UIs (`apps/start/src/routes/widget/*.tsx`, `unsubscribe.tsx`). Fix: validate
  search params in the loader and render a small "missing share id" page.
- `/acme/does-not-exist` — see H12 (`__root.tsx:71`).

### M9. Notification rule form validation — PARTLY FIXED (`cd489afb`)
> Verified 2026-09-29. **Fixed**: the rule cache was cleared before the access check and
> before the write; `deleteRule` never cleared it at all. **Already fixed**: the unknown
> integration id — `notification.service.ts:434` validates ownership and answers 400, not
> 500. **Still open**: the form UX; `zChartEvent.name` has no `.min(1)`, so an empty event
> name passes the client resolver and only surfaces as a toast.
- **Symptom**: submitting an empty form shows only an "Issues ⊘" marker on the name field, no
  message, nothing on event/integration; unknown integration id → `notification.createOrUpdateRule` 500.
- **Files**: `apps/start/src/modals/add-notification-rule.tsx` (or equivalent),
  `packages/core/src/modules/notification/notification.rpc.ts` (`getNotificationRulesByProjectId.clear`
  also runs before the access check).
- **Fix**: field-level messages; validate integration ids belong to the project → 400/404.

### M10. Empty and odd ids from names
> **Narrowed by the ground rule above — the Fix line below is breaking as written.**
- **Symptom**: `dashboard.create {name:""}` and MCP `create_dashboard` → id `""`;
  `POST /manage/projects {"name":"   "}` → project id `""` (listed but unfetchable/undeletable);
  `"🚀🚀"` → id `3457`; a 1000-char name → 1000-char id.
- **Files**: `packages/core/src/slug-id.ts:19-24`, `packages/shared/src/slug.ts:21`,
  `packages/core/src/modules/project/project.constants.ts:29`, `dashboard.rpc.ts` (no `min(1)`),
  `packages/core/src/modules/mcp/src/tools/dashboard-management.ts:320`.
- **Fix**: `.trim().min(1).max(100)` on names; fall back to a generated id when the slug is empty.

### M11. Ingest response/state mismatches — CONFIRMED STILL BROKEN (all three)
> Verified live 2026-09-29. The `isServer` branch
> (`incoming-event-handler.ts:407-434`) falls back to `''` rather than the deviceId and
> sessionId it already resolved and returned. The identify→increment race is the profile
> buffer never writing its `profile-cache:*` key until flush — `add()` does not write it and
> the public `setCache` is dead code. Non-finite properties are dropped by the Kafka JSON
> round-trip, where `Infinity` becomes `null` and `toDots` skips nulls.
> **Narrowed by the ground rule above — the Fix line below is breaking as written.**
- Server-side (`clientSecretAuth`, non-browser UA) `/track` returns a `deviceId`/`sessionId` but
  the stored row has empty device/session/profile (`ingest.service.ts:313-317`, `isServer` branch).
  Either omit the ids from the response or store them.
- `identify` then immediate `increment`/`decrement` → 404 "Profile not found" until the worker
  flushes (~6 s). Read the profile buffer before ClickHouse, or return 202 and apply after flush.
- `__revenue` is only validated when `name === 'revenue'`; `1e400` properties are silently dropped.

### M12. CORS on `/mcp` and `/gsc` — NOT THE ONE-LINER IT LOOKS LIKE
> Verified live 2026-09-29. The origin echo is deliberate and `cors.ts` documents it, so
> that half is **not actionable** under the ground rule. The other two reproduce:
> `Access-Control-Allow-Headers: undefined` when a preflight requests no headers, and
> `Access-Control-Expose-Headers` echoing `host,user-agent,accept,origin,…`. Both are
> cosmetic — an absent `Access-Control-Request-Headers` means the browser is asking for
> nothing, and request header names expose no response header. **Fixing them means an
> explicit list**, because `@elysiajs/cors` accepts only `true | string | string[]`, and an
> explicit `allowedHeaders` TIGHTENS what a browser may send. Left alone deliberately.
> **Narrowed by the ground rule above — the Fix line below is breaking as written.**
- **Symptom**: `OPTIONS /mcp` with `origin: https://evil.example` → `access-control-allow-origin`
  echoed with `allow-credentials: true`; preflight without request headers →
  `access-control-allow-headers: undefined`; `expose-headers` echoes every request header name.
- **Files**: `packages/core/src/http/cors.ts:10-11` (documents `/mcp`,`/gsc` as an unported quirk),
  `@elysiajs/cors` config.
- **Fix**: `/mcp` needs no browser CORS at all (token auth) — restrict to no-credentials or a
  fixed origin list; `/gsc` should use the dashboard origin.

### M13. Silent acceptance of bad input — RE-VERIFIED BULLET BY BULLET (2026-09-29)
> **Fixed** (`cd489afb`): `/export/events?start=garbage` — the entry said "silently
> ignored"; it actually answered **HTTP 500 with a raw RangeError**, because
> `new Date('garbage')` survives construction and throws only when formatted.
> **Already fixed**: `/export/events?limit=0|-5`, clamped at `export.routes.ts:195`.
> **Not actionable**: `includes=bogus`, whose silent ignore matches the ground rule.
> **Still broken, each re-verified**: the `overview.*` `z.array(z.any())` filters;
> `report.updateLayout` bounds; `organization.inviteUser` accepting an unknown project;
> `organization.updateMemberAccess` for an unknown user; `organization.getInvite`
> answering 200 `{isExpired: undefined}`; `user.update` empty names;
> `email.updatePreferences` unknown categories; `import.create` provider mismatch;
> `group.create` upserting silently; `profile.list` with no `take` cap;
> `cohort.listProfiles` cross-org returning 200 empty (a status-code problem, **not** a
> data leak — the query is scoped by the caller's own `project_id`);
> `integration.testConnection` reporting success for webhooks without sending anything;
> and `auth.signInOAuth` returning a URL with an empty `client_id` when the provider is
> unconfigured. None of these is breaking to fix.
> **Narrowed by the ground rule above — the Fix line below is breaking as written.**
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

> **Re-verified 2026-09-29.** Most of this section is done. **Already fixed and
> confirmed absent from the repo**: "Pick atleast one event"; "Most visted pages"
> (now "Most visited"); the three identically-titled "Event distribution" cards
> (now four distinct titles); the MaxMind credit, which linked to ipdata.co and
> now links to maxmind.com; the favicon `?url=` request on origin-less rows
> (`pages/table/columns.tsx:46` skips the `<img>` and encodes the origin); the
> cohort popover position; the seed's missing `event_meta` rows — Postgres holds
> 10, exactly matching what `.seed.json` advertises; and every sanctioned API
> nit (lowercase `bearer`, GET/DELETE `/mcp` → 405 with `Allow`, `NOT_FOUND` in
> `SKIP_LOG_ERROR_CODES`, the NUL-byte `country`, `get_dashboard_urls` encoding,
> and the hand-rolled `_replicated` fragment). The **locale** bullet is also
> fixed — `getLocale()` returns `'en-US'` (`1d92441a`); the only
> `navigator.language` left in the tree is the word inside that function's own
> comment. The stack-trace-in-production bullet was never a bug.
>
> **Still open**: the `<title>` gaps, the trailing-slash router option, the
> favicon negative cache (needs a new cache value shape), bundling the external
> logos (licence decision), the realtime empty states and blank second card, the
> feedback popup overlap, the virtualized container heights (same root cause as
> H10), the truncated pie labels (deliberate `truncate(name, 20)`), the insights
> cron (product call) and the cohort cap (migration).


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
  Integrations load one logo from `static.vecteezy.com` (`integrations.tsx:60`) and one from
  `play-lh.googleusercontent.com` (`:50`). **`docs.brandfetch.com` does not appear anywhere in
  the repo** — that half of the claim does not reproduce. Bundling means committing binary
  assets and settling the vecteezy licence, so it is not a one-liner.
  Negative caching is also not free: `misc.service.ts:239-292` only caches the success path,
  so a new cache value shape is needed.
- **Titles/URLs**: `/acme/account` has no `<title>`; profile → Sessions tab is titled
  "Dashboard | …"; changing the range rewrites the URL to `/acme/acme-web/?range=3m` (trailing slash).
- **Layout**: realtime page has a blank second card (recharts 0×0 warning) and no "no traffic"
  empty state; events/sessions virtualized containers are 4–8 k px tall for ~30 rows
  (`VirtualizedEventsTable` height not tied to row count); the feedback popup overlaps the
  overview chart; the cohort event popover opens far from its trigger.
- **Seed/product mismatch**: `packages/seed` advertises conversions per project in `.seed.json`
  (`postgres.ts:193`, `manifest.ts:31,82`) but writes **no `event_meta` rows at all** — the
  table holds 0 rows — so the Conversions tab is empty everywhere. The consumer is
  `event.service.ts:830-833` (`findMany({ where: { conversion: true } })`).
  **No ClickHouse reseed and no `.seed.json` change are needed**: `EventMeta` is Postgres-only
  with `@@unique([name, projectId])`, so it is an upsert loop next to `upsertClient`, and
  `seedPostgres` is already idempotent. Give it its own commit so the re-run is a clean step.
- **Insights — NOT A BUG, needs a product decision before any code.** Empty until the 02:00
  cron (`insight.jobs.ts:35`, with a per-day dedupe `jobId` at `:44`). The comment at `:31-33`
  says the schedule deliberately matches V1. Nothing is broken; a fresh seed simply has no
  computed insights. Three possible answers: run `insightsProject` once at seed time (dev-only,
  small), expose a "compute now" (a new user-facing feature), or document it. **Do not batch
  this with the copy fixes.**
- **API nits** — six of these change public HTTP behaviour; the owner's calls are marked.
  **DO**: `Authorization: bearer` (lowercase scheme) rejected on `/mcp` (`mcp/src/auth.ts:146`,
  `startsWith('Bearer ')`) — RFC 7235 makes the scheme case-insensitive, so this is strictly
  loosening and cannot break a caller. **DO**: GET/DELETE `/mcp` → 404 instead of 405
  (`mcp.routes.ts:23` registers only `.post`) — add the methods returning 405 with
  `Allow: POST`. **SKIP**: form-encoded JSON-RPC bodies accepted (`mcp.service.ts:109` gates on
  `isRecord` with no content-type check) — rejecting them is pure tightening that can only
  break callers that work today. `get_dashboard_urls` does not URL-encode ids
  (`dashboard-links.ts:74,89-99`, six raw interpolations). **DO, but in its own commit**:
  `/export/events` returns `"country":"\u0000\u0000"` for events without geo — the fix belongs
  at `event.service.ts:334` (`transformEvent`), so it changes the dashboard, MCP and charts at
  the same time as the documented export API. `/manage`
  missing-auth message says "Client ID must be a valid UUIDv4" (`http/client-auth.ts:189-193`);
  unmatched routes log a warn with a stack trace each (`http/errors.ts:25-29`,
  `SKIP_LOG_ERROR_CODES` omits `NOT_FOUND`); tRPC error bodies carry the full server `stack`
  — **already off in production**, since `apps/api/Dockerfile:123`, `apps/start/Dockerfile:89`
  and `self-hosting/coolify.yml:146,187,218` all set `NODE_ENV=production`, so this is a
  regression test at most, not a code change; the "cluster" note in
  `packages/core/src/modules/organization/organization.service.ts:548-560` hand-rolls the
  `_replicated` fragment — use `replicatedTarget` from `shared/ch-tables.ts`.
- **Cohort cap — the least low-hanging item in this section.** `cohort.service.ts:72`
  `DEFAULT_COHORT_MATERIALIZE_LIMIT = 10_000` (env-tunable at `:74-79`), and the stored count is
  **already the truncated one** (`:874` `profileCount: profileIds.length`). To say "truncated"
  the UI needs a flag that does not exist: either persist `truncated` on the `Cohort` model
  (**a Prisma migration**) or derive it at read time and add a field to the tRPC response. The
  comment at `:64` says the subset is arbitrary, so even "10,000+" would be a lie without an
  uncapped `count()`. Needs a decision first.

---

### L1. `test/midnight-window.test.ts` rots with the calendar — FIXED (`7e7eb4ef`)
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
