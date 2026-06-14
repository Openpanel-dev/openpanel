# Core Packages

The core packages provide shared, foundational utilities used across the OpenPanel platform. These six packages handle authentication, API routing, validation, common utilities, constants, and JSON serialization.

## Key files

| Package | Location | Purpose |
|---------|----------|---------|
| `@openpanel/auth` | `packages/auth/` | Session/token management, OAuth (GitHub/Google), password hashing (Argon2) |
| `@openpanel/trpc` | `packages/trpc/` | tRPC router definitions & procedures; 20+ routers for dashboard API |
| `@openpanel/validation` | `packages/validation/` | Zod schemas for charts, reports, projects, users, integrations |
| `@openpanel/common` | `packages/common/` | Utilities (date, math, string, slug, timezone); server-side helpers |
| `@openpanel/constants` | `packages/constants/` | UI constants (time windows, chart types, operators, intervals) |
| `@openpanel/json` | `packages/json/` | SuperJSON helpers for serializing non-JSON types |

---

## @openpanel/auth

**Purpose:** Handles session tokens, OAuth providers, and password security (Argon2).

### Key exports

- **`createSession(token, userId)`** — Creates a 30-day session in the database (packages/auth/src/session.ts:16).
- **`validateSessionToken(token)`** — Validates session token; auto-extends if within 15 days of expiry (src/session.ts:68). Returns `{ session, user, userId }` or `EMPTY_SESSION`.
- **`invalidateSession(sessionId)`** — Deletes a session (src/session.ts:112).
- **`generateSessionToken()`** — Generates a 20-byte base32 token (src/session.ts:9).
- **`hashPassword(password)`** — Argon2 with 19456 memory cost, 2 iterations (src/password.ts:5).
- **`verifyPasswordHash(hash, password)`** — Compares hash against plain text (src/password.ts:14).
- **`verifyPasswordStrength(password)`** — Validates length and checks against Have I Been Pwned API (src/password.ts:21).
- **`github`, `google`** — Preconfigured Arctic OAuth2 clients (src/oauth.ts:8,14).
- **`setSessionTokenCookie()`, `deleteSessionTokenCookie()`** — Cookie helpers using httpOnly, sameSite=lax (src/cookie.ts).

### Session token flow

1. `generateSessionToken()` → 20 random bytes → base32-encode
2. Session ID = SHA256(token) stored in database
3. Token sent to client as secure HTTP-only cookie
4. On request, `validateSessionToken()` decodes cookie → looks up session by SHA256 hash
5. Auto-extends expiry if needed (30-day rolling window)

### Dependencies

- `@node-rs/argon2` (Argon2 hashing)
- `@oslojs/crypto` (SHA256 hashing)
- `@oslojs/encoding` (base32 encoding)
- `arctic` (OAuth2 abstraction for GitHub, Google)
- `@openpanel/db` (Prisma models: Session, User)

**File structure:**
- `src/session.ts` — Session CRUD and validation
- `src/password.ts` — Password hashing & security checks
- `src/oauth.ts` — OAuth provider setup
- `src/cookie.ts` — Cookie serialization
- `constants.ts` — `COOKIE_OPTIONS` (httpOnly, sameSite=lax, domain, secure)

---

## @openpanel/trpc

**Purpose:** Central tRPC API layer; 20+ routers handle all dashboard/API communication.

### Router map (packages/trpc/src/routers/)

**Core business logic:**
- **`chart.ts`** (867 lines) — Chart data queries (linear, bar, funnel, retention, conversion, histogram, map, pie, metric). Uses ClickHouse ChartEngine.
- **`report.ts`** (327 lines) — Report CRUD (create, update, delete, list).
- **`dashboard.ts`** (244 lines) — Dashboard management.
- **`overview.ts`** (306 lines) — Overview queries and dashboard summaries.
- **`event.ts`** (367 lines) — Event list/details, filters, properties.
- **`cohort.ts`** (489 lines) — Cohort definitions, membership queries.
- **`custom-event.ts`** (184 lines) — Custom (derived) event definitions.

**User & org management:**
- **`user.ts`** (58 lines) — Get user profile.
- **`organization.ts`** (293 lines) — Org CRUD, member list, roles.
- **`project.ts`** (206 lines) — Project CRUD, settings (domain, CORS, filters).

**Analytics:**
- **`profile.ts`** (176 lines) — User profile lookup, property timeline.
- **`client.ts`** (101 lines) — API client token management.
- **`session.ts`** (87 lines) — Session queries.
- **`realtime.ts`** (149 lines) — Real-time event stream (websocket?).

**Integration & alerts:**
- **`integration.ts`** (140 lines) — Slack/Discord/Webhook integrations.
- **`notification.ts`** (152 lines) — Alert rules and delivery.
- **`reference.ts`** (129 lines) — Reference/marker annotations.

**Account & auth:**
- **`auth.ts`** (383 lines) — Sign up, sign in, OAuth, password reset.
- **`subscription.ts`** (178 lines) — Billing/plan management.
- **`onboarding.ts`** (138 lines) — Project onboarding flow.

**Data import & sharing:**
- **`import.ts`** (204 lines) — Import from Umami/Plausible/Mixpanel.
- **`share.ts`** (88 lines) — Public/password-protected report sharing.

**Other:**
- **`chat.ts`** (20 lines) — AI chat (minimal).

### tRPC context & middleware

**Context creation** (src/trpc.ts:34):
```ts
createContext({ req, res }) {
  session: SessionValidationResult  // from auth cookie
  req, res                           // Fastify objects
  setCookie: ISetCookie             // Helper to set HTTP-only cookies
  cookies: Record<string, string>   // Parsed request cookies
}
```

**Procedure types:**
- **`publicProcedure`** — No auth required. Includes logging + session scope middleware (src/trpc.ts:163).
- **`protectedProcedure`** — Auth required (`enforceUserIsAuthed`), project/org access checks (`enforceAccess`), logging, session scope (src/trpc.ts:166).

**Middlewares:**
- **`enforceUserIsAuthed`** — Throws `UNAUTHORIZED` if no `ctx.session.userId` (src/trpc.ts:76).
- **`enforceAccess`** — Checks `projectId` and `organizationId` via `getProjectAccess()` and `getOrganizationAccess()` (from @openpanel/db). Throws in demo mode on mutations (src/trpc.ts:97).
- **`loggerMiddleware`** — Logs mutations with path, userId, projectId, organizationId (src/trpc.ts:136).
- **`sessionScopeMiddleware`** — Wraps handler in `runWithAlsSession()` for async context propagation (src/trpc.ts:156).
- **`cacheMiddleware`** — Redis caching for queries (TTL-based, production-only); keys = `trpc:{path}:{input}` (src/trpc.ts:176).

**Rate limiting:**
- `rateLimitMiddleware({ max, windowMs })` — Uses `@trpc-limiter/redis` with IP fingerprint (src/trpc.ts:18).

**Error handling:**
- Custom error helpers: `TRPCAccessError()`, `TRPCNotFoundError()`, `TRPCInternalServerError()`, `TRPCBadRequestError()` (src/errors.ts).
- Zod error flattening in response format (src/trpc.ts:64).

**SuperJSON transformer:**
- tRPC uses `superjson` to serialize non-JSON types (dates, maps, sets) (src/trpc.ts:63).

### Access control

Access checks delegate to `@openpanel/db`:
- `getProjectAccess(userId, projectId)` — Returns boolean; checks user's org membership and project assignment.
- `getOrganizationAccess(userId, organizationId)` — Returns boolean; checks user's org role.
- `getClientAccess(clientId, projectId)` — Returns boolean; for API client tokens.

(Implementation in @openpanel/db, not @openpanel/trpc.)

### Root router structure

**File:** src/root.ts

Aggregates all routers into a single `appRouter`:
```ts
appRouter = createTRPCRouter({
  auth, chart, cohort, customEvent, dashboard, event, ...
  organization, project, profile, report, session, share,
  subscription, user, realtime, chat, import, notification, integration,
  onboarding, overview, reference
})
```

Exported as `AppRouter` type for type-safe client usage (src/root.ts:57).

### Dependencies

- `@trpc/server` — Core tRPC framework
- `@openpanel/auth` — Session validation
- `@openpanel/db` — Prisma + ClickHouse access
- `@openpanel/validation` — Zod schemas
- `@openpanel/common` — Utilities
- `@openpanel/constants` — UI enums
- `@openpanel/redis` — Cache & rate-limit store
- `@trpc-limiter/redis` — Rate limiter
- `superjson` — Non-JSON serialization
- `date-fns`, `mathjs`, `ramda` — Utilities

---

## @openpanel/validation

**Purpose:** Zod schema definitions for all API inputs and domain models.

### Main schemas

**Chart & reporting:**
- `zChartEventFilter` — Single filter (name, operator, value, cohortId) (index.ts:22).
- `zChartEvent` — Event with segment, filters, optional property (index.ts:42).
- `zChartFormula` — Formula-type series (e.g., A+B) (index.ts:65).
- `zChartEventItem` — Discriminated union: event | formula (index.ts:83).
- `zChartSeries` — Array of events/formulas; auto-migrates old `events` → `series` field (index.ts:96).
- `zChartBreakdown` — Dimension breakdown by property or cohort (index.ts:88).
- `zChartInputBase` — Core chart query: chartType, interval, series, breakdowns, range, metric, projectId, filters, etc. (index.ts:143).
- `zChartInput` — Preprocessed to normalize series format (index.ts:241).
- `zReportInput` — ChartInputBase + name, lineType, unit, hiddenSeries (index.ts:249).
- `zChartInputAI` — Report schema for AI feature (startDate/endDate required) (index.ts:265).

**Events & filtering:**
- `zChartEventSegment` — Segment types: event, user, session, user_average, one_event_per_user, property_sum/average/max/min (index.ts:37).
- `zChartType` — Chart types: linear, bar, histogram, pie, metric, area, map, funnel, retention, conversion (index.ts:131).
- `zLineType` — Line visualization: monotone, linear, natural, basis, step, bump, etc. (index.ts:133).
- `zTimeInterval` — minute, day, hour, week, month (index.ts:135).
- `zMetric` — Aggregation: count, sum, average, min, max (index.ts:137).
- `zRange` — Time window: 30min, lastHour, today, 7d, 30d, 3m, 6m, 12m, custom, etc. (index.ts:139).

**Users & auth:**
- `zSignInEmail` — email + password (8+ chars) (index.ts:523).
- `zSignUpEmail` — firstName, lastName, email, password, confirmPassword, inviteId (index.ts:529).
- `zResetPassword` — token + password (index.ts:544).
- `zRequestResetPassword` — email (index.ts:550).
- `zInviteUser` — email, organizationId, role, access (index.ts:277).
- `zCheckout` — productPriceId, organizationId, projectId, productId (index.ts:561).

**Projects:**
- `zProject` — id, name, domain (URL), CORS origins, filters, crossDomain, allowUnsafeRevenueTracking (index.ts:510).
- `zOnboardingProject` — Onboarding flow: project name, domain, CORS, website/app/backend flags, timezone (index.ts:298).
- `zProjectFilterIp` — IP block filter (index.ts:492).
- `zProjectFilterProfileId` — Profile exclusion filter (index.ts:498).

**Integrations & alerts:**
- `zSlackConfig` — Slack app config (team, channel, webhook URL, token) (index.ts:369).
- `zWebhookConfig` — Generic webhook (URL, headers, payload) (index.ts:377).
- `zDiscordConfig`, `zEmailConfig`, `zAppConfig` — Other destinations (index.ts:385, 396, 391).
- `zNotificationRuleEventConfig`, `zNotificationRuleFunnelConfig`, `zNotificationRuleThresholdConfig`, `zNotificationRuleAnomalyConfig` — Alert condition types (index.ts:428–476).
- `zAlertFrequency` — hour, day, week, month (index.ts:446).
- `zCreateNotificationRule` — name, config, integrations, sendToApp, sendToEmail, projectId (index.ts:481).

**Sharing & organization:**
- `zShareOverview` — organizationId, projectId, password, public flag (index.ts:284).
- `zEditOrganization` — id, name, timezone (index.ts:569).
- `zCreateImport` — projectId, provider (umami/plausible/mixpanel), config (index.ts:614).

**Custom events & cohorts:**
- `zCustomEventCriteria` — Event name + filters (custom-event.validation.ts:29).
- `zCustomEventDefinition` — operator: 'or', events array (max 40) (custom-event.validation.ts:40).
- `zCustomEventInput` — name, description, projectId, definition, conversion flag (custom-event.validation.ts:52).
- Cohort schemas exported from `cohort.validation.ts` (index.ts:627).

**Type exports** (types.validation.ts):
- `IChartInput`, `IChartInputAI`, `IChartEvent`, `IChartSeries`, `IChartBreakdown`, `IInterval`, etc.
- `ISetCookie` — Function type for setting HTTP-only cookies.
- `Metrics` — sum, average, min, max, count + previous period comparison.
- `IChartSerie` — Response type: id, names, event metadata, metrics, data points.
- `FinalChart` — series array + aggregated metrics.

**Dependencies:**
- `zod` — Schema definition
- `@openpanel/constants` — Chart type/operator/interval enums

**Note:** Validation schemas are colocated with their domain (chart, cohort, custom-event, etc.) to avoid circular dependencies.

---

## @openpanel/common

**Purpose:** Shared utilities for both client and server; utilities for data transformation.

### Client-side exports (index.ts)

**Date:**
- `getDefaultIntervalByRange()` — Maps time window to interval (e.g., 30d → day).
- `getDefaultIntervalByDates()` — Infers interval from custom date range.
- `isMinuteIntervalEnabledByRange()`, `isHourIntervalEnabledByRange()` — Feature flags.

**Object/math/string:**
- `groupByLabels()` — Groups objects by property.
- `getPreviousMetric()` — Calculates metric delta.
- `objectToSnakeCase()`, `objectToCamelCase()`, `objectToKeyValue()` — Object transformations.
- `round()` — Number rounding.
- `generateId()` — Generates unique IDs.
- `generateSlug()` — Slugifies strings.
- `getUrl()` — URL construction.
- `getNames()` — Name generation.
- `timezones` — List of IANA timezones.

### Server-side exports (server/index.ts)

**Crypto & ID generation:**
- `hashPassword()` — Argon2 hashing (imports from @openpanel/auth).
- `generateSecureId()` — Cryptographic ID generation.
- `profileId()` — Generates profile ID.

**Utilities:**
- `parseReferrer()` — Extracts referrer info.
- `parseUserAgent()` — Parses browser/OS/device from UA string.
- `getClientIp()` — Extracts IP from request headers/proxy.

**Referrers:**
- `referrers/` — Curated list of known referrer domains.

### Key helpers (src/)

| File | Purpose |
|------|---------|
| `date.ts` | Date arithmetic, interval-by-range mapping |
| `math.ts` | Rounding, calculations |
| `object.ts` | Deep object transformations (snake/camel case, merge, pick) |
| `slug.ts` | URL-safe slug generation |
| `string.ts` | String utilities (truncate, replace) |
| `url.ts` | URL parsing and construction |
| `id.ts` | ID generation (nanoid) |
| `names.ts` | Random name generation |
| `timezones.ts` | IANA timezone list (600 lines) |
| `get-previous-metric.ts` | Percent-change calculation |
| `group-by-labels.ts` | Grouping by property |

**Server-specific (server/):**
- `crypto.ts` — Hashing, secure random generation
- `profileId.ts` — Profile ID generation
- `parser-user-agent.ts` — UA parsing (device, browser, OS)
- `parse-referrer.ts` — Referrer domain extraction
- `get-client-ip.ts` — IP from CF-Connecting-IP, X-Forwarded-For, etc.
- `referrers/index.ts` — Pre-computed referrer domains (auto-generated)

**Exports in package.json:**
- `.` → `index.ts` (client)
- `./server` → `server/index.ts` (Node.js only)
- `./server/get-client-ip` → `server/get-client-ip.ts` (specific export)

**Dependencies:**
- `date-fns`, `luxon` — Date manipulation
- `lru-cache` — In-memory caching
- `mathjs` — Advanced math
- `nanoid` — ID generation
- `ramda` — Functional utilities
- `slugify`, `unique-names-generator` — Slug/name generation
- `superjson` — Serialization
- `ua-parser-js` — User-agent parsing
- `@openpanel/constants` — Chart enums

---

## @openpanel/constants

**Purpose:** UI enums and configuration constants shared across the app.

### Exports (index.ts)

**Time windows:**
- `timeWindows` — 30min, lastHour, today, yesterday, 3d, 7d, 21d, 30d, 3m, 6m, 12m, monthToDate, lastMonth, yearToDate, lastYear, custom. Each has label, shortcut key.
- `isMinuteIntervalEnabledByRange()`, `isHourIntervalEnabledByRange()`, `getDefaultIntervalByRange()` — Helper functions (also duplicated in @openpanel/common).

**Intervals:**
- `intervals` — minute, day, hour, week, month.
- `isMinuteIntervalEnabledByRange()` — Returns true for 30min, lastHour.
- `isHourIntervalEnabledByRange()` — Returns true for minute ranges + today, yesterday, 3d, 7d.

**Operators:**
- `operators` — is, isNot, contains, doesNotContain, startsWith, endsWith, regex, isNull, isNotNull, gt, lt, gte, lte, inCohort, notInCohort.

**Chart types & segments:**
- `chartTypes` — linear, bar, histogram, pie, metric, area, map, funnel, retention, conversion.
- `chartSegments` — event, user, session, user_average, one_event_per_user, property_sum/average/max/min.
- `lineTypes` — 15 variants (monotone, linear, natural, basis, step, bump, basisClosed, etc.).

**Metrics:**
- `metrics` — count, sum, average, min, max.

**Alphabet IDs:**
- `alphabetIds` — A–Z for labeling series on charts.

**Project types:**
- `ProjectTypeNames` — website, app, backend.

**Alert frequency constants** (for custom alerts):
- `ALERT_FREQUENCY_TO_RANGE` — Maps frequency to historical range (hour→3d, day→21d, week→30d, month→180d).
- `ALERT_FREQUENCY_TO_CURRENT_RANGE` — Maps frequency to current period (hour→lastHour, day→today, week→7d, month→30d).
- `ALERT_FREQUENCY_TO_INTERVAL` — Maps frequency to interval (hour→hour, day→day, week→week, month→month).
- `ANOMALY_HISTORY_COUNT` — 72 historical data points for anomaly detection.
- `CONFIDENCE_Z_SCORES` — Z-scores for 95%, 98%, 99% confidence levels (1.96, 2.326, 2.576).
- `ALERT_FREQUENCY_MS` — Milliseconds per frequency (hour, day, week, month).

**Misc:**
- `DEFAULT_ASPECT_RATIO` — 0.5625 (9:16 or 16:9 video ratio).
- `NOT_SET_VALUE` — '(not set)' for missing property values.
- `deprecated_timeRanges` — Legacy range keys (1h, 24h, 14d, 1m, 3m, 6m, 1y).

**Dependencies:** None (except date-fns for helper functions).

**Size:** ~327 lines of pure constants and helper functions.

---

## @openpanel/json

**Purpose:** SuperJSON serialization helpers for non-JSON types (Date, Map, Set, BigInt, etc.).

### Exports (index.ts)

- **`getSafeJson<T>(str: string): T | null`** — Safe JSON.parse() wrapper; returns null on error.
- **`getSuperJson<T>(str: string): T | null`** — Detects and parses SuperJSON format; falls back to JSON.parse().
- **`setSuperJson(obj: any): string`** — Serializes object via SuperJSON (handles Date, Map, Set, etc.).

### Purpose in OpenPanel

- **In tRPC:** `@trpc/server` uses `superjson` transformer (packages/trpc/src/trpc.ts:63) to serialize non-JSON types in API responses.
- **In common:** `@openpanel/common` imports `setSuperJson()` for internal serialization (if needed).
- **In auth:** Session data may contain dates, serialized with SuperJSON.

### Dependencies

- `superjson` — The underlying serialization library.

**Size:** ~22 lines; minimal wrapper around superjson.

---

## How it connects

### Dependency graph

```
@openpanel/auth
  ├─ @openpanel/db (Session, User models)
  ├─ @openpanel/validation (ISetCookie type)
  └─ arctic, @node-rs/argon2, @oslojs/crypto

@openpanel/trpc (depends on auth, validation, common, constants)
  ├─ @openpanel/auth (validateSessionToken, session middleware)
  ├─ @openpanel/db (access control, Prisma queries)
  ├─ @openpanel/validation (Zod input validation)
  ├─ @openpanel/common (utilities: round, generateId, etc.)
  ├─ @openpanel/constants (chart types, operators, time windows)
  ├─ @openpanel/redis (caching, rate limits)
  └─ @openpanel/json (superjson transformer)

@openpanel/validation
  └─ @openpanel/constants (operators, intervals, chart types, metrics)

@openpanel/common
  └─ @openpanel/constants (intervals for date helpers)

@openpanel/constants
  └─ date-fns (for interval/range helper functions)

@openpanel/json
  └─ superjson (no internal dependencies)
```

### API flow

**Request:**
1. Client sends tRPC call to `/trpc.{router}.{procedure}` (e.g., `/trpc.chart.getData`)
2. Fastify adapter extracts session cookie → `validateSessionToken()` → context.session
3. `createContext()` prepares `{ req, res, session, setCookie, cookies }`
4. Middleware chain:
   - `loggerMiddleware` logs mutation
   - `enforceUserIsAuthed` checks session
   - `enforceAccess` validates projectId/organizationId access
   - `sessionScopeMiddleware` wraps async context
   - `cacheMiddleware` (if attached) checks Redis
5. Procedure handler runs, uses Zod schemas to validate input
6. Executes DB/ClickHouse query via @openpanel/db
7. Response serialized via SuperJSON transformer
8. Sent back to client

**Session validation (on each request):**
1. Parse `session` cookie
2. Call `validateSessionToken(token)` from @openpanel/auth
3. SHA256(token) → look up session in DB
4. If expired, delete & return EMPTY_SESSION
5. If within 15 days of expiry, extend to 30 days
6. Return `{ session, user, userId }`

**Project access check (enforceAccess middleware):**
1. Extract `projectId` from input
2. Call `getProjectAccess(userId, projectId)` from @openpanel/db
3. Throws `TRPCAccessError` if false
4. Mutation check: throws if DEMO_USER_ID and is mutation

### Dashboard usage

- Dashboard imports `@openpanel/trpc` client (`@trpc/client`) for RPC calls
- Dashboard uses `@openpanel/validation` schemas to type form inputs
- Dashboard uses `@openpanel/constants` to render chart type dropdowns, time windows, operators
- Dashboard uses `@openpanel/common` for date formatting, timezone conversion, slug generation

---

## Gotchas

1. **Session token encoding:** Token is base32-encoded client-side, but database stores SHA256 hash. Decoding steps: cookie → `decodeSessionToken()` (SHA256) → lookup. If you inspect the DB, you won't see the plain token.

2. **Circular dependency avoidance:** Validation schemas are **not** in a single file; domain-specific schemas (cohort.validation.ts, custom-event.validation.ts) are split into separate files to avoid circular imports with @openpanel/constants, while chart schemas live in index.ts.

3. **Backward compat in zChartSeries:** `zChartSeries.preprocess()` auto-migrates old `events` array field to `series` for backward compatibility. Ensures old API clients still work (index.ts:96).

4. **Demo mode enforcement:** If `DEMO_USER_ID` env var is set, mutations are blocked with "not allowed to do this in demo mode" (packages/trpc/src/trpc.ts:101). Sessions still work; all read operations allowed.

5. **Redis cache by key:** Cache key = `trpc:{path}:{input}` with quotes replaced by apostrophes. Can fail if input JSON differs slightly; no content-hash or deep-equal check. TTL is custom per procedure.

6. **Password strength check:** `verifyPasswordStrength()` hits pwnedpasswords.com API online; can fail if API is down. Doesn't throw; returns false. Validate password locally first if needed.

7. **Timezone constants:** `timezones.ts` is 600 lines. Client rarely needs full list; consider lazy-loading or treeshaking if bundle size matters.

8. **Middleware ordering:** `enforceAccess` runs **after** `enforceUserIsAuthed`, so access checks assume session exists. Order in protectedProcedure (src/trpc.ts:166): auth → access → logging → sessionScope.

9. **SuperJSON serialization:** Dates, Maps, Sets are serialized via SuperJSON. When tRPC client receives response, it auto-deserializes. Manual JSON.parse() will break these types; always use tRPC client.

10. **Cookie domain parsing:** `COOKIE_OPTIONS.domain` is parsed from `DASHBOARD_URL` or `NEXT_PUBLIC_DASHBOARD_URL` via `parseCookieDomain()`. If URLs are wrong, cookies won't be sent back. See constants.ts.

---

## Unverified / TODO

- **OAuth token refresh:** Arctic OAuth clients are initialized but refresh/revocation flow not traced. Confirm where tokens are stored and refreshed.
- **Rate limiter fingerprint:** Uses `defaultFingerPrint(req)` from @trpc-limiter/redis. Verify if it's IP-based and how it handles proxies (CF-Connecting-IP vs X-Forwarded-For priority).
- **ClickHouse integration in chart router:** chart.ts is 867 lines; imports ChartEngine, conversionService, funnelService. These live in @openpanel/db; schema/query builder rules not fully documented here.
- **Email validation:** No @openpanel/email integration in core packages; auth.ts likely imports `sendEmail()` from @openpanel/email. Confirm email sending flow.
- **Cohort logic:** cohort.validation.ts not fully read; verify if cohort membership is cached and how it scales.
- **Import data providers:** zUmamiImportConfig, zPlausibleImportConfig, zMixpanelImportConfig schemas exist; actual import implementations in worker or API not traced.
- **Notification rule execution:** Schemas defined; execution/scheduling in worker or background jobs not verified.
