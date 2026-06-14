# SDKs: Client Tracking Libraries

The SDKs (`packages/sdks/`) are npm-published tracking clients that instrument applications to send user events, conversions, and session data to OpenPanel. These libraries span browser, mobile (React Native), and backend platforms (Next.js, Express, Astro), all wrapping or extending the core `@openpanel/sdk` class.

## Key files

| Package | Location | Version | Purpose |
|---------|----------|---------|---------|
| `@openpanel/sdk` | `packages/sdks/sdk/` | 1.0.3 | Core/shared tracking client; public API (track, identify, increment, decrement, revenue); HTTP client with retry logic |
| `@openpanel/web` | `packages/sdks/web/` | 1.1.0 | Browser SDK; extends core; auto-tracking (screen views, outgoing links, attributes); session replay via rrweb; revenue session storage |
| `@openpanel/nextjs` | `packages/sdks/nextjs/` | 1.1.2 | React component wrapper for Next.js; injects CDN script + init snippet; `useOpenPanel()` hook; wraps `@openpanel/web` |
| `@openpanel/react-native` | `packages/sdks/react-native/` | 1.0.4 | React Native wrapper; app version + build tracking; sets default properties (install referrer, OS version) |
| `@openpanel/astro` | `packages/sdks/astro/` | 1.0.6 | Astro framework integration; exposes `.astro` components (OpenPanelComponent, IdentifyComponent); injects CDN script |
| `@openpanel/express` | `packages/sdks/express/` | 1.0.4 | Express middleware; attaches `req.op` (OpenPanel instance); tracks HTTP requests; resolves client IP; wraps `@openpanel/sdk` |
| `@openpanel/sdk-info` | `packages/sdks/_info/` | 0.0.1 | Framework metadata + icons; used by `apps/public` to render SDK install/setup guides (not a tracking SDK) |

---

## @openpanel/sdk

**Purpose:** Core tracking client for Node.js, browsers, and mobile; shared base for all platform-specific SDKs.

### Public API

**Constructor & initialization:**
- **`constructor(options: OpenPanelOptions)`** — Initializes client with `clientId`, optional `clientSecret`, `apiUrl`, custom `sdk` name, `sdkVersion`, `waitForProfile` (queue events until identified), `filter` (event predicate), `disabled`, and `debug` mode (packages/sdks/sdk/src/index.ts:88–113).
- **`init()`** — Placeholder; no-op (currently unused).
- **`ready()`** — Flushes queued events and disables `waitForProfile` (src/index.ts:120–123).

**Event tracking:**
- **`track(name: string, properties?: TrackProperties): Promise<void>`** — Log a named event with optional properties; merged with global properties; associated to `profileId` if available (src/index.ts:148–161).
- **`identify(payload: IdentifyPayload): Promise<void>`** — Identify user by `profileId`; optionally set firstName, lastName, email, avatar, properties; flushes queued events (src/index.ts:163–182).
- **`increment(payload: IncrementPayload): Promise<void>`** — Increment a numeric user property (src/index.ts:189–194).
- **`decrement(payload: DecrementPayload): Promise<void>`** — Decrement a numeric user property (src/index.ts:196–201).
- **`revenue(amount: number, properties?: TrackProperties): Promise<void>`** — Track revenue event; stores `__revenue: amount` property; optionally bind to `deviceId` (src/index.ts:203–214).
- **`alias(payload: AliasPayload): Promise<void>`** — *Deprecated; no-op* (src/index.ts:184–187).

**Session & device management:**
- **`fetchDeviceId(): Promise<string>`** — GET `/track/device-id`; returns and caches `deviceId` and optional `sessionId` from server; used to identify sessions (src/index.ts:216–228).
- **`clear()`** — Clear `profileId` (does not end session; comment suggests future session termination) (src/index.ts:230–233).
- **`flush()`** — Send all queued events, injecting current `profileId` (src/index.ts:235–251).

**Config:**
- **`setGlobalProperties(properties: Record<string, unknown>)`** — Set properties merged into all subsequent events (src/index.ts:141–146).
- **`log(...args)`** — Debug logging if `debug: true` (src/index.ts:253–257).

### Request headers (sent to ingestion API)

All requests to `/track` endpoint carry these headers (packages/sdks/sdk/src/index.ts:97–107):
- **`openpanel-client-id`** — UUID identifying the SDK client/project (required).
- **`openpanel-client-secret`** — Secret for secure operations (optional; set by caller if needed).
- **`openpanel-sdk-name`** — SDK platform identifier (e.g., 'web', 'node', 'react-native'); defaults to 'node' if not provided.
- **`openpanel-sdk-version`** — SDK semantic version; injected from `process.env.SDK_VERSION` at build time.
- **`Content-Type: application/json`** — Standard JSON request.

Example header setup in constructor (src/index.ts:97–107):
```typescript
const defaultHeaders: Record<string, string> = {
  'openpanel-client-id': options.clientId,
};
if (options.clientSecret) {
  defaultHeaders['openpanel-client-secret'] = options.clientSecret;
}
defaultHeaders['openpanel-sdk-name'] = options.sdk || 'node';
defaultHeaders['openpanel-sdk-version'] = options.sdkVersion || process.env.SDK_VERSION!;
```

### HTTP client

**`Api` class** (packages/sdks/sdk/src/api.ts):
- **Constructor** — Accepts `baseUrl`, `defaultHeaders`, `maxRetries` (default 3), `initialRetryDelay` (default 500ms).
- **`async fetch<ReqBody, ResBody>(path, data, options?): Promise<ResBody | null>`** — POST JSON to `baseUrl + path`; retries on error with exponential backoff (500ms × 2^attempt); accepts 200/202; returns null on 401; max retry delay increases exponentially (src/api.ts:82–89).
- **`addHeader(key, value)`** — Add or override a header (supports async values for dynamic headers like User-Agent) (src/api.ts:39–41).
- **Special handling:**
  - **keepalive**: Disabled for payloads > 60 KB (e.g., session-replay FullSnapshot chunks) to avoid Chrome's 64 KB keepalive limit (src/api.ts:51–54).
  - **Status codes**: Treats 200 and 202 as success; 401 returns null (auth failure); all other errors trigger retry.

### Event queue and profile waiting

If `waitForProfile: true` and `profileId` is not set:
- Events are queued in memory (`queue: TrackHandlerPayload[]`).
- Once `identify(profileId)` is called or `ready()` is invoked, `flush()` sends all queued events with the resolved `profileId`.
- This ensures events are not lost before user identification (src/index.ts:134–137).

### Event payload types

All events follow a union type (src/index.ts:3–27):
```typescript
type TrackHandlerPayload =
  | { type: 'track'; payload: TrackPayload }
  | { type: 'increment'; payload: IncrementPayload }
  | { type: 'decrement'; payload: DecrementPayload }
  | { type: 'alias'; payload: AliasPayload }
  | { type: 'identify'; payload: IdentifyPayload }
  | { type: 'replay'; payload: ReplayPayload };
```

**TrackPayload** (src/index.ts:39–43): `{ name: string; properties?: Record<string, unknown>; profileId?: string }`.

**IdentifyPayload** (src/index.ts:50–57): `{ profileId: string; firstName?; lastName?; email?; avatar?; properties?: Record<string, unknown> }`.

---

## @openpanel/web

**Purpose:** Browser-only SDK; extends `@openpanel/sdk` with auto-tracking, DOM event handling, and session replay.

### Public API (beyond core SDK)

**Auto-tracking:**
- **`trackScreenViews: boolean`** — Option to auto-track page/URL changes; listens to `pushState`, `replaceState`, `popstate`; emits `screen_view` event with `__path` and `__title` properties (packages/sdks/web/src/index.ts:76–79, 178–210).
- **`trackOutgoingLinks: boolean`** — Option to detect clicks on external links; emits `link_out` event with `href` and `text` properties (src/index.ts:81–82, 146–176).
- **`trackAttributes: boolean`** — Option to track clicks on elements with `data-track` attribute; collects all `data-*` attributes as properties (src/index.ts:85–87, 212–240).
- **`trackHashChanges: boolean`** — If true, track hash changes (#); if false, track full URL changes (src/index.ts:205).

**Methods:**
- **`screenView(path?: string, properties?: TrackProperties): void`** — Manually log screen view; if no path provided, uses `window.location.href`; skips if path unchanged; records `__path` and `__title` (src/index.ts:242–273).
- **`stopReplay()`** — Stop active session replay recording (src/index.ts:133–135).

**Session replay:**
- **`sessionReplay: SessionReplayOptions`** — Config object with:
  - **`enabled: boolean`** — Enable/disable replay (required).
  - **`sampleRate: number`** — 0..1 fraction of sessions to record; default 1 (all) (src/index.ts:15–20).
  - **`startTimeoutMs: number`** — Max milliseconds to wait for `sessionId` before giving up; default 10000 ms (src/index.ts:20–26).
  - Recorder starts after `fetchDeviceId()` obtains a `sessionId`; polls up to timeout (src/index.ts:95–131).
  - Replay chunks sent as `{ type: 'replay'; payload: ReplayPayload }` with `session_id` injected (src/index.ts:122–130).

**Revenue tracking:**
- **`pendingRevenue(amount, properties?): void`** — Queue revenue event in `sessionStorage` (useful for SPA post-checkout); recovered on page reload (src/index.ts:292–302).
- **`flushRevenue(): Promise<void>`** — Send all pending revenue events; clears queue (src/index.ts:275–281).
- **`clearRevenue(): void`** — Clear pending revenue without sending (src/index.ts:283–290).

### Constructor

**`constructor(options: OpenPanelOptions & { trackScreenViews?; trackOutgoingLinks?; trackAttributes?; trackHashChanges?; sessionReplay? })`** (src/index.ts:52–93):
- Sets `sdk: 'web'` and `sdkVersion` from `process.env.WEB_VERSION!`.
- If not server (checks `typeof document`):
  - Recovers pending revenues from `sessionStorage['openpanel-pending-revenues']`.
  - Sets global property `__referrer: document.referrer`.
  - Initializes auto-tracking hooks (screen views, outgoing links, attributes).
  - Starts session replay if enabled.

### Session storage

Pending revenues persisted to `sessionStorage['openpanel-pending-revenues']` as JSON array; survives page reload but cleared on session end.

### Browser compatibility

- Checks `typeof document === 'undefined'` to detect SSR; skips DOM operations on server.
- Uses standard DOM APIs: `addEventListener`, `querySelector`, `closest`, `pushState`, `popstate`.

---

## @openpanel/nextjs

**Purpose:** React component wrapper for Next.js; exposes `<OpenPanelComponent>`, `<IdentifyComponent>`, `<SetGlobalPropertiesComponent>`, and `useOpenPanel()` hook.

### Components

**`<OpenPanelComponent props>`** (packages/sdks/nextjs/index.tsx:41–95):
- Props: `clientId`, `clientSecret`, `apiUrl`, `trackScreenViews`, `trackOutgoingLinks`, `trackAttributes`, `trackHashChanges`, `sessionReplay`, `profileId`, `cdnUrl`, `filter` (as string), `globalProperties`.
- Renders two Next.js `<Script>` tags:
  1. External script tag pointing to CDN (default `https://openpanel.dev/op1.js`); appended with version query parameter.
  2. Inline script with `getInitSnippet()` + method calls: `window.op('init', {...})`, `window.op('identify', {...})`, `window.op('setGlobalProperties', {...})` (src/index.tsx:79–92).
- Uses `strategy="beforeInteractive"` for init snippet to ensure SDK ready before other scripts.

**`<IdentifyComponent profileId; firstName?; lastName?; email?; avatar?; properties?>`** (src/index.tsx:97–109):
- Renders inline script calling `window.op('identify', payload)`.

**`<SetGlobalPropertiesComponent properties>`** (src/index.tsx:111–121):
- Renders inline script calling `window.op('setGlobalProperties', properties)`.

### Hook

**`useOpenPanel()`** (src/index.tsx:123–138):
- Returns object with methods: `track`, `screenView`, `identify`, `increment`, `decrement`, `clear`, `setGlobalProperties`, `revenue`, `flushRevenue`, `clearRevenue`, `pendingRevenue`, `fetchDeviceId`.
- All methods call `window.op(methodName, ...)` or `window.op.methodName(...)` on global window object.
- These are client-side wrappers; require SDK to be loaded via `<OpenPanelComponent>` first.

### CDN script flow

1. External script (`op1.js`) loaded from CDN.
2. Inline script initializes `window.op` queue if not already present.
3. Subsequent calls to `window.op('methodName', ...)` are queued or executed.
4. Hook provides TypeScript-typed wrappers around `window.op` calls.

### Package dependencies

- `@openpanel/web` (imports `getInitSnippet` and types).
- React & Next.js peer dependencies.

---

## @openpanel/react-native

**Purpose:** React Native wrapper; extends `@openpanel/sdk` with platform-specific defaults (app version, build number, install referrer, OS).

### Constructor

**`constructor(options: OpenPanelOptions)`** (packages/sdks/react-native/index.ts:10–27):
- Sets `sdk: 'react-native'` and `sdkVersion` from `process.env.REACT_NATIVE_VERSION!`.
- Adds User-Agent header from Expo: `api.addHeader('User-Agent', Constants.getWebViewUserAgentAsync())`.
- Listens to `AppState` changes; resets default properties when app comes to foreground.
- Calls `setDefaultProperties()` on init.

### Methods

**`setDefaultProperties(): Promise<void>`** (src/index.ts:29–38):
- Fetches and sets:
  - `__version` — app version (from `expo-application`).
  - `__buildNumber` — build version/number.
  - `__referrer` — install referrer (Android only; iOS returns undefined).
- Sets via `setGlobalProperties()`, so all subsequent events carry these.

**`screenView(route: string, properties?: TrackProperties): void`** (src/index.ts:40–45):
- Convenience method; calls `super.track('screen_view', { ...properties, __path: route })`.

### Dependencies

- `@openpanel/sdk` (base class).
- `expo-application` (version/build number).
- `expo-constants` (User-Agent).
- `react-native` (AppState).

---

## @openpanel/astro

**Purpose:** Astro framework integration; exposes `.astro` components for template-based SDK initialization.

### Components (Astro)

All components in `packages/sdks/astro/src/`:

**`OpenPanelComponent`** (OpenPanelComponent.astro):
- Props: Same as Next.js; `clientId`, `clientSecret`, `apiUrl`, tracking options, `profileId`, `cdnUrl`, `filter` (string), `globalProperties`.
- Renders:
  1. External script tag (`<script src={cdnUrl ?? CDN_URL} async defer />`).
  2. Inline script with init snippet + method calls.
- Astro-specific: Uses `is:inline` directive to inject script inline.

**`IdentifyComponent`** (IdentifyComponent.astro):
- Props: `profileId`, `firstName?`, `lastName?`, `email?`, `avatar?`, `properties?`.
- Renders inline script calling `window.op('identify', {...})`.

**`SetGlobalPropertiesComponent`** (SetGlobalPropertiesComponent.astro):
- Props: `properties: Record<string, unknown>`.
- Renders inline script calling `window.op('setGlobalProperties', {...})`.

### Exports

`packages/sdks/astro/index.ts`:
- Re-exports all types from `@openpanel/web`.
- Exports the three Astro components.
- Re-exports tracking function wrappers: `track`, `screenView`, `identify`, `increment`, `decrement`, `clear` (client-side `window.op` wrappers).

### Package config

- **`type: module`** — ES modules.
- **`transformEnvs: true`** — Transforms environment variables in build.

---

## @openpanel/express

**Purpose:** Express middleware; attaches OpenPanel instance to `req.op` for server-side tracking.

### Middleware

**`createMiddleware(options: OpenpanelOptions)`** (packages/sdks/express/index.ts:22–49):
- Returns Express middleware function.
- Options extend `OpenPanelOptions` with:
  - **`trackRequest?(url: string): boolean`** — Predicate to decide whether to auto-track HTTP requests.
  - **`getProfileId?(req): string`** — Callback to extract profile ID from request.

**Middleware behavior:**
1. Creates new `OpenPanel` instance for each request.
2. Extracts client IP from headers; adds as `openpanel-client-ip` header (via `getClientIpFromHeaders()`).
3. Adds `user-agent` header if present.
4. If `trackRequest(url)` returns true, logs `request` event with URL, method, query, and optional profileId.
5. Attaches instance to `req.op`; passes to next handler.

### Request event

Auto-tracked `request` event (if enabled) includes:
- `url: string`
- `method: string` (GET, POST, etc.)
- `query: Record<string, any>`
- `profileId?: string` (if `getProfileId` provided)

### TypeScript

Global namespace extension (src/index.ts:9–14):
```typescript
declare global {
  namespace Express {
    export interface Request {
      op: OpenPanel;
    }
  }
}
```

### Dependencies

- `@openpanel/sdk` (base client).
- `@openpanel/common/server/get-client-ip` (IP resolution helper).

---

## @openpanel/sdk-info

**Purpose:** Framework metadata and icons; used by `apps/public` (dashboard setup/onboarding) to render SDK installation guides and framework selector UI.

### Exports

**`frameworks: Framework[]`** (packages/sdks/_info/frameworks.tsx:25+):
- Array of framework objects with:
  - `key: string` — identifier (e.g., 'nextjs', 'react', 'astro').
  - `IconComponent: React.ComponentType` — SVG icon for UI.
  - `name: string` — display name (e.g., "Next.js").
  - `href: string` — link to docs (e.g., `https://openpanel.dev/docs/sdks/nextjs`).
  - `type: ('website' | 'app' | 'backend')[]` — framework category(ies).

**Supported frameworks:** HTML/Script, React, Next.js, Remix, Vue, Svelte, Angular, Node.js, Deno, Bun, Express, Laravel, Kotlin, Swift, Rust, Ruby.

### Purpose in dashboard

`apps/public` uses this to:
- Populate "Select your framework" dropdown during onboarding.
- Render quick-start code snippets and links.
- Provide platform-specific setup instructions.

---

## Event Flow: SDK → Ingestion API

```
Client Application
  ↓
SDK (e.g., @openpanel/web or @openpanel/nextjs)
  │
  ├─ track('event_name', { properties })
  │  → Merges global properties
  │  → Queues or sends immediately (depending on waitForProfile)
  │
  ├─ identify({ profileId, ... })
  │  → Sets profileId
  │  → Flushes queued events
  │
  └─ revenue(amount, { ... })
     → Tracks as event with __revenue property

    ↓

SDK.api.fetch('/track', payload, {
  headers: {
    'openpanel-client-id': clientId,
    'openpanel-client-secret': clientSecret (if set),
    'openpanel-sdk-name': 'web' (or other),
    'openpanel-sdk-version': '1.1.0',
    'Content-Type': 'application/json',
  }
})

    ↓

HTTP POST apps/api/src/routes/track.router.ts or event.router.ts
  │
  ├─ Middleware: request ID, timestamp, IP resolution, client validation, bot detection
  │
  ├─ apps/api/src/controllers/track.controller.ts or event.controller.ts
  │  ├─ Resolve device ID (deterministic hash of IP + UA + salt)
  │  ├─ Derive geo location (IP → ClickHouse GeoIP)
  │  └─ Enqueue to groupmq (Redis-backed queue, order-preserving per device/profile)
  │
  └─ Return 202 Accepted

    ↓

apps/worker (queue consumer)
  │
  ├─ Fetch event from groupmq
  ├─ Insert into ClickHouse (ts_events, sessions, profiles)
  └─ Update PostgreSQL (profiles, integrations)
```

**Key validation points** (apps/api/src/utils/auth.ts):
- Client ID must be valid UUID.
- Client must exist in DB.
- CORS: origin must match project's allowed domains or secret must be valid.
- Revenue tracking requires client secret (unless `allowUnsafeRevenueTracking` enabled on project).

---

## Build & Publish

### Build

Each SDK uses **tsup** for bundling:
- Config: `tsup.config.ts` (packages/sdks/[package]/tsup.config.ts).
- Output: Dual format (CommonJS + ESM) with TypeScript declarations (`.d.ts`).
- Command: `pnpm build` (runs `rm -rf dist && tsup`).
- Minification: Enabled (`minify: true`).

**Example** (packages/sdks/sdk/tsup.config.ts):
```typescript
export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
});
```

### Publish to npm

- **Trigger:** GitHub Actions workflow `openpanel-release.yaml` (`.github/workflows/openpanel-release.yaml`).
- **Condition:** Workflow runs on commits to `main` containing `#tag` in message, or manual trigger.
- **Version scheme:** Date-based (YY.MM.DD, with numeric suffix if multiple releases per day).
- **SDK versions:** Each package has local `-local` version in `package.json`; CI updates before npm publish.

**Workspace:** Managed via `pnpm` with `pnpm-workspace.yaml` (root `packages/sdks/` monorepo).

---

## Documentation

**Canonical end-user docs:** `apps/public/content/docs/(tracking)/sdks/`
- Generated from Markdown; served at `https://openpanel.dev/docs/sdks/<framework>`.
- Includes installation, API reference, code examples, and platform-specific setup.
- Built by Next.js `apps/public`.

**Developer docs (this file):** `docs/sdks.md` (repository root).
- Architecture, public API, request headers, event flow, build setup.
- Intended for contributors maintaining SDK packages.

---

## Unverified / TODO

- **Session replay storage**: How long are replay chunks retained in ClickHouse? Any TTL or cleanup policy?
- **Device ID rotation**: Current behavior when salt changes (described in apps/api docs as supporting rotation without losing continuity, but SDK-side implications not verified).
- **SDK version injection**: Confirms `process.env.SDK_VERSION` used in core SDK; exact mechanism (build-time substitution?) and environment setup not verified.
- **astro package version mismatch**: packages/sdks/astro/src/OpenPanelComponent.astro (line 36) hard-codes version string `'1.0.6'` instead of importing from package.json or env; may cause version skew if not manually updated.
- **express middleware integration with @openpanel/common**: `getClientIpFromHeaders()` dependency not inspected; assumes it correctly resolves IPs from headers.
- **Web SDK Auto-Tracking Race Conditions**: Session replay waits for `sessionId` via polling; potential for events to be tracked before replay starts; sample rate mechanism is probabilistic (not guaranteed across reload).
- **Filter function**: Type-checked but actual filtering behavior in production not verified (custom filter predicates may have unintended effects).
