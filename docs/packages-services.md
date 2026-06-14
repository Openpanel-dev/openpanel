# Service Packages

Infrastructure and service packages providing queue management, caching, email, geolocation, integrations, payments, data import, and logging for the OpenPanel platform.

## Key Files

| Package | Main Entry | Purpose |
|---------|-----------|---------|
| `packages/queue` | `src/queues.ts` | BullMQ + GroupMQ job queues (events, sessions, cron, misc, import) |
| `packages/redis` | `redis.ts`, `cachable.ts` | Redis client factories, caching (L2), pub/sub, helpers |
| `packages/email` | `src/index.tsx`, `src/emails/` | React-email templates + Resend integration |
| `packages/geo` | `src/geo.ts` | MaxMind GeoLite2-City IP geolocation with LRU cache |
| `packages/integrations` | `src/slack.ts`, `src/discord.ts` | Third-party integrations (Slack webhooks/OAuth) |
| `packages/payments` | `src/polar.ts` | Polar.sh SDK integration for billing/subscriptions |
| `packages/importer` | `src/base-provider.ts`, `src/providers/` | Pluggable provider framework for data import (Mixpanel, Umami) |
| `packages/logger` | `index.ts` | Winston logger with HyperDX OpenTelemetry support |

---

## Queue (`@openpanel/queue`)

**Purpose:** Distributed job queue system using BullMQ (for most queues) and GroupMQ (for high-volume event ingestion).

### Public API

- **`eventsGroupQueues`**: Array of GroupMQ queues for incoming events (sharded by project ID).
  - Shards via `EVENTS_GROUP_QUEUES_SHARDS` env var (default 1).
  - Use `getEventsGroupQueueShard(projectId)` to route to the correct shard.
- **Queue instances**:
  - `sessionsQueue` (BullMQ): Session lifecycle events.
  - `cronQueue` (BullMQ): Periodic tasks (flush events/profiles, salt rotation, project deletion).
  - `miscQueue` (BullMQ): Miscellaneous jobs (e.g., trial-ending notifications).
  - `notificationQueue` (BullMQ): User notifications.
  - `importQueue` (BullMQ): Data import jobs.

### Job Types

```typescript
// Incoming events (high-volume, GroupMQ with auto-batching)
EventsQueuePayloadIncomingEvent: {
  projectId, event (TrackPayload + timestamp), 
  uaInfo (browser/OS), geo, headers, deviceIds
}

// Session + event lifecycle
EventsQueuePayloadCreateEvent, EventsQueuePayloadCreateSessionEnd

// Cron tasks
CronQueuePayload: 'salt' | 'flushEvents' | 'flushProfiles' | 'flushSessions' 
  | 'flushReplays' | 'ping' | 'deleteProjects' | 'customAlerts'

// Misc jobs
MiscQueuePayload: { type: 'trialEndingSoon', payload: { organizationId } }

// Notifications
NotificationQueuePayload: { type: 'sendNotification', payload: { notification } }

// Data import
ImportQueuePayload: { type: 'import', payload: { importId } }
```

### Configuration

- `QUEUE_CLUSTER`: If set, prefixes queue names with `{name}` for Redis Cluster hash slot control.
- `EVENTS_GROUP_QUEUES_SHARDS`: Number of event queue shards (default 1). Scaling: distribute shards across worker pods.
- `ORDERING_DELAY_MS`: GroupMQ ordering delay (default 100ms).
- `AUTO_BATCH_MAX_WAIT_MS`, `AUTO_BATCH_SIZE`: GroupMQ auto-batching config (default 0/disabled).

### Usage Example

```typescript
// In API: queue incoming event
import { getEventsGroupQueueShard } from '@openpanel/queue';
const queue = getEventsGroupQueueShard(projectId);
await queue.add('event', { projectId, event, uaInfo, geo, ... });

// In Worker: process job
import { incomingEvent } from './jobs/events.incoming-event';
const worker = new Worker('group_events', incomingEvent, options);
```

**See also:** `apps/worker/src/boot-workers.ts` (worker registration), `apps/api/src/controllers/track.controller.ts` (event ingestion).

---

## Redis (`@openpanel/redis`)

**Purpose:** Unified Redis client factory with pub/sub, caching (L2), and distributed locks.

### Public API

**Client factories** (singleton, lazy-initialized):
- `getRedisCache()`: Main cache connection (JSON-serialized data).
- `getRedisQueue()`: Queue connection (dedicated for BullMQ; `enableReadyCheck=false`, `maxRetriesPerRequest=null` for queue safety).
- `getRedisGroupQueue()`: GroupMQ event buffer (uses `REDIS_EVENT_URL` if set; fallback `REDIS_URL`).
- `getRedisPub()`, `getRedisSub()`: Pub/sub pair (separate connections).
- `getRedisSession()`: Session cache (uses `REDIS_SESSION_URL` if set; fallback `REDIS_URL`).
- `getRedisEvent()`: Event buffer (uses `REDIS_EVENT_URL`).

**Extended Redis interface**:
```typescript
interface ExtendedRedis extends Redis {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, expireInSec: number, value: T): Promise<void>;
}
```

**Caching helpers**:
- `getCache(key, expireInSec, fn, useLruCache?)`: L1/L2 cache (in-memory LRU + Redis).
- `cacheable(fn | name, fn, expireInSec)`: Redis-only cache decorator (async).
- `cacheableLru(fn | name, fn, options)`: LRU-only cache (synchronous/promise-based).
- `deleteCache(key)`: Clear Redis entry.
- `clearGlobalLruCache(key?)`: Clear in-memory LRU (optionally by key).
- `getGlobalLruCacheStats()`: LRU cache hit rate diagnostics.

**Pub/Sub**:
```typescript
publishEvent<Channel>(channel, type, event, [multi])
subscribeToPublishedEvent<Channel>(channel, type, callback): unsubscribe()
psubscribeToPublishedEvent(pattern, callback): unsubscribe()
parsePublishedEvent<Channel>(channel, type, message): event
```

**Channels** (typed):
- `organization:subscription_updated` → `{ organizationId }`
- `events:received`, `events:saved` → `IServiceEvent`
- `notification:created` → `Prisma.NotificationUncheckedCreateInput`

**Utilities**:
- `getLock(key, value, timeout)`: Distributed lock via `SET NX EX` (returns bool).
- `runEvery({ key, interval, fn })`: Execute function once per `interval` (Redis-backed).

### Configuration

- `REDIS_URL`: Default connection (default `redis://localhost:6379`).
- `REDIS_SESSION_URL`: Session cache (fallback to `REDIS_URL`).
- `REDIS_EVENT_URL`: Event buffer (fallback to `REDIS_URL`).

### Usage Example

```typescript
// Caching data
import { getCache } from '@openpanel/redis';
const projects = await getCache(
  'projects:org:123',
  3600,  // 1 hour TTL
  () => db.project.findMany({ where: { organizationId: '123' } }),
  true   // use LRU
);

// Cacheable function (Redis-backed)
import { cacheable } from '@openpanel/redis';
const getCachedUser = cacheable('getUser', 
  async (userId: string) => db.user.findUnique({ where: { id: userId } }),
  600  // 10 min TTL
);
await getCachedUser('user-123');  // Cached
await getCachedUser.clear('user-123');  // Invalidate

// Pub/Sub
import { subscribeToPublishedEvent, publishEvent } from '@openpanel/redis';
subscribeToPublishedEvent('organization', 'subscription_updated', (event) => {
  console.log('Subscription changed:', event.organizationId);
});
publishEvent('organization', 'subscription_updated', { organizationId: '123' });
```

**See also:** `apps/api/src/bots/index.ts` (AI bot caching), `apps/api/src/controllers/misc.controller.ts` (data caching).

---

## Email (`@openpanel/email`)

**Purpose:** React-email template system with Resend integration for transactional emails.

### Public API

```typescript
sendEmail<T extends TemplateKey>(
  template: T,
  options: {
    to: string | string[];
    data: z.infer<Templates[T]['schema']>;
  }
): Promise<SendEmailResponse | null>
```

### Templates

Located in `src/emails/`:
- **`invite`**: `zEmailInvite` schema → "Invite to join {organizationName}"
- **`reset-password`**: `zEmailResetPassword` schema → "Reset your password"
- **`trial-ending-soon`**: `zTrailEndingSoon` schema → "Your trial is ending soon"

Each template is a React component with Zod validation schema.

### Configuration

- `RESEND_API_KEY`: Resend API key (required to send; if missing, logs to console).
- `EMAIL_SENDER`: From address (default `hello@openpanel.dev`).

### Usage Example

```typescript
import { sendEmail } from '@openpanel/email';

await sendEmail('invite', {
  to: 'user@example.com',
  data: {
    organizationName: 'ACME Corp',
    inviteLink: 'https://app.openpanel.dev/join/token-123',
  }
});

await sendEmail('trial-ending-soon', {
  to: 'admin@org.example.com',
  data: {
    organizationName: 'ACME Corp',
    url: 'https://app.openpanel.dev/org-456/settings/billing',
  }
});
```

**See also:** `apps/worker/src/jobs/misc.trail-ending-soon.ts` (email job handler).

**Development**: Run `pnpm --filter @openpanel/email dev` to preview templates at http://localhost:3939.

---

## Geo (`@openpanel/geo`)

**Purpose:** IP geolocation using MaxMind GeoLite2-City database with LRU caching.

### Public API

```typescript
getGeoLocation(ip?: string): Promise<GeoLocation>

interface GeoLocation {
  country: string | undefined;     // ISO 3166-1 alpha-2 code
  city: string | undefined;
  region: string | undefined;
  longitude: number | undefined;
  latitude: number | undefined;
}
```

### Database

- **File**: `packages/geo/GeoLite2-City.mmdb` (63 MB, MaxMind format).
- **Codegen**: `pnpm --filter @openpanel/geo codegen` downloads latest via `packages/geo/scripts/download.ts`.
  - Uses GitHub GitSquared redistribution by default.
  - If `MAXMIND_LICENSE_KEY` env var set, downloads directly from MaxMind (requires account).

### Caching

- **LRU**: 1000-entry in-memory cache, 5-minute TTL per IP.
- **Fallback IPs**: Returns empty `GeoLocation` for `127.0.0.1` (localhost) and `::1` (IPv6 localhost).
- **Error handling**: Gracefully returns empty `GeoLocation` on DB load failure or lookup error.

### Usage Example

```typescript
import { getGeoLocation } from '@openpanel/geo';

const geo = await getGeoLocation('203.0.113.42');
// { country: 'US', city: 'San Francisco', region: 'California', ... }

const noGeo = await getGeoLocation('127.0.0.1');
// { country: undefined, city: undefined, ... }
```

**See also:** `apps/api/src/controllers/track.controller.ts` (event geolocation), `apps/api/src/controllers/misc.controller.ts` (IP lookup endpoint).

---

## Integrations (`@openpanel/integrations`)

**Purpose:** Third-party service integrations (currently Slack and Discord stubs).

### Public API

**Slack**:
```typescript
// OAuth setup
slackInstaller: InstallProvider  // Slack Bolt OAuth helper
getSlackInstallUrl({ integrationId, organizationId }): string

// Send notification to webhook
sendSlackNotification({ webhookUrl, message }): Promise<Response>
```

**Configuration**:
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`: Slack OAuth credentials.
- `SLACK_OAUTH_REDIRECT_URL`: OAuth callback URL.
- `SLACK_STATE_SECRET`: State parameter secret for CSRF protection.

**Discord**: Stub present (`src/discord.ts`), not yet implemented.

### Usage Example

```typescript
import { getSlackInstallUrl, sendSlackNotification } from '@openpanel/integrations/src/slack';

// Generate OAuth link for user
const installUrl = getSlackInstallUrl({
  integrationId: 'integration-123',
  organizationId: 'org-456'
});

// Send notification
await sendSlackNotification({
  webhookUrl: 'https://hooks.slack.com/services/...',
  message: 'OpenPanel alert: High error rate detected!'
});
```

**See also:** API routes for OAuth callback (in `apps/api`).

---

## Payments (`@openpanel/payments`)

**Purpose:** Billing via Polar.sh SDK (subscription management, checkout, portal).

### Public API

```typescript
polar: Polar  // Initialized SDK client

// Products & pricing
getProducts(): Promise<IPolarProduct[]>
getProduct(id: string): Promise<IPolarProduct>
type IPolarPrice = IPolarProduct['prices'][number]

// Checkout & portal
createCheckout(config): Promise<CheckoutResponse>
createPortal({ customerId }): Promise<CustomerSessionResponse>

// Subscription management
cancelSubscription(subscriptionId: string): Promise<Subscription>
reactivateSubscription(subscriptionId: string): Promise<Subscription>
changeSubscription(subscriptionId, productId): Promise<Subscription>

// Webhook validation
validatePolarEvent(request: Request): Promise<WebhookEvent>
```

### Configuration

- `POLAR_ACCESS_TOKEN`: Polar API token (required).
- `DASHBOARD_URL` or `NEXT_PUBLIC_DASHBOARD_URL`: Success URL for checkout (fallback chain).
- Environment: Uses `sandbox` if `NODE_ENV !== 'production'`; otherwise `production`.

### Usage Example

```typescript
import { createCheckout, getProducts } from '@openpanel/payments';

// List products
const products = await getProducts();
// Filter to non-custom products (metadata.custom !== 'true')

// Create checkout
const checkout = await createCheckout({
  productId: 'prod-123',
  organizationId: 'org-456',
  user: { id: 'user-789', firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
  ipAddress: '203.0.113.42'
});
// { clientSecret, checkoutId, ... }

// Manage subscription
await cancelSubscription('sub-123');  // Mark for end-of-period cancellation
await reactivateSubscription('sub-123');  // Undo cancellation
await changeSubscription('sub-123', 'prod-456');  // Switch plan
```

**See also:** API routes for billing UI, webhook handlers.

---

## Importer (`@openpanel/importer`)

**Purpose:** Pluggable provider framework for importing historical analytics data from third-party platforms (Mixpanel, Umami, etc.).

### Public API

**Base class** (abstract, extend for new providers):
```typescript
abstract class BaseImportProvider<TRawEvent> {
  abstract provider: string;
  abstract version: string;
  
  // Implement these
  abstract parseSource(overrideFrom?: string): AsyncGenerator<TRawEvent>;
  abstract transformEvent(rawEvent: TRawEvent): IClickhouseEvent;
  abstract validate(rawEvent: TRawEvent): boolean;
  abstract getTotalEventsCount(): Promise<number>;
  
  // Optional lifecycle hooks
  async beforeBatch?(events: TRawEvent[]): Promise<TRawEvent[]>;
  getImportMetadata?(): ImportJobMetadata;
  async onError?(error: Error, context?: ErrorContext): Promise<void>;
  async getEstimatedTotal?(): Promise<number>;
  shouldGenerateSessionIds(): boolean;  // Default: false
  
  // Utility
  getDateChunks(from: string, to: string, chunkSizeDays?): Array<[string, string]>
}
```

**Provided implementations**:
- `MixpanelProvider`: CSV export import.
- `UmamiProvider`: Umami analytics API import.

**Types**:
```typescript
interface ImportConfig {
  projectId: string;
  provider: string;
  sourceType: 'file' | 'api';
  sourceLocation: string;  // File path or API URL
}

interface ImportProgress {
  totalEvents: number;
  processedEvents: number;
  currentBatch: number;
  totalBatches: number;
}

interface ImportResult {
  success: boolean;
  totalEvents: number;
  processedEvents: number;
  error?: string;
}
```

### Usage Example

```typescript
import { MixpanelProvider } from '@openpanel/importer';

class MyImportJob {
  async handle(importId: string) {
    const provider = new MixpanelProvider('proj-123', {
      provider: 'mixpanel',
      type: 'api',
      serviceAccount: 'svc-account',
      serviceSecret: 'svc-secret',
      projectId: 'mixpanel-project-id',
      from: '2024-01-01',
      to: '2024-01-31',
    });
    
    const totalEvents = await provider.getTotalEventsCount();
    let processedEvents = 0;
    
    // Stream-process events (memory-efficient for large exports)
    for await (const rawEvent of provider.parseSource()) {
      if (!provider.validate(rawEvent)) continue;
      
      const event = provider.transformEvent(rawEvent);
      // Insert event into ClickHouse...
      processedEvents++;
    }
    
    return { success: true, totalEvents, processedEvents };
  }
}
```

**See also:** `apps/worker/src/jobs/import.ts` (worker job), `packages/importer/src/providers/` (implementation examples).

---

## Logger (`@openpanel/logger`)

**Purpose:** Winston-based structured logging with HyperDX OpenTelemetry integration for production observability.

### Public API

```typescript
createLogger({ name: string }): ILogger

type ILogger = winston.Logger
// Standard Winston methods: logger.info(), logger.warn(), logger.error(), logger.debug(), etc.
```

### Log Levels

- Custom levels: `fatal: 0`, `error: 3`, `warn: 4`, `info: 6`, `debug: 7`, `trace: 7` (syslog-based).
- Default level: `process.env.LOG_LEVEL` (default `'info'`).

### Features

- **Sensitive data redaction**: Automatically masks keys containing `password`, `token`, `secret`, `authorization`, `apiKey`.
- **Error formatting**: Serializes Error objects with stack traces.
- **HyperDX integration** (if `HYPERDX_API_KEY` set): Forwards structured logs + traces to HyperDX.
- **Console output** (dev/local): Colorized, human-readable format with JSON metadata.

### Configuration

- `LOG_LEVEL`: Log verbosity (default `'info'`).
- `LOG_SILENT`: Set to `'true'` to suppress all logs.
- `LOG_PREFIX`: Prefix for service name (combined with `name` and `NODE_ENV`).
- `HYPERDX_API_KEY`: Enable OpenTelemetry export to HyperDX.
- `NODE_ENV`: Auto-detected for log format selection.

### Usage Example

```typescript
import { createLogger } from '@openpanel/logger';

const logger = createLogger({ name: 'my-service' });

logger.info('User signed up', { userId: 'user-123', email: 'user@example.com' });
// Service name = `my-service-dev` (or `-prod` if NODE_ENV=production)

logger.error('Failed to fetch data', { 
  error: new Error('Network timeout'),
  apiUrl: 'https://api.example.com/...',
  password: 'secret123'  // Will be redacted → [REDACTED]
});

logger.debug('Cache hit', { cacheKey: 'user:123', ttl: 3600 });
```

**See also:** `apps/api/src/utils/logger.ts`, `apps/worker/src/utils/logger.ts` (instantiation patterns).

---

## How It Connects

```
User Request
  ↓
[API Server]
  ├─ Queue: getEventsGroupQueueShard() → events → [Worker]
  ├─ Redis: getCache(), cacheable(), getLock()
  ├─ Geo: getGeoLocation(ip)
  ├─ Email: sendEmail() [triggered by cron/misc jobs]
  ├─ Logger: createLogger('track')
  └─ Payments: getProducts(), createCheckout()
  
[Worker Server]
  ├─ Queue: boot workers → process jobs
  ├─ Redis: cache results, pub/sub
  ├─ Importer: load historical data (MixpanelProvider, UmamiProvider)
  ├─ Email: send transactional emails (invite, password reset, trial reminder)
  ├─ Logger: track job progress, errors
  └─ Integrations: Slack notifications for alerts

Data Flow:
  Events → [GroupMQ Queue] → [Worker] → ClickHouse (via sql-builder)
  Bulk Import → [Importer Provider] → ClickHouse
  Cron Tasks → [CronQueue] → [Worker] → Flush buffers, delete old data
  User Actions → [Email Queue] → [Worker] → [Resend] → User inbox
  Organization Changes → [Redis Pub/Sub] → Dashboard (live updates)
```

---

## Gotchas

1. **Queue names & Redis Cluster**: If using `QUEUE_CLUSTER`, queue names must include `{name}` syntax for hash slot routing. Queues are prefixed automatically via `getQueueName()`.

2. **Event queue sharding**: `getEventsGroupQueueShard()` uses SHA1 hash of `projectId` to deterministically pick a shard. All events for the same project must hash to the same shard for ordered processing.

3. **Redis connection options**: `getRedisQueue()` has `maxRetriesPerRequest: null` and `enableReadyCheck: false` to prevent BullMQ blocking. Do NOT use this connection for pub/sub or caching.

4. **Sensitive data in logs**: Logger auto-redacts `password`, `token`, etc. — but check for custom keys before logging (e.g., API keys in custom fields).

5. **Geo database size**: GeoLite2-City is 63 MB; ensure disk space in Docker images. Codegen script (`pnpm codegen`) downloads on first install.

6. **Email without RESEND_API_KEY**: `sendEmail()` returns `null` and logs to console. Useful for local dev, but enables easy silent failure in production if key is missing.

7. **Importer session IDs**: `shouldGenerateSessionIds()` determines if SQL (in worker) or provider generates session IDs. Umami generates them; Mixpanel CSV does not (worker generates via window functions).

8. **HyperDX tracer export**: If `HYPERDX_API_KEY` is set, logs go to HyperDX instead of stdout. Ensure key is valid before deploying.

9. **Cacheable LRU eviction**: `cacheableLru()` uses in-memory LRU with 1000-entry default limit. High-cardinality data may thrash the cache; prefer `cacheable()` (Redis) for unbounded sets.

10. **Polar webhook signature**: Use `validatePolarEvent()` to verify webhook authenticity before processing billing events.

---

## Unverified / TODO

- **Discord integration** (`packages/integrations/src/discord.ts`): Stub present but not implemented. Check if needed.
- **Payments webhook handling**: Verify that all Polar webhook events (subscription updated, invoice paid, etc.) are correctly handled in worker.
- **Importer provider extensibility**: The base class supports custom providers, but no documentation on how to register new ones (hardcoded in worker job?).
- **Email template errors**: Zod schema validation errors are logged but not surfaced to user. Consider adding retry logic or error callback.
- **Geo database freshness**: Download script works, but no automated rotation. Check if GeoLite2 updates are needed monthly/yearly.
- **Logger BigInt serialization**: Logger manually handles BigInt serialization for JSON output. Verify this works across all use cases (check `apps/worker` logs for BigInt errors).

